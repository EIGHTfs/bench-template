#!/usr/bin/env node
// ============================================================
// scripts/gitignore-runtime.cjs —— 通用模板脚本：扫描运行态注释标记 → 自动维护 .gitignore
//
// 用途：项目代码注释里用标记声明「运行态文件/目录」（config.json、sessions.json、json/ 等
//   含敏感/易变数据、不应入库的文件），本脚本扫描标记并把它们追加进 .gitignore（幂等）。
//   避免手动维护 .gitignore 易漏——nexus config.json 根级未忽略差点泄露 cookie 的教训。
//
// 标记格式（写在任意被扫描的 .js/.cjs 注释里）：
//   // gitignore-runtime file server/config.json desc="服务配置（含密码/路径，本机权威）"
//   // gitignore-runtime dir json/ desc="运行态数据（会话/任务/缓存）"
//   // gitignore-runtime file sessions.json desc="登录会话（根级）"
//   file = 单文件；dir = 整目录（忽略行不加尾斜杠，gitignore 目录模式）
//
// 用法：
//   node scripts/gitignore-runtime.cjs <项目根>          # 扫描 + 追加（幂等）
//   node scripts/gitignore-runtime.cjs <项目根> --check  # 只报告将新增，不写盘
// ============================================================
"use strict";

const fs = require("fs");
const path = require("path");

const MARK_RE = /gitignore-runtime\s+(file|dir)\s+([^\s"]+)(?:\s+desc="([^"]*)")?/g;

function walkJs(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === ".trash") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkJs(full, out);
    else if (/\.(js|cjs)$/.test(e.name)) out.push(full);
  }
}

function scan(root) {
  const files = [];
  walkJs(root, files);
  const found = new Map(); // path → {kind, desc}
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    let m;
    while ((m = MARK_RE.exec(src)) !== null) {
      const key = m[2].replace(/\\/g, "/");
      if (!found.has(key)) found.set(key, { kind: m[1], desc: m[3] || "" });
    }
  }
  return found;
}

function main() {
  const root = path.resolve(process.argv[2] || ".");
  const checkOnly = process.argv.includes("--check");
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error("用法: node scripts/gitignore-runtime.cjs <项目根> [--check]");
    process.exit(1);
  }
  const found = scan(root);
  const giPath = path.join(root, ".gitignore");
  let gi = "";
  try { gi = fs.readFileSync(giPath, "utf8"); } catch (_) {}

  const HEADER = "# === gitignore-runtime 自动段（扫描注释标记生成，勿手改；重跑本脚本刷新）===";
  const lines = gi.split(/\r?\n/);
  const existing = new Set(lines.map((l) => l.trim()).filter(Boolean));
  const additions = [];
  const sortedKeys = [...found.keys()].sort();
  for (const key of sortedKeys) {
    const meta = found.get(key);
    if (existing.has(key)) continue;
    additions.push(key);
    if (meta.desc) additions.push("# " + meta.desc.replace(/\s+/g, " "));
  }

  if (!additions.length) {
    console.log("✓ 无新增忽略项（已全部覆盖）——共 " + found.size + " 个运行态标记");
    return;
  }
  console.log("新增 " + additions.length + " 行运行态忽略（共 " + found.size + " 个标记）：");
  additions.forEach((l) => console.log(l.startsWith("#") ? "  " + l : "  + " + l));

  if (checkOnly) { console.log("(--check：未写盘)"); return; }

  const block = "\n" + HEADER + "\n" + additions.join("\n") + "\n";
  fs.appendFileSync(giPath, block, "utf8");
  console.log("已追加到 .gitignore: " + giPath);
}

main();
