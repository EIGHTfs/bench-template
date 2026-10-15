// ============================================================
// 任务行 HTML（rowHtml）—— 2026-10-15 拆分
//
// 为什么拆：原实现是单个 79 行函数、圈复杂度 51（审计 blocker，阈值 10）——
//   分支全挤在一处，改一个状态要通读全函数，且没有测试能挡住 HTML 悄悄变样。
// 怎么拆：按「取数据 → 定状态 → 拼片段 → 组装」切成 7 个小函数，rowHtml 只做组装。
// 不改任何输出：test/row-html-baseline.test.cjs 用 21 个覆盖每条分支的夹具把输出
//   sha256 钉死，拆分前后必须逐字节一致（改动渲染逻辑时该基准会立刻变红）。
// ============================================================

/** 由 task.activeItems 建「下标 → 实时进度」索引（下载中的行用它取进度/速度） */
function rowActiveMap(task) {
  const activeMap = {};
  (task.activeItems || []).forEach((a) => {
    if (a && a.idx != null) activeMap[a.idx] = { received: a.received || 0, total: a.total || 0, speed: a.speed || 0 };
  });
  return activeMap;
}

/**
 * 由结果定「状态类名 / 图标 / 状态文案」；无结果返回 null（调用方回落到类型图标与文案）。
 * @returns {{cls:string, icon:string, statusText:string}|null}
 */
function rowResultState(r) {
  if (!r) return null;
  if (r.skipped) return { cls: "ok", icon: "⏭", statusText: r.exists ? "已存在（跳过）" : "已忽略" };
  if (r.ok) return { cls: "ok", icon: "✓", statusText: "成功" };
  // 2026-10-12：GB 侧文件不可用（CDN 404）单独标注——不是本侧故障，批量重试会跳过
  if (r.gbUnavailable) return { cls: "fail", icon: "🌐", statusText: "GB 侧不可用（源站已取不到，重试无效）" };
  return { cls: "fail", icon: "✗", statusText: r.error || "失败" };
}

/** 忽略/跳过原因（如「游戏未配置下载路径」）或构建失败原因追加到状态文案（2026-09-02） */
function rowAppendReason(item, statusText) {
  if (item.skipReason) return statusText + `（${item.skipReason}）`;
  if (item.buildError) return statusText + `（${item.buildError}）`;
  return statusText;
}

/**
 * 失败/卡住行的操作按钮：
 *   有 path → 🔄重试 / 🚫跳过；type=error 且无 path（构建失败）→ 🔄重试 / 🚫清除。
 *   能否操作由调用方判定后传入 canAct（有结果看是否失败，无结果看任务是否已收尾）。
 */
function rowActionButtons(item, canAct) {
  if (!canAct) return "";
  if (item.path) {
    return ` <button class="mm-retry-btn" data-url="${esc(item.url || "")}" data-path="${esc(item.path || "")}" title="重试下载此文件">🔄 重试</button>` +
      ` <button class="mm-skip-btn" data-url="${esc(item.url || "")}" data-path="${esc(item.path || "")}" title="跳过此文件（下次请求可再下载）">🚫 跳过</button>`;
  }
  if (item.type === "error" && (item.url || item.displayName)) {
    // 2026-10-11 修：无 path 的错误项（mod 解析/构建失败）原先只给「清除」⇒ 瞬时故障（响应被截断）
    //   也只能把 mod 丢掉。现在同时给「🔄 重试」——后端会把该 mod 放回 pendingMods 重新解析构建。
    return ` <button class="mm-retry-btn" data-url="${esc(item.url || "")}" data-path="" title="重新解析并下载此 mod">🔄 重试</button>` +
      ` <button class="mm-skip-btn" data-url="${esc(item.url || "")}" data-path="" title="清除此错误（下次请求可再尝试此 mod）">🚫 清除</button>`;
  }
  return "";
}

/**
 * 缩略图（图片项且文件已就绪；gif 加 GIF 角标）。
 *   缩略图与放大图同源（服务端 /api/image 直接回原图），路径在 URL 里编码。
 */
function rowThumb(item, hasFile) {
  if (!(item.type === "image" && hasFile)) return "";
  const thumbSrc = `/api/image?path=${encodeURIComponent(item.path || "")}`;
  const img = `<img class="row-thumb row-thumb-clickable" src="${thumbSrc}" loading="lazy" alt="${esc(item.displayName || "")}" data-full="${thumbSrc}" data-cap="${esc(item.displayName || item.path || "")}" title="点击放大">`;
  return item.isGif ? `<span class="row-thumb-wrap">${img}<span class="row-thumb-badge">GIF</span></span>` : img;
}

/** 行内进度条状态：成功 100% 绿 / 失败 100% 红 / 下载中实时蓝 / 未开始 0% */
function rowBarState(r, ap) {
  if (r) return { pct: 100, cls: r.ok ? "row-bar-ok" : "row-bar-fail" };
  if (ap) return { pct: ap.total > 0 ? Math.min(100, Math.round((ap.received / ap.total) * 100)) : 0, cls: "row-bar-active" };
  return { pct: 0, cls: "row-bar-pending" };
}

/**
 * 「已下载 / 文件大小」文案（2026-10-11 新增，单位按量级自动切换见 fmtSize）：
 *   下载中 → activeItems 的 received/total；已完成 → 结果里的 size；未开始但已知大小 → 0 B / size。
 *   注意：有 activeItems 但 received/total 都取不到时**不**回落到 size（与拆分前一致）。
 */
function rowSizeText(item, r, ap) {
  if (ap) {
    const recv = fmtSize(ap.received);
    const tot = fmtSize(ap.total);
    return (recv || tot) ? ((recv || "0 B") + " / " + (tot || "—")) : "";
  }
  if (r && r.size) return fmtSize(r.size);
  if (item.size) return "0 B / " + fmtSize(item.size);
  return "";
}

/** 状态文案：失败且不是泛化文案（失败/错误）时可点击复制，便于排查反馈（2026-09-02） */
function rowStatusHtml(cls, statusText) {
  return (cls === "fail" && statusText && statusText !== "失败" && statusText !== "错误")
    ? `<span class="mm-err-copy" title="点击复制错误文本" data-copy="${esc(statusText)}">${esc(statusText)}</span>`
    : esc(statusText);
}

/** 单行 HTML：组装上面各片段（拆分前是同一个大函数，输出逐字节不变） */
function rowHtml(item, idx, task, doneMap) {
  const resultOf = (idx2) => (doneMap[idx2] != null ? doneMap[idx2] : (idx2 < (task.results || []).length ? task.results[idx2] : null));
  const activeMap = rowActiveMap(task);
  const r = resultOf(idx);
  const st = rowResultState(r);
  const cls = st ? st.cls : "pending";
  const icon = st ? st.icon : typeIcon(item.type);
  let statusText = rowAppendReason(item, st ? st.statusText : typeLabel(item.type));
  // 2026-08-26 加回：失败行 🔄重试 / 🚫跳过 按钮；
  //   2026-08-26 修复：卡住行（无结果且任务已收尾）也显示按钮（重试/跳过后才能处理它）
  //   2026-10-11 修：收尾判定改用 isTaskEnded()——暂停不属于收尾，在途行不再冒出重试/跳过按钮
  //   2026-09-02 新增：type=error 且 path="" 的错误项（构建失败，只有 mod url）——无法重试（无文件可下），
  //     但可清除（标记跳过），按钮文案见 rowActionButtons
  const canAct = r ? (r.ok === false && !r.skipped) : isTaskEnded(task);
  const actBtns = rowActionButtons(item, canAct);
  // 2026-08-26：跳过的图片也显示预览图（已存在/已下载的图片项都显示缩略图）
  const hasFile = r && (r.ok || (r.skipped && r.exists)) && item.path;
  const thumb = rowThumb(item, hasFile);
  const ap = activeMap[idx];
  const bar = rowBarState(r, ap);
  if (ap && ap.speed) statusText += ` ⚡${fmtSpeed(ap.speed)}`;
  const barHtml = `<span class="row-bar ${bar.cls}"><span class="row-bar-fill" style="width:${bar.pct}%"></span></span>`;
  const sizeText = rowSizeText(item, r, ap);
  const sizeHtml = sizeText ? `<span class="row-size" title="已下载 / 文件大小">${esc(sizeText)}</span>` : "";
  const statusHtml = rowStatusHtml(cls, statusText);
  return `<div class="item ${cls}"><span class="icon">${icon}</span><span class="item-name">${esc(item.displayName || item.path || item.url || "")}${barHtml}${sizeHtml}</span><span class="status-text">${statusHtml}${actBtns}</span>${thumb}</div>`;
}

// 分组外层 HTML（折叠头 + 行列表）
