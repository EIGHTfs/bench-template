function startSearchPoll() {
  if (searchPollTimer) clearInterval(searchPollTimer);
  // 2026-08-31 防重入：上一次请求未返回时跳过本次（原实现无标志，慢响应会堆叠）
  let inFlight = false;
  searchPollTimer = setInterval(async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const r = await api("/api/search-status");
      const t = r.task;
      if (!t) return;
      if (t.status === "running") {
        $("#searchStatus").textContent = t.message + "（后台运行中）";
      } else {
        clearInterval(searchPollTimer);
        searchPollTimer = null;
        $("#searchBtn").disabled = false;
        $("#stopSearchBtn").style.display = "none";
        $("#searchStatus").textContent = t.message;
        $("#searchStatus").className = "status ok";
      }
      if (t.results) {
        searchResults = t.results;
        renderSearchResults();
      }
    } catch (_) {}
    finally { inFlight = false; }
  }, 2000);
}

/** 渲染搜索结果列表。
 *  @param {boolean} reset 结果集被整体替换（新搜索/清空/载入缓存）时传 true → 全量重建；
 *                         默认 false → **增量追加**（搜索任务只增不减，保留已有行与用户勾选）。
 *  2026-10-09 改：原来无条件整块重建 innerHTML，导致搜索轮询每 2 秒清空用户勾选（且 1680 行重复重建）。 */
