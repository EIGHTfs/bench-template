async function loadGbCharacters(force) {
  const game = $("#mmAddGame").value;
  const st = $("#mmAddStatus");
  if (!game) return;
  if (st) { setStatus(st, force ? "从香蕉网重新获取角色列表…" : "加载角色列表…", ""); }
  const qs = "/api/gb-characters?game=" + encodeURIComponent(game) + (force ? "&refresh=1" : "");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await api(qs);
      if (!r.ok) throw new Error(r.error || "获取失败");
      // 2026-10-08：角色缓存改为对象数组 [{name,url}]，设置页下拉只需要名字（兼容旧格式）
      window.__gbChars = (r.characters || []).map((c) => (typeof c === "string" ? c : c.name)).filter(Boolean);
      if (st) {
        st.textContent = force
          ? `已重新获取并保存 ${window.__gbChars.length} 个角色（json/role/<游戏名>.json，含分类网址）`
          : `已加载 ${window.__gbChars.length} 个角色${r.fromCache ? "（缓存）" : "（新获取）"}（英文名输入时过滤选择）`;
        st.className = "status ok";
      }
      return;
    } catch (e) {
      if (attempt === 0) { if (st) { setStatus(st, "网络抖动，重试…", ""); } await new Promise((r2) => setTimeout(r2, 1200)); }
      else if (st) setStatus(st, "获取失败: " + e.message, "err");
    }
  }
}

// 输入联想列表渲染（按过滤词匹配，最多 20 条）
function renderCombo(filter) {
  const list = window.__gbChars || [];
  const el = $("#mmComboList");
  const q = String(filter || "").trim().toLowerCase();
  const matched = q
    ? list.filter((c) => c.toLowerCase().includes(q))
    : list;
  const shown = matched.slice(0, 20);
  if (!shown.length) { el.innerHTML = '<div class="combo-empty">无匹配角色</div>'; el.style.display = "block"; return; }
  el.innerHTML = shown.map((c) => `<div class="combo-item" data-v="${esc(c)}">${esc(c)}</div>`).join("");
  el.style.display = "block";
}

// ---------- 退出 ----------
