function bindProgress() {
  bindTaskControlButtons();
  bindRowActionDelegation();
  bindConcurrencyControl();
  bindRestoreMode();
  startTaskPoll();
}

// 2026-10-11 P0-2：进度页数据 = 后端摘要（状态/统计/活动项）+ 按需拉取的「未完成项」分页。
//   为什么：/api/task 原来回整个任务（3.6 万项 ⇒ 34.3MB/次 × 每 2 秒 ≈17MB/s），页面被拖死。
//   这里把「摘要 + 未完成项」拼成 renderTask 需要的形状（items 用稀疏数组、resultsMap 只放未完成项），
//   渲染逻辑本身不用改。
async function loadTaskView() {
  const r = await api("/api/task");
  const t = r && r.task;
  if (!t) return null;
  // 2026-10-12：列表移除方式跟随设置 ——
  //   "group"（默认）= 整组完成才一起移除：该 mod 还有未完成项时，已完成项（含预览图）仍留在列表
  //   "file"         = 每个文件完成即移除（P0-2 之后的行为）
  //   后端 getTaskItems 对应 filter="group" / "open"。
  const removalSel = $("#taskListRemoval");
  if (removalSel) {
    if (!removalSel._gbmdBound) {
      removalSel._gbmdBound = true;
      removalSel.addEventListener("change", async () => {
        try { await api("/api/settings", "POST", { taskListRemoval: removalSel.value }); } catch (_) {}
      });
    }
    if (settings) removalSel.value = settings.taskListRemoval || "group";
  }
  const removalMode = (settings && settings.taskListRemoval) === "file" ? "file" : "group";
  const page = await api("/api/task/items?filter=" + (removalMode === "file" ? "open" : "group") + "&limit=2000");
  const merged = Object.assign({}, t, { items: [], resultsMap: {} });
  for (const row of ((page && page.items) || [])) {
    if (!row || row.idx == null) continue;
    merged.items[row.idx] = row.item;
    if (row.result) merged.resultsMap[row.idx] = row.result;
  }
  merged.openTotal = (page && page.total) || 0;
  return merged;
}

// 暂停/继续/停止后立即刷新列表（不等 2s 轮询）+ 停止清空列表
async function refreshTaskView() {
  try {
    const t = await loadTaskView();
    if (t) renderTask(t);
  } catch (_) {}
}

// 任务总控按钮：暂停/继续/停止/全局重试/一键清除失败
function bindTaskControlButtons() {
  $("#pauseBtn").addEventListener("click", async () => {
    const r = await api("/api/task/pause", "POST", {});
    if (r && r.ok) refreshTaskView();
  });
  $("#resumeBtn").addEventListener("click", async () => {
    const r = await api("/api/task/resume", "POST", {});
    if (r && r.ok) refreshTaskView();
  });
  $("#stopBtn").addEventListener("click", async () => {
    const r = await api("/api/task/stop", "POST", {});
    if (r && r.ok) {
      refreshTaskView(); // 立即刷新（task=null → 列表清空显示"暂无任务"）
    }
  });
  $("#retryBtn").addEventListener("click", async () => {
    const r = await api("/api/task/retry-failed", "POST", {});
    if (r && r.ok) { if (r.message) showFeedback(r.message, "ok"); try { const t = await loadTaskView(); if (t) renderTask(t); } catch (_) {} }
    else showFeedback((r && r.error) || "重试失败", "err");
  });
  // 2026-08-26 加回：一键清除下载失败（失败项标记跳过，前端立即消失）
  $("#clearFailBtn").addEventListener("click", async () => {
    const r = await api("/api/skip-all-failed", "POST", {});
    if (r && r.ok) { if (r.skipped > 0 && r.message) showFeedback(r.message, "ok"); try { const t = await loadTaskView(); if (t) renderTask(t); } catch (_) {} }
    else showFeedback((r && r.error) || "清除失败失败", "err");
  });
}

// 2026-09-18 新增：预览图灯箱——点缩略图放大，点遮罩 / Esc / 滚轮 关闭
let lightboxEl = null;
