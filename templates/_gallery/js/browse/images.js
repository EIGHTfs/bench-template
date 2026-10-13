  /* ─── Load images: assign each to deepest matching directory ─── */
  // onlyRoot：只刷新指定根目录（上传后局部刷新，其他目录保留旧数据）
  // noCache：强制服务端跳过扫描缓存重新扫描（上传后立即看到新图）
  async function loadAPIImages(onlyRoot, noCache) {
    if (loading) return;
    loading = true;
    showNotification(t("loadingImages"), "info");

    const targets = onlyRoot
      ? directories.filter(d => d.path === onlyRoot)
      : directories;

    const rawMap = new Map();   // imagePath -> raw image
    // 并行请求目标目录（不串行等待；后端有扫描缓存后每个请求毫秒级）
    const results = await Promise.all(targets.map(async dir => {
      try {
        const qs = `/images?root=${encodeURIComponent(dir.path)}&recursive=true` + (noCache ? '&noCache=true' : '');
        return await window.API.apiGet(qs);
      } catch (e) {
        console.warn(`Failed to load ${dir.path}:`, e.message);
        return null;
      }
    }));
    for (const imgData of results) {
      if (!imgData) continue;
      for (const im of (imgData.images || [])) rawMap.set(im.path, im);
    }

    const deepest = [...directories].sort((a, b) => b.path.length - a.path.length);
    const mapped = Array.from(rawMap.values()).map(im => {
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

    if (onlyRoot) {
      // 只刷新该 root：保留其他 root 的图片，替换本 root 的
      apiImages = [...apiImages.filter(x => x.rootPath !== onlyRoot), ...mapped];
    } else {
      apiImages = mapped;
    }

    loading = false;
    showNotification(t("loadedImages", { n: apiImages.length }), "success");
    render();
  }

