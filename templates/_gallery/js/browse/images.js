  /* ─── Load images: assign each to deepest matching directory ─── */
  // onlyRoot：只刷新指定根目录（上传后局部刷新，其他目录保留旧数据）
  // noCache：强制服务端跳过扫描缓存重新扫描（上传后立即看到新图）
  //
  // 2026-10-15 两步加载（用户要求「当前目录优先，再加载剩下全部」）：
  //   第一步：只取「当前正在看的那个目录」这一层（recursive=false）＋ 各配置根的根层
  //           —— 服务端只做一次 readdir，毫秒级返回 ⇒ 首屏立刻出图，不必等整棵子树
  //   第二步：再对全部配置根取全量（recursive=true，走按目录索引）⇒ 合并后补齐并更新总数
  // 竞态守卫 loadRunId：两步期间若用户又触发一次加载（切目录/刷新/上传），旧一轮结果直接丢弃，
  //   避免「慢的全量结果盖掉新的当前目录结果」。
  let loadRunId = 0;

  /** 把「路径 → 原始图片」映射成前端图片对象（与原实现完全一致，保证显示不变） */
  function mapRawImages(rawMap) {
    const deepest = [...directories].sort((a, b) => b.path.length - a.path.length);
    return Array.from(rawMap.values()).map(im => {
      const d = deepest.find(x => im.path.startsWith(x.path))
             || directories[0]
             || { category: "all", path: "" };
      // 真实目录层级：相对根目录的子路径
      const rootPath = d.path || "";
      const relPath = rootPath && im.path.startsWith(rootPath + "/")
        ? im.path.slice(rootPath.length + 1)
        : im.path;
      const slashIdx = relPath.lastIndexOf("/");
      const parentDir = slashIdx > 0 ? relPath.slice(0, slashIdx) : "";
      return {
        ...im,
        src:  window.API.apiUrl(im.url),
        rootPath,        // 所属配置根目录
        relPath,         // 相对根目录的完整相对路径（含文件名）
        parentDir,       // 相对根目录的父目录路径（"" 表示直接在根目录）
        cat:    d.category,
        dirId:  d.path,
        dirName: d.path.split("/").pop() || "Root",
        title: im.name.replace(/\.(jpg|jpeg|png|webp|gif)$/i, ""),
      };
    });
  }

  /** 合并规则与原实现一致：onlyRoot 时只替换该 root 的图片，否则整体替换 */
  function applyImages(mapped, onlyRoot) {
    if (onlyRoot) {
      apiImages = [...apiImages.filter(x => x.rootPath !== onlyRoot), ...mapped];
    } else {
      apiImages = mapped;
    }
  }

  async function loadAPIImages(onlyRoot, noCache) {
    if (loading) return;
    loading = true;
    const runId = ++loadRunId;
    const targets = onlyRoot
      ? directories.filter(d => d.path === onlyRoot)
      : directories;

    /** 取一层：root 指定根，path 指定相对子路径（空=根层），recursive 决定是否整棵
     *  skipRel：本次**不下钻**的相对子树（第二步整根取数时跳过第一步已取过的当前目录，
     *           保证两个请求合计仍是一次完整遍历 —— 总耗时≈原来一次请求，不额外增加） */
    async function fetchLayer(dir, relPath, recursive, skipRel) {
      try {
        const qs = `/images?root=${encodeURIComponent(dir.path)}`
          + (relPath ? `&path=${encodeURIComponent(relPath)}` : '')
          + (recursive ? '&recursive=true' : '')
          + (skipRel ? `&skip=${encodeURIComponent(skipRel)}` : '')
          + (noCache ? '&noCache=true' : '');
        return await window.API.apiGet(qs);
      } catch (e) {
        console.warn(`Failed to load ${dir.path}:`, e.message);
        return null;
      }
    }

    // ── 第一步：只取「当前所在的这一层」⇒ 立刻出图 ──
    // 例：前端停在 星穹铁道/(gamebanana)/角色/Pearl – 真珠 时，
    //     只请求 root=<星穹铁道根>&path=(gamebanana)/角色/Pearl – 真珠&recursive=false —— 一个目录的一次 readdir，毫秒级。
    // 未选中具体目录（如在「全部」视图）时，退化为各配置根的根层（同样只一层）。
    showNotification(t("loadingImages"), "info");
    const firstMap = new Map();
    const firstTargets = (activeDir && !onlyRoot)
      ? [{ dir: directories.find(d => d.path === activeDir), rel: currentPath || "" }]
      : targets.map(dir => ({ dir, rel: (activeDir && dir.path === activeDir) ? (currentPath || "") : "" }));
    const firsts = await Promise.all(firstTargets
      .filter(t => t.dir)
      .map(t => fetchLayer(t.dir, t.rel, true)));   // true：当前目录的**整棵子树**（界面上几百张就是它的聚合数）
    if (runId !== loadRunId) return;                       // 已被新一轮取代 ⇒ 丢弃
    for (const imgData of firsts) {
      if (!imgData) continue;
      for (const im of (imgData.images || [])) firstMap.set(im.path, im);
    }
    applyImages(mapRawImages(firstMap), onlyRoot);
    render();                                             // 首屏：当前这一层先出来
    // 提示改成「当前这层」的张数 —— 不再一上来就报全局几十万张（那会让人以为要等很久）
    showNotification(t("loadedImages", { n: firstMap.size }), "info");

    /** 当前视图「可见内容」的指纹：直接取 render 实际用的那份派生结果
     *  （currentScope() 就是 render() 内部算 {subDirs, images} 的那个函数）
     *  子目录卡片上显示的张数是聚合数（含更深层），所以把每个可见子目录的 count 也计入指纹 ——
     *  这样「深层新增了一张图」也会被识别为可见内容变化。 */
    function scopeFingerprint() {
      try {
        const sc = currentScope();
        const dirs = (sc.subDirs || []).map(d => `${d.relPath || d.name}:${d.count || 0}`).join(',');
        const imgs = (sc.images || []).map(i => i.relPath || i.path).join(',');
        return `${dirs}|${imgs}`;
      } catch (_) {
        return "unknown";   // 取不到指纹时保守处理（当作「可能变了」）
      }
    }
    const firstFp = scopeFingerprint();

    // ── 第二步：剩下全部（走索引；首次未索引时较慢）──
    // 对「第一步已单独取过的那个当前目录子树」传 skip ⇒ 服务端不下钻它，避免重复遍历：
    //   两个请求合计 = 一次完整遍历（总耗时≈原来一次请求），而当前目录 0.3s 级先到手。
    const step1Rel = (activeDir && !onlyRoot) ? (currentPath || "") : "";
    const fullMap = new Map();
    const results = await Promise.all(targets.map(dir =>
      fetchLayer(dir, "", true, (step1Rel && dir.path === activeDir) ? step1Rel : "")));
    if (runId !== loadRunId) return;                       // 同上
    for (const imgData of results) {
      if (!imgData) continue;
      for (const im of (imgData.images || [])) fullMap.set(im.path, im);
    }
    applyImages(mapRawImages(fullMap), onlyRoot);

    loading = false;
    showNotification(t("loadedImages", { n: apiImages.length }), "success");
    // ┌─ 本步已按「增量合并」实现：可见内容没变就不重建 DOM；确实变了才重建，并保住滚动位置 ────
    // │ 现状（代码事实）：render() 入口即 `gallery.innerHTML = ""`（js/browse/render.js:59 / 113 / 155，
    // │   分别对应 收藏视图 / 游客视图 / 常规视图 三个分支），随后由 currentScope() 依据 apiImages
    // │   重新派生 {subDirs, images} 并重建排序条、分组 section、图片行 .dir-grid、卡片，
    // │   最后 renderBreadcrumb() 写右侧张数、applyImageRowWrap(N) 做每行 N 张切块。
    // │   ⇒ 每次 render 都是「全屏重画」：副作用一是画廊滚动位置被重置到顶部，
    // │     二是已显示图片的 DOM 被重建（解码有缓存、通常不闪白，但会有一次重排）。
    // │   同源记录：js/app.js:516-519（上次「点开图片→点收藏→图片回顶部」的修复注释，
    // │   当时把 toggleFavorite 末尾的 render() 改成 updateFavoriteMarks() 就地更新角标）。
    // │
    // │ 本处为什么现在会触发：第一步先把「当前目录」渲染出来之后，第二步全量数据到达又 render 一次，
    // │   如果用户已经往下滚着看第一步的内容，就会被弹回顶部。
    // │
    // │ 方案 2 概要（保滚动位置，约 20 行，不改分组/渲染结构）：
    // │   1) 渲染前记录：const keepTop = gallery.scrollTop（若有其它滚动容器一并记录）；
    // │   2) 渲染后恢复：把 keepTop 写回；由于图片是懒加载、恢复时布局高度可能还没稳定，
    // │      在 requestAnimationFrame 里再写一次（或恢复后校验 scrollHeight 是否已足够）；
    // │   3) 只在「同一视图补数据」时恢复；用户切目录/切筛选（activeDir/currentPath/activeFilter 变化）
    // │      时**不恢复**（切视图本来就该回到顶部），判据：进入本函数时快照这三个状态、渲染后比对；
    // │   4) 验收：进某目录 → 滚到中部 → 等第二步完成 → 滚动位置不变，且第一屏图片无重复闪烁。
    // │ 已采用的增量判据：第一步渲染后取一次可见指纹 firstFp（上面 scopeFingerprint），
    // │   第二步合并后再取一次 → 相同则完全不重建 DOM；不同才走下面的重建分支（并套用上面的保滚动做法）。
    // └────────────────────────────────────────────────────────────────────────────
    const afterFp = scopeFingerprint();
    if (afterFp === firstFp) {
      // 可见内容没变（典型：你停在某个目录里，第二步补的是其它目录/更深层的图，当前视图用不到）
      // ⇒ 不重建画廊 DOM：零重画、零闪烁、滚动位置不动；只刷新侧栏目录树（不碰画廊）
      try { renderDirTree(); } catch (_) { /* 侧栏刷新失败不影响浏览 */ }
    } else {
      // 可见内容确实变了（典型：停在「全部」或某层的聚合数变化）⇒ 该重建，但保住滚动位置
      const keepTop = gallery.scrollTop;
      render();
      gallery.scrollTop = keepTop;
      requestAnimationFrame(() => { gallery.scrollTop = keepTop; });   // 懒加载布局稳定后再校正一次
    }
  }

