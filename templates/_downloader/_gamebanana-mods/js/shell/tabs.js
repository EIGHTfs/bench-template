function bindTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      $("#panel-" + tab.dataset.tab).classList.add("active");
      try { history.replaceState(null, "", "#" + tab.dataset.tab); } catch (_) {}
    });
  });
  window.addEventListener("hashchange", () => {
    const name = location.hash.replace(/^#/, "");
    if (name && document.querySelector(`.tab[data-tab="${name}"]`)) switchTab(name);
  });
  const initial = location.hash.replace(/^#/, "");
  if (initial && document.querySelector(`.tab[data-tab="${initial}"]`)) switchTab(initial);
}

function switchTab(name) {
  const tab = document.querySelector(`.tab[data-tab="${name}"]`);
  if (tab) tab.click();
}

// ---------- 批量下载 ----------
// 2026-09-03：「浏览器插件以前可以选择下载内容比如图片，压缩包」
// 勾选即时写入 /api/settings 的 downloadToggles；搜索「下载勾选项」也走同一份 config，不必每次 POST 再带。
