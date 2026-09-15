#!/usr/bin/env node
// ============================================================
// 扫描 HTML 里 <script> 标签之外裸露的 JS 残留
//
// 背景：XSS 抽取（内联 script → 外部 .js）时，如果只加了
//   <script src="xxx.js"></script> 却没删掉原内联代码，浏览器会
//   把裸露的 JS 文本当页面内容渲染出来（注释/代码可见）。
//
// 用法：
//   node scripts/scan-bare-js-html.js <文件或目录> [--json]
//   目录会递归扫 *.html
//
// 输出：每个文件里 script 标签外的 JS 特征行（行号 + 内容）
//   --json 输出 JSON 便于程序消费
//
// 判定：逐行跟踪 <script>..</script> 块状态，块外的行若匹配
//   JS 特征（// 注释、try {、const/let/var、function、{..}、赋值/调用等）
//   则报告。正常 HTML 文本（如 <p>const</p>）可能误报，人工复核。
// ============================================================
"use strict";

const fs = require("fs");
const path = require("path");

const JS_PATTERN = /^\s*(?:\/\/|\/\*|try\s*\{|catch\s*\(|finally\s*\{|const\s+|let\s+|var\s+|function\s|async\s+function|if\s*\(|for\s*\(|while\s*\(|switch\s*\(|return\s|throw\s|new\s+|await\s+|document\.|window\.|localStorage|sessionStorage|fetch\s*\(|\}\s*(?:catch|else|finally)?\s*\{?|\}\s*\)?\s*;|\);|=>|\.addEventListener|\.innerHTML|\.textContent|JSON\.)/;

function scanFile(fp) {
  const lines = fs.readFileSync(fp, "utf-8").split("\n");
  const hits = [];
  let inScript = false; // <script> 块内
  let inStyle = false;  // <style> 块内（CSS 不算 JS）

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    // ---- 更新块状态（本行优先）----
    const hasScriptOpen = /<script[\s>]/i.test(line) || /<script$/i.test(line);
    const hasScriptClose = /<\/script>/i.test(line);
    const hasStyleOpen = /<style[\s>]/i.test(line) || /<style$/i.test(line);
    const hasStyleClose = /<\/style>/i.test(line);

    if (hasStyleOpen && hasStyleClose) continue;
    if (hasStyleOpen) { inStyle = true; continue; }
    if (hasStyleClose) { inStyle = false; continue; }
    if (hasScriptOpen && hasScriptClose) continue;
    if (hasScriptOpen) { inScript = true; continue; }
    if (hasScriptClose) { inScript = false; continue; }

    // ---- 块外行检查裸 JS 特征 ----
    if (!inScript && !inStyle && t && JS_PATTERN.test(t)) {
      if (/^<!--/.test(t)) continue;
      hits.push({ line: i + 1, text: t.slice(0, 90) });
    }
  }
  return hits;
}

function collectHtmlFiles(target) {
  const out = [];
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".trash")) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith(".html")) out.push(p);
    }
  };
  walk(target);
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const targets = args.filter((a) => !a.startsWith("--"));
  const asJson = args.includes("--json");

  const files = [];
  for (const t of targets.length ? targets : ["."]) {
    for (const f of collectHtmlFiles(t)) files.push(f);
  }
  const report = [];
  for (const f of files) {
    const hits = scanFile(f);
    if (hits.length) report.push({ file: f, hits });
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  let total = 0;
  for (const r of report) {
    console.log(`\n══ ${r.file}（${r.hits.length} 处）══`);
    for (const h of r.hits) console.log(`  L${h.line}: ${h.text}`);
    total += r.hits.length;
  }
  console.log(`\n共 ${report.length} 个文件、${total} 处疑似裸 JS 残留`);
  process.exit(total ? 1 : 0);
}

main();
