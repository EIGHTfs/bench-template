#!/usr/bin/env node
// ============================================================
// 框架素材引用扫描：给「按功能分类整理」当依据
//
// 用途：把 framework/ 下每个 js 的「被依赖情况」和「引用了哪些样式/资源」
//   列出来，供人工/AI 判断它属于哪个功能域。
//
// 为什么需要它：framework/ 现在 23 个模块平铺，且彼此有相对 require；
//   要拆成功能子目录就必须先看清谁引谁（否则改路径必断链）。
//   同时前端素材（连 style.css 的脚本）也要看，才能确定哪些属于前端域。
//
// 用法：
//   node scripts/scan-framework-refs.js                 # 全量扫描
//   node scripts/scan-framework-refs.js --json           # 输出 JSON（给程序用）
//   node scripts/scan-framework-refs.js --cycles         # 只查循环依赖
// ============================================================
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FW_DIR = path.join(ROOT, "server", "framework");
const TPL_DIR = path.join(ROOT, "server", "templates");
const BP_DIR = path.join(ROOT, "server", "project", "blueprint");

const args = process.argv.slice(2);
const AS_JSON = args.includes("--json");
const ONLY_CYCLES = args.includes("--cycles");

// ---------------------------------------------------------------- 小工具

function listFiles(dir, filter) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    // 跳过回收站/备份/生成物：.trash-* 是历史备份，不是真实引用来源，
    // 扫进来会把早已删除的旧页面算成「引用者」，干扰判断。
    if (e.isDirectory() && (e.name.startsWith(".trash") || e.name === "node_modules")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, filter));
    else if (filter(e.name)) out.push(p);
  }
  return out;
}

/**
 * 剥掉注释，避免把注释里的示例代码当成真依赖。
 * 实测踩坑：require-sibling.js 的用法示例写在注释里（`require("../framework/require-sibling.js")`），
 * routes-adapter.js 同理——不剥注释会报出两个不存在的「自引用循环依赖」。
 * 只做够用的处理：块注释 + 行注释；不追求完整词法分析（字符串里的 // 会误剥，
 * 但本仓库没有这种写法，且误剥只会少报依赖、不会凭空多报）。
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")     // 块注释
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1"); // 行注释（避开 http:// 这类）
}

/** 提取文件里所有 require("...") 的目标（原样，不做解析） */
function extractRequires(text) {
  const src = stripComments(text);
  const out = [];
  const re = /require\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

/** 提取 HTML 里的 <script src> 与 <link href>（相对引用） */
function extractHtmlRefs(text) {
  const out = { scripts: [], styles: [] };
  let m;
  const reS = /<script[^>]+src=["']([^"']+)["']/g;
  while ((m = reS.exec(text)) !== null) out.scripts.push(m[1]);
  const reL = /<link[^>]+href=["']([^"']+)["']/g;
  while ((m = reL.exec(text)) !== null) out.styles.push(m[1]);
  return out;
}

/** 去掉 querystring 与前面的 ./ */
function normalizeRef(r) {
  return r.split("?")[0].replace(/^\.\//, "");
}

// ---------------------------------------------------------------- 依赖图

/** 解析一个 require 目标 → 它指向 framework/ 下哪个文件（解析不了返回 null） */
function resolveRequire(fromFile, req) {
  if (!req.startsWith(".")) return null;                 // 外部包
  const base = path.resolve(path.dirname(fromFile), req);
  const cands = [base, base + ".js", base + ".cjs", path.join(base, "index.js")];
  for (const c of cands) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function buildGraph() {
  const files = listFiles(FW_DIR, (n) => n.endsWith(".js") || n.endsWith(".cjs"));
  const nodes = new Map();       // absPath → { name, requires: [{raw, target}] }
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const requires = extractRequires(text).map((raw) => ({
      raw,
      target: resolveRequire(f, raw),
    }));
    nodes.set(f, { name: path.relative(FW_DIR, f), requires });
  }

  // 反向索引：谁引用了我
  const importedBy = new Map();
  for (const f of files) importedBy.set(f, []);
  for (const [f, node] of nodes) {
    for (const r of node.requires) {
      if (r.target && importedBy.has(r.target)) importedBy.get(r.target).push(f);
    }
  }
  return { nodes, importedBy };
}

/** 找循环依赖（DFS 三色法） */
function findCycles(nodes) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const f of nodes.keys()) color.set(f, WHITE);
  const cycles = [];
  const stack = [];

  function dfs(f) {
    color.set(f, GRAY);
    stack.push(f);
    const node = nodes.get(f);
    for (const r of node.requires) {
      if (!r.target || !nodes.has(r.target)) continue;
      if (color.get(r.target) === GRAY) {
        const i = stack.indexOf(r.target);
        cycles.push(stack.slice(i).map((p) => path.relative(FW_DIR, p)).concat([path.relative(FW_DIR, r.target)]));
      } else if (color.get(r.target) === WHITE) {
        dfs(r.target);
      }
    }
    stack.pop();
    color.set(f, BLACK);
  }

  for (const f of nodes.keys()) if (color.get(f) === WHITE) dfs(f);
  return cycles;
}

// ---------------------------------------------------------------- 前端引用

/** 扫描各素材目录里「引用 js / css」的 html，回答「谁在用这些脚本」 */
function scanAssetRefs() {
  const roots = [
    { label: "blueprint", dir: BP_DIR },
    { label: "templates", dir: TPL_DIR },
  ];
  const scripts = new Map();     // js 文件名 → [{where, html}]
  const styles = new Map();

  for (const { label, dir } of roots) {
    const htmls = listFiles(dir, (n) => n.endsWith(".html"));
    for (const h of htmls) {
      const text = fs.readFileSync(h, "utf8");
      const refs = extractHtmlRefs(text);
      const where = `${label}/${path.relative(dir, h)}`;
      for (const s of refs.scripts) {
        const key = normalizeRef(s);
        if (!key || key.startsWith("http")) continue;
        if (!scripts.has(key)) scripts.set(key, []);
        scripts.get(key).push(where);
      }
      for (const s of refs.styles) {
        const key = normalizeRef(s);
        if (!key || key.startsWith("http")) continue;
        if (!styles.has(key)) styles.set(key, []);
        styles.get(key).push(where);
      }
    }
  }
  return { scripts, styles };
}

// ---------------------------------------------------------------- 输出

function main() {
  const { nodes, importedBy } = buildGraph();
  const cycles = findCycles(nodes);
  const { scripts, styles } = scanAssetRefs();

  if (AS_JSON) {
    const out = {
      framework: [...nodes.entries()].map(([f, n]) => ({
        file: n.name,
        lines: fs.readFileSync(f, "utf8").split("\n").length,
        requires: n.requires.filter((r) => r.target).map((r) => path.relative(FW_DIR, r.target)),
        importedBy: (importedBy.get(f) || []).map((p) => path.relative(FW_DIR, p)),
      })),
      cycles: cycles,
      scriptRefs: [...scripts.entries()].map(([k, v]) => ({ script: k, usedIn: v })),
      styleRefs: [...styles.entries()].map(([k, v]) => ({ style: k, usedIn: v })),
    };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return 0;
  }

  if (ONLY_CYCLES) {
    if (!cycles.length) { process.stdout.write("✅ 无循环依赖\n"); return 0; }
    process.stdout.write(`⚠️  发现 ${cycles.length} 组循环依赖：\n`);
    for (const c of cycles) process.stdout.write("  " + c.join(" → ") + "\n");
    return 1;
  }

  const L = [];
  L.push("framework 依赖与引用扫描");
  L.push("  目录: " + path.relative(ROOT, FW_DIR));
  L.push("  模块: " + nodes.size + " 个");
  L.push("");
  L.push("── 每个模块的依赖（→ 它 require 谁 / ← 谁 require 它）──");
  const sorted = [...nodes.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  for (const [f, n] of sorted) {
    const lines = fs.readFileSync(f, "utf8").split("\n").length;
    const out = n.requires.filter((r) => r.target).map((r) => path.relative(FW_DIR, r.target));
    const inn = (importedBy.get(f) || []).map((p) => path.relative(FW_DIR, p));
    const noDep = out.length === 0 && inn.length === 0;
    L.push(`  ${n.name}  (${lines} 行)${noDep ? "  【无任何依赖关系——独立模块】" : ""}`);
    if (out.length) L.push("      → " + out.join(", "));
    if (inn.length) L.push("      ← " + inn.join(", "));
  }
  L.push("");
  if (cycles.length) {
    L.push(`── ⚠️ 循环依赖 ${cycles.length} 组（拆子目录前必须先解开）──`);
    for (const c of cycles) L.push("  " + c.join(" → "));
  } else {
    L.push("── ✅ 无循环依赖 ──");
  }
  L.push("");
  L.push("── 前端脚本被哪些 html 引用（判断是否属「前端域」）──");
  for (const [k, v] of [...scripts.entries()].sort()) {
    L.push(`  ${k}`);
    for (const w of [...new Set(v)]) L.push("      被 " + w);
  }
  L.push("");
  L.push("── 样式表被哪些 html 引用 ──");
  for (const [k, v] of [...styles.entries()].sort()) {
    L.push(`  ${k}  ←  ${[...new Set(v)].join(", ")}`);
  }
  process.stdout.write(L.join("\n") + "\n");
  return 0;
}

process.exit(main());
