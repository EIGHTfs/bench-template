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

    /** 取一层：root 指定根，path 指定相对子路径（空=根层），recursive 决定是否整棵 */
    async function fetchLayer(dir, relPath, recursive) {
      try {
        const qs = `/images?root=${encodeURIComponent(dir.path)}`
          + (relPath ? `&path=${encodeURIComponent(relPath)}` : '')
          + (recursive ? '&recursive=true' : '')
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

    // ── 第二步：剩下全部（走索引；首次未索引时较慢）──
    const fullMap = new Map();
    const results = await Promise.all(targets.map(dir => fetchLayer(dir, "", true)));
    if (runId !== loadRunId) return;                       // 同上
    for (const imgData of results) {
      if (!imgData) continue;
      for (const im of (imgData.images || [])) fullMap.set(im.path, im);
    }
    applyImages(mapRawImages(fullMap), onlyRoot);

    loading = false;
    showNotification(t("loadedImages", { n: apiImages.length }), "success");
    // ┌─ 待办：这一步的 render() 是「整屏重建」，会带来滚动位置回顶（方案 2 设计概要，尚未实施）────────
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
    // │ 备选（体验更好但风险更高，未采用）：方案 1 增量合并 —— 第二步只把新出现的深层图片/新分组
    // │   插进现有 DOM（参照 updateFavoriteMarks 的就地更新思路），不整屏重建；需真渲染回归验证。
    // └────────────────────────────────────────────────────────────────────────────
    render();
  }

