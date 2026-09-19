"use strict";
// ============================================================
// example 示例项目的自研前端脚本（public/app.js）
//
// 为什么必须自研：模板只提供骨架与风格片段，业务前端主脚本由各项目自己实现
// （scripts.html 片段里的 <script src="app.js"> 指向这里，模板不提供 app.js）。
// 缺失时页面能打开，但标签页切换/列表渲染等交互全不生效 —— 实测表现就是
// 「标签页没有映射」：点标签无反应，因为初始化 JS 根本没加载（404）。
//
// 本文件演示两件事：
//   1. 标签页映射：data-tab → 对应 .tab-panel 的切换
//   2. 自研闭环：GET /api/items（自研后端路由 routes/items.js）
//      → 渲染假数据（json/items.json），前端/后端/数据三件套闭环
// ============================================================
(function () {
  // ---------- ① 标签页切换（data-tab → 面板 id=panel-<name>） ----------
  var TABS = document.querySelectorAll(".tabs .tab");
  var PANELS = document.querySelectorAll(".tab-panel");

  function switchPanel(name) {
    TABS.forEach(function (tab) {
      tab.classList.toggle("active", tab.dataset.tab === name);
    });
    PANELS.forEach(function (panel) {
      var active = panel.id === "panel-" + name;
      panel.classList.toggle("active", active);
      // 双保险：CSS 未命中时也直接控制显隐（自研代码不依赖风格层规则是否齐全）
      panel.style.display = active ? "" : "none";
    });
  }
  TABS.forEach(function (tab) {
    tab.addEventListener("click", function () {
      switchPanel(tab.dataset.tab);
    });
  });

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- ② 示例假数据列表（自研闭环演示） ----------
  // 前端调自研 API → 后端读假数据 → 追加到「下载进度」面板末尾。
  // 位置依据：对比 iwara/gbmd 两风格模板，下载项/任务列表都在「下载进度」
  // 面板（#panel-progress，gbmd 的 #taskList 同区），「下载」面板只有
  // 输入区+流程说明、没有下载项列表——故示例下载项跟随模板放在进度面板。
  fetch("/api/items")
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) {
      var items = (data && data.items) || [];
      var panel = document.getElementById("panel-progress");
      if (!panel || !items.length) return;

      var style = document.createElement("style");
      style.textContent =
        ".example-items-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}" +
        ".example-items-table th,.example-items-table td{border:1px solid #ddd;padding:5px 8px;text-align:left}" +
        ".example-items-table caption{text-align:left;padding-bottom:6px;color:#777}";

      var table = document.createElement("table");
      table.className = "example-items-table";
      table.innerHTML =
        "<caption>示例下载项（假数据：json/items.json → /api/items → 本表，与真实任务列表同区）</caption>" +
        "<tr><th>标题</th><th>作者</th><th>来源风格</th><th>状态</th><th>大小</th></tr>" +
        items.map(function (it) {
          return "<tr><td>" + esc(it.title) + "</td><td>" + esc(it.author) + "</td><td>" +
            esc(it.style) + "</td><td>" + esc(it.status) + "</td><td>" + esc(it.size) + "</td></tr>";
        }).join("");

      panel.appendChild(style);
      panel.appendChild(table);
    })
    .catch(function (err) { console.log("[example] /api/items 加载失败:", err); });
})();