function startTaskPoll() {
  if (taskPollTimer) clearInterval(taskPollTimer);
  // 2026-08-31 防重入：上一次请求未返回时跳过本次
  let inFlight = false;
  taskPollTimer = setInterval(async () => {
    if (inFlight) return;
    // 2026-10-11 修（搜索页卡死的真因）：**不在进度页时不拉任务**。
    //   实测 /api/task 全量单次 34.3MB（items 36,739 条），每 2 秒一轮 ⇒ ≈17MB/s 持续拉取；
    //   而轮询是全局的，切到「搜索」页也照拉 ⇒ 页面直接卡死（现象：点搜索后卡住不动）。
    //   判据用「任务列表元素是否可见」，不依赖标签状态实现；切回进度页后 2 秒内自动恢复刷新。
    const listEl = $("#taskList");
    if (!listEl || listEl.offsetParent === null) return;
    inFlight = true;
    try {
      const t = await loadTaskView();
      if (t) renderTask(t);
    } catch (_) {}
    finally { inFlight = false; }
  }, 2000);
}

function fmtSpeed(s) {
  if (!s || s <= 0) return "";
  return s >= 1048576 ? (s / 1048576).toFixed(2) + " MB/s" : Math.round(s / 1024) + " KB/s";
}

// 文件大小格式化：**按量级自动选单位**（B / KB / MB / GB / TB）
//   2026-10-11 新增：下载列表每行显示「已下载大小 / 文件大小」，单位随数值自动切换，
//   不再固定 MB（小图显示 0.0 MB、大包显示 4096.0 MB 都不好读）。
function fmtSize(n) {
  const b = Number(n);
  if (!b || b < 0) return "";
  if (b < 1024) return Math.round(b) + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
  if (b < 1099511627776) return (b / 1073741824).toFixed(2) + " GB";
  return (b / 1099511627776).toFixed(2) + " TB";
}

function updateSpeedHud(task) {
  const el = $("#speedHud");
  if (!el) return;
  const sp = task && task.totalSpeed ? task.totalSpeed : 0;
  if (sp > 0) {
    el.hidden = false;
    el.textContent = "⬇ " + fmtSpeed(sp);
  } else {
    el.hidden = true;
  }
}

function diffArrow(from, to) {
  return '<span class="diff-from">' + esc(from) + '</span> → <span class="diff-to">' + esc(to) + '</span>';
}

// 2026-08-26 优化（问题：网页刷新下载进度每次重新加载半天）：
//   renderTask 每次 2 秒轮询都全量遍历 items 分组 + 重渲染 DOM（任务几百上千项时卡顿）。
//   加分组指纹缓存：items/resultsMap 未变化时直接复用上次的 taskList HTML。
let __renderTaskCache = { fingerprint: "", html: "" };

