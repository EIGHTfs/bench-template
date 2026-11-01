  /* ─── Nav buttons: one per category ─── */
  // “顶部的分类点了没有切换路径的功能，希望实现默认是根目录，分别记录用户点进去了哪个目录”
  // 【原代码】点击分类只设 activeFilter，不切换 activeDir → 分类筛选但目录不变
  // 【改为】点击分类 → 进入该分类对应根目录（默认根层），每个目录各自记录路径
  function renderNavBtns() {
    const nav = document.getElementById("nav");
    // "全部" 按钮 + "收藏" 按钮 + "游客"按钮（“预设个不可删改的收藏分类”“不登录只能上传到预设分类游客”）
    nav.innerHTML = `
      <button class="nav-btn ${activeDir === null && activeFilter !== "favorites" && activeFilter !== "guest" ? "active" : ""}" data-filter="all">${escapeHTML(t("all"))}</button>
      <button class="nav-btn ${activeFilter === "favorites" ? "active" : ""}" data-filter="favorites" style="${activeFilter === "favorites" ? "background:#e63946;color:#fff" : "color:#e63946"}">🩷 ${escapeHTML(t("favorites") || "收藏")}</button>
      <button class="nav-btn ${activeFilter === "guest" ? "active" : ""}" data-filter="guest" style="${activeFilter === "guest" ? "background:#2f9e44;color:#fff" : "color:#2f9e44"}">👤 ${escapeHTML(t("guest") || "游客")}</button>
      ${categories.map(c => {
        // 该分类下第一个目录是否就是当前 activeDir
        const dirs = directories.filter(d => d.category === c.name);
        const isActive = dirs.some(d => d.path === activeDir);
        return `
        <button class="nav-btn ${isActive ? "active" : ""}"
                data-filter="${c.name}"
                style="${isActive ? `background:${c.color};color:#fff` : ""}">
          ${escapeHTML(c.label)}
        </button>`;
      }).join("")}
    `;
    nav.querySelectorAll(".nav-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const filter = btn.dataset.filter;
        if (filter === "all") {
          // "全部" → 回到概览
          if (activeDir) { navByDir[activeDir] = currentPath; saveNav(); }
          activeDir = null;
          currentPath = "";
          activeFilter = "all";
          saveNav(); pushNavHistory();
          renderNavBtns();
          renderDirTree();
          render();
        } else if (filter === "favorites") {
          // 收藏 → 进入收藏视图（“点了收藏的图片都会在里面平铺”）
          if (activeDir) { navByDir[activeDir] = currentPath; saveNav(); }
          activeDir = null;
          currentPath = "";
          activeFilter = "favorites";
          saveNav(); pushNavHistory();
          renderNavBtns();
          renderDirTree();
          render();
        } else if (filter === "guest") {
          // 游客 → 显示本地上传图片（预设分类，不可删改）
          if (activeDir) { navByDir[activeDir] = currentPath; saveNav(); }
          activeDir = null;
          currentPath = "";
          activeFilter = "guest";
          saveNav(); pushNavHistory();
          renderNavBtns();
          renderDirTree();
          render();
        } else {
          // 点击分类 → 进入该分类对应的第一个根目录
          const dir = directories.find(d => d.category === filter);
          if (dir) switchDir(dir.path);
        }
      });
    });
  }

