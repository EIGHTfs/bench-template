async function mergeRolesPreview() {
  const game = $("#mmGameSelect").value;
  const st = $("#mmMergeStatus");
  if (!game) { setStatus(st, "请先选择游戏", "err"); return; }
  st.textContent = "扫描角色目录…";
  st.className = "status";
  const d = await api("/api/merge-roles", "POST", { dryRun: true, game });
  const el = $("#mmMergePlan");
  if (!d || !d.ok) { setStatus(st, "失败: " + ((d && d.error) || "未知"), "err"); return; }
  mergePlan = d.merged || [];
  st.textContent = `发现 ${d.groups} 组可合并角色目录（${mergePlan.length} 个将归一到标准「英文 – 中文」，变体目录并入标准目录）`;
  st.className = "status ok";
  el.innerHTML = mergePlan.length
    ? mergePlan.map((m) => `<div class="mm-mis">${diffArrow(m.from.split("/Mods/")[1] || m.from, m.to.split("/Mods/")[1] || m.to)}</div>`).join("")
    : '<div class="hint">无需要合并的角色目录</div>';
}
async function mergeRolesRun() {
  if (!mergePlan.length) { showFeedback("请先「预览合并计划」", "err"); return; }
  const game = $("#mmGameSelect").value;
  const st = $("#mmMergeStatus");
  st.textContent = "合并中…";
  st.className = "status";
  const d = await api("/api/merge-roles", "POST", { dryRun: false, game });
  if (!d || !d.ok) { setStatus(st, "失败: " + ((d && d.error) || "未知"), "err"); return; }
  st.textContent = `合并完成：${(d.merged || []).length} 个目录，${(d.skipped || []).length} 跳过，${(d.trashed || []).length} 进回收站`;
  st.className = "status ok";
  $("#mmMergePlan").innerHTML = "";
  mergePlan = [];
}

// ---------- 清空空文件夹（2026-08-31：空壳/仅含HTML也算，选游戏，带被清目录预览）----------
let emptyPlan = [];
async function emptyDirsPreview() {
  const game = $("#mmEmptyGame").value;
  const st = $("#mmEmptyStatus");
  if (!game) { setStatus(st, "请先选择游戏", "err"); return; }
  st.textContent = "扫描空文件夹…";
  st.className = "status";
  const d = await api("/api/cleanup-empty-dirs", "POST", { dryRun: true, game });
  const el = $("#mmEmptyPlan");
  if (!d || !d.ok) { setStatus(st, "失败: " + ((d && d.error) || "未知"), "err"); return; }
  emptyPlan = d.cleared || [];
  st.textContent = `发现 ${emptyPlan.length} 个空文件夹（空壳/仅含HTML，预览见下）`;
  st.className = "status ok";
  el.innerHTML = emptyPlan.length
    ? emptyPlan.map((m) => {
        const from = (m.dir || "").split("/Mods/")[1] || m.dir || "";
        const to = (m.trash || "").split("/Mods/")[1] || m.trash || ".trash";
        return `<div class="mm-mis">${diffArrow(from, to)}</div>`;
      }).join("")
    : '<div class="hint">没有空文件夹</div>';
}
async function emptyDirsRun() {
  if (!emptyPlan.length) { showFeedback("请先「预览待清空」", "err"); return; }
  const game = $("#mmEmptyGame").value;
  const st = $("#mmEmptyStatus");
  st.textContent = "清空中…";
  st.className = "status";
  const d = await api("/api/cleanup-empty-dirs", "POST", { dryRun: false, game });
  if (!d || !d.ok) { setStatus(st, "失败: " + ((d && d.error) || "未知"), "err"); return; }
  st.textContent = `已清空：${(d.cleared || []).length} 个，跳过 ${(d.skipped || []).length} 个（已进 .trash 可恢复）`;
  st.className = "status ok";
  $("#mmEmptyPlan").innerHTML = "";
  emptyPlan = [];
}

function bindMerge() {
  $("#mmMergeBtn").addEventListener("click", mergeRolesPreview);
  $("#mmMergeGoBtn").addEventListener("click", mergeRolesRun);
  $("#mmEmptyBtn").addEventListener("click", emptyDirsPreview);
  $("#mmEmptyGoBtn").addEventListener("click", emptyDirsRun);
  bindMergeMapping();
  // 自动更新卡片：公共模块（blueprint/auto-update-card.js；HTML 走 @frag:auto-update-card）
  if (window.AutoUpdateCard) window.AutoUpdateCard.mount();
}

/** 映射管理：手动添加映射（游戏/仓库/角色级联选择） */
function bindMergeMapping() {
  bindMappingGameSelect();
  bindMappingWarehouseSelect();
  bindMappingCombo();
  bindMappingAdd();
}

// 游戏下拉：切换后加载仓库列表（未选游戏禁用其余输入）
