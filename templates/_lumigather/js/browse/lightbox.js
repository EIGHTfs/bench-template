  /* ─── Lightbox ─── */
  function openLightbox(idx, items) {
    lbList = items || [];
    lightboxIdx = idx;
    updateLightbox(lbList);
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function updateLightbox(items) {
    const total = items.length;
    const cur = items[Math.min(lightboxIdx, total - 1)];
    if (!cur) return;
    const prev = items[(lightboxIdx - 1 + total) % total];
    const next = items[(lightboxIdx + 1) % total];
    lbImgCur.src = cur.src || "";
    lbImgPrev.src = prev ? prev.src : "";
    lbImgNext.src = next ? next.src : "";
    lbCarousel.style.transform = "";   // 切换后重置轮播位置
    const title = cur.title || cur.name || "Untitled";
    const catMeta = categories.find(c => c.name === cur.cat);
    const dir = cur.dirName || cur.dir || "";
    // 收藏分类打开 → 下方描述显示来源路径
    const srcPath = (activeFilter === "favorites")
      ? (cur.path || getPathFromSrc(cur.src) || cur.root || "")
      : "";
    lbInfo.innerHTML = `
      <div class="lb-title">${escapeHTML(title)}</div>
      <div class="lb-cat">${escapeHTML(dir)}${cur.size ? " · " + cur.size : ""} · ${escapeHTML(catMeta?.label || cur.cat || "")}</div>
      ${srcPath ? `<div class="lb-path">📁 ${escapeHTML(srcPath)}</div>` : ""}`;
    // 更新收藏按钮状态
    const lbFav = document.getElementById("lbFav");
    if (lbFav) {
      const isFav = favoriteSrcs.has(cur.src);
      lbFav.textContent = isFav ? "❤️" : "🩷";
      lbFav.style.opacity = authedUser ? "1" : "0.5";
      lbFav.title = authedUser ? (isFav ? t("removeFav") || "取消收藏" : t("addFav") || "收藏") : (t("loginFirst") || "请先登录");
    }
  }
  function closeLightbox() {
    lightbox.classList.remove("open");
    document.body.style.overflow = "";
  }
  // 轮播切换动画（“点开图片还是缺少过渡”→ 平滑滑动切换，不硬切）
  // 经典轮播：先把容器平滑滑到目标位置 → transitionend 后换图 → 瞬移回原位（视觉无感）
  let lbAnimating = false;
  function lbSlide(dir) {   // dir: 1=下一张(左滑), -1=上一张(右滑)
    if (!lbList.length || lbAnimating) return;
    lbAnimating = true;
    const slideW = (lbImgCur.offsetWidth || Math.min(window.innerWidth * 0.7, 600)) + 40;  // 当前图宽 + gap 40px
    lbCarousel.style.transition = "transform .32s cubic-bezier(.25,.8,.35,1)";
    lbCarousel.style.transform = `translateX(${-dir * slideW}px)`;
    const done = () => {
      if (!lbAnimating) return;
      lbAnimating = false;
      lbCarousel.style.transition = "none";          // 关闭过渡，瞬移回位
      lightboxIdx = (lightboxIdx + dir + lbList.length) % lbList.length;
      updateLightbox(lbList);                        // 换图 + transform 归零（视觉无感）
      setTimeout(() => { lbCarousel.style.transition = ""; }, 50);
    };
    const onEnd = ev => { if (ev.propertyName === "transform") { lbCarousel.removeEventListener("transitionend", onEnd); done(); } };
    lbCarousel.addEventListener("transitionend", onEnd);
    setTimeout(done, 420);                           // 兜底：transitionend 万一不触发
  }
  function lbPrev() { lbSlide(-1); }
  function lbNext() { lbSlide(1); }

