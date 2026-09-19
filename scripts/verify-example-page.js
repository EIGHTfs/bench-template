#!/usr/bin/env node
"use strict";
// ============================================================
// example 页面验证（交付前真实渲染检查，零依赖 node 脚本）
//
// 为什么存在：交付 example 时只 curl API 没看页面，用户实测发现
//   @brand 原样输出、样式缺失、标签页没有映射——教训固化在
//   example/ASSEMBLE-COVERAGE.md 第九节（坑 6/7/8/9）：
//   交付前端必须真实渲染验证，curl 不算。本脚本把验证固化成工具，
//   跑一遍覆盖「品牌替换 / 片段装配 / 自研前端 / 假数据 API」全部断言。
//
// 用法：
//   node scripts/verify-example-page.js                      # 默认 http://127.0.0.1:8090，密码 123456
//   node scripts/verify-example-page.js --port 8090 --password 123456
//   node scripts/verify-example-page.js --base http://10.10.10.193:8090
//
// 两种验证深度：
//   内容级（默认，零依赖）——fetch 断言：brand 无残留 / 4 tabs / gbmd 面板 /
//     style.css 无 @frag 残留 / app.js 可达 / /api/items 假数据非空
//   交互级（可选增强）——require("jsdom") 可用时真实执行 public/app.js，
//     点击 tab 验证切换、校验假数据表格渲染（jsdom 纯 JS 无系统依赖，
//     不在项目里时可用 NODE_PATH 指向已安装位置）
// ============================================================
const idxOf = (a) => (process.argv.indexOf(a) !== -1 ? process.argv[process.argv.indexOf(a) + 1] : null);
const BASE = idxOf("--base") || "http://127.0.0.1:" + (idxOf("--port") || "8090");
const PASSWORD = idxOf("--password") || "123456";

let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✓ " + m); pass++; };
const bad = (m) => { console.log("  ✗ " + m); fail++; };

async function get(url, cookie) {
  return fetch(BASE + url, cookie ? { headers: { Cookie: cookie } } : {});
}

async function main() {
  console.log("══ example 页面验证（" + BASE + "） ══");

  // --- 登录（拿会话 cookie） ---
  const login = await fetch(BASE + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  if (!login.ok) {
    bad("登录失败（HTTP " + login.status + "）—— 密码错误或服务未启动");
    console.log("── 结果：通过 " + pass + " / 失败 " + fail + " ──");
    process.exit(1);
  }
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  cookie ? ok("登录成功（拿到会话 cookie）") : bad("登录响应无 set-cookie");

  // --- index.html（运行期装配后） ---
  const idx = await get("/index.html", cookie);
  const html = await idx.text();
  idx.ok && html.length > 5000
    ? ok("index.html 装配完整（" + html.length + " 字节）")
    : bad("index.html 获取异常（HTTP " + idx.status + "）");
  (html.match(/@brand:/g) || []).length === 0
    ? ok("brand 指令全部替换（无 @brand 残留）")
    : bad("@brand 残留 " + (html.match(/@brand:/g) || []).length + " 处");
  html.includes('data-tab="download"') && html.includes('data-tab="settings"')
    ? ok("标签页结构在（tabs）")
    : bad("tabs 结构缺失");
  html.includes('id="panel-download"') && html.includes('id="panel-settings"')
    ? ok("面板结构在（tab-panel）")
    : bad("tab-panel 结构缺失");
  html.includes("下载 Mod")
    ? ok("混搭生效：download 面板为 gbmd 版")
    : bad("download 面板不是 gbmd 版（混搭失效）");
  html.includes('src="app.js"')
    ? ok("业务前端 app.js 已被引用")
    : bad("app.js 未被引用");

  // --- style.css（片段装配完整性） ---
  const cssRes = await get("/style.css", cookie);
  const cssText = await cssRes.text();
  cssRes.ok && !cssText.includes("@frag:")
    ? ok("style.css 片段装配完整（无 @frag 残留）")
    : bad("style.css 缺失或含 @frag 残留（可选片段未随混搭下发）");

  // --- public/app.js（业务前端主脚本，缺失=标签页无反应） ---
  const appRes = await get("/app.js", cookie);
  const appText = appRes.ok ? await appRes.text() : "";
  appRes.ok
    ? ok("public/app.js 可达（" + appText.length + " 字节）")
    : bad("public/app.js 缺失（404 → 标签页没有映射）");

  // --- 假数据 API ---
  const items = await (await get("/api/items", cookie)).json();
  Array.isArray(items.items) && items.items.length >= 3
    ? ok("/api/items 返回假数据（" + items.items.length + " 条）")
    : bad("/api/items 未返回假数据");

  // --- 交互级增强（jsdom 可选：真实执行 app.js 的点击与渲染） ---
  let jsdom = null;
  try { jsdom = require("jsdom"); } catch (_) { jsdom = null; }
  if (jsdom) {
    try {
      const { JSDOM } = jsdom;
      const dom = new JSDOM(html, { url: BASE + "/", runScripts: "dangerously", pretendToBeVisual: true });
      const win = dom.window;
      win.fetch = (url, opts) =>
        fetch(BASE + url, Object.assign({ headers: { Cookie: cookie } }, opts))
          .then((r) => ({ ok: r.ok, status: r.status, json: () => r.json() }));
      win.eval(appText);
      await new Promise((r) => setTimeout(r, 600)); // 等 /api/items fetch 完成
      const doc = win.document;
      doc.querySelector('.tabs .tab[data-tab="search"]').click();
      const clickOk =
        doc.getElementById("panel-search").classList.contains("active") &&
        doc.getElementById("panel-search").style.display !== "none";
      clickOk ? ok("交互级：点击 search 标签 → 面板切换生效") : bad("交互级：tab 切换未生效");
      const rows = doc.querySelectorAll(".example-items-table tr").length;
      rows >= 3 ? ok("交互级：假数据表格渲染（" + rows + " 行）") : bad("交互级：假数据表格未渲染");
      const prHtml = doc.getElementById("panel-progress").innerHTML;
      const prHasItems = prHtml.includes("星辉长枪") && prHtml.includes("示例下载项");
      const dlHtml = doc.getElementById("panel-download").innerHTML;
      const dlIsGbmd = dlHtml.includes("下载 Mod");
      const dlClean = !dlHtml.includes("example-items-table");
      const searchClean = !doc.getElementById("panel-search").innerHTML.includes("example-items-table");
      prHasItems ? ok("交互级：假数据表格在「下载进度」面板（与真实任务列表同区）") : bad("交互级：假数据表格不在进度面板");
      dlIsGbmd ? ok("交互级：下载面板为 gbmd 版（混搭胜出）") : bad("交互级：gbmd 混搭失效");
      dlClean ? ok("交互级：「下载」面板无假数据表格（未塞进输入面板）") : bad("交互级：表格误入下载输入面板");
      searchClean ? ok("交互级：搜索面板无假数据表格（未放错面板）") : bad("交互级：表格放错面板");
    } catch (e) {
      bad("交互级：jsdom 执行异常 " + e.message);
    }
  } else {
    console.log("  （提示：未安装 jsdom，跳过交互级点击验证；交互级需 `pnpm add jsdom`）");
  }

  console.log("── 结果：通过 " + pass + " / 失败 " + fail + " ──");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("验证脚本异常:", e.message); process.exit(2); });
