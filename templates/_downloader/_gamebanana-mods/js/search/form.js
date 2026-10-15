function bindSearch() {
  bindSearchDates();
  bindSearchStart();
  bindSearchStopClear();
  bindSearchExport();
  bindSearchImport();
  bindSearchSelectAll();
  bindSearchSave();
  bindSearchDownloadSelected();
}

// 搜索日期初始化 + 最早日期按钮
function bindSearchDates() {
  const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // 开始和结束都默认今天（bindInputs 内部也会兜底，这里提前填好防闪烁）
  const today = (window.SearchDateRange && SearchDateRange.todayYmd()) || localDate(new Date());
  if (!$("#searchStart").value) $("#searchStart").value = today;
  if (!$("#searchEnd").value) $("#searchEnd").value = today;
  if (window.SearchDateRange && $("#searchStart") && $("#searchEnd")) {
    SearchDateRange.bindInputs($("#searchStart"), $("#searchEnd"), function () {
      $("#searchStatus").textContent = "已自动修正日期范围";
    });
  }

  $("#earliestBtn").addEventListener("click", () => {
    $("#searchStart").value = (window.SearchDateRange && SearchDateRange.EARLIEST) || "2000-01-01";
    if (window.SearchDateRange && $("#searchEnd")) {
      const r = SearchDateRange.enforceDateRules($("#searchStart").value, $("#searchEnd").value);
      $("#searchStart").value = r.startDate;
      $("#searchEnd").value = r.endDate;
    }
    $("#searchStatus").textContent = "开始日期已设为最早（2000-01-01）";
  });
}

// 启动按时间搜索
function bindSearchStart() {
  $("#searchBtn").addEventListener("click", async () => {
    const range = window.SearchDateRange
      ? SearchDateRange.enforceDateRules($("#searchStart").value, $("#searchEnd").value)
      : { startDate: $("#searchStart").value || "2000-01-01", endDate: $("#searchEnd").value };
    $("#searchStart").value = range.startDate;
    $("#searchEnd").value = range.endDate;
    const startDate = range.startDate || "2000-01-01";
    const endDate = range.endDate;
    if (!endDate) { $("#searchStatus").textContent = "请选择结束日期"; return; }
    const game = $("#searchGameSelect").value;
    if (!game) { $("#searchStatus").textContent = "请选择要筛选的游戏"; return; }
    const contentFilter = [];
    if ($("#filterNormal").checked) contentFilter.push("normal");
    if ($("#filterNsfw").checked) contentFilter.push("nsfw");
    if (!contentFilter.length) { $("#searchStatus").textContent = "请至少选择一个内容分级"; return; }
    $("#searchBtn").disabled = true;
    $("#searchStatus").textContent = "启动搜索…";
    try {
      // 2026-08-26 修复（问题：中途搜了别的没覆盖旧搜索）：
      //   先停掉旧搜索（避免「已有搜索任务」报错 + 旧结果残留），再启动新搜索
      try { await api("/api/search/stop", "POST", {}); } catch (_) {}
      // 清空旧的搜索结果显示
      searchResults = [];
      const resEl = $("#searchResult");
      if (resEl) resEl.innerHTML = "";
      const r = await api("/api/search", "POST", { startDate, endDate, contentFilter, games: [game] });
      if (!r.ok) throw new Error(r.error || "启动失败");
      $("#searchStatus").textContent = "搜索中…（后台运行，可切换标签）";
      $("#searchStatus").className = "status";
      $("#stopSearchBtn").style.display = "inline-block";
      startSearchPoll();
    } catch (e) {
      $("#searchStatus").textContent = "搜索失败：" + e.message;
      $("#searchStatus").className = "status err";
      $("#searchBtn").disabled = false;
    }
  });
}

// 停止 / 清空搜索
function bindSearchStopClear() {
  $("#stopSearchBtn").addEventListener("click", async () => {
    await api("/api/search/stop", "POST", {});
    $("#stopSearchBtn").style.display = "none";
    $("#searchBtn").disabled = false;
    $("#searchStatus").textContent = "已停止搜索（保留已找到的结果）";
  });

  $("#clearSearchBtn").addEventListener("click", async () => {
    searchResults = [];
    renderSearchResults(true);   // 清空 → 全量重建（重置增量状态）
    await api("/api/search/clear", "POST", {});
    $("#searchStatus").textContent = "列表已清空";
  });
}

// 导出搜索记录（备份、迁移、手动恢复）
function bindSearchExport() {
  $("#exportSearchBtn").addEventListener("click", async () => {
    try {
      const r = await fetch("/api/search/export", withAuth({}));
      if (r.status === 401) { location.href = "/login.html"; return; }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gbmd-search-records-" + new Date().toISOString().slice(0, 10) + ".jsonl";
      a.click();
      URL.revokeObjectURL(a.href);
      $("#searchStatus").textContent = "已导出搜索记录 JSONL";
    } catch (e) {
      $("#searchStatus").textContent = "导出失败: " + e.message;
      $("#searchStatus").className = "status err";
    }
  });
}

// 导入搜索记录（JSONL 导出文件，或旧 JSON：数组 / {results:[...]} / {records:[...]}）
function bindSearchImport() {
  $("#importSearchBtn").addEventListener("click", () => { $("#importSearchFile").click(); });
  $("#importSearchFile").addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    $("#searchStatus").textContent = "正在导入 " + file.name + " …";
    try {
      const text = await file.text();
      if (!text.trim()) { $("#searchStatus").textContent = "导入失败: 文件是空的"; $("#searchStatus").className = "status err"; ev.target.value = ""; return; }
      // 搜索记录导出就是 JSONL：原文交给服务端解析（不在浏览器 JSON.parse —— JSONL 整体不是合法 JSON）。
      //   服务端同时兼容旧的 JSON 文件（数组 / {results:[…]} / {records:[…]}）。
      const r = await api("/api/search/import", "POST", { json: text });
      if (!r.ok) throw new Error(r.error || "导入失败");
      // 刷新显示：重新拉取合并后的 cache
      const c = await api("/api/search/cache");
      if (c.cache && c.cache.results) { searchResults = c.cache.results; renderSearchResults(true); }   // 载入缓存 = 新结果集 → 全量重建
      $("#searchStatus").textContent = `✅ 导入完成：新增 ${r.added} 条，覆盖 ${r.replaced} 条，当前共 ${r.total} 条`;
      $("#searchStatus").className = "status";
    } catch (e) {
      $("#searchStatus").textContent = "导入失败: " + e.message;
      $("#searchStatus").className = "status err";
    } finally {
      ev.target.value = ""; // 允许再次选择同一文件
    }
  });
}

// 全选/全不选（全选依据普通/NSFW 筛选）
function bindSearchSelectAll() {
  // 2026-08-31：全选也依据上面搜索功能部分的 普通/NSFW 筛选（只勾选符合筛选的）
  $("#selectAllBtn").addEventListener("click", () => {
    const wantNormal = $("#filterNormal").checked;
    const wantNsfw = $("#filterNsfw").checked;
    // 2026-10-09 改：先按 modId 建索引（O(n)），替代「每个复选框都 searchResults.find()」的 O(n²)。
    //   实测 1680 项时旧写法要做 ~280 万次比较（约 119ms，随条数平方增长）。
    const byId = new Map(searchResults.map((x) => [String(x.modId), x]));
    document.querySelectorAll("#searchResultList input[type=checkbox]").forEach((cb) => {
      const it = byId.get(cb.id.replace(/^cb-/, ""));
      cb.checked = !!it && (it.isNsfw ? wantNsfw : wantNormal);
    });
  });
  $("#selectNoneBtn").addEventListener("click", () => {
    document.querySelectorAll("#searchResultList input[type=checkbox]").forEach((cb) => (cb.checked = false));
  });
}

// 保存搜索结果（覆盖写入 search_cache.json）
function bindSearchSave() {
  $("#saveSearchBtn").addEventListener("click", async () => {
    try {
      const r = await api("/api/search/save", "POST", { results: searchResults });
      if (!r.ok) throw new Error(r.error || "保存失败");
      $("#searchStatus").textContent = `✅ 已保存 ${r.total} 条到 search_cache.json`;
      $("#searchStatus").className = "status ok";
    } catch (e) {
      $("#searchStatus").textContent = "保存失败: " + e.message;
      $("#searchStatus").className = "status err";
    }
  });
}

// 下载选中项（勾选的搜索结果显示 mod → 启动后台下载）
function bindSearchDownloadSelected() {
  $("#downloadSelectedBtn").addEventListener("click", async () => {
    // 2026-10-09 改：一次性拿全部已勾选 id（Set），替代「每个结果都 getElementById」的逐条查询
    const checkedIds = new Set(
      Array.from(document.querySelectorAll("#searchResultList input[type=checkbox]"))
        .filter((cb) => cb.checked)
        .map((cb) => cb.id.replace(/^cb-/, ""))
    );
    const selected = searchResults.filter((it) => checkedIds.has(String(it.modId)));
    if (!selected.length) { $("#searchStatus").textContent = "请先勾选要下载的 mod"; return; }
    $("#searchStatus").textContent = `正在启动 ${selected.length} 个 mod 的下载…`;
    try {
      await persistDownloadToggles();
      const r = await api("/api/download-selected", "POST", { items: selected });
      if (!r.ok) throw new Error(r.error || "启动失败");
      $("#searchStatus").textContent = `已启动后台下载（${selected.length} 个 mod），进度见「下载进度」标签`;
      $("#searchStatus").className = "status ok";
      switchTab("progress");
    } catch (e) {
      $("#searchStatus").textContent = "启动失败：" + e.message;
      $("#searchStatus").className = "status err";
    }
  });
}

