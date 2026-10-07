#!/usr/bin/env node
/**
 * build-userscript.js —— 按片段组装通用油猴脚本
 *
 * 用法：
 *   node scripts/build-userscript.js <项目 userscript 目录> <输出 .user.js> [--check]
 *
 * 协议（见 templates/userscript/README.md）：
 *   - 通用片段目录：templates/userscript/cookie-fetch/（或项目 00-config.json 里 templateDir 指定）
 *   - 项目片段目录：<项目 userscript 目录>
 *   - 片段 = *.js，文件名数字前缀决定拼接顺序，两侧合并后统一排序
 *     （所以项目用 00-/50- 就能插进通用片段之间：10-config → 20-core → 30-panel → 40-account → 90-boot）
 *   - <项目>/00-config.json 为项目配置：
 *       · 替换 header.tpl 的 {{占位符}}
 *       · 生成产物开头的 `const CFG = {...};`
 *   - 产物结构：UserScript 头 + IIFE（"use strict" + CFG + 各片段）
 *
 * --check：只校验不写盘（片段缺失/占位符未替换会报错并非 0 退出）
 */
"use strict";

const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const args = argv.filter((a) => !a.startsWith("--"));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_TPL_DIR = path.join(REPO_ROOT, "templates", "userscript", "cookie-fetch");
const DEFAULT_GRANTS = [
  "GM_setClipboard", "GM_getValue", "GM_setValue", "GM_notification",
  "GM_cookie.list", "GM_cookie.set", "GM_xmlhttpRequest"
];

function die(msg) { console.error("❌ " + msg); process.exit(1); }

/** 取文件名数字前缀（无数字则给大值，排到末尾） */
function prefixOf(name) {
  const m = String(name).match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 9999;
}
/** 收集目录下的 .js 片段 */
function collect(dir, tag) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => ({ file: f, tag, dir, text: fs.readFileSync(path.join(dir, f), "utf8") }));
}

if (args.length < 2) {
  console.error("用法: node scripts/build-userscript.js <项目 userscript 目录> <输出 .user.js> [--check]");
  process.exit(1);
}
const projDir = path.resolve(args[0]);
const outFile = path.resolve(args[1]);

if (!fs.existsSync(projDir)) die("项目目录不存在: " + projDir);
const cfgFile = path.join(projDir, "00-config.json");
if (!fs.existsSync(cfgFile)) die("缺少项目配置 " + path.join(path.basename(projDir), "00-config.json"));

let cfg;
try { cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8")); }
catch (e) { die("00-config.json 解析失败: " + e.message); }

const tplDir = cfg.templateDir ? path.resolve(REPO_ROOT, cfg.templateDir) : DEFAULT_TPL_DIR;
if (!fs.existsSync(tplDir)) die("通用模板目录不存在: " + tplDir);
const headerFile = path.join(tplDir, "header.tpl");
if (!fs.existsSync(headerFile)) die("缺少 " + headerFile);

// ---- header 占位符替换 ----
let header = fs.readFileSync(headerFile, "utf8");
const grants = Array.isArray(cfg.grant) && cfg.grant.length ? cfg.grant : DEFAULT_GRANTS;
const replaced = [];
header = header.replace(/\{\{(\w+)\}\}/g, (m, key) => {
  replaced.push(key);
  if (key === "match") return (cfg.match || ["*://*/*"]).map((s) => "// @match        " + s).join("\n");
  if (key === "grant") return grants.map((s) => "// @grant        " + s).join("\n");
  const v = cfg[key];
  return v === undefined || v === null ? "" : String(v);
});
if (/\{\{\w+\}\}/.test(header)) die("header.tpl 仍有未替换占位符（检查 00-config.json 字段）");

// ---- 收集并排序片段（两侧合并） ----
const frags = collect(tplDir, "模板").concat(collect(projDir, "项目"));
if (!frags.length) die("没有任何 .js 片段");
frags.sort((a, b) => prefixOf(a.file) - prefixOf(b.file) || a.file.localeCompare(b.file));

// 片段里有硬编码的站点/键名/前缀时给出提示（这些应全部走 CFG）
const hardcoded = [];
for (const f of frags) {
  const hits = [];
  if (/\biwcred[-:]/.test(f.text)) hits.push("iwcred-");
  if (/\bgbcred[-:]/.test(f.text)) hits.push("gbcred-");
  if (/iwara\.tv|gamebanana\.com/.test(f.text)) hits.push("站点域名");
  if (hits.length) hardcoded.push(f.tag + "/" + f.file + " → " + hits.join("/"));
}

// ---- 片段内占位符替换（数据类配置；覆盖 CSS / 字符串字面量里的前缀与文案）----
//   片段里写 {{IDP}}fab、{{STORE_PREFIX}}server、{{SITE_DOMAIN}} 等，组装时按配置替换；
//   这样 id 前缀/键前缀/域名/文案不需要改写成 CFG.xxx 引用（CSS 字符串里也能用）。
const FRAG_KEYS = [
  "IDP", "STORE_PREFIX", "LOG_TAG", "SITE_DOMAIN", "SITE_DOMAINS", "SITE_NAME",
  "NOTIFY_TITLE", "ICON", "VER", "SRV_KEY", "SRV_PWD_KEY", "SRV_LIST_KEY",
  "COOKIE_CACHE_KEY", "USER_CACHE_KEY", "ACCOUNT_TTL_MS", "LOGIN_WARN_DAYS", "SKEW_MS"
];
const missingKeys = new Set();
for (const f of frags) {
  f.text = f.text.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (cfg[k] === undefined || cfg[k] === null) { missingKeys.add(k); return m; }
    return String(cfg[k]);
  });
}
if (missingKeys.size) die("00-config.json 缺少片段占位符对应字段: " + [...missingKeys].join(", "));

// ---- 组装 ----
const CFG_JSON = JSON.stringify(cfg, null, 4);
const body = frags.map((f) => f.text.replace(/\s+$/, "")).join("\n\n");
const out = [
  header.replace(/\s+$/, ""),
  "",
  "/* ============================================================",
  " * 本文件由模板组装生成，请勿手改。",
  " *   模板: templates/userscript/" + path.basename(tplDir) + "/",
  " *   项目: " + path.relative(REPO_ROOT, projDir).split(path.sep).join("/") + "/",
  " *   组装: node scripts/build-userscript.js <项目目录> <输出>",
  " * ============================================================ */",
  "(function () { // dsh-skip-func-length 油猴脚本标准 IIFE 包裹（模板组装，全脚本一体，不可按行拆分）",
  '    "use strict";',
  "",
  "    // ---- 项目配置（来自 00-config.json；命名带前缀避免与脚本自有 CFG 冲突）----",
  "    const __US_CFG = " + CFG_JSON + ";",
  "",
  body,
  "})();",
  ""
].join("\n");

// ---- 自检 ----
const problems = [];
if (/@version\s+\{\{/.test(out) || /\{\{\w+\}\}/.test(out)) problems.push("产物仍有未替换占位符");
for (const f of frags) if (!f.text.trim()) problems.push(f.tag + "/" + f.file + " 为空");
if (hardcoded.length) problems.push("片段里疑似硬编码（应改为 CFG 读取）: " + hardcoded.join("; "));

console.log("模板目录: " + path.relative(REPO_ROOT, tplDir));
console.log("项目目录: " + path.relative(REPO_ROOT, projDir));
console.log("片段顺序: " + frags.map((f) => f.tag + "/" + f.file).join(" → "));
console.log("占位符  : " + (replaced.length ? [...new Set(replaced)].join(", ") : "(无)"));
console.log("产物行数: " + (out.split("\n").length - 1));

if (problems.length) {
  console.error("\n⚠️ 自检问题：");
  for (const p of problems) console.error("  - " + p);
}

if (CHECK) {
  console.log(problems.length ? "\n--check 失败" : "\n--check 通过");
  process.exit(problems.length ? 1 : 0);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out, "utf8");
console.log("\n✅ 已生成: " + outFile);
