function bindMappingGameSelect() {
  $("#mmAddGame").addEventListener("change", async () => {
    const game = $("#mmAddGame").value;
    const wh = $("#mmAddWarehouse");
    const en = $("#mmAddEn"), zh = $("#mmAddZh");
    if (!game) {
      wh.disabled = true; en.disabled = true; zh.disabled = true;
      wh.innerHTML = '<option value="">— 请先选择游戏 —</option>';
      en.value = ""; zh.value = "";
      return;
    }
    wh.disabled = false;
    en.disabled = true; zh.disabled = true; en.value = ""; zh.value = "";
    wh.innerHTML = '<option value="">— 加载中 —</option>';
    try {
      const r = await api("/api/gb-warehouses?game=" + encodeURIComponent(game));
      if (!r.ok) throw new Error(r.error || "获取失败");
      wh.innerHTML = '<option value="">— 请选择仓库 —</option>' +
        (r.warehouses || []).map((w) =>
          `<option value="${esc(w.name)}">${esc(w.name)}${w.type === "characters" && w.from ? "（来自" + esc(w.from) + "）" : ""}${w.local && w.type !== "characters" ? "（" + esc(w.local) + "）" : ""}</option>`).join("");
      loadGbCharacters();
    } catch (e) {
      wh.innerHTML = '<option value="">— 获取失败 —</option>';
    }
  });
  $("#mmAddGame").addEventListener("change", () => { window.__gbChars = []; $("#mmComboList").style.display = "none"; });
}

// 仓库下拉：切换后启用英文/中文输入并加载角色
function bindMappingWarehouseSelect() {
  $("#mmAddWarehouse").addEventListener("change", () => {
    const en = $("#mmAddEn"), zh = $("#mmAddZh");
    if (!$("#mmAddWarehouse").value) { en.disabled = true; zh.disabled = true; en.value = ""; return; }
    en.disabled = false; zh.disabled = false;
    loadGbCharacters();
  });
}

// 角色下拉联想：聚焦/输入过滤 + 键盘上下/回车/ESC + 点击选中
function bindMappingCombo() {
  $("#mmAddEn").addEventListener("focus", () => { if (!$("#mmAddEn").disabled) renderCombo($("#mmAddEn").value); });
  $("#mmAddEn").addEventListener("input", () => renderCombo($("#mmAddEn").value));
  $("#mmAddEn").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      const items = document.querySelectorAll("#mmComboList .combo-item");
      if (items.length) { e.preventDefault(); const cur = document.querySelector("#mmComboList .combo-item.hover") || items[0]; cur.classList.remove("hover"); (cur.nextElementSibling || items[0]).classList.add("hover"); }
    } else if (e.key === "ArrowUp") {
      const items = document.querySelectorAll("#mmComboList .combo-item");
      if (items.length) { e.preventDefault(); const cur = document.querySelector("#mmComboList .combo-item.hover") || items[0]; cur.classList.remove("hover"); (cur.previousElementSibling || items[items.length - 1]).classList.add("hover"); }
    } else if (e.key === "Enter") {
      const cur = document.querySelector("#mmComboList .combo-item.hover");
      if (cur) { e.preventDefault(); $("#mmAddEn").value = cur.dataset.v; $("#mmComboList").style.display = "none"; }
    } else if (e.key === "Escape") {
      $("#mmComboList").style.display = "none";
    }
  });
  document.addEventListener("click", (e) => {
    const item = e.target.closest && e.target.closest(".combo-item");
    if (item) { $("#mmAddEn").value = item.dataset.v; $("#mmComboList").style.display = "none"; return; }
    if (!e.target.closest || !e.target.closest("#mmAddEn")) $("#mmComboList").style.display = "none";
  });
  $("#mmRefreshChars").addEventListener("click", () => {
    if (!$("#mmAddGame").value) { const st = $("#mmAddStatus"); if (st) setStatus(st, "请先选择游戏", "err"); return; }
    loadGbCharacters(true);
  });
}

// 添加角色按钮：校验 → POST → 清空输入
function bindMappingAdd() {
  $("#mmAddBtn").addEventListener("click", async () => {
    const game = $("#mmAddGame").value;
    const en = $("#mmAddEn").value.trim();
    const zh = $("#mmAddZh").value.trim();
    const st = $("#mmAddStatus");
    if (!game || !en || !zh) { if (st) setStatus(st, "请选择游戏并填写英文名/中文名", "err"); return; }
    try {
      const r = await api("/api/mapping/add-role", "POST", { game, en, zh });
      if (!r.ok) throw new Error(r.error || "添加失败");
      if (st) setStatus(st, `已添加：${en} → ${zh}（已写入 mapping/${game}.json）`, "ok");
      $("#mmAddEn").value = "";
      $("#mmAddZh").value = "";
    } catch (e) {
      if (st) setStatus(st, "添加失败: " + e.message, "err");
    }
  });
}

// 加载角色列表（force=强制从香蕉网刷新并保存缓存）
