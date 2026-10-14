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
    render();
  }

