function bindSettingsCookie() {
  const saveBtn = $("#saveCookieBtn");
  if (saveBtn) saveBtn.addEventListener("click", async () => {
    const payload = {
      gbCookie: $("#cookieInput").value.trim(),
      gbUserAgent: navigator.userAgent
    };
    try {
      const r = await api("/api/settings", "POST", payload);
      if (!r.ok) throw new Error(r.error || "保存失败");
      settings = r.settings;
      const cookieEl = $("#cookieInput");
      if (cookieEl) {
        cookieEl.value = "";
        cookieEl.placeholder = "已保存（再贴新凭证才会覆盖；留空不改）";
        cookieEl.dataset.filled = "1";
      }
      showToast("✅ 已保存设置", "ok");
      updateGbUserBadge();
    } catch (e) {
      showToast("❌ 保存失败：" + e.message, "err");
    }
  });
  const saveDefPathBtn = $("#saveDefaultPathBtn");
  if (saveDefPathBtn) saveDefPathBtn.addEventListener("click", async () => {
    const st = $("#defaultPathStatus");
    const v = ($("#defaultDownloadPath").value || "").trim();
    try {
      const r = await api("/api/settings", "POST", { defaultDownloadPath: v });
      if (!r.ok) throw new Error(r.error || "保存失败");
      settings = r.settings;
      setStatus(st, "已保存默认下载位置" + (v ? `：${v}` : "（已清空，未配置游戏下载将报错提示）"), "ok");
    } catch (e) {
      setStatus(st, "保存失败: " + e.message, "err");
    }
  });
}

/** 设置-未完成任务扫描 */
