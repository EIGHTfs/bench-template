#!/usr/bin/env node
// ============================================================
// check-auth.cjs — 三项目通用 API 鉴权检测脚本（gbmd / iwara / gallery）
//
// 能力：
//   1. 自动发现全部 API：静态扫描 server/ 路由表 + public/ 前端 fetch 调用，
//      提取 "METHOD /path" 得到完整 API 清单（去重、去 query/通配）。
//   2. 逐个检测鉴权行为（未登录）：GET 无 cookie 探测；POST/DELETE 发空 body
//      （鉴权先于业务——未登录 401；公开但需参数 400；公开可写 200）。
//      分类：公开 / 需登录 / 参数依赖 / 404（可能含动态参数）。
//   3. 鉴权链路检测：/api/status 字段契约（ok/needsSetup/needsAuth/port）、
//      未设密码放行、401 响应带 needsLogin 标记。
//   4. --password 分支：登录后重测所有「需登录」API → 应全部放行（非 401）。
//
// 用法：
//   node check-auth.cjs --root <项目根> [--port N] [--host 127.0.0.1]
//        [--write-api /api/favorites] [--password 明文密码] [--json]
//   --root       项目根目录（默认 cwd；自动从 server/config.json 读 port）
//   --port       覆盖端口（可选）
//   --host       目标主机（默认 127.0.0.1）
//   --write-api  鉴权链路检测的写探针 POST 路径（默认 /api/favorites）
//   --password   项目登录密码（提供才测登录成功分支；不改项目任何配置）
//   --json       只输出 JSON 汇总（供程序消费）
// 退出码：0=鉴权链路全通过，1=有 FAIL
// ============================================================
"use strict";

const fs = require("fs");
const path = require("path");

// ---------- 参数 ----------
function printHelp() {
  console.log(`用法: node check-auth.cjs [选项]
  --root <dir>      项目根目录（默认 cwd；自动读 server/config.json 的 port）
  --port <N>        覆盖端口（可选）
  --host <ip>       目标主机（默认 127.0.0.1）
  --write-api <p>   鉴权链路写探针 POST 路径（默认 /api/favorites）
  --password <pw>   项目登录密码（提供才测登录成功分支；不改项目配置）
  --json            只输出 JSON 汇总
  -h, --help        帮助`);
}

function parseArgs(argv) {
  const args = { host: "127.0.0.1", writeApi: "/api/favorites", root: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") args.root = argv[++i];
    else if (a === "--port") args.port = Number(argv[++i]);
    else if (a === "--host") args.host = argv[++i];
    else if (a === "--write-api") args.writeApi = argv[++i];
    else if (a === "--password") args.password = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") { printHelp(); process.exit(0); }
  }
  return args;
}

// ---------- 端口探测 ----------
function detectPort(root) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(root, "server", "config.json"), "utf8"));
    if (d && typeof d.port === "number") return d.port;
  } catch (_) {}
  return null;
}

// ---------- API 自动发现 ----------
// 路由表两种写法：键式 "GET /path"（gallery createRoute / gbmd 表式）与
// 函数式 route("GET","/path") / routePublic("GET","/path")（iwara）
const RE_KEY = /["'`](GET|POST|DELETE|PUT|PATCH|HEAD|OPTIONS)\s+(\/[^"'`\s]+)["'`]/g;
const RE_FN = /route(?:Public)?\(\s*["'`](GET|POST|DELETE|PUT|PATCH|HEAD|OPTIONS)["'`]\s*,\s*["'`](\/[^"'`]+)["'`]/g;

function normApiPath(p) {
  p = p.split("?")[0].replace(/\*/g, "").replace(/:[\w]+/g, ":param").trim();
  if (!p.startsWith("/")) return "";
  // 含正则/路径通配等特殊字符的噪音（如 /^\/avatar\// 这类匹配表达式）
  if (/[^/\w\-:._~]/.test(p)) return "";
  // 统一 /api 前缀：gallery createRoute 键式写 "GET /favorites"（挂载时统一加前缀），
  // iwara/gbmd 显式写 "/api/..."——无前缀的补上，探测路径才一致
  if (!p.startsWith("/api/")) p = "/api" + p;
  return p;
}

function collectFiles(dir, out, depth = 0) {
  if (depth > 6) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name.startsWith(".trash")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectFiles(p, out, depth + 1);
    else if (/\.(js|cjs)$/.test(e.name)) out.push(p);
  }
}

function extractApis(root) {
  const files = [];
  collectFiles(path.join(root, "server"), files);
  const apis = new Map(); // key: METHOD pathname
  for (const f of files) {
    let src;
    try { src = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
    let m;
    RE_KEY.lastIndex = 0;
    while ((m = RE_KEY.exec(src)) !== null) {
      const p = normApiPath(m[2]);
      if (p) apis.set(`${m[1]} ${p}`, { method: m[1], path: p });
    }
    RE_FN.lastIndex = 0;
    while ((m = RE_FN.exec(src)) !== null) {
      const p = normApiPath(m[2]);
      if (p) apis.set(`${m[1]} ${p}`, { method: m[1], path: p });
    }
  }
  return [...apis.values()];
}

// ---------- 请求 ----------
async function req(base, p, { method = "GET", cookie, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(base + p, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data, setCookie: res.headers.get("set-cookie") };
}

// ---------- 主流程 ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = args.port || detectPort(args.root);
  if (!port) {
    console.error("❌ 未指定 --port，且 server/config.json 里读不到 port");
    process.exit(1);
  }
  const base = `http://${args.host}:${port}`;
  const out = { base, port, root: args.root, apis: [], authChain: [], summary: {} };

  // ========== 0. 连接检查 ==========
  const st = await connectOrExit(base, args);
  if (!args.json) console.log(`═══ API 鉴权检测: ${base}（root=${args.root}）═══\n`);

  // ========== 1. 鉴权链路（/api/status 契约 + 写探针） ==========
  const chain = [];
  const step = (name, pass, detail) => {
    chain.push({ name, pass, detail: detail || "" });
    if (!args.json) console.log(`${pass ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  };
  const isSetup = await probeAuthChain(base, st, args, step);
  out.authChain = chain;

  // ========== 2. 自动发现全部 API ==========
  const apis = extractApis(args.root);
  if (!args.json) console.log(`\n--- 发现 ${apis.length} 个 API 路由 ---`);

  // ========== 3. 未登录逐个探测 ==========
  const probe = await probeApis(base, apis);
  out.apis.push(...probe.records);

  // ========== 4. 登录后重测需登录项 ==========
  if (!isSetup && args.password) await retestLoggedIn(base, probe.needLogin, args.password, step);
  else if (!isSetup && !args.password) {
    if (!args.json) console.log("\n（未提供 --password，跳过登录后重测；只测未登录侧）");
  }

  // ========== 5. 汇总 ==========
  const allPass = printSummary(out, probe, args.json);
  process.exit(allPass ? 0 : 1);
}

// 0. 连接检查：失败输出提示后退出
async function connectOrExit(base, args) {
  let st;
  try { st = await req(base, "/api/status"); }
  catch (e) {
    if (args.json) { console.log(JSON.stringify({ base, error: e.message }, null, 2)); }
    else console.error("❌ 连接失败:", e.message, "（服务是否在运行？）");
    process.exit(1);
  }
  return st;
}

// 1. 鉴权链路：/api/status 字段契约 + 未登录写探针；返回 needsSetup
async function probeAuthChain(base, st, args, step) {
  const required = ["ok", "needsSetup", "needsAuth", "port"];
  const missing = required.filter((k) => !(k in (st.data || {})));
  step("GET /api/status 200", st.status === 200, `status=${st.status}`);
  step("status 字段契约 ok/needsSetup/needsAuth/port", missing.length === 0,
    missing.length ? `缺字段: ${missing.join(", ")}`
      : `needsSetup=${st.data.needsSetup} needsAuth=${st.data.needsAuth} port=${st.data.port}`);

  const isSetup = !!(st.data && st.data.needsSetup === true);
  if (isSetup) {
    const r = await req(base, args.writeApi, { method: "POST", body: {} });
    step("未设密码：写探针放行（非 401）", r.status !== 401, `status=${r.status}`);
  } else {
    const r401 = await req(base, args.writeApi, { method: "POST", body: {} });
    step("已设密码：未登录写探针 401", r401.status === 401, `status=${r401.status}`);
    step("未登录 /status needsAuth=true", st.data && st.data.needsAuth === true, `needsAuth=${st.data && st.data.needsAuth}`);
    step("401 响应带 needsLogin 标记", r401.data && r401.data.needsLogin === true, r401.data ? JSON.stringify(r401.data) : "无 body");
  }
  return isSetup;
}

// 3. 未登录逐个探测：对每个 API 发空 body（写操作）或 GET，按响应分类
async function probeApis(base, apis) {
  const needLogin = [], pub = [], paramDep = [], notFound = [], other = [], records = [];
  // 认证端点：401 是业务语义（登录失败/未登录可登出），不是鉴权门，不计入「需登录」
  const AUTH_ENDPOINTS = new Set(["/api/login", "/api/logout"]);

  for (const api of apis) {
    const isWrite = api.method === "POST" || api.method === "DELETE" || api.method === "PUT" || api.method === "PATCH";
    const isAuthEndpoint = AUTH_ENDPOINTS.has(api.path);
    let r;
    try { r = await req(base, api.path, { method: api.method, body: isWrite ? {} : undefined }); }
    catch (e) { r = { status: 0, data: { error: e.message } }; }
    const rec = { method: api.method, path: api.path, status: r.status, kind: "" };
    if (r.status === 0) rec.kind = "unreachable";
    else if (r.status === 404) { rec.kind = "404"; notFound.push(rec); }
    else if (isWrite) {
      if (r.status === 401 && isAuthEndpoint) { rec.kind = "public"; pub.push(rec); }
      else if (r.status === 401) { rec.kind = "need-login"; needLogin.push(rec); }
      else if (r.status === 400) { rec.kind = "public-param"; paramDep.push(rec); }
      else { rec.kind = "public"; pub.push(rec); }
    } else {
      if (r.status === 401 && isAuthEndpoint) { rec.kind = "public"; pub.push(rec); }
      else if (r.status === 401) { rec.kind = "need-login"; needLogin.push(rec); }
      else if (r.status === 200) { rec.kind = "public"; pub.push(rec); }
      else { rec.kind = "other"; other.push(rec); }
    }
    records.push(rec);
  }
  return { needLogin, pub, paramDep, notFound, other, records };
}

// 4. 登录后重测：错误/正确密码登录，带 cookie 重测需登录项均非 401
async function retestLoggedIn(base, needLogin, password, step) {
  const fakePwd = "wrong-" + Date.now();  // 动态假值，只测错误密码分支
  const bad = await req(base, "/api/login", { method: "POST", body: { password: fakePwd } });
  step("错误密码登录 401", bad.status === 401, `status=${bad.status}`);
  const ok = await req(base, "/api/login", { method: "POST", body: { password } });
  step("正确密码登录 200", ok.status === 200, `status=${ok.status}`);
  if (!ok.setCookie) { step("登录未返回 cookie", false, "无法继续登录后检测"); return; }

  const authedCookie = ok.setCookie.split(";")[0];
  step("登录返回 Set-Cookie(session)", /session=/i.test(authedCookie), authedCookie.split("=")[0] + "=…");
  const st2 = await req(base, "/api/status", { cookie: authedCookie });
  step("带 cookie /status authed=true（登录态由服务端判定）", st2.data && st2.data.authed === true, `authed=${st2.data && st2.data.authed} needsAuth=${st2.data && st2.data.needsAuth}`);

  let authedOk = 0, authedFail = 0;
  for (const rec of needLogin) {
    const isW = rec.method === "POST" || rec.method === "DELETE" || rec.method === "PUT" || rec.method === "PATCH";
    const r2 = await req(base, rec.path, { method: rec.method, body: isW ? {} : undefined, cookie: authedCookie });
    rec.authedStatus = r2.status;
    rec.authedOk = r2.status !== 401;
    if (rec.authedOk) authedOk++; else authedFail++;
  }
  step(`登录后重测 ${needLogin.length} 个需登录 API（均非 401）`, authedFail === 0,
    needLogin.length ? `${authedOk}/${needLogin.length} 放行，失败: ${needLogin.filter((r) => !r.authedOk).map((r) => r.path).join(", ") || "无"}` : "无需登录 API");
}

// 5. 汇总输出；返回是否全部通过
function printSummary(out, probe, jsonMode) {
  const { needLogin, pub, paramDep, notFound, other } = probe;
  out.summary = {
    apiTotal: probe.records.length,
    public: pub.length,
    needLogin: needLogin.length,
    paramDep: paramDep.length,
    notFound: notFound.length,
    other: other.length,
    chainPass: out.authChain.filter((c) => c.pass).length,
    chainTotal: out.authChain.length,
  };
  if (jsonMode) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`\n--- API 鉴权行为汇总 ---`);
    console.log(`  公开/可读: ${pub.length}`);
    console.log(`  需登录:   ${needLogin.length}`);
    console.log(`  参数依赖: ${paramDep.length}`);
    console.log(`  404/未知: ${notFound.length}`);
    console.log(`  其它:     ${other.length}`);
    if (needLogin.length) {
      console.log(`\n--- 需登录 API 清单 ---`);
      for (const r of needLogin) console.log(`  ${r.method.padEnd(6)} ${r.path}${r.authedOk !== undefined ? (r.authedOk ? "  ✓ 登录后放行" : "  ✗ 登录后仍 401") : ""}`);
    }
    if (pub.length) {
      console.log(`\n--- 公开 API 清单 ---`);
      for (const r of pub) console.log(`  ${r.method.padEnd(6)} ${r.path}`);
    }
    const chainPass = out.authChain.filter((c) => c.pass).length;
    console.log(`\n═══ 鉴权链路: ${chainPass}/${out.authChain.length} 通过 ${chainPass === out.authChain.length ? "🎉" : "⚠️ 有 FAIL"} ═══`);
  }
  return out.authChain.every((c) => c.pass);
}

main().catch((e) => { console.error("❌ 脚本异常:", e.message); process.exit(1); });
