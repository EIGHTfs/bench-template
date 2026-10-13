  /* ─── Events ─── */
  // “如果它已展开（是 ancestor），点击应该折叠它（而不是导航到它）。如果是未展开，点击就是展开它并导航到它”
  dirTree.addEventListener("click", e => {
    const item = e.target.closest(".dir-item");
    if (!item) return;
    const root = item.dataset.root;
    const path = item.dataset.path || "";
    const nodeKey = item.dataset.nodeKey || "";
    // 判断当前是否已展开（是 ancestor/active 且未被手动折叠）
    const isAncestor = !!path && (currentPath === path || (currentPath && currentPath.startsWith(path + "/")));
    const isExpanded = isAncestor && !collapsedTreeNodes.has(nodeKey);
    const hasKids = item.querySelector(".dir-icon")?.textContent === "▾" || item.querySelector(".dir-icon")?.textContent === "▸";

    if (root === "all" || !hasKids) {
      // "全部"或叶子节点 → 直接导航
      if (root === "all") { activeDir = null; currentPath = ""; activeFilter = "all"; }
      else {
        if (root) activeDir = root;
        currentPath = path;
        // “选择收藏/游客分类后，不能通过左侧边栏跳转其他分类”→ 点侧边栏目录时切回该目录所属分类
        const dir = directories.find(d => d.path === root);
        if (dir) activeFilter = dir.category;
      }
    } else if (isExpanded) {
      // 已展开 → 折叠（不导航）
      collapsedTreeNodes.add(nodeKey);
      saveCollapsed();
      renderDirTree();
      return;
    } else {
      // 未展开 → 展开 + 导航
      collapsedTreeNodes.delete(nodeKey);
      if (root) activeDir = root;
      currentPath = path;
      if (root) {
        const dir = directories.find(d => d.path === root);
        if (dir) activeFilter = dir.category;
      }
    }
    renderNavBtns();
    saveNav();
    pushNavHistory();
    renderDirTree();
    render();
  });

  searchInput.addEventListener("input", e => { searchQuery = e.target.value; render(); });

  // ─── 语言切换 ───
  const langBtn = document.getElementById("langBtn");
  langBtn.addEventListener("click", () => {
    const next = lang === "en" ? "zh-CN" : "en";
    loadLang(next);
  });

  // ─── 屏蔽图片右键菜单（已注释屏蔽逻辑：允许长按/右键保存图片）───
  // document.addEventListener("contextmenu", e => {
  //   if (e.target.closest("img")) e.preventDefault();
  // }, true);

  // “④下载功能并没有唤起浏览器下载图片，只是跳转到原图”
  // 【原代码】a.href=p.src; a.download=... → 跨源(:3000)图片浏览器忽略 download 属性，直接跳转
  // 【改为】fetch blob → URL.createObjectURL → a.download → 真正下载
  document.getElementById("lbDownload").addEventListener("click", async () => {
    const p = lbList[Math.min(lightboxIdx, lbList.length - 1)];
    if (!p || !p.src) return;
    const filename = (p.name || "image").replace(/[\\/:*?"<>|]/g, "_");
    try {
      const resp = await fetch(p.src, { credentials: "include" });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (_) {
      // 回退：直接跳转（至少能用）
      window.open(p.src, "_blank");
    }
  });

  document.getElementById("lbClose").addEventListener("click", closeLightbox);
  document.getElementById("lbPrev").addEventListener("click", e => { e.stopPropagation(); lbPrev(); });
  document.getElementById("lbNext").addEventListener("click", e => { e.stopPropagation(); lbNext(); });
  // “登录用户可点收藏，游客可以看”
  document.getElementById("lbFav").addEventListener("click", e => {
    e.stopPropagation();
    const p = lbList[Math.min(lightboxIdx, lbList.length - 1)];
    if (p) toggleFavorite(p).then(() => updateLightbox(lbList));
  });
  lightbox.addEventListener("click", e => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener("keydown", e => {
    if (!lightbox.classList.contains("open")) return;
    if (e.key === "Escape")     closeLightbox();
    if (e.key === "ArrowLeft")  lbPrev();
    if (e.key === "ArrowRight") lbNext();
  });

  // “③点开图片之后，除了按钮切换图片，加上可以滑动切换”
  // “点开图片之后，前后图片也都被点开，中间稍微有几厘米间距，滑动时前后图片一起滑动”
  // → 三图轮播：拖动整个 .lb-carousel 容器（前后图一起动），松手超阈值切换、否则弹回
  let lbDrag = null; // { startX, startY, moved }
  function lbDragStart(x, y) {
    lbDrag = { startX: x, startY: y, moved: false };
    lbCarousel.style.transition = "none";          // 拖动中禁用过渡，跟手
  }
  function lbDragMove(x, y) {
    if (!lbDrag) return;
    const dx = x - lbDrag.startX;
    const dy = y - lbDrag.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) lbDrag.moved = true;
    if (lbDrag.moved && Math.abs(dx) > Math.abs(dy)) {
      lbCarousel.style.transform = `translateX(${dx}px)`;
    }
  }
  function lbDragEnd(x, y) {
    if (!lbDrag) return;
    const dx = x - lbDrag.startX;
    const moved = lbDrag.moved;
    lbDrag = null;
    if (moved && Math.abs(dx) > 80) {
      // 切换走 lbSlide：从当前拖动位置平滑滑到目标（transitionend 后换图）
      if (dx > 0) lbPrev(); else lbNext();
    } else {
      lbCarousel.style.transition = "transform .3s ease";
      lbCarousel.style.transform = "";                     // 弹回原位
      setTimeout(() => { lbCarousel.style.transition = ""; }, 350);
    }
  }
  // 触摸（绑定到 lightbox，前后图也可见时整体可拖动）
  lightbox.addEventListener("touchstart", e => { lbDragStart(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  lightbox.addEventListener("touchmove", e => {
    if (lbDrag && lbDrag.moved) e.preventDefault();
    lbDragMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  lightbox.addEventListener("touchend", e => { lbDragEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }, { passive: true });
  // 鼠标拖拽（桌面端，与卡片行预览滑动一致）
  lightbox.addEventListener("mousedown", e => {
    if (e.target.closest("button")) return;   // 不拦截按钮点击
    e.preventDefault();
    lbDragStart(e.clientX, e.clientY);
  });
  document.addEventListener("mousemove", e => lbDragMove(e.clientX, e.clientY));
  document.addEventListener("mouseup", e => lbDragEnd(e.clientX, e.clientY));
  // 鼠标滚轮切换（lightbox 打开时）
  lightbox.addEventListener("wheel", e => {
    if (!lightbox.classList.contains("open")) return;
    e.preventDefault();
    if (e.deltaY > 0 || e.deltaX > 0) lbNext();
    else lbPrev();
  }, { passive: false });

  collapseBtn.addEventListener("click", () => {
    app.classList.toggle("collapsed");
    collapseBtn.textContent = app.classList.contains("collapsed") ? "▶" : "◀";
  });

