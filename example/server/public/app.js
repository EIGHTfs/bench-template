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
// 自动版本化：改本文件任何内容后，fragment-assembler 按内容 hash 自动升 ?v=
//（见 fragment-assembler.js versionizeScripts），浏览器强制拉取新版本。
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

  // ---------- ② 示例假数据列表（自研闭环演示，复用 gbmd 下载列表模板） ----------
  // 前端调自研 API → 后端读假数据 → 按 gbmd 模板结构渲染进 #taskList：
  //   分组 = .mod-group（折叠头 .mod-group-head + 组体 .mod-group-body）
  //   行   = .item（.icon + .item-name + .row-bar 进度条 + .status-text）
  // 分组/行结构与 gbmd renderTask/groupHtml/rowHtml 一致，样式复用已下发的
  // mod-group.css / task-list.css——走模板的下载列表组件，不是硬造表格。
  fetch("/api/items")
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) {
      var items = ((data && data.items) || []).slice();
      var list = document.getElementById("taskList");
      if (!list || !items.length || list.dataset.exampleBound) return;
      list.dataset.exampleBound = "1";

      // 按风格分组（gbmd：同组同 mod；示例：同 style 同组）
      var groups = [];
      var byStyle = {};
      items.forEach(function (it) {
        var key = it.style || "其他";
        if (!byStyle[key]) { byStyle[key] = { key: key, items: [] }; groups.push(byStyle[key]); }
        byStyle[key].items.push(it);
      });

      var html = groups.map(function (g, gi) {
        var rows = g.items.map(function (it) {
          var done = it.status === "done";
          var ic = done ? "✓" : "⬇";
          var rc = done ? "row-bar-ok" : "row-bar-pending";
          var st = esc((done ? "已完成" : "等待中") + " · " + (it.size || ""));
          return '<div class="item ' + (done ? "ok" : "pending") + '">' +
            '<span class="icon">' + ic + "</span>" +
            '<span class="item-name">' + esc(it.title) +
            '<span class="row-bar ' + rc + '"><span class="row-bar-fill" style="width:100%"></span></span></span>' +
            '<span class="status-text">' + st + "</span></div>";
        }).join("");
        return '<div class="mod-group">' +
          '<div class="mod-group-head" data-group="' + esc(g.key) + '">' +
          '<span><span class="mg-arrow">▼</span><span class="group-num">' + (gi + 1) + ".</span><span>" + esc(g.key) + "</span></span>" +
          '<span class="mod-group-dir">📁 示例下载项 · ' + g.items.length + " 条假数据</span></div>" +
          '<div class="mod-group-body">' + rows + "</div></div>";
      }).join("");

      var cap = document.createElement("div");
      cap.className = "hint";
      cap.style.margin = "4px 0 8px";
      cap.textContent = "示例下载项（假数据：json/items.json → /api/items → 本列表，按 gbmd 列表模板渲染）";

      list.insertBefore(cap, list.firstChild);
      list.insertAdjacentHTML("beforeend", html);

      // 分组折叠（同 gbmd bindTaskListCollapse 交互：点组头切换 .collapsed）
      list.addEventListener("click", function (e) {
        var head = e.target.closest && e.target.closest(".mod-group-head");
        if (!head) return;
        head.closest(".mod-group").classList.toggle("collapsed");
      });
    })
    .catch(function (err) { console.log("[example] /api/items 加载失败:", err); });
})();