"use strict";
// ============================================================
// example 示例项目的自研路由（不在模板里，不受组装影响）
//
// 演示两件事：
//   1. 项目自研代码（server/routes/**）——组装/check 都不管它，改它≠改模板；
//   2. 假数据（json/items.json）——数据文件与代码分离，页面/API 从文件读。
//
// 接口：
//   GET /api/items   下载项列表（JSON，给测试与前端用）
//   GET /self-demo   自研渲染的小页面（演示「自研代码加页面」，不依赖组装产物）
// ============================================================
const path = require("path");
const fs = require("fs");
const { createRoute, sendJson } = require("../core/index.js");

const ITEMS_FILE = path.join(__dirname, "..", "..", "json", "items.json");
const STYLE_LABEL = { iwara: "iwara 风格", gbmd: "gbmd 风格", gallery: "gallery 风格" };

function loadItems() {
  try {
    const data = JSON.parse(fs.readFileSync(ITEMS_FILE, "utf8"));
    return Array.isArray(data.items) ? data.items : [];
  } catch (_) {
    return [];
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const itemsRoutes = createRoute({
  // 列表 API：返回假数据 JSON（公开，测试/前端可直接探测）
  "GET /api/items": async (req, res) => {
    sendJson(res, { ok: true, items: loadItems() });
  },

  // 自研渲染页：后端拼 HTML 表格，演示「项目自研页面」
  "GET /self-demo": async (req, res) => {
    const rows = loadItems()
      .map(
        (it) =>
          `<tr><td>${esc(it.id)}</td><td>${esc(it.title)}</td><td>${esc(it.author)}</td>` +
          `<td>${esc(STYLE_LABEL[it.style] || it.style)}</td><td>${esc(it.status)}</td>` +
          `<td>${esc(it.size)}</td><td>${esc(it.updated)}</td></tr>`
      )
      .join("\n");
    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>example 下载项（假数据）</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 12px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 8px;font-size:14px}
th{background:#f5f5f5;text-align:left}</style></head><body>
<h2>example 下载项（假数据，来自 json/items.json）</h2>
<p>本页由项目自研路由生成（server/routes/items.js），不走组装产物。</p>
<table><tr><th>ID</th><th>标题</th><th>作者</th><th>来源风格</th><th>状态</th><th>大小</th><th>更新</th></tr>
${rows}
</table></body></html>`;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  },
});

module.exports = itemsRoutes;