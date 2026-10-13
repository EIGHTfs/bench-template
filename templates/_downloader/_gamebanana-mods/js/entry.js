async function init() {
  try {
    const st = await api("/api/status");
    // 2026-08-26：未设置密码 → 不强制跳 setup，直接可用（页面顶部警告）
    if (st.needsSetup) {
      const w = $("#noPwdWarn");
      if (w) w.style.display = "block";
      // 未设密码时隐藏退出按钮（没有登录态概念）
      const lb = $("#logoutBtn");
      if (lb) lb.style.display = "none";
    } else if (st.needsAuth) {
      // 已设密码但未登录 → 登录页
      const s = await api("/api/settings");
      if (!s.ok) { location.href = "/login.html"; return; }
    }
  } catch (_) {}
  bindTabs();
  bindDownloadToggles();
  bindBatch();
  bindSearch();
  bindKeywordSearch();
  bindProgress();
  bindTaskListCollapse(); // 2026-09-13：下载列表分组折叠（默认展开）
  bindSettings();
  // 2026-09-02 目录选择弹窗事件由 path-picker.js 小模块绑定（原 bindBrowse 已移除）
  if (window.PathPicker) PathPicker.bindEvents();
  bindMerge();
  bindTheme();
  bindLogout();
  // 2026-08-26 修复：刷新后并发数显示 config 持久化值（无任务时 input 回填 downloadConcurrency）
  try {
    const sr = await api("/api/settings");
    if (sr && sr.ok && sr.settings && sr.settings.downloadConcurrency) {
      const ci = $("#concurrencyInput");
      if (ci && document.activeElement !== ci) ci.value = sr.settings.downloadConcurrency;
    }
  } catch (_) {}
  loadGameSelects();
  await loadSettings();
  updateGbUserBadge(); // 2026-09-01 顶部显示当前登录用户名（时间前）
  try {
    // 2026-08-26 恢复显示最近一次搜索结果（重启后恢复显示，不被覆盖）
    const c = await api("/api/search/cache");
    if (c.cache && c.cache.results && c.cache.results.length) {
      searchResults = c.cache.results;
      renderSearchResults(true);   // 启动恢复缓存 = 新结果集 → 全量重建
    }
    // 恢复「搜索正在后台运行」的状态：若 search-status 是 running 才继续轮询
    const st = await api("/api/search-status");
    if (st.task && st.task.status === "running") {
      $("#searchBtn").disabled = true;
      $("#stopSearchBtn").style.display = "inline-block";
      startSearchPoll();
    }
  } catch (_) {}
  function updServerTime() {
    const t = new Date();
    // 顶部两行：年月日 / 时分秒（嵌套 span 只填文本）
    const dateEl = $("#serverDate");
    const clockEl = $("#serverClock");
    const el = $("#serverTime");
    if (dateEl) dateEl.textContent = t.toLocaleDateString("zh-CN");
    if (clockEl) clockEl.textContent = t.toLocaleTimeString("zh-CN", { hour12: false });
    if (!dateEl && el) el.textContent = t.toLocaleDateString("zh-CN") + " " + t.toLocaleTimeString("zh-CN", { hour12: false });
  }
  updServerTime();
  setInterval(updServerTime, 1000);
}

init();
