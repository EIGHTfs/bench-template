// test/js-parts.test.cjs —— JS 分片拼接器单测（Step 1，2026-10-14）
//
// 用法：node --test test/js-parts.test.cjs   或   node test/js-parts.test.cjs
// 零依赖、不联网；全部在系统临时目录里跑玩具片段集，**不碰任何真代码**。
//
// 为什么单测这些：拼接器的失败模式都是「静默产出坏文件」——
//   缺片少一段、顺序错、CRLF 混入、写盘写到一半 —— 这些在浏览器里表现为「交互时才炸」，
//   静态检查与 API 层都探测不到（见 dsh-clientjs-split-build 的作用域大坑）。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const JOINER = path.join(ROOT, "scripts", "join-js-parts.mjs");

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "js-parts-"));
}
function run(args, cwd) {
  const r = spawnSync(process.execPath, [JOINER, ...args], { cwd: cwd || ROOT, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

test("基本拼接：按清单顺序拼接，产物为各片段之和", () => {
  const d = mkTmp();
  fs.mkdirSync(path.join(d, "parts"));
  fs.writeFileSync(path.join(d, "parts", "a.js"), "const A = 1;\n");
  fs.writeFileSync(path.join(d, "parts", "b.js"), "const B = 2;\n");
  fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ parts: ["parts/a.js", "parts/b.js"] }));
  const r = run([path.join(d, "manifest.json"), path.join(d, "out.js")]);
  assert.equal(r.code, 0, r.out);
  assert.equal(fs.readFileSync(path.join(d, "out.js"), "utf8"), "const A = 1;\nconst B = 2;\n");
  fs.rmSync(d, { recursive: true, force: true });
});

test("顺序即依赖：调换清单顺序 → 产物字节不同（证明顺序被真正遵守）", () => {
  const d = mkTmp();
  fs.mkdirSync(path.join(d, "parts"));
  fs.writeFileSync(path.join(d, "parts", "a.js"), "A\n");
  fs.writeFileSync(path.join(d, "parts", "b.js"), "B\n");
  fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ parts: ["parts/a.js", "parts/b.js"] }));
  assert.equal(run([path.join(d, "manifest.json"), path.join(d, "o1.js")]).code, 0);
  fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ parts: ["parts/b.js", "parts/a.js"] }));
  assert.equal(run([path.join(d, "manifest.json"), path.join(d, "o2.js")]).code, 0);
  assert.notEqual(fs.readFileSync(path.join(d, "o1.js"), "utf8"), fs.readFileSync(path.join(d, "o2.js"), "utf8"));
  fs.rmSync(d, { recursive: true, force: true });
});

test("缺片必须中止（且不覆盖已有产物）—— 静默少一段是最危险的失败模式", () => {
  const d = mkTmp();
  fs.mkdirSync(path.join(d, "parts"));
  fs.writeFileSync(path.join(d, "parts", "a.js"), "A\n");
  fs.writeFileSync(path.join(d, "out.js"), "OLD-CONTENT\n");
  fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ parts: ["parts/a.js", "parts/missing.js"] }));
  const r = run([path.join(d, "manifest.json"), path.join(d, "out.js")]);
  assert.notEqual(r.code, 0, "缺片应非 0 退出");
  assert.match(r.out, /片段缺失/);
  assert.equal(fs.readFileSync(path.join(d, "out.js"), "utf8"), "OLD-CONTENT\n", "产物必须保持原样");
  fs.rmSync(d, { recursive: true, force: true });
});

test("空片段集必须报错（空片段集不该走拼接）", () => {
  const d = mkTmp();
  fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ parts: [] }));
  const r = run([path.join(d, "manifest.json"), path.join(d, "out.js")]);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /parts 为空/);
  fs.rmSync(d, { recursive: true, force: true });
});

test("幂等：同输入跑两次，产物字节完全一致", () => {
  const d = mkTmp();
  fs.mkdirSync(path.join(d, "parts"));
  fs.writeFileSync(path.join(d, "parts", "a.js"), "A\n");
  fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ parts: ["parts/a.js"] }));
  run([path.join(d, "manifest.json"), path.join(d, "o.js")]);
  const first = fs.readFileSync(path.join(d, "o.js"), "utf8");
  run([path.join(d, "manifest.json"), path.join(d, "o.js")]);
  assert.equal(fs.readFileSync(path.join(d, "o.js"), "utf8"), first);
  fs.rmSync(d, { recursive: true, force: true });
});

test("CRLF 统一为 LF：片段是 CRLF 时产物不得混入 \\r", () => {
  const d = mkTmp();
  fs.mkdirSync(path.join(d, "parts"));
  fs.writeFileSync(path.join(d, "parts", "a.js"), "A\r\nB\r\n");
  fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ parts: ["parts/a.js"] }));
  run([path.join(d, "manifest.json"), path.join(d, "o.js")]);
  assert.ok(!fs.readFileSync(path.join(d, "o.js"), "utf8").includes("\r"), "产物不得含 CR");
  fs.rmSync(d, { recursive: true, force: true });
});

test("--check：一致时退出 0 且不写盘；不一致时退出 1", () => {
  const d = mkTmp();
  fs.mkdirSync(path.join(d, "parts"));
  fs.writeFileSync(path.join(d, "parts", "a.js"), "A\n");
  fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ parts: ["parts/a.js"] }));
  fs.writeFileSync(path.join(d, "o.js"), "A\n");
  const ok = run([path.join(d, "manifest.json"), path.join(d, "o.js"), "--check"]);
  assert.equal(ok.code, 0, ok.out);
  fs.writeFileSync(path.join(d, "o.js"), "DIFFERENT\n");
  const bad = run([path.join(d, "manifest.json"), path.join(d, "o.js"), "--check"]);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /不一致/);
  assert.equal(fs.readFileSync(path.join(d, "o.js"), "utf8"), "DIFFERENT\n", "--check 不得写盘");
  fs.rmSync(d, { recursive: true, force: true });
});
