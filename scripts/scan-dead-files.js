#!/usr/bin/env node
// ============================================================
// 扫描「死文件」——存在但没有任何地方引用的资源文件
//
// 背景：模板/项目做重构时（样式上移、分片改名、按钮改版），
//   旧文件常常留在原地没人删：
//     · save-fab.css 改名成 diff.css 后，旧的 save-fab.css 还在
//     · 分片从风格层上移到通用层后，风格层的旧副本还在
//   它们不被任何 @frag 引用、不被 HTML/JS 提及，纯属噪声，
//   还会让人误以为「这块样式还在生效」。
//
// 用法：
//   node scripts/scan-dead-files.js <目录> [选项]
//   目录可给多个，会逐个扫描。'.' 按【当前工作目录】解析，
//   从别处调用时建议直接给绝对路径。
//
// 选项：
//   --json              输出 JSON（便于程序消费）
//   --ext=.css,.html    只扫这些扩展名（默认 .css,.html,.js）
//   --quiet             只输出结论行
//
// 判定：一个文件算「死文件」需同时满足
//   1) 位于 fragments/ 下（分片体系管理的资源目录）
//   2) 没有任何 @frag:<相对路径> 引用它
//   3) 没有其它文件按【文件名】或【去扩展名的名字】提及它
//   4) 自身不是入口（index.html/style.css/app.js/login.*）
//
// 退出码：发现死文件 = 1（可直接用于 CI），否则 0
// ============================================================
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_EXTS = [".css", ".html", ".js"];

/** 分片入口：这些文件本身不被 @frag 引用也是活的 */
const ENTRY_BASENAMES = new Set([
  "index.html",
  "style.css",
  "app.js",
  "login.html",
  "login.js",
]);

function parseArgs(argv) {
  const opts = { dirs: [], json: false, quiet: false, exts: DEFAULT_EXTS };
  for (const a of argv) {
    if (a === "--json") opts.json = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a.startsWith("--ext=")) {
      opts.exts = a
        .slice(6)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.startsWith(".") ? s : "." + s));
    } else if (!a.startsWith("-")) opts.dirs.push(a);
  }
  if (!opts.dirs.length) opts.dirs.push(".");
  return opts;
}

/** 递归收集文件 */
function walk(dir, exts, out) {
  out = out || [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, exts, out);
    else if (exts.includes(path.extname(e.name))) out.push(fp);
  }
  return out;
}

/**
 * 把整个项目的文本拼起来，用于「被提及」判定。
 * 返回 { text, byFile }：byFile 保留单文件内容，
 * 以便判定某个文件时把【它自己】排除掉（否则文件内的类名会造成自引用）。
 */
function readAllText(root) {
  const files = walk(root, [".css", ".html", ".js", ".json", ".md"], []);
  const byFile = new Map();
  const chunks = [];
  for (const f of files) {
    try {
      const t = fs.readFileSync(f, "utf-8");
      byFile.set(f, t);
      chunks.push(t);
    } catch (_) {
      /* 读不了就跳过 */
    }
  }
  return { text: chunks.join("\n"), byFile };
}

/**
 * 找出一个根目录下所有「分片目录」。
 * 项目形态：   server/public/fragments/
 * 模板形态：   server/project/blueprint/fragments/
 *              server/templates/_<风格>-style/fragments/
 */
function findFragDirs(root) {
  const found = [];
  const direct = [
    path.join(root, "server", "public", "fragments"),
    path.join(root, "fragments"),
  ];
  for (const d of direct) if (fs.existsSync(d)) found.push(d);

  const tplBase = path.join(root, "server", "templates");
  let styles = [];
  try {
    styles = fs.readdirSync(tplBase, { withFileTypes: true });
  } catch (_) {
    styles = [];
  }
  for (const e of styles) {
    if (!e.isDirectory()) continue;
    const d = path.join(tplBase, e.name, "fragments");
    if (fs.existsSync(d)) found.push(d);
  }

  const bp = path.join(root, "server", "project", "blueprint", "fragments");
  if (fs.existsSync(bp)) found.push(bp);

  return [...new Set(found)];
}

/** 扫描一个根目录 */
function scanRoot(root, exts) {
  const fragDirs = findFragDirs(root);
  if (!fragDirs.length) return { root, fragDirs: [], dead: [], checked: 0 };

  const all = readAllText(root);
  const haystack = all.text;
  const dead = [];
  let checked = 0;

  // 判定某文件时用的文本 = 全项目文本 - 该文件自身
  //（否则文件内容里出现的自己的类名会造成「自引用」，永远判定为活在用）
  const textWithout = (fp) => {
    const own = all.byFile.get(fp);
    if (!own) return haystack;
    return haystack.replace(own, "");
  };

  for (const fragDir of fragDirs) {
    const targets = walk(fragDir, exts, []);
    checked += targets.length;

    for (const fp of targets) {
      const base = path.basename(fp);
      if (ENTRY_BASENAMES.has(base)) continue;

      const rel = path.relative(fragDir, fp).split(path.sep).join("/");
      const stem = base.replace(/\.[^.]+$/, "");

      const hay = textWithout(fp);
      if (hay.includes("@frag:" + rel)) continue;
      // 分片可能被跨层引用（风格层同名文件被通用层 style.css 引用），
      // 因此按【文件名】而非完整相对路径做二次判定
      if (hay.includes(base)) continue;
      // 去扩展名后按「CSS 类名/JS 标识符」的形态找：
      //   起始处须是边界，尾部允许 -/_ 续接（grid-map.css 对应 .grid-map-row）
      const esc = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp("(^|[^\\w-])" + esc + "([^\\w]|$)").test(hay)) continue;

      dead.push({ file: fp, rel: path.relative(root, fp).split(path.sep).join("/"), base });
    }
  }

  return { root, fragDirs, dead, checked };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const results = opts.dirs.map((d) => scanRoot(path.resolve(d), opts.exts));

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    let totalDead = 0;
    for (const r of results) {
      if (!r.fragDirs.length) {
        if (!opts.quiet) console.log(`  ${r.root}\n    （未找到 fragments/ 目录，跳过）`);
        continue;
      }
      if (!opts.quiet) {
        console.log(`  ${r.root}`);
        for (const d of r.fragDirs) console.log(`    分片目录: ${d}`);
        console.log(`    检查 ${r.checked} 个文件，死文件 ${r.dead.length} 个`);
      }
      for (const d of r.dead) {
        console.log(`      ✗ ${d.rel}`);
        totalDead++;
      }
      if (!opts.quiet && r.dead.length) console.log("");
    }
    console.log(totalDead ? `  ❌ 共发现 ${totalDead} 个死文件` : "  ✅ 未发现死文件");
  }

  process.exit(results.some((r) => r.dead.length) ? 1 : 0);
}

main();
