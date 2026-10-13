function renderSearchResults(reset) {
  const list = $("#searchResultList");
  $("#resultCount").textContent = `共 ${searchResults.length} 个`;
  if (!searchResults.length) {
    list.innerHTML = '<div class="empty">暂无结果</div>';
    renderedIds.clear();
    return;
  }
  // 需要全量重建的兜底情形：显式 reset / 列表为空 / 结果被换成另一批（首项变了或变少）
  const firstKey = String(searchResults[0].modId);
  const needFull = reset === true
    || !list.querySelector(".result-item")
    || searchResults.length < renderedIds.size
    || !renderedIds.has(firstKey);
  if (needFull) { list.innerHTML = ""; renderedIds.clear(); }

  const rowHtml = (it) => `
    <div class="result-item">
      <input type="checkbox" id="cb-${it.modId}">
      <span class="badge ${it.isNsfw ? "nsfw" : "normal"}">${it.isNsfw ? "NSFW" : "普通"}</span>
      <span class="name"><a href="${esc(it.profileUrl)}" target="_blank">${esc(it.name)}</a></span>
      <span class="meta">${esc(it.game)} · ${esc(it.author)}</span>
      <span class="meta">${(() => { const a = fmtTs(it.dateAdded); return a !== "-" ? a : fmtTs(it.dateUpdated); })()}</span>
    </div>`;
  const frag = document.createDocumentFragment();
  let added = 0;
  for (const it of searchResults) {
    const key = String(it.modId);
    if (renderedIds.has(key)) continue;   // 已渲染过 → 保持原 DOM（勾选状态不丢）
    const tmp = document.createElement("div");
    tmp.innerHTML = rowHtml(it);
    frag.appendChild(tmp.firstElementChild);
    renderedIds.add(key);
    added++;
  }
  if (added) list.appendChild(frag);

  // 旧实现（保留备查，勿删）：
  // $("#searchResultList").innerHTML = searchResults.map((it) => `...rows...`).join("");
}

// ---------- 下载进度 ----------
