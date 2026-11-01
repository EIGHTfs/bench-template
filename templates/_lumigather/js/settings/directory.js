  /* ─── Add Directory (本机目录浏览器 — “添加目录改成📂读取本机目录选择，选择之后不需要弹窗口马上指定分类，直接默认指向all”) ─── */
  let dirBrowserOpen = false;
  document.getElementById("addDirBtn").addEventListener("click", () => {
    if (dirBrowserOpen) return;
    dirBrowserOpen = true;
    // 在目录列表下方插入目录浏览器
    const li = document.createElement("li");
    li.className = "dir-browser-inline";
    li.innerHTML = `
      <div class="dir-browser">
        <div class="dir-browser-path">
          <button class="db-up" title="上级">📁↑</button>
          <span class="db-cwd">/</span>
        </div>
        <ul class="db-list"></ul>
        <div class="db-actions">
          <button class="db-select">📂 选择此目录</button>
          <button class="db-cancel">取消</button>
        </div>
      </div>
    `;
    dirList.appendChild(li);
    let cwd = window.__GALLERY_FS_ROOT || "/";
    const upBtn = li.querySelector(".db-up");
    async function loadDirList(root) {
      try {
        const data = await window.API.apiGet(`/directories?root=${encodeURIComponent(root)}`);
        cwd = data.root;
        li.querySelector(".db-cwd").textContent = cwd;
        // 请求越界被钳回 → 明确提示。此前是静默回退到原目录，看起来就像「📁↑ 按钮坏了」
        if (data.clamped) showNotification(t("browseTopReached"), "info");
        // 到顶（浏览上限 / 文件系统根）时禁用 ↑ 并说明原因
        upBtn.disabled = !data.canUp;
        upBtn.title = data.canUp ? t("dirUp") : t("browseTopReached");
        const ul = li.querySelector(".db-list");
        ul.innerHTML = (data.items || []).map(name => `<li class="db-item" data-name="${escapeHTML(name)}">📁 ${escapeHTML(name)}</li>`).join("");
        ul.querySelectorAll(".db-item").forEach(item => {
          // cwd 为 "/" 时不拼出 "//name"
          item.addEventListener("click", () => loadDirList((cwd === "/" ? "" : cwd) + "/" + item.dataset.name));
        });
      } catch (e) {
        li.querySelector(".db-list").innerHTML = `<li style="color:var(--muted)">无法读取</li>`;
      }
    }
    upBtn.addEventListener("click", () => {
      const parts = cwd.split("/").filter(Boolean);
      parts.pop();
      loadDirList("/" + parts.join("/"));
    });
    li.querySelector(".db-select").addEventListener("click", () => {
      // “直接默认指向all，作为里面的子文件夹。然后可以再分类”
      directories.push({ path: cwd, category: "all" });
      li.remove(); dirBrowserOpen = false;
      renderDirectories(); renderNavBtns(); renderDirTree(); render();
      saveSettings(true);
      showNotification(t("settingsSaved"), "success");
    });
    li.querySelector(".db-cancel").addEventListener("click", () => { li.remove(); dirBrowserOpen = false; });
    loadDirList(cwd);
  });

  let saveTimer = null;
  function saveSettings(reload = false) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await window.API.apiPost("/gallery", { title: galleryTitle, categories, directories });
        showNotification(t("settingsSaved"), "success");
        if (reload) await loadAPIImages();
      } catch (e) {
        console.warn("save failed:", e);
        showNotification(t("saveFailed") + e.message, "error");
      }
    }, 400);
  }

  /* ─── Upload（上传区域搬到主页顶栏📤 + 全局拖拽，“上传区域搬到主页”）─── */
  uploadBtn.addEventListener("click", () => fileInput.click());
  // 全局拖拽上传：把图片拖到页面上任意位置即可上传
  let dragDepth = 0;
  document.addEventListener("dragenter", e => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes("Files")) return;
    dragDepth++;
    document.body.classList.add("drag-uploading");
    e.preventDefault();
  });
  document.addEventListener("dragover", e => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
  });
  document.addEventListener("dragleave", e => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes("Files")) return;
    if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("drag-uploading"); }
    e.preventDefault();
  });
  document.addEventListener("drop", e => {
    dragDepth = 0;
    document.body.classList.remove("drag-uploading");
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener("change", () => handleFiles(fileInput.files));

  async function handleFiles(files) {
    // 上传权限（“上传功能不能上传到收藏目录；不登录只能上传到预设分类游客”）
    if (activeFilter === "favorites") {
      showNotification(t("favNoUpload") || "收藏分类不可上传", "error");
      return;
    }
    const isGuest = !authedUser;
    let targetCat, targetDir = "";
    if (isGuest) {
      // 游客：只能上传到预设“游客”分类，实际存储项目本地 uploads/（无 targetDir）
      targetCat = "guest";
    } else {
      // 登录后：可以上传到其他目录（若当前在真实目录，则写文件到该目录；否则存本地）
      // 分类只从配置来（categories 由 /api/gallery 下发）；拿不到就明确报错终止，不写死任何默认分类
      targetCat = activeFilter !== "all" && activeFilter !== "guest" ? activeFilter : (categories[0]?.name || "");
      if (!targetCat) {
        window.alert("请先在设置里创建分类，或先进入某个分类再上传");
        return;
      }
      if (activeDir) targetDir = activeDir;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const form = new FormData();
      form.append("image", file);
      try {
        const result = await window.API.apiUpload(form, targetDir || undefined);
        if (result.targetDir) {
          // 登录上传到真实目录 → 需要重新扫描以显示
          continue;
        }
        // 本地 uploads（游客 或 登录后无 activeDir 时）
        userImages.push({
          id:    result.id,
          src:   window.API.apiUrl(result.url),
          w:     600, h: 800,
          title: file.name.replace(/\.[^/.]+$/, ""),
          cat:   targetCat,
          dirId: "Uploaded",
          dirName: "Uploaded",
          size:  result.size,
        });
      } catch (e) {
        const reader = new FileReader();
        reader.onload = ev => {
          userImages.push({
            src: ev.target.result, w: 600, h: 800,
            title: file.name.replace(/\.[^/.]+$/, ""),
            cat: targetCat, dirId: "Uploaded", dirName: "Uploaded",
            size: (file.size / 1024 / 1024).toFixed(1) + " MB",
          });
          renderUserImages(); render();
        };
        reader.readAsDataURL(file);
        continue;
      }
    }
    // 如果有上传到真实目录，只刷新上传目录所属的根（带 noCache 强制服务端跳过 30s 缓存）
    if (targetDir) {
      const root = directories
        .map(d => d.path)
        .filter(p => targetDir === p || targetDir.startsWith(p + '/'))
        .sort((a, b) => b.length - a.length)[0];
      if (root) await loadAPIImages(root, true);
    }
    renderUserImages();
    render();
  }

  /* ─── 卡片行预览滑动（“点开滑动确实实现了，但我其实想要的是没点开时那种的滑动”）
       在 dir-grid 上按住横向拖动 → 滚动行；轻点（无位移）→ 正常点开卡片 ─── */
  let gridDrag = null;
  let gridDragMoved = false;
  document.addEventListener("mousedown", e => {
    const grid = e.target.closest(".dir-grid");
    if (!grid) return;
    if (e.target.closest("button, input, a, label")) return;
    gridDrag = { grid, startX: e.clientX, scrollLeft: grid.scrollLeft };
    gridDragMoved = false;
  });
  document.addEventListener("mousemove", e => {
    if (!gridDrag) return;
    const dx = e.clientX - gridDrag.startX;
    const dy = e.clientY - (gridDrag.startY || e.clientY);
    if (!gridDragMoved && Math.abs(dx) > 4 && Math.abs(dx) > Math.abs(dy)) gridDragMoved = true;
    if (gridDragMoved) {
      gridDrag.grid.scrollLeft = gridDrag.scrollLeft - dx;
      e.preventDefault();
    }
  });
  document.addEventListener("mouseup", () => { gridDrag = null; });
  // 捕获阶段拦截 click（拖动后不触发卡片打开）
  document.addEventListener("click", e => {
    if (gridDragMoved) { e.stopPropagation(); e.preventDefault(); gridDragMoved = false; }
  }, true);

