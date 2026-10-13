function bindTheme() {
  const btn = $("#themeBtn");
  const apply = () => {
    const night = document.documentElement.getAttribute("data-theme") === "night";
    btn.textContent = night ? "☀️ 白天" : "🌙 夜间";
    try { localStorage.setItem("gbmd-theme", night ? "night" : "day"); } catch (_) {}
  };
  btn.addEventListener("click", () => {
    const night = document.documentElement.getAttribute("data-theme") === "night";
    if (night) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", "night");
    apply();
  });
  apply();
}

// ---------- 设置 ----------
function makeRootRow(name, entry) {
  const div = document.createElement("div");
  div.className = "grid-map-row";
  const cn = (entry && entry.cn) || "";
  const id = (entry && entry.id) || "";
  const p = (entry && entry.downloadPath) || "";
  div.innerHTML = `
    <input class="root-game" value="${esc(name)}" readonly style="background:var(--card2);max-width:200px">
    <input class="root-cn" value="${esc(cn)}" readonly style="background:var(--card2);max-width:90px">
    <input class="root-id" value="${esc(id)}" readonly style="background:var(--card2);max-width:70px">
    <input class="root-path" placeholder="下载路径根目录" value="${esc(p)}" style="flex:1">`;
  // 2026-09-02 目录选择统一走 path-picker.js 小模块：一行接入（自动加 📂 按钮 + 弹窗绑定）
  PathPicker.attach(div.querySelector(".root-path"));
  return div;
}

// ---------- 目录选择弹窗：统一由 path-picker.js 小模块提供（PathPicker.attach / bindEvents）----------
// 任何「下载路径」输入框一行接入：PathPicker.attach(inputEl)。历史函数 openBrowse/loadBrowse/bindBrowse 已移除（2026-09-02封装小模块复用）。

function renderGamesRows() {
  const wrap = $("#rootMapRows");
  wrap.innerHTML = "";
  const games = (typeof window.__games === "object" && window.__games) || {};
  for (const [name, entry] of Object.entries(games)) {
    wrap.appendChild(makeRootRow(name, entry));
  }
}

// ---- bindSettings 子步骤拆分（原430行拆为6个子函数）----

/** 设置-游戏管理：保存/添加游戏 */
