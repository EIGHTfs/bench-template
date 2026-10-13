function bindSettingsGames() {
  $("#saveGamesBtn").addEventListener("click", async () => {
    const games = {};
    document.querySelectorAll("#rootMapRows .grid-map-row").forEach((row) => {
      const name = row.querySelector(".root-game").value.trim();
      const cn = row.querySelector(".root-cn").value.trim();
      const id = row.querySelector(".root-id").value.trim();
      const p = row.querySelector(".root-path").value.trim();
      if (!name) return;
      games[name] = { cn, id: id ? Number(id) : 0, downloadPath: p };
    });
    try {
      const r = await api("/api/games", "POST", { games });
      if (!r.ok) throw new Error(r.error || "保存失败");
      window.__games = r.games;
      renderGamesRows();
      $("#gamesStatus").textContent = "已保存到 json/gamebanana.com.json";
      $("#gamesStatus").className = "status ok";
    } catch (e) {
      $("#gamesStatus").textContent = "保存失败：" + e.message;
      $("#gamesStatus").className = "status err";
    }
  });
  // 2026-10-08：按游戏名搜香蕉网游戏 → 候选（id · 名称 · 缩写）→ 点选填入 id 框并自动走既有「获取游戏名」流程
  $("#searchGameBtn").addEventListener("click", async () => {
    const q = ($("#searchGameKw").value || "").trim();
    const st = $("#searchGameStatus");
    const box = $("#searchGameCandidates");
    if (!q) { setStatus(st, "请输入游戏名", "err"); return; }
    setStatus(st, "搜索中…", "");
    box.style.display = "none";
    try {
      const r = await api("/api/gb-search-games?q=" + encodeURIComponent(q) + "&perpage=10");
      if (!r.ok) throw new Error(r.error || "搜索失败");
      const list = r.candidates || [];
      if (!list.length) { setStatus(st, "没有匹配的游戏", "err"); return; }
      box.innerHTML = list.map((c) =>
        `<div class="cand-item" data-id="${c.id}" data-name="${esc(c.name)}" style="cursor:pointer;padding:4px 6px;border-radius:6px">`
        + `<b>${c.id}</b> · ${esc(c.name)}${c.abbr ? ` <span class="sub">${esc(c.abbr)}</span>` : ""}</div>`).join("");
      box.style.display = "block";
      box.querySelectorAll(".cand-item").forEach((el) => el.addEventListener("click", () => {
        $("#addGameId").value = el.dataset.id;
        box.style.display = "none";
        setStatus(st, `已选「${el.dataset.name}」（id ${el.dataset.id}），正在获取游戏名…`, "ok");
        $("#fetchGameBtn").click(); // 复用既有流程：取游戏名 → 预览 → 添加到游戏列表
      }));
      setStatus(st, `找到 ${list.length} 个候选，点一条填入`, "ok");
    } catch (e) {
      setStatus(st, "搜索失败: " + e.message, "err");
    }
  });
  $("#searchGameKw").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#searchGameBtn").click(); });
  $("#fetchGameBtn").addEventListener("click", async () => {
    const id = parseInt($("#addGameId").value, 10);
    const st = $("#addGameStatus");
    if (!id || id <= 0) { setStatus(st, "请输入香蕉网游戏 id", "err"); return; }
    setStatus(st, "获取中…", "");
    try {
      const r = await api("/api/gb-game-info?id=" + id);
      if (!r.ok) throw new Error(r.error || "获取失败");
      window.__addGameInfo = r.info;
      $("#addGameName").textContent = `游戏名：${r.info.name}（香蕉网 id ${id}）`;
      $("#addGamePreview").style.display = "flex";
      st.textContent = "";
    } catch (e) {
      st.textContent = "获取失败: " + e.message;
      st.className = "status err";
    }
  });
  $("#addGameConfirmBtn").addEventListener("click", async () => {
    const info = window.__addGameInfo;
    const st = $("#addGameStatus");
    if (!info) return;
    const games = { ...(window.__games || {}) };
    games[info.name] = { id: info.id, cn: info.name, downloadPath: "" };
    try {
      const r = await api("/api/games", "POST", { games });
      if (!r.ok) throw new Error(r.error || "添加失败");
      window.__games = r.games;
      renderGamesRows();
      st.textContent = `已添加「${info.name}」（下载路径请在下方填写后保存）`;
      st.className = "status ok";
      $("#addGamePreview").style.display = "none";
      $("#addGameId").value = "";
    } catch (e) {
      st.textContent = "添加失败: " + e.message;
      st.className = "status err";
    }
  });
}

/** 设置-Cookie/默认路径 */
