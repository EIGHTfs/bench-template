function bindRowActionDelegation() {
  document.addEventListener("click", async (ev) => {
    // 2026-09-18 新增：点缩略图放大（.row-thumb-clickable）
    const thumbEl = ev.target.closest && ev.target.closest(".row-thumb-clickable");
    if (thumbEl) {
      ev.preventDefault();
      openLightbox(thumbEl.dataset.full || thumbEl.src, thumbEl.dataset.cap || "");
      return;
    }
    // 2026-09-02 新增：错误文本点击复制（.mm-err-copy）
    const errCopy = ev.target.closest(".mm-err-copy");
    if (errCopy) {
      ev.preventDefault();
      const txt = errCopy.dataset.copy || errCopy.textContent || "";
      try {
        if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(txt); }
        else { // 非 https（http 局域网）时 clipboard API 不可用 → 临时 textarea 回退
          const ta = document.createElement("textarea");
          ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select();
          document.execCommand("copy"); document.body.removeChild(ta);
        }
        showToast("已复制错误文本", "ok");
      } catch (_) { showToast("复制失败，请手动选中复制", "err"); }
      return;
    }
    const retryBtn = ev.target.closest(".mm-retry-btn");
    if (retryBtn) {
      ev.preventDefault();
      // 2026-09-01 修复（问题：单任务重试变成全部重试）——行级按钮只重试这一项
      const r = await api("/api/task/retry-failed", "POST", { url: retryBtn.dataset.url || "", path: retryBtn.dataset.path || "" });
      if (r && r.ok) { if (r.message) showFeedback(r.message, "ok"); try { const t = await loadTaskView(); if (t) renderTask(t); } catch (_) {} }
      else showFeedback((r && r.error) || "重试失败", "err");
      return;
    }
    const skipBtn = ev.target.closest(".mm-skip-btn");
    if (skipBtn) {
      ev.preventDefault();
      const r = await api("/api/skip", "POST", { url: skipBtn.dataset.url, path: skipBtn.dataset.path });
      if (r && r.ok) { try { const t = await loadTaskView(); if (t) renderTask(t); } catch (_) {} }
      else showFeedback((r && r.error) || "跳过失败", "err");
      return;
    }
  });
}

// 应用并发数按钮——照搜索的反馈模式（状态文字 + 按钮禁用恢复 + 成功/失败）
