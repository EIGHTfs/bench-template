function groupHtml(g, gi, rows) {
  // 2026-09-13：折叠状态按组 key 记忆（localStorage）
  const key = g.key;
  return `<div class="mod-group">
    <div class="mod-group-head" data-group="${esc(key)}"><span><span class="mg-arrow">▼</span><span class="group-num">${gi + 1}.</span><span>${esc(g.key)}</span></span><span class="mod-group-dir">📁 ${esc(g.targetDir)}</span></div>
    <div class="mod-group-body">${rows}</div>
  </div>`;
}

// 2026-09-13：下载列表分组折叠（默认展开）。折叠状态按组 key 存 localStorage，
//   每次 renderTask 渲染后调用 applyGroupCollapsedState 恢复；点击表头切换。
const GROUP_COLLAPSE_KEY = "gbmd_group_collapsed";
function loadCollapsedGroups() {
  try { return new Set(JSON.parse(localStorage.getItem(GROUP_COLLAPSE_KEY) || "[]")); }
  catch (_) { return new Set(); }
}
function applyGroupCollapsedState() {
  const collapsed = loadCollapsedGroups();
  document.querySelectorAll("#taskList .mod-group").forEach((g) => {
    const head = g.querySelector(".mod-group-head");
    const key = head && head.dataset.group;
    g.classList.toggle("collapsed", !!key && collapsed.has(key));
  });
}
function bindTaskListCollapse() {
  const list = $("#taskList");
  if (!list || list.dataset.collapseBound) return;
  list.dataset.collapseBound = "1";
  list.addEventListener("click", (e) => {
    const head = e.target.closest && e.target.closest(".mod-group-head");
    if (!head || !head.dataset.group) return;
    const group = head.closest(".mod-group");
    if (!group) return;
    const collapsed = loadCollapsedGroups();
    const key = head.dataset.group;
    if (group.classList.contains("collapsed")) { group.classList.remove("collapsed"); collapsed.delete(key); }
    else { group.classList.add("collapsed"); collapsed.add(key); }
    try { localStorage.setItem(GROUP_COLLAPSE_KEY, JSON.stringify([...collapsed])); } catch (_) {}
  });
}

// ---------- 主题切换（2026-08-26：蓝白=白天模式，香蕉风深色=夜间模式）----------
