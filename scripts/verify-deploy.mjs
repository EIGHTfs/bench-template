#!/usr/bin/env node
// ============================================================
// scripts/verify-deploy.mjs —— 部署端一致性核实（零依赖，两阶段设计）
//
// 解决什么问题：下游项目「推送后，部署端到底更新了没」一直靠人肉 SSH + 肉眼比对，
//   容易误判（本项目就发生过：日志最后一条是**推送之前**的记录，被误读成「部署端没更新/代码有 bug」）。
//
// 两阶段设计（关键：**本脚本不含任何凭据**，远端命令由使用者自己在目标机上执行）：
//   ① 生成远端命令：
//        node scripts/verify-deploy.mjs --emit --local <本地仓库> --remote <部署目录> [--json]
//      把输出整段复制到**部署端**（NAS）执行，把结果存成文件带回。
//   ② 比对：
//        node scripts/verify-deploy.mjs --check --local <本地仓库> <远端结果文件>
//      逐文件比对 md5，并核对 lastSha 与本地 HEAD。
//
// 比对口径（为什么这样比）：
//   · **文件级 md5**：证明「下发件真的逐字节落地」，比时间戳/mtime 可靠
//   · **lastSha vs 本地 HEAD**：`.auto-update-state.json` 里部署端自己记录的「已更新到哪个提交」，
//     与本地 HEAD 一致 ⇒ 闭环成立；不一致 ⇒ 还没轮到下一次检查，或检查失败（看部署端日志）
//   · 文件清单取自本地 `assemble.json` 的 files 映射（清单是下发的唯一真相）
//
// 退出码：0 = 全部一致；1 = 有不一致；2 = 用法/输入错误
// ============================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : ""; };

const LOCAL = val("--local");
const REMOTE = val("--remote");
const posArg = argv.filter((a) => !a.startsWith("--") && a !== LOCAL && a !== REMOTE)[0] || "";

if (!LOCAL || (!has("--emit") && !has("--check"))) {
  console.error("用法:");
  console.error("  生成远端命令: node scripts/verify-deploy.mjs --emit  --local <本地仓库> --remote <部署目录>");
  console.error("  比对结果:     node scripts/verify-deploy.mjs --check --local <本地仓库> <远端结果文件>");
  process.exit(2);
}

// ---------- 读本地 assemble.json，得到「模板文件 → 项目文件」映射 ----------
function readMapping(repo) {
  const mf = path.join(repo, "assemble.json");
  if (!fs.existsSync(mf)) { console.error(`✗ 找不到 ${mf}`); process.exit(2); }
  const j = JSON.parse(fs.readFileSync(mf, "utf8"));
  const files = j.files || {};
  // 只取字符串值，且限定文本类扩展名（注意括号：`a && b || c` 会变成 `(a&&b) || c`，是常见误写）
  return Object.values(files).filter((v) => typeof v === "string" && /\.(js|mjs|cjs|sh|css|json|html)$/.test(v));
}
function md5(p) {
  return crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
}
function localHead(repo) {
  try {
    return execSync("git rev-parse HEAD", { cwd: repo }).toString().trim();
  } catch { return ""; }
}

const mapping = readMapping(LOCAL);

// ---------- 阶段①：生成远端命令 ----------
if (has("--emit")) {
  const remoteDir = REMOTE || "<部署目录>";
  const lines = [];
  lines.push(`# 在**部署端**执行（把下面整段复制过去），结果保存为 deploy-check.txt 带回：`);
  lines.push(`D=${JSON.stringify(remoteDir)}`);
  lines.push(`echo "== 部署端时间 =="; date "+%F %H:%M"`);
  lines.push(`echo "== 自动更新状态 =="; cat "$D/.auto-update-state.json" 2>/dev/null`);
  lines.push(`echo "== 文件 md5（相对部署目录）=="`);
  lines.push(`cd "$D" || exit 1`);
  for (const rel of mapping) lines.push(`md5sum ${JSON.stringify(rel)} 2>/dev/null || echo "MISSING  ${rel}"`);
  lines.push(`echo "== 最近自动更新日志 =="; tail -4 server/server.log 2>/dev/null`);
  console.log(lines.join("\n"));
  process.exit(0);
}

// ---------- 阶段②：比对 ----------
if (!posArg || !fs.existsSync(posArg)) {
  console.error(`✗ 找不到远端结果文件: ${posArg || "(未提供)"}`);
  process.exit(2);
}
const raw = fs.readFileSync(posArg, "utf8");
const remoteMd5 = new Map();
for (const line of raw.split("\n")) {
  const m = /^([a-f0-9]{32})\s+(.+)$/.exec(line.trim());
  if (m) remoteMd5.set(m[2].replace(/^\*/, "").trim(), m[1]);
  const miss = /^MISSING\s+(.+)$/.exec(line.trim());
  if (miss) remoteMd5.set(miss[1].trim(), "__MISSING__");
}
const stateSha = (/\"lastSha\"\s*:\s*\"([a-f0-9]+)\"/.exec(raw) || [])[1] || "";

let same = 0, diff = 0, missing = 0;
const bad = [];
for (const rel of mapping) {
  const local = path.join(LOCAL, rel);
  if (!fs.existsSync(local)) continue;
  const l = md5(local);
  const r = remoteMd5.get(rel);
  if (!r) { missing++; bad.push(`  ? 部署端未报告: ${rel}`); continue; }
  if (r === "__MISSING__") { missing++; bad.push(`  ✗ 部署端缺文件: ${rel}`); continue; }
  if (r === l) same++;
  else { diff++; bad.push(`  ✗ 内容不同: ${rel}\n      本地 ${l.slice(0, 12)}  部署端 ${r.slice(0, 12)}`); }
}
const head = localHead(LOCAL);
console.log(`═══ 部署端一致性核实 ═══`);
console.log(`  本地仓库: ${LOCAL}`);
console.log(`  文件条目: ${mapping.length} 个（一致 ${same} / 不同 ${diff} / 缺失 ${missing}）`);
console.log(`  本地 HEAD:      ${head.slice(0, 12) || "(未知)"}`);
console.log(`  部署端 lastSha: ${stateSha.slice(0, 12) || "(未读到)"}`);
if (stateSha && head && stateSha === head) console.log(`  ✅ lastSha 与本地 HEAD 一致 ⇒ 更新闭环成立`);
else if (stateSha && head) console.log(`  ⚠️ lastSha ≠ 本地 HEAD ⇒ 部署端还没更新到本地提交（可能还没轮到下一次自动检查，或检查失败——看部署端日志）`);
if (bad.length) { console.log(`\n不一致明细:`); bad.forEach((b) => console.log(b)); }
process.exit(diff + missing > 0 ? 1 : 0);
