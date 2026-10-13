function bindSettingsScanIncomplete() {
  let lastScanTaskJson = null;
  async function runScanIncomplete() {
    const st = $("#scanIncompleteStatus");
    const out = $("#scanIncompleteResult");
    if (!st || !out) return;
    const dlBtn = $("#scanIncompleteDlBtn");
    const exBtn = $("#scanIncompleteExportBtn");
    if (dlBtn) dlBtn.disabled = true;
    if (exBtn) exBtn.disabled = true;
    lastScanTaskJson = null;
    setStatus(st, "扫描全部游戏根目录（.part 残留 / 文件缺失）…", "");
    out.innerHTML = "";
    try {
      const r = await api("/api/scan-incomplete", "POST", {});
      if (!r.ok) throw new Error(r.error || "扫描失败");
      lastScanTaskJson = r.taskJson;
      const list = (r.taskJson && r.taskJson.tasks) || [];
      setStatus(st, `✅ 发现 ${r.count} 个未完成任务（${r.links.length} 个可下载链接）`, "ok");
      if (exBtn && lastScanTaskJson) exBtn.disabled = false;
      if (dlBtn && r.links && r.links.length) dlBtn.disabled = false;
      out.innerHTML = list.length
        ? '<div style="max-height:260px;overflow:auto;border:1px solid var(--border);border-radius:6px;padding:6px">' +
          list.map((t) => {
            const miss = (t.missingFiles || []).slice(0, 3).map((m) => esc(m)).join("、");
            const parts = (t.partFiles || []).length ? `，part: ${esc((t.partFiles || [])[0])}` : "";
            return `<div style="padding:3px 4px;border-bottom:1px dashed var(--border)">📦 <b>${esc(t.name || t.modId || t.url)}</b>` +
              (t.game ? ` <span class="hint">(${esc(t.game)})</span>` : "") +
              `<br><span class="hint" style="font-size:12px">${esc(t.modDir || "")}</span>` +
              (miss ? `<br><span class="hint" style="font-size:12px;color:var(--warn,#c77)">缺: ${miss}</span>` : "") + parts +
              `</div>`;
          }).join("") + '</div>'
        : '<div class="hint">无未完成任务（全部 mod 下载完整）</div>';
    } catch (e) {
      setStatus(st, "扫描失败: " + e.message, "err");
    }
  }
  const scanDlBtn = $("#scanIncompleteDlBtn");
  if (scanDlBtn) scanDlBtn.addEventListener("click", async () => {
    const st = $("#scanIncompleteStatus");
    if (!lastScanTaskJson || !lastScanTaskJson.tasks || !lastScanTaskJson.tasks.length) return;
    const links = lastScanTaskJson.tasks.map((t) => t.url || t.modId).filter(Boolean);
    try {
      const rr = await api("/api/scan-incomplete/download", "POST", { links });
      if (!rr.ok) throw new Error(rr.error || "加入失败");
      setStatus(st, `✅ 已将 ${rr.count || links.length} 个未完成任务加入下载队列`, "ok");
      try { const t = await api("/api/task"); if (t && t.task) renderTask(t.task); } catch (_) { /* 刷新任务失败 */ }
    } catch (e) {
      setStatus(st, "加入下载失败: " + e.message, "err");
    }
  });
  const scanExBtn = $("#scanIncompleteExportBtn");
  if (scanExBtn) scanExBtn.addEventListener("click", () => {
    if (!lastScanTaskJson) return;
    downloadJsonFile(lastScanTaskJson, `未完成任务-${new Date().toISOString().slice(0, 10)}.json`);
  });
}

/** 设置-任务导出/导入 */
