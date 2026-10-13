function buildTaskGroups(task, doneMap) {
  const groups = [];
  const groupMap = new Map();
  (task.items || []).forEach((item, idx) => {
    const key = item.modUrl || item.modName || item.targetDir || "(未知)";
    if (!groupMap.has(key)) {
      const g = { key, targetDir: item.targetDir || "", items: [] };
      groupMap.set(key, g);
      groups.push(g);
    }
    groupMap.get(key).items.push({ item, idx });
  });
  const resultOf = (idx) => (doneMap[idx] != null ? doneMap[idx] : (idx < (task.results || []).length ? task.results[idx] : null));  // 正在下载项的实时进度（idx -> {received,total,speed}）——每行文件进度条用
  // 2026-08-26：每组 mod 一组出现在下载列表，整组下载完才从任务列表移除；
  //   组内还有未处理(下载中/准备) → 整组显示全部行（各带状态）；
  //   全部处理完但含失败 → 只留失败行（可 🔄重试 / 🚫跳过）；
  //   全成功/全跳过 → 整组移除不再显示
  return groups.filter((g) => {
    const hasPending = g.items.some(({ idx }) => resultOf(idx) == null);
    if (hasPending) { g.keptRows = g.items; return true; }
    const failed = g.items.filter(({ idx }) => {
      const r = resultOf(idx);
      return r && r.ok === false && !r.skipped;
    });
    if (failed.length) { g.keptRows = failed; return true; }
    return false;
  });
}

// 单行 HTML：状态/按钮/缩略图/进度条（含错误文本可复制）
