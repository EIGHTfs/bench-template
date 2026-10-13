function rowHtml(item, idx, task, doneMap) {
  const resultOf = (idx2) => (doneMap[idx2] != null ? doneMap[idx2] : (idx2 < (task.results || []).length ? task.results[idx2] : null));
  const activeMap = {};
  (task.activeItems || []).forEach((a) => {
    if (a && a.idx != null) activeMap[a.idx] = { received: a.received || 0, total: a.total || 0, speed: a.speed || 0 };
  });
  let cls = "pending", icon = typeIcon(item.type), statusText = typeLabel(item.type);
  const r = resultOf(idx);
  if (r) {
    if (r.skipped) { cls = "ok"; icon = "⏭"; statusText = r.exists ? "已存在（跳过）" : "已忽略"; }
    else if (r.ok) { cls = "ok"; icon = "✓"; statusText = "成功"; }
    // 2026-10-12：GB 侧文件不可用（CDN 404）单独标注——不是本侧故障，批量重试会跳过
    else if (r.gbUnavailable) { cls = "fail"; icon = "🌐"; statusText = "GB 侧不可用（源站已取不到，重试无效）"; }
    else { cls = "fail"; icon = "✗"; statusText = r.error || "失败"; }
  }
  // 2026-09-02：忽略/跳过原因（如「游戏未配置下载路径」）显示在 UI 上
  if (item.skipReason) statusText += `（${item.skipReason}）`;
  // 2026-09-02 错误项（构建失败，无 path）原因也显示
  else if (item.buildError) statusText += `（${item.buildError}）`;
  // 2026-08-26 加回：失败行 🔄重试 / 🚫跳过 按钮；
  //   2026-08-26 修复：卡住行（无结果且任务已收尾）也显示按钮（重试/跳过后才能处理它）
  //   2026-10-11 修：收尾判定改用 isTaskEnded()——暂停不属于收尾，在途行不再冒出重试/跳过按钮
  //   2026-09-02 新增：type=error 且 path="" 的错误项（构建失败，只有 mod url）
  //     ——无法重试（无文件可下），但可清除（标记跳过）；显示「🚫 清除」
  let actBtns = "";
  const canAct = r ? (r.ok === false && !r.skipped) : isTaskEnded(task);
  if (canAct && item.path) {
    actBtns = ` <button class="mm-retry-btn" data-url="${esc(item.url || "")}" data-path="${esc(item.path || "")}" title="重试下载此文件">🔄 重试</button>` +
      ` <button class="mm-skip-btn" data-url="${esc(item.url || "")}" data-path="${esc(item.path || "")}" title="跳过此文件（下次请求可再下载）">🚫 跳过</button>`;
  } else if (canAct && item.type === "error" && (item.url || item.displayName)) {
    // 2026-10-11 修：无 path 的错误项（mod 解析/构建失败）原先只给「清除」⇒ 瞬时故障（响应被截断）
    //   也只能把 mod 丢掉。现在同时给「🔄 重试」——后端会把该 mod 放回 pendingMods 重新解析构建。
    actBtns = ` <button class="mm-retry-btn" data-url="${esc(item.url || "")}" data-path="" title="重新解析并下载此 mod">🔄 重试</button>` +
      ` <button class="mm-skip-btn" data-url="${esc(item.url || "")}" data-path="" title="清除此错误（下次请求可再尝试此 mod）">🚫 清除</button>`;
  }
  // 2026-08-26：跳过的图片也显示预览图（已存在/已下载的图片项都显示缩略图）
  const hasFile = r && (r.ok || (r.skipped && r.exists)) && item.path;
  const isImgOk = item.type === "image" && hasFile;   // gif 也给预览缩略图
  // 缩略图与放大图同源（服务端 /api/image 直接回原图）；路径在 URL 里编码
  const thumbSrc = `/api/image?path=${encodeURIComponent(item.path || "")}`;
  // gif 也用同一个 /api/image 端点预览（服务端本就返回 image/gif），加 GIF 角标便于区分
  let thumb = "";
  if (isImgOk) {
    // 2026-09-18 新增：点缩略图放大（灯箱）——src 用 thumb，data-full 留给放大时大图
    const img = `<img class="row-thumb row-thumb-clickable" src="${thumbSrc}" loading="lazy" alt="${esc(item.displayName || "")}" data-full="${thumbSrc}" data-cap="${esc(item.displayName || item.path || "")}" title="点击放大">`;
    thumb = item.isGif ? `<span class="row-thumb-wrap">${img}<span class="row-thumb-badge">GIF</span></span>` : img;
  }
  // 每行文件进度条：成功100%绿 / 下载中实时蓝 / 失败100%红 / 未开始0%
  let barPct = 0, barCls = "row-bar-pending";
  if (r) {
    if (r.ok) { barPct = 100; barCls = "row-bar-ok"; }
    else { barPct = 100; barCls = "row-bar-fail"; }
  } else if (activeMap[idx]) {
    const ap = activeMap[idx];
    barPct = ap.total > 0 ? Math.min(100, Math.round((ap.received / ap.total) * 100)) : 0;
    barCls = "row-bar-active";
    if (ap.speed) statusText += ` ⚡${fmtSpeed(ap.speed)}`;
  }
  const bar = `<span class="row-bar ${barCls}"><span class="row-bar-fill" style="width:${barPct}%"></span></span>`;
  // 2026-10-11 新增：每行显示「已下载大小 / 文件大小」（单位按量级自动切换，见 fmtSize）
  //   下载中 → activeItems 的 received/total；已完成 → 结果里的 size；未开始但已知大小 → 0 B / size
  let sizeText = "";
  if (activeMap[idx]) {
    const ap = activeMap[idx];
    const recv = fmtSize(ap.received);
    const tot = fmtSize(ap.total);
    if (recv || tot) sizeText = (recv || "0 B") + " / " + (tot || "—");
  } else if (r && r.size) {
    sizeText = fmtSize(r.size);
  } else if (item.size) {
    sizeText = "0 B / " + fmtSize(item.size);
  }
  const sizeHtml = sizeText ? `<span class="row-size" title="已下载 / 文件大小">${esc(sizeText)}</span>` : "";
  // 2026-09-02 新增：失败/错误文本可点击复制（点击 .mm-err-copy 复制错误内容，便于排查/反馈）
  const statusHtml = (cls === "fail" && statusText && statusText !== "失败" && statusText !== "错误")
    ? `<span class="mm-err-copy" title="点击复制错误文本" data-copy="${esc(statusText)}">${esc(statusText)}</span>`
    : esc(statusText);
  return `<div class="item ${cls}"><span class="icon">${icon}</span><span class="item-name">${esc(item.displayName || item.path || item.url || "")}${bar}${sizeHtml}</span><span class="status-text">${statusHtml}${actBtns}</span>${thumb}</div>`;
}

// 分组外层 HTML（折叠头 + 行列表）
