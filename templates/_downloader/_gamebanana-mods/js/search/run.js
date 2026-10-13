async function keywordSearch() {
  const q = ($("#kwInput").value || "").trim();
  const game = $("#searchGameSelect").value;
  const st = $("#kwStatus");
  if (!q || !game) { if (st) setStatus(st, "请输入关键词并选择游戏", "err"); return; }
  if (st) { setStatus(st, "搜索中…", ""); }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await api("/api/keyword-search?q=" + encodeURIComponent(q) + "&game=" + encodeURIComponent(game) + "&perpage=50&max=100");
      if (!r || !r.ok) throw new Error((r && r.error) || "search failed");
      searchResults = r.results || [];
      // 2026-08-31：关键词搜索也按 普通/NSFW 筛选（与时间搜索共用筛选）
      const wantNormal = $("#filterNormal") ? $("#filterNormal").checked : true;
      const wantNsfw = $("#filterNsfw") ? $("#filterNsfw").checked : true;
      if (!(wantNormal && wantNsfw)) {
        searchResults = searchResults.filter((it) => (it.isNsfw ? wantNsfw : wantNormal));
      }
      renderSearchResults(true);   // 关键词搜索 = 新结果集 → 全量重建
      if (st) {
        const norm = r.normalized ? `（${r.normalized.from} → ${r.normalized.to}）` : "";
        st.textContent = `关键词「${q}」${norm}: ${searchResults.length} 个结果${(wantNormal && wantNsfw) ? "" : "（已按分级筛选）"}`;
        st.className = "status ok";
      }
      return;
    } catch (e) {
      if (attempt < 2) { if (st) { setStatus(st, "网络抖动，重试 " + (attempt + 1) + "/2…", ""); } await new Promise((r2) => setTimeout(r2, 1500)); }
      else { if (st) setStatus(st, "搜索失败: " + e.message, "err"); }
    }
  }
}

function bindKeywordSearch() {
  // 关键词搜索入口保留（2026-10-08：它是独立功能，浏览器扩展 crx/extension/search.js 也走同一端点；
  //   只有「选角色」改成了按角色分类抓取，见下方 pickRole）。
  $("#kwSearchBtn").addEventListener("click", keywordSearch);
  $("#kwInput").addEventListener("keydown", (e) => { if (e.key === "Enter") keywordSearch(); });

  // ---- 2026-08-27：搜索页「选角色」——从香蕉网获取角色列表（同设置页手动添加映射的机制，仓库目录写死"角色"）----
  const roleInput = $("#kwRoleInput");
  const roleCombo = $("#kwRoleCombo");
  let kwRoleChars = [];
  // 选游戏后加载角色列表（照搬设置页 loadGbCharacters，独立存 kwRoleChars）
  $("#searchGameSelect").addEventListener("change", async () => {
    const game = $("#searchGameSelect").value;
    if (!game) { roleInput.disabled = true; roleInput.value = ""; kwRoleChars = []; return; }
    roleInput.disabled = false;
    roleInput.placeholder = "加载角色…";
    const st = $("#kwStatus");
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await api("/api/gb-characters?game=" + encodeURIComponent(game));
        if (!r.ok) throw new Error(r.error || "获取失败");
        // 2026-10-08：角色缓存改为对象数组 [{name,url}]，这里只取名字（兼容旧的字符串数组）
        kwRoleChars = (r.characters || []).map((c) => (typeof c === "string" ? c : c.name)).filter(Boolean);
        roleInput.placeholder = "输入过滤";
        if (st) setStatus(st, `已加载 ${kwRoleChars.length} 个角色${r.fromCache ? "（缓存）" : ""}（选角色后自动搜索；设置页可手动刷新）`, "ok");
        return;
      } catch (e) {
        if (attempt === 0) { if (st) { setStatus(st, "获取角色列表失败，重试…", ""); } await new Promise((r2) => setTimeout(r2, 1200)); }
        else { if (st) setStatus(st, "获取角色列表失败: " + e.message, "err"); roleInput.placeholder = "加载失败，可手动输入"; }
      }
    }
  });
  // 自绘过滤下拉（照搬设置页 renderCombo）
  function renderRoleCombo(filter) {
    const q = String(filter || "").trim().toLowerCase();
    const matched = q ? kwRoleChars.filter((c) => c.toLowerCase().includes(q)) : kwRoleChars;
    const shown = matched.slice(0, 20);
    if (!shown.length) { roleCombo.innerHTML = '<div class="combo-empty">无匹配角色</div>'; roleCombo.style.display = "block"; return; }
    roleCombo.innerHTML = shown.map((c) => `<div class="combo-item" data-v="${esc(c)}">${esc(c)}</div>`).join("");
    roleCombo.style.display = "block";
  }
  roleInput.addEventListener("focus", () => { if (!roleInput.disabled) renderRoleCombo(roleInput.value); });
  roleInput.addEventListener("input", () => renderRoleCombo(roleInput.value));
  roleInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      const items = document.querySelectorAll("#kwRoleCombo .combo-item");
      if (items.length) { e.preventDefault(); const cur = document.querySelector("#kwRoleCombo .combo-item.hover") || items[0]; cur.classList.remove("hover"); (cur.nextElementSibling || items[0]).classList.add("hover"); }
    } else if (e.key === "ArrowUp") {
      const items = document.querySelectorAll("#kwRoleCombo .combo-item");
      if (items.length) { e.preventDefault(); const cur = document.querySelector("#kwRoleCombo .combo-item.hover") || items[0]; cur.classList.remove("hover"); (cur.previousElementSibling || items[items.length - 1]).classList.add("hover"); }
    } else if (e.key === "Enter") {
      const cur = document.querySelector("#kwRoleCombo .combo-item.hover");
      if (cur) { e.preventDefault(); roleInput.value = cur.dataset.v; roleCombo.style.display = "none"; pickRole(cur.dataset.v); }
    } else if (e.key === "Escape") {
      roleCombo.style.display = "none";
    }
  });
  document.addEventListener("click", (e) => {
    const item = e.target.closest && e.target.closest("#kwRoleCombo .combo-item");
    if (item) { roleInput.value = item.dataset.v; roleCombo.style.display = "none"; pickRole(item.dataset.v); return; }
    if (!e.target.closest("#kwRoleInput") && !e.target.closest("#kwRoleCombo")) roleCombo.style.display = "none";
  });
  // 2026-10-08：② 按角色通道 —— 选中角色 → 按该角色的**香蕉网分类**抓取全部 mod
  //   （原实现是填关键词走关键词搜索，只按标题匹配、会漏；现在走 /api/role-mods：
  //     角色网址 → catId → 该分类下全量）。与①关键词通道相互独立，各自有自己的按钮。
  async function pickRole(name) {
    const game = $("#searchGameSelect").value;
    const st = $("#kwStatus");
    if (!game) { if (st) setStatus(st, "请先选择游戏", "err"); return; }
    if (!name) { if (st) setStatus(st, "请先选择角色", "err"); return; }
    if (st) setStatus(st, `按角色「${name}」的分类抓取…`, "");
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await api("/api/role-mods?game=" + encodeURIComponent(game) + "&role=" + encodeURIComponent(name) + "&perpage=100");
        if (!r || !r.ok) throw new Error((r && r.error) || "抓取失败");
        searchResults = r.results || [];
        // 与时间搜索共用「普通/NSFW」筛选
        const wantNormal = $("#filterNormal") ? $("#filterNormal").checked : true;
        const wantNsfw = $("#filterNsfw") ? $("#filterNsfw").checked : true;
        if (!(wantNormal && wantNsfw)) {
          searchResults = searchResults.filter((it) => (it.isNsfw ? wantNsfw : wantNormal));
        }
        renderSearchResults(true);   // 按角色抓取 = 新结果集 → 全量重建
        if (st) {
          st.textContent = `角色「${name}」（分类 ${r.catId || "-"}）: ${searchResults.length} 个结果${(wantNormal && wantNsfw) ? "" : "（已按分级筛选）"}`;
          st.className = "status ok";
        }
        return;
      } catch (e) {
        if (attempt < 2) { if (st) { setStatus(st, "网络抖动，重试 " + (attempt + 1) + "/2…", ""); } await new Promise((r2) => setTimeout(r2, 1500)); }
        else { if (st) setStatus(st, "抓取失败: " + e.message, "err"); }
      }
    }
  }
  // ② 通道的显式按钮：按输入框里当前的角色名抓取（与下拉选中同一入口）
  $("#roleSearchBtn").addEventListener("click", () => pickRole(($("#kwRoleInput").value || "").trim()));
}

