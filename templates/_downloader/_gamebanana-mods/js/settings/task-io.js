function bindSettingsTaskIO() {
  const taskExportBtn = $("#taskExportBtn");
  if (taskExportBtn) taskExportBtn.addEventListener("click", async () => {
    const st = $("#taskJsonStatus");
    try {
      const r = await api("/api/task/export");
      if (!r.ok) throw new Error(r.error || "导出失败");
      downloadJsonFile(r.taskJson, `下载任务-${new Date().toISOString().slice(0, 10)}.json`);
      setStatus(st, `✅ 已导出 ${r.taskJson.count} 个任务链接`, "ok");
    } catch (e) {
      setStatus(st, "导出失败: " + e.message, "err");
    }
  });
  const taskImportBtn = $("#taskImportBtn");
  const taskImportFile = $("#taskImportFile");
  if (taskImportBtn && taskImportFile) {
    taskImportBtn.addEventListener("click", () => taskImportFile.click());
    taskImportFile.addEventListener("change", async () => {
      const st = $("#taskJsonStatus");
      const f = taskImportFile.files && taskImportFile.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const r = await api("/api/task/import", "POST", { json: text });
        if (!r.ok) throw new Error(r.error || "导入失败");
        setStatus(st, `✅ 已导入 ${r.imported} 个链接加入下载队列`, "ok");
        try { const t = await api("/api/task"); if (t && t.task) renderTask(t.task); } catch (_) { /* 刷新任务失败 */ }
      } catch (e) {
        setStatus(st, "导入失败: " + e.message, "err");
      } finally {
        taskImportFile.value = "";
      }
    });
  }
}

/** 设置-密码/数据备份恢复 */
