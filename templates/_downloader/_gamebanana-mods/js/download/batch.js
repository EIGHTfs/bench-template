function bindBatch() {
  $("#batchBtn").addEventListener("click", async () => {
    const links = $("#batchInput").value.split("\n").map((s) => s.trim()).filter((s) => s);
    if (!links.length) { $("#batchStatus").textContent = "请输入链接"; return; }
    $("#batchBtn").disabled = true;
    $("#batchStatus").textContent = "启动中…";
    try {
      await persistDownloadToggles();
      const r = await api("/api/download", "POST", { links });
      if (!r.ok) throw new Error(r.error || "启动失败");
      $("#batchStatus").textContent = `已启动后台下载（${links.length} 个 mod），进度见「下载进度」标签`;
      $("#batchStatus").className = "status ok";
      switchTab("progress");
    } catch (e) {
      $("#batchStatus").textContent = "启动失败：" + e.message;
      $("#batchStatus").className = "status err";
    } finally {
      $("#batchBtn").disabled = false;
    }
  });
  $("#clearBtn").addEventListener("click", () => {
    $("#batchInput").value = "";
    $("#batchStatus").textContent = "";
  });
}

// ---------- 搜索 ----------
function loadGameSelects() {
  api("/api/games").then((r) => {
    if (!(r && r.ok && r.games)) return;
    const opts = '<option value="">— 请选择游戏 —</option>' +
      Object.entries(r.games).map(([name, entry]) =>
        `<option value="${esc(name)}">${esc(entry && entry.cn ? entry.cn + "（" + name + "）" : name)}</option>`).join("");
    $("#searchGameSelect").innerHTML = opts;
    const mm = $("#mmGameSelect");
    if (mm) mm.innerHTML = opts;
    const mmAdd = $("#mmAddGame");
    if (mmAdd) mmAdd.innerHTML = opts;
    const mmEmpty = $("#mmEmptyGame");
    if (mmEmpty) mmEmpty.innerHTML = opts;
    // 2026-09-02 重建索引按游戏：下拉复用已配置游戏列表（值为游戏名）
    const hrg = $("#hashRebuildGame");
    if (hrg) {
      const saved = hrg.value;
      hrg.innerHTML = '<option value="">全部游戏</option>' +
        Object.entries(r.games).map(([name, entry]) =>
          `<option value="${esc(name)}">${esc(entry && entry.cn ? entry.cn + "（" + name + "）" : name)}</option>`).join("");
      hrg.value = saved;
    }
  }).catch(() => {});
}

