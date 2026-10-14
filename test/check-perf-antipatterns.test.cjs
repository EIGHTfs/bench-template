// test/check-perf-antipatterns.test.cjs —— 性能反模式检查器的单测（模板仓库版）
//
// 用法：node --test test/check-perf-antipatterns.test.cjs
// 零依赖、不联网；全部在系统临时目录里造夹具，**不碰任何真实项目**。
//
// 覆盖点（都是实际踩过的坑）：
//   1) R8 版本号漂移：**不一致要抓到**、**一致必须放过**（曾因规则缺比较而构造性误报）
//   2) 扫描目录自适应：非标准目录名要能扫到（不绑定某个仓库的布局）
//   3) node_modules / json / test 等必须跳过（否则噪音淹没真问题）
//   4) --root 生效（默认值不写死为脚本所在仓库）
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "check-perf-antipatterns.mjs");

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "perf-check-"));
}
function run(root) {
  const r = spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8" });
  return (r.stdout || "") + (r.stderr || "");
}
/** 从输出里取「N 个 blocker / M 个 warning / 扫描 K 个文件」 */
function parse(out) {
  const b = /(\d+)\s*个\s*blocker/.exec(out);
  const w = /(\d+)\s*个\s*warning/.exec(out);
  const f = /扫描\s*(\d+)\s*个文件/.exec(out);
  return { blocker: b ? Number(b[1]) : 0, warning: w ? Number(w[1]) : 0, files: f ? Number(f[1]) : 0, passed: /检查通过/.test(out) };
}
function writeUserscript(root, version) {
  const p = path.join(root, "scripts", "x.user.js");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `// ==UserScript==\n// @version ${version}\n// ==/UserScript==\n`);
}
function writeHtml(root, v) {
  const p = path.join(root, "server", "public", "fragments", "topbar", "t.html");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `<a href="/x.user.js?v=${v}">u</a>\n`);
}

test("R8：html 的 ?v= 与脚本 @version **不一致** ⇒ 必须报 blocker", () => {
  const d = mkTmp();
  writeUserscript(d, "1.0.0");
  writeHtml(d, "2.0.0");
  const r = parse(run(d));
  assert.equal(r.blocker, 1, run(d));
  fs.rmSync(d, { recursive: true, force: true });
});

test("R8：两者**一致** ⇒ 必须放过（曾因规则缺比较而误报）", () => {
  const d = mkTmp();
  writeUserscript(d, "7.7.2");
  writeHtml(d, "7.7.2");
  const out = run(d);
  assert.equal(parse(out).blocker, 0, out);
  fs.rmSync(d, { recursive: true, force: true });
});

test("扫描目录自适应：非标准目录名（webapp/）也要扫到", () => {
  const d = mkTmp();
  fs.mkdirSync(path.join(d, "webapp"), { recursive: true });
  fs.writeFileSync(path.join(d, "webapp", "a.js"),
    'async function f(g) {\n  for (const item of g.items) {\n    require("fs").existsSync(item.path);\n    require("fs").statSync(item.path);\n  }\n}\n');
  const r = parse(run(d));
  assert.ok(r.warning >= 1, run(d));
  assert.match(run(d), /webapp[\\/]a\.js/);
  fs.rmSync(d, { recursive: true, force: true });
});

test("扫描目录自适应：node_modules 必须跳过（否则噪音淹没真问题）", () => {
  const d = mkTmp();
  fs.mkdirSync(path.join(d, "node_modules"), { recursive: true });
  fs.writeFileSync(path.join(d, "node_modules", "b.js"),
    'async function f(g) {\n  for (const item of g.items) {\n    require("fs").existsSync(item.path);\n    require("fs").statSync(item.path);\n  }\n}\n');
  const out = run(d);
  assert.equal(parse(out).files, 0, out);   // 没有可扫文件 ⇒ 不报 node_modules 里的问题
  assert.doesNotMatch(out, /node_modules/);
  fs.rmSync(d, { recursive: true, force: true });
});

test("--root 生效：默认根是脚本所在仓库，指定后必须只扫指定根", () => {
  const d = mkTmp();
  writeUserscript(d, "1.0.0");
  writeHtml(d, "2.0.0");
  const out = run(d);
  assert.match(out, /扫描 2 个文件/, out);       // 只扫到夹具里的两个文件
  assert.doesNotMatch(out, /bench-template/, out);
  fs.rmSync(d, { recursive: true, force: true });
});
