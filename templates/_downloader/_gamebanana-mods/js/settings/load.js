async function loadSettings() {
  try {
    const r = await api("/api/settings");
    settings = r.settings;
    // 2026-09-02 回填默认下载位置（#17）
    const defPathEl = $("#defaultDownloadPath");
    if (defPathEl && settings.defaultDownloadPath) defPathEl.value = settings.defaultDownloadPath || "";
    // 2026-09-02 默认下载位置同样挂目录选择（path-picker.js 小模块一行接入，幂等）
    if (defPathEl && window.PathPicker) PathPicker.attach(defPathEl);
    // 2026-08-26：设置里不要并发数（只在「下载进度」页改）——不再回填 dlConcurrency
    // 2026-09-01 后端脱敏：不回传 gbCookie 明文，改用 hasGbCookie 提示 + dataset.filled 只填一次
    const cookieEl = $("#cookieInput");
    if (cookieEl && cookieEl.dataset.filled !== "1" && !cookieEl.value.trim()) {
      cookieEl.placeholder = settings.hasGbCookie
        ? "已保存 Cookie（再贴新凭证才会覆盖；留空不改）"
        : "粘贴 Cookie 后点保存（sess=xxx; rmc=xxx）";
    }
    // 2026-09-03 回填下载内容勾选（downloadToggles，缺省全开）
    const t = settings.downloadToggles || { files: true, images: true };
    const filesEl = $("#dlToggleFiles");
    const imagesEl = $("#dlToggleImages");
    if (filesEl) filesEl.checked = t.files !== false;
    if (imagesEl) imagesEl.checked = t.images !== false;
  } catch (_) {}
  try {
    const g = await api("/api/games");
    if (g.ok && g.games) {
      window.__games = g.games;
      renderGamesRows();
    }
  } catch (_) {}
}

// ---------- 文件夹合并 ----------
let mergePlan = [];
