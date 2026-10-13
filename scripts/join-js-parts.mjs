#!/usr/bin/env node
// ============================================================
// scripts/join-js-parts.mjs —— JS 分片拼接器（零依赖，node 内置模块）
//
// 为什么：两个下游项目的前端 app.js 都是 2000+ 行单文件，职责混杂、审计复杂度高。
//   参照 dsh-clientjs-split-build 的做法：**源码按片段维护，产物仍是单文件**（运行时零变化）。
//
// 用法：
//   node scripts/join-js-parts.mjs <清单.json> <产物路径> [--check]
//   node scripts/join-js-parts.mjs --parts <a.js,b.js,...> <产物路径> [--check]
//
// 清单格式（与分片同目录的 manifest.json）：
//   {
//     "parts": ["parts/foundation.js", "parts/scenes.js", "parts/apply.js"]
//   }
//   · parts 相对清单所在目录；**顺序即依赖**（共享层放最前，入口放最后）
//
// 设计要点（都是踩过的坑）：
//   1. **顺序即依赖**：顺序不变 → 产物逐字节一致（幂等）；顺序错 → 先拼接的片段访问后定义 ⇒ 运行时才炸
//   2. **缺片报错中止**：绝不静默少一段（否则页面交互时才炸，静态检查与 API 层都探测不到）
//   3. **统一 LF**：避免 CRLF 造成"看起来一样但字节不同"，破坏逐字节等价验收
//   4. **原子写**：tmp + rename，避免组装中断留下半成品
//   5. **--check**：只比对不写盘，不一致退出码 1（供 setup/CI 门禁使用）
//
// 产物与分片的关系：**产物是构建结果，不要手改**；改代码只改 parts/ 下的分片。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const rest = argv.filter((a) => a !== "--check");

// ---------- 解析参数：<清单.json> 或 --parts a,b,c ----------
let manifestPath = "";
let partFiles = null;
let outPath = "";
if (rest[0] === "--parts") {
  partFiles = String(rest[1] || "").split(",").map((s) => s.trim()).filter(Boolean);
  outPath = rest[2] || "";
} else {
  manifestPath = rest[0] || "";
  outPath = rest[1] || "";
}

if ((!manifestPath && !partFiles) || !outPath) {
  console.error("用法: node scripts/join-js-parts.mjs <清单.json> <产物路径> [--check]");
  console.error("      node scripts/join-js-parts.mjs --parts a.js,b.js <产物路径> [--check]");
  process.exit(2);
}

// ---------- 读清单 ----------
let baseDir = process.cwd();
if (manifestPath) {
  const mp = path.resolve(manifestPath);
  if (!fs.existsSync(mp)) {
    console.error(`✗ 清单不存在: ${mp}`);
    process.exit(2);
  }
  baseDir = path.dirname(mp);
  let mf;
  try {
    mf = JSON.parse(fs.readFileSync(mp, "utf8"));
  } catch (e) {
    console.error(`✗ 清单不是合法 JSON: ${mp}（${e.message}）`);
    process.exit(2);
  }
  partFiles = Array.isArray(mf.parts) ? mf.parts : [];
}

if (!partFiles.length) {
  console.error("✗ 清单里 parts 为空 —— 空片段集应直接复制原文件，不要走拼接");
  process.exit(2);
}

// ---------- 逐个读片段（缺片即中止，不静默跳过）----------
const chunks = [];
for (const rel of partFiles) {
  const abs = path.isAbsolute(rel) ? rel : path.join(baseDir, rel);
  if (!fs.existsSync(abs)) {
    console.error(`✗ 片段缺失: ${rel}（解析为 ${abs}）—— 中止拼接，避免产出残缺文件`);
    process.exit(1);
  }
  const raw = fs.readFileSync(abs, "utf8");
  // 统一 LF（CRLF/CR → LF），并保证片段以换行结尾，避免相邻片段粘连成一行
  const norm = raw.replace(/\r\n?/g, "\n");
  chunks.push(norm.endsWith("\n") ? norm : norm + "\n");
}
const joined = chunks.join("");

// ---------- --check：只比对 ----------
const outAbs = path.resolve(outPath);
if (CHECK) {
  if (!fs.existsSync(outAbs)) {
    console.error(`✗ 产物不存在: ${outAbs}（--check 模式不写盘）`);
    process.exit(1);
  }
  const cur = fs.readFileSync(outAbs, "utf8").replace(/\r\n?/g, "\n");
  if (cur === joined) {
    console.log(`✓ 一致: ${outPath}（${partFiles.length} 个片段，${Buffer.byteLength(joined)} 字节）`);
    process.exit(0);
  }
  const h1 = crypto.createHash("sha256").update(cur).digest("hex").slice(0, 12);
  const h2 = crypto.createHash("sha256").update(joined).digest("hex").slice(0, 12);
  console.error(`✗ 不一致: ${outPath}`);
  console.error(`  现有产物 ${cur.length} 字符 sha256:${h1}`);
  console.error(`  拼接结果 ${joined.length} 字符 sha256:${h2}`);
  console.error("  （下游未重组，或产物被手改过 —— 二选一排查）");
  process.exit(1);
}

// ---------- 原子写 ----------
const dir = path.dirname(outAbs);
fs.mkdirSync(dir, { recursive: true });
const tmp = path.join(dir, `.${path.basename(outAbs)}.tmp-${process.pid}`);
fs.writeFileSync(tmp, joined, "utf8");
fs.renameSync(tmp, outAbs);

const bytes = Buffer.byteLength(joined);
const sha = crypto.createHash("sha256").update(joined).digest("hex").slice(0, 12);
console.log(`✓ 已生成 ${outPath}（${partFiles.length} 个片段，${bytes} 字节，sha256:${sha}）`);
