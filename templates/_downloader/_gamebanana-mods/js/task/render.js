function renderTask(task) {
  updateSpeedHud(task);
  const stateText = { running: "下载中", preparing: "准备中", done: "已完成", paused: "已暂停", stopped: "已终止", error: "出错" };
  $("#taskState").textContent = task ? (stateText[task.status] || task.status) : "无任务";
  // 2026-08-27：找回模式开关——有任务时禁用
  if (window.__setRestoreModeDisabled) window.__setRestoreModeDisabled(task);
  if (!task) { renderEmptyTask(); return; }

  // 2026-08-26 修复：doneMap 必须在使用前声明（stuckOrFailed 先引用会 TDZ ReferenceError
  //   → renderTask 每次抛错被轮询 catch 吞掉 → 前端不显示、后台正常的根因）
  const doneMap = task.resultsMap || {};
  const stats = taskStats(task, doneMap); // 总览统计（进度/成功/失败/可重试判定）
  renderProgressBar(task, stats);
  renderActiveArea(task);

  $("#pauseBtn").disabled = !(task.status === "running" || task.status === "preparing");
  $("#resumeBtn").disabled = !(task.status === "paused");
  $("#stopBtn").disabled = !(task.status === "running" || task.status === "preparing" || task.status === "paused");
  if (task.concurrency && document.activeElement !== $("#concurrencyInput")) $("#concurrencyInput").value = task.concurrency;

  if (task.status === "stopped") {
    $("#taskList").innerHTML = '<div class="empty">已终止</div>';
    return;
  }

  // 2026-08-26 优化：分组指纹缓存——items/resultsMap/status 未变则复用上次 HTML，避免全量重渲染
  const fp = (task.items || []).length + ":" + Object.keys(task.resultsMap || {}).length + ":" + (task.doneCount || 0) + ":" + (task.status || "");
  if (__renderTaskCache.fingerprint === fp && __renderTaskCache.html !== "") {
    $("#taskList").innerHTML = __renderTaskCache.html;
    applyGroupCollapsedState(); // 2026-09-13：缓存复用同样恢复折叠状态
    return;
  }

  const groups = buildTaskGroups(task, doneMap);
  const html = groups.map((g, gi) => {
    const rows = g.keptRows.map(({ item, idx }) => rowHtml(item, idx, task, doneMap));
    return groupHtml(g, gi, rows);
  }).join("");
  __renderTaskCache.fingerprint = fp;
  __renderTaskCache.html = html || '<div class="empty">暂无任务</div>';
  $("#taskList").innerHTML = html || '<div class="empty">暂无任务</div>';
  applyGroupCollapsedState(); // 2026-09-13：渲染后按 localStorage 恢复各分组折叠状态
}

// 无任务时渲染空态 + 按钮禁用 + 并发数回填
function renderEmptyTask() {
  $("#progressFill").style.width = "0%";
  $("#taskMeta").textContent = "尚未开始下载";
  $("#activeList").innerHTML = "";
  $("#taskList").innerHTML = '<div class="empty">暂无任务</div>';
  $("#pauseBtn").disabled = true;
  $("#resumeBtn").disabled = true;
  $("#stopBtn").disabled = true;
  $("#retryBtn").disabled = true;
  // 2026-08-26 无任务时也显示 config 持久化的并发数
  if (settings && settings.downloadConcurrency) {
    const ci = $("#concurrencyInput");
    if (ci && document.activeElement !== ci) ci.value = settings.downloadConcurrency;
  }
}

// 2026-10-11 修：任务是否已「收尾」（done/stopped/error）。
//   旧写法用「status 不是 running/preparing」当收尾判断，把**暂停**也算进去了 ⇒ 手动暂停时
//   在途项（尚无结果）被判为「卡住/失败」：全局「重试失败」按钮亮起、每行冒出 🔄重试/🚫跳过
//   ——表现为「手动暂停被算作任务失败」。暂停只是没下完，不属于收尾。
function isTaskEnded(task) {
  return !!task && (task.status === "done" || task.status === "stopped" || task.status === "error");
}

// 任务总览统计：进度/成功失败跳过/全局重试按钮判定
function taskStats(task, doneMap) {
  // 2026-08-26 修复：失败项 + 卡住项（无结果且任务已收尾）都可重试 → 全局重试按钮启用判定
  const stuckOrFailed = (task.items || []).some((it, i) => {
    if (!it || !it.path) return false;
    const rr = doneMap[i];
    // GB 侧不可用（CDN 404）不计入可重试：批量重试会跳过它，按钮状态要如实反映
    return (rr && !rr.ok && !rr.skipped && !rr.gbUnavailable) || (!rr && isTaskEnded(task));
  });
  $("#retryBtn").disabled = !stuckOrFailed;
  const itemsLen = (task.items || []).length;
  const rmKeys = Object.keys(task.resultsMap || {}).map(Number);
  const rmMax = rmKeys.length ? Math.max(...rmKeys) + 1 : 0;
  const total = Math.max(itemsLen, rmMax, task.doneCount || 0, (task.results || []).length);
  const done = task.doneCount != null ? task.doneCount : (task.currentIndex || 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const doneValues = Object.values(task.resultsMap || {});
  // 2026-10-11 P0-2：/api/task 只回摘要时，列表里只有「未完成项」，resultsMap 不再是全量 ⇒
  //   统计优先用后端摘要给的计数（okCount/skippedCount/failCount），回退到本地结果表。
  const okCount = task.okCount != null ? task.okCount : doneValues.filter((r) => r && r.ok && !r.skipped).length;
  const skipCount = task.skippedCount != null ? task.skippedCount : doneValues.filter((r) => r && r.skipped).length;
  // 2026-10-12：GB 侧不可用（CDN 404）单列——后端已把它从 failCount 剔除，此处独立展示并单列计数
  const gbGoneCount = task.gbUnavailableCount != null
    ? task.gbUnavailableCount
    : doneValues.filter((r) => r && !r.ok && r.gbUnavailable).length;
  const failCount = task.failCount != null
    ? task.failCount
    : doneValues.filter((r) => r && !r.ok && !r.gbUnavailable).length;
  let metaText = `${done}/${total} 项 | 成功 ${okCount} | 失败 ${failCount}`;
  if (skipCount) metaText += ` | 跳过 ${skipCount}`;
  if (gbGoneCount) metaText += ` | 🌐 GB 侧不可用 ${gbGoneCount}`;
  return { total, done, pct, metaText, okCount, skipCount, failCount, gbGoneCount };
}

// 进度条 + 任务 meta 文本
function renderProgressBar(task, stats) {
  $("#progressFill").style.width = stats.pct + "%";
  $("#taskMeta").textContent = stats.metaText + (task.message ? " ｜ " + task.message : "");
}

// 进行中的活动项列表（activeList）
function renderActiveArea(task) {
  const activeEl = $("#activeList");
  if (task.status === "running" || task.status === "preparing") {
    const preparing = task.preparingItem;
    const active = task.activeItems || [];
    let html = "";
    // 2026-08-26：准备阶段也展示（status=preparing 时同样显示准备进度 + 当前解析的 mod）
    if (preparing && preparing.name) {
      const prepCount = `${(task.buildIndex || 0) + 1}/${(task.pendingModsCount != null ? task.pendingModsCount : (task.pendingMods || []).length)}`;
      html += `<div class="item" style="padding:4px 8px;background:var(--card2)"><span class="icon">⏳</span><span>准备 ${prepCount}: ${esc(preparing.name)}</span></div>`;
    } else if (task.status === "preparing" && (task.pendingModsCount != null ? task.pendingModsCount : (task.pendingMods || []).length)) {
      const prepCount = `${(task.buildIndex || 0)}/${(task.pendingModsCount != null ? task.pendingModsCount : (task.pendingMods || []).length)}`;
      html += `<div class="item" style="padding:4px 8px;background:var(--card2)"><span class="icon">⏳</span><span>准备中（${prepCount}）…</span></div>`;
    }
    if (active.length) {
      html += `<div class="hint" style="margin:4px 0">⬇ 进行中（${active.length} 线程）:</div>`;
      active.forEach((a) => {
        const fromHtml = a.modName ? ` <span class="hint">· 来自 ${esc(a.modName)}</span>` : "";
        const spd = a.speed ? ` <span class="status-text">⚡ ${fmtSpeed(a.speed)}</span>` : "";
        html += `<div class="item" style="padding:4px 8px;background:rgba(59,130,246,.08)"><span class="icon">${typeIcon(a.type)}</span><span>${esc(a.name)}${fromHtml}</span>${spd}</div>`;
      });
    }
    activeEl.innerHTML = html || "";
  } else {
    activeEl.innerHTML = "";
  }
}

// 分组构建 + 可见组过滤（返回带 keptRows 的组数组）
