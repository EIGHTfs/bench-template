function bindConcurrencyControl() {
  $("#concurrencyBtn").addEventListener("click", async () => {
    const btn = $("#concurrencyBtn");
    const input = $("#concurrencyInput");
    const st = $("#concurrencyStatus");
    const v = parseInt(input.value, 10);
    if (!v || v < 1) { if (st) setStatus(st, "并发数无效（至少 1）", "err"); return; }
    btn.disabled = true;
    btn.textContent = "应用中…";
    if (st) { setStatus(st, "应用并发数…", ""); }
    try {
      const r = await api("/api/task/concurrency", "POST", { concurrency: v });
      if (r && r.ok) {
        input.value = r.concurrency;
        if (st) setStatus(st, "✅ 并发数已设为 " + r.concurrency, "ok");
        // 立即拉最新任务刷新显示
        try {
          const t = await api("/api/task");
          if (t && t.task) renderTask(t.task);
        } catch (_) {}
      } else {
        if (st) setStatus(st, "应用失败：" + ((r && r.error) || "未知错误"), "err");
      }
    } catch (e) {
      if (st) setStatus(st, "应用失败：" + (e.message || String(e)), "err");
    } finally {
      btn.disabled = false;
      btn.textContent = "应用";
    }
  });
}

// 2026-08-27 找回模式开关：开启后不实际下载，只归位/找回；仅无任务时可控制
function bindRestoreMode() {
  const rmToggle = $("#restoreModeToggle");
  if (!rmToggle) return;
  const rmHint = $("#restoreModeHint");
  window.__setRestoreModeDisabled = (task) => {
    const busy = task && (task.status === "running" || task.status === "paused" || task.status === "preparing" || task.status === "done");
    rmToggle.disabled = !!busy;
    if (rmHint) {
      if (rmToggle.disabled) rmHint.textContent = "有任务进行中/已暂停，停止或完成后才能修改";
      else rmHint.textContent = rmToggle.checked ? "当前开启：需下载的项会直接跳过（只找回/归位）" : "当前关闭：正常下载";
    }
  };
  const applyRm = (on) => {
    rmToggle.checked = on;
    if (rmHint) {
      rmHint.textContent = on ? "当前开启：需下载的项会直接跳过（只找回/归位）" : "当前关闭：正常下载";
      rmHint.style.color = on ? "#c62828" : "";
    }
  };
  api("/api/task/restore-mode").then((r) => { if (r && r.ok) applyRm(r.restoreOnly); }).catch(() => {});
  rmToggle.addEventListener("change", async () => {
    if (rmToggle.disabled) { rmToggle.checked = !rmToggle.checked; return; }
    const on = rmToggle.checked;
    try {
      const r = await api("/api/task/restore-mode", "POST", { enabled: on });
      if (r && r.ok) applyRm(r.restoreOnly);
      else { applyRm(!on); if (rmHint) rmHint.textContent = "保存失败：" + ((r && r.error) || "未知错误"); }
    } catch (e) {
      applyRm(!on);
      if (rmHint) rmHint.textContent = "保存失败：" + (e.message || String(e));
    }
  });
}

// 2026-08-26 及时反馈：顶部浮动提示（2.5s 自动消失）
function showFeedback(msg, type) {
  let el = $("#feedbackToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "feedbackToast";
    el.style.cssText = "position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:9999;padding:10px 20px;border-radius:8px;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .3s";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = type === "ok" ? "#1e7d32" : "#c62828";
  el.style.color = "#fff";
  el.style.opacity = "1";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = "0"; }, 2500);
}

