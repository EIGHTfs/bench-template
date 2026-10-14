  /* ─── Init: load config ─── */
  async function init() {
    loadCollapsed();
    await refreshAuth();
    try {
      const data = await window.API.apiGet("/gallery");
      galleryTitle = data.title || "崩坏3";
      favicon      = data.favicon || "";
      categories   = Array.isArray(data.categories) ? data.categories : [];
      directories  = Array.isArray(data.directories) ? data.directories : [];
      window.__GALLERY_FS_ROOT = data.fsRoot || "/";
    } catch (e) {
      console.warn("API init failed:", e);
    }
    // 刷新时直接呈现上次位置：restoreNav() 只依赖 localStorage 与已加载的 directories。
    // 必须放在**任何 render() 之前**——实测 loadLang() 内部会触发一次渲染（138ms 时视图为 "(null)|"），
    // 若放在 loadLang() 之后，首屏仍会先闪一下主页再跳回上次位置。
    restoreNav();
    await loadLang(lang);
    document.querySelector(".logo-text").textContent = galleryTitle;
    galleryTitleInput.value = galleryTitle;
    faviconInput.value = favicon;
    applyTabMeta();
    renderNavBtns();
    renderDirTree();
    render();
    await loadAPIImages();
    // restoreNav();  // 【原位置】在首次 render() 之后 ⇒ 先画主页再跳，已提前到上面（保留痕迹，勿删）
    pushNavHistory();  // “顶部导航栏前后加< >实现后退前进”→ 初始状态入历史栈，导航后才能后退
    await loadFavorites();  // 加载收藏列表
    await loadUploaded();   // 加载服务端 uploads/ 目录图片（游客分类）
    renderDirTree();
    render();
  }

  /* ─── 游客分类图片（服务端 uploads/ 目录，重启后仍可见）─── */
  async function loadUploaded() {
    try {
      const list = await window.API.apiGet('/uploaded');
      uploadedImages = Array.isArray(list) ? list : [];
    } catch (_) { uploadedImages = []; }
  }

  /* ─── 收藏功能（“增加收藏功能🩷，预设个不可删改的收藏分类，登录可点收藏，游客可看”）─── */
  // 规范化收藏 src：旧数据可能存了完整 URL（含端口），重启/换端口后裂开
  // “重启过后，收藏下的图片裂开不能显示”→ 统一转成相对 /api/... 路径
  function normalizeFavSrc(src) {
    if (!src) return src;
    // 已经是相对路径 → 直接用
    if (!/^https?:\/\//i.test(src)) return src;
    try {
      const u = new URL(src);
      // 完整 URL → 只保留 pathname+search（同源后相对路径即可）
      return u.pathname + u.search;
    } catch (_) { return src; }
  }
  // 从 src 提取完整文件路径：/api/media?file=<urlencoded绝对路径> 或完整URL
  // 旧收藏没存 path，只有 root（根目录）；完整路径藏在 src 的 file 参数里
  // “图片路径明明有全路径，目录描述你只到根目录”→ 解析 file 参数补全
  function getPathFromSrc(src) {
    if (!src) return "";
    try {
      let file = src;
      // 若为完整 URL（http://host/api/media?file=...），取 pathname+search
      if (/^https?:\/\//i.test(src)) {
        const u = new URL(src);
        file = u.pathname + u.search;
      }
      const m = file.match(/[?&]file=([^&]+)/);
      if (!m) return "";
      const decoded = decodeURIComponent(m[1]);
      // 只保留绝对路径部分（若含主机前缀则去掉）
      return decoded;
    } catch (_) { return ""; }
  }
  async function loadFavorites() {
    try {
      const [favs, auth] = await Promise.all([
        window.API.apiGet('/favorites'),
        // 用 apiAuthStatus()（内部把框架 /status 的 needsAuth 转成 authed）判定登录态；
        // 不要直接 apiGet('/status')——框架返回 needsAuth 字段而非 authed，
        // 裸取 auth.authed 恒为 undefined → 已设密码时登录了 authedUser 仍为 false（收藏提示未登录）
        window.API.apiAuthStatus()
      ]);
      // 规范化 src（兼容旧数据完整 URL）
      favoriteImages = (Array.isArray(favs) ? favs : []).map(f => ({ ...f, src: normalizeFavSrc(f.src) }));
      favoriteSrcs = new Set(favoriteImages.map(f => f.src));
      authedUser = auth.needsSetup === true ? true : auth.authed === true;
    } catch (_) { favoriteImages = []; favoriteSrcs = new Set(); }
  }
  /** 收藏状态就地更新：只增删匹配 src 的卡片 ❤️ 角标，不重建画廊 DOM
   *  （2026-10-14 修 bug：原先 toggleFavorite 末尾无条件 render()，
   *   而 render() 会 gallery.innerHTML="" 重建全部卡片 ⇒ 画廊滚动位置被重置到顶部，
   *   表现为「点开图片→点收藏→图片回顶部」。）
   *  @returns {number} 实际改动过的卡片数
   */
  function updateFavoriteMarks(p, src) {
    const on = favoriteSrcs.has(src);
    const targets = [p && p.src, src].filter(Boolean);
    let touched = 0;
    document.querySelectorAll("#gallery .card img").forEach((img) => {
      const s = img.getAttribute("src");
      if (!s || targets.indexOf(s) === -1) return;
      const card = img.closest(".card");
      if (!card) return;
      const mark = card.querySelector(".card-fav");
      if (on && !mark) {
        const span = document.createElement("span");
        span.className = "card-fav";
        span.textContent = "❤️";
        card.appendChild(span);
        touched++;
      } else if (!on && mark) {
        mark.remove();
        touched++;
      }
    });
    return touched;
  }

  async function toggleFavorite(p) {
    if (!authedUser) { showNotification(t("loginFirst") || "请先登录", "warn"); return; }
    const src = normalizeFavSrc(p.src);
    if (!src) return;
    if (favoriteSrcs.has(src)) {
      // 移除收藏
      await window.API.apiDelete('/favorites', { src });
      favoriteSrcs.delete(src);
      favoriteImages = favoriteImages.filter(f => f.src !== src);
    } else {
      // 添加收藏（存相对 src + 来源路径，lightbox 里可显示路径）
      // “收藏里面的图片可以点开后描述来源路径”→ 保存 path/root
      const item = {
        src, name: p.name, title: p.title || p.name, cat: p.cat,
        dir: p.parentDir || p.dir, size: p.size,
        root: p.rootPath || activeDir,
        path: p.path || "",   // 绝对路径（lightbox 显示用）
      };
      await window.API.apiPost('/favorites', item);
      favoriteSrcs.add(src);
      favoriteImages.push({ ...item, src });
    }
    // 就地更新 ❤️ 角标 + 导航计数；**不**整体重渲染画廊（否则滚动位置回顶部）
    updateFavoriteMarks(p, src);
    renderNavBtns();
    // 仅「收藏」视图需要整体重渲染：该视图的图片列表本身随收藏变化（其余视图内容不变）
    if (activeFilter === "favorites") render();
  }

