#!/usr/bin/env node
/**
 * HTML 片段组装方式性能基准
 *
 * 对比前端按功能拆分后三种组装方式的真实开销：
 *   static   构建期静态拼接（setup.sh 拼好整份 index.html，运行时读单文件）
 *   assemble 服务端每请求拼装（读 N 个片段 + join）
 *   cached   服务端启动拼一次 + 内存缓存
 *
 * 用法：
 *   node bench-html-assembly.js                 # 合成 6 片段（22KB）基准
 *   node bench-html-assembly.js <index.html>    # 用真实文件规模基准
 *
 * 输出串行与并发两组数据，判断「服务端 include 的性能代价」是否可接受。
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const FRAG_COUNT = 6;
const TMP = path.join(require("os").tmpdir(), "html-assembly-bench");

// ---------- 准备片段 ----------
function prepare(realFile) {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  let full;
  if (realFile) {
    full = fs.readFileSync(realFile, "utf8");
    const lines = full.split("\n");
    const size = Math.ceil(lines.length / FRAG_COUNT);
    for (let i = 0; i < FRAG_COUNT; i++) {
      fs.writeFileSync(path.join(TMP, `p${i}.html`), lines.slice(i * size, (i + 1) * size).join("\n"));
    }
    console.log(`  数据源: ${realFile}`);
  } else {
    full = "";
    for (let i = 0; i < FRAG_COUNT; i++) {
      const rows = [];
      for (let j = 0; j < 62; j++) {
        rows.push(`  <div class="sec-${i}-${j}"><span>片段 ${i} 内容 ${j}</span></div>`);
      }
      fs.writeFileSync(path.join(TMP, `p${i}.html`), rows.join("\n"));
    }
    full = Array.from({ length: FRAG_COUNT }, (_, i) => fs.readFileSync(path.join(TMP, `p${i}.html`), "utf8")).join("\n");
  }
  fs.writeFileSync(path.join(TMP, "full.html"), full);
  console.log(`  片段数: ${FRAG_COUNT}   拼装后: ${(Buffer.byteLength(full) / 1024).toFixed(1)} KB`);
}

const FRAGS = Array.from({ length: FRAG_COUNT }, (_, i) => `p${i}.html`);
let cached = null;

function buildBody(mode) {
  if (mode === "static") return fs.readFileSync(path.join(TMP, "full.html"), "utf8");
  if (mode === "assemble") return FRAGS.map((f) => fs.readFileSync(path.join(TMP, f), "utf8")).join("\n");
  if (!cached) cached = FRAGS.map((f) => fs.readFileSync(path.join(TMP, f), "utf8")).join("\n");
  return cached;
}

function makeServer(mode) {
  return http.createServer((req, res) => {
    const body = buildBody(mode);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
  });
}

// ---------- 请求 ----------
function one(port) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const r = http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
      res.resume();
      res.on("end", () => resolve(Number(process.hrtime.bigint() - t0) / 1000));
    });
    r.on("error", () => resolve(NaN));
  });
}

// ---------- 测试 ----------
async function serial(mode, port, n = 400) {
  cached = null;
  const srv = makeServer(mode);
  await new Promise((r) => srv.listen(port, "127.0.0.1", r));
  for (let i = 0; i < 20; i++) await one(port);          // 预热
  const t0 = Date.now();
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(await one(port));
  const wall = Date.now() - t0;
  arr.sort((a, b) => a - b);
  const avg = arr.reduce((a, b) => a + b, 0) / n;
  console.log(`  ${mode.padEnd(9)} 中位 ${arr[n >> 1].toFixed(0).padStart(4)}µs | 平均 ${avg.toFixed(0).padStart(4)}µs | ${n} 次共 ${wall}ms | ${(n / (wall / 1000)).toFixed(0)} req/s`);
  srv.close();
}

async function concurrent(mode, port, total = 600, conc = 30) {
  cached = null;
  const srv = makeServer(mode);
  await new Promise((r) => srv.listen(port, "127.0.0.1", r));
  for (let i = 0; i < 30; i++) await one(port);
  const t0 = Date.now();
  const times = [];
  let inflight = 0, done = 0;
  await new Promise((resolve) => {
    (function next() {
      while (inflight < conc && done + inflight < total) {
        inflight++;
        one(port).then((us) => {
          if (!Number.isNaN(us)) times.push(us);
          inflight--; done++;
          done >= total ? resolve() : next();
        });
      }
      if (done >= total) resolve();
    })();
  });
  const wall = Date.now() - t0;
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`  ${mode.padEnd(9)} 平均 ${avg.toFixed(0).padStart(5)}µs | p50 ${times[times.length >> 1].toFixed(0).padStart(5)}µs | p99 ${times[Math.floor(times.length * 0.99)].toFixed(0).padStart(6)}µs | ${(total / (wall / 1000)).toFixed(0)} req/s`);
  srv.close();
}

(async () => {
  prepare(process.argv[2]);
  console.log("\n  【串行请求】400 次，测单次真实延迟：");
  await serial("static", 8731);
  await serial("assemble", 8732);
  await serial("cached", 8733);

  console.log("\n  【并发请求】600 次 / 30 并发：");
  await concurrent("static", 8741);
  await concurrent("assemble", 8742);
  await concurrent("cached", 8743);

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("\n  说明：实测结论见 docs/前端片段化改造指南.md");
})();
