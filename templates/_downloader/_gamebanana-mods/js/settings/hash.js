function bindSettingsHashQuery() {
  async function hashQuery() {
    const h = String($("#hashInput").value || "").trim();
    const st = $("#hashStatus"), res = $("#hashResult");
    if (!h) { setStatus(st, "请输入 hash 或图片短名", "err"); return; }
    st.className = "status";
    st.textContent = "查询中…";
    try {
      const r = await api("/api/hash-query?hash=" + encodeURIComponent(h));
      if (!r.ok) throw new Error(r.error || "查询失败");
      if (!r.found) {
        st.textContent = "未找到（试试：压缩包 GB 页面 MD5 / 图片原始短名，或先「重建索引」）";
        st.className = "status err";
        res.innerHTML = "";
        return;
      }
      const isLocal = r.source === "local";
      const srcLabel = isLocal ? "✅ 本地表命中" : (r.source === "html" ? "ℹ️ HTML 表命中（按 GB 原名反查）" : "ℹ️ GB 表命中（此 mod 未在本机下载）");
      st.textContent = srcLabel + "（" + (r.file.kind === "image" ? "图片" : "文件") + "）";
      st.className = isLocal ? "status ok" : "status";
      const rel = (r.modDir || "").split("/").slice(-4).join("/");
      res.innerHTML =
        '<div class="mm-mis">📦 <b>' + esc(r.mod.name) + '</b> by ' + esc(r.mod.author) +
        (r.mod.game ? "（" + esc(r.mod.game) + "）" : "") +
        (r.mod.modId ? " [mods/" + esc(r.mod.modId) + "]" : "") + "</div>" +
        '<div class="hint">🔗 <a href="' + esc(r.mod.url || "") + '" target="_blank">' + esc(r.mod.url || "") + "</a></div>" +
        (isLocal ? '<div class="hint">📁 本地目录：<code>' + esc(rel) + "</code></div>" : "") +
        '<div class="hint">文件：<code>' + esc(r.file.name || "") + "</code>" +
        (r.file.gbMd5 ? "（MD5: <code>" + esc(r.file.gbMd5) + "</code>）" : "") + "</div>" +
        (!isLocal && r.mod.url
          ? '<div class="row mt"><button id="hashDlBtn" type="button" class="primary">⬇ 下载此 mod</button><span class="hint" id="hashDlStatus"></span></div>'
          : "");
      const dlBtn = $("#hashDlBtn");
      if (dlBtn) {
        dlBtn.addEventListener("click", async () => {
          const ds = $("#hashDlStatus");
          if (ds) { setStatus(ds, "已提交下载…", ""); }
          try {
            const rr = await api("/api/download", "POST", { links: [r.mod.url] });
            if (!rr.ok) throw new Error(rr.error || "提交失败");
            if (ds) { setStatus(ds, "✅ 已加入下载（见「下载进度」页）", "ok"); }
            dlBtn.disabled = true;
          } catch (e) {
            if (ds) { setStatus(ds, "失败: " + e.message, "err"); }
          }
        });
      }
    } catch (e) {
      st.textContent = "查询失败: " + e.message;
      st.className = "status err";
    }
  }
  const hq = $("#hashQueryBtn");
  if (hq) hq.addEventListener("click", hashQuery);
  const hi = $("#hashInput");
  if (hi) hi.addEventListener("keydown", (e) => { if (e.key === "Enter") hashQuery(); });
  const hr = $("#hashRebuildBtn");
  if (hr) hr.addEventListener("click", async () => {
    const st = $("#hashStatus");
    const gameSel = $("#hashRebuildGame");
    const game = gameSel ? gameSel.value : "";
    st.className = "status";
    st.textContent = game
      ? `后台重建「${game}」索引…（可继续查询旧索引）`
      : "后台重建全部游戏索引…（可继续查询旧索引）";
    try {
      const r = await api("/api/hash-rebuild", "POST", {
        game: game || "",
        // 2026-10-12：两个可选动作（面板上默认不勾）——重写存量 HTML / 补算图片内容 md5
        html: !!($("#hashRebuildHtml") && $("#hashRebuildHtml").checked),
        md5: !!($("#hashRebuildMd5") && $("#hashRebuildMd5").checked),
      });
      if (!r.ok) throw new Error(r.error || "启动失败");
      const doScan = !!($("#hashRebuildScan") && $("#hashRebuildScan").checked);
      const poll = async () => {
        const s = await api("/api/hash-index-status");
        if (s && s.running) { setTimeout(poll, 1500); return; }
        const gInfo = (s && s.games && s.games[game]) || null;
        st.textContent = game
          ? `✅ 「${game}」索引已重建：GB 表 ${gInfo ? gInfo.gb : "?"} 条，本地表 ${gInfo ? gInfo.local : "?"} 条`
          : "✅ 索引已重建：GB 表 " + (s ? s.gb : "?") + " 条，本地表 " + (s ? s.local : "?") + " 条（" + (s ? s.htmls : "?") + " 个 HTML）";
        st.className = "status ok";
        if (doScan) { try { await runScanIncomplete(); } catch (_) { /* 扫描失败 */ } }
      };
      setTimeout(poll, 1200);
    } catch (e) {
      st.textContent = "重建失败: " + e.message;
      st.className = "status err";
    }
  });
  api("/api/hash-index-status").then((s) => {
    if (s && s.ok) {
      const st = $("#hashStatus");
      if (st) {
        const gCount = s.games ? Object.keys(s.games).length : 0;
        st.textContent = "索引：GB 表 " + (s.gb || 0) + " 条 / 本地表 " + (s.local || 0) + " 条" +
          (gCount ? `（${gCount} 个游戏）` : "") + (s.running ? "，重建中…" : "");
        st.className = "status";
      }
    }
  }).catch(() => { /* 获取索引状态失败 */ });
}

/** 设置-GB表模糊搜索 */
function bindSettingsHashSearch() {
  async function hashSearch() {
    const q = String($("#hashSearchInput").value || "").trim();
    const st = $("#hashSearchStatus"), res = $("#hashSearchResult");
    if (q.length < 2) { setStatus(st, "关键词至少 2 个字符", "err"); return; }
    st.className = "status";
    st.textContent = "搜索中…";
    try {
      const r = await api("/api/hash-index-search?q=" + encodeURIComponent(q));
      if (!r.ok) throw new Error(r.error || "搜索失败");
      if (!r.count) {
        st.textContent = "GB 表中无匹配（试试其他关键词，或先「重建索引」覆盖全部已下载 mod）";
        st.className = "status";
        res.innerHTML = "";
        return;
      }
      st.textContent = "✅ 命中 " + r.count + " 个 mod（GB 表）";
      st.className = "status ok";
      res.innerHTML = r.results.map((m) =>
        '<div class="mm-mis">📦 <b>' + esc(m.modName) + '</b> by ' + esc(m.author) +
        (m.game ? "（" + esc(m.game) + "）" : "") +
        (m.hasLocal ? ' <span class="badge" style="background:#2e7d32">已下载</span>' : ' <span class="badge" style="background:#888">未下载</span>') +
        ' <span class="hint">' + m.fileCount + " 个文件</span></div>" +
        '<div class="row" style="margin:2px 0 8px 0"><a class="hint" href="' + esc(m.url || "") + '" target="_blank">' + esc(m.url || "") + "</a>" +
        (!m.hasLocal && m.url
          ? '<button class="ghost" data-dl="' + esc(m.url) + '" style="margin-left:8px">⬇ 下载</button>'
          : "") + "</div>"
      ).join("");
      res.querySelectorAll("button[data-dl]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          btn.textContent = "提交中…";
          try {
            const rr = await api("/api/download", "POST", { links: [btn.dataset.dl] });
            if (!rr.ok) throw new Error(rr.error || "提交失败");
            btn.textContent = "✅ 已加入下载";
          } catch (e) { btn.textContent = "失败: " + e.message; btn.disabled = false; }
        });
      });
    } catch (e) {
      st.textContent = "搜索失败: " + e.message;
      st.className = "status err";
    }
  }
  const hss = $("#hashSearchBtn");
  if (hss) hss.addEventListener("click", hashSearch);
  const hsi = $("#hashSearchInput");
  if (hsi) hsi.addEventListener("keydown", (e) => { if (e.key === "Enter") hashSearch(); });
}

