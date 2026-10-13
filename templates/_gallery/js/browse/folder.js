  /* ─── 当前文件夹的内容：直接子文件夹 + 直接图片 ─── */
  // 目录 relPath -> 所属根目录（"全部" 视图时用于定位进入哪个根）
  /* dsh-skip-func-length：既有渲染主流程，拆分易引入显示回归，待独立重构 */
  function currentScope() {  // dsh-skip-func-length 既有渲染主流程，拆分易引入显示回归，待独立重构
    const subDirs = new Map();   // name -> {name, relPath, root, count, mtime}
    const images = [];
    const dirRoot = new Map();   // dirRelPath -> rootPath

    const pool = [...apiImages, ...userImages];
    // 第一遍：收集该根下所有目录路径（分类过滤影响目录可见性）
    pool.forEach(p => {
      const root = p.rootPath || p.dirId || "Uploaded";
      if (activeDir && root !== activeDir) return;
      if (activeFilter !== "all" && p.cat !== activeFilter) return;
      const rel = p.rootPath ? (p.relPath || "") : "";
      const parts = rel.split("/").filter(Boolean);
      parts.pop(); // 去掉文件名
      let acc = "";
      parts.forEach(part => {
        acc = acc ? acc + "/" + part : part;
        if (!dirRoot.has(acc)) dirRoot.set(acc, root);
      });
    });

    // 直接子文件夹：目录路径是 currentPath 的一级子
    const prefix = currentPath ? currentPath + "/" : "";
    dirRoot.forEach((root, d) => {
      const isChild = currentPath ? (d.startsWith(prefix) && !d.slice(prefix.length).includes("/"))
                                  : (!d.includes("/"));
      if (!isChild) return;
      const name = currentPath ? d.slice(prefix.length) : d;
      if (!subDirs.has(name)) subDirs.set(name, { name, relPath: d, root, count: 0, mtime: 0, hasSub: false, leafImages: [] });
    });

    // 判断每个子文件夹是否还有更深的子文件夹
    subDirs.forEach(sd => {
      for (const d of dirRoot.keys()) {
        if (d.startsWith(sd.relPath + "/")) { sd.hasSub = true; break; }
      }
    });

    // 第二遍：统计每个子文件夹的图片数量与最新时间，并收集当前目录直接图片
    pool.forEach(p => {
      const root = p.rootPath || p.dirId || "Uploaded";
      if (activeDir && root !== activeDir) return;
      if (activeFilter !== "all" && p.cat !== activeFilter) return;
      const rel = p.rootPath ? (p.relPath || "") : "";
      const parts = rel.split("/").filter(Boolean);
      const dir = parts.slice(0, -1).join("/");
      const mtime = (typeof p.modified === "number" ? p.modified
                    : p.modified ? new Date(p.modified).getTime() : 0) || 0;
      if (dir === currentPath) {
        if (!searchQuery || (p.title || p.name || "").toLowerCase().includes(searchQuery.toLowerCase())) images.push(p);
      }
      // 统计所属子文件夹（递归：包含其下所有层级的图片）
      subDirs.forEach(sd => {
        if (dir === sd.relPath || dir.startsWith(sd.relPath + "/")) {
          sd.count++;
          if (mtime > sd.mtime) sd.mtime = mtime;
          // 叶子文件夹：收集直接图片用于平铺
          if (!sd.hasSub && dir === sd.relPath) sd.leafImages.push(p);
        }
      });
    });

    /* ── 折叠 + 分组：无直图的纯子文件夹链 ──
       单链（只有1个子）→ 继续下钻合并前缀；
       分叉（多个子）→ 生成分组：标题=完整公共前缀链，组内=下一层短名文件夹卡片；
       有直图 → 拍平卡片（名含完整链），点击直达。 */
    // 目录父子关系 + 哪些目录有直接图片
    const childMap = new Map();          // 父目录relPath -> [子目录relPath]
    dirRoot.forEach((root, d) => {
      const i = d.lastIndexOf("/");
      const parent = i < 0 ? "" : d.slice(0, i);
      if (!childMap.has(parent)) childMap.set(parent, []);
      childMap.get(parent).push(d);
    });
    const dirHasImg = new Set();         // 有直接图片的目录
    // 预计算 dirAgg：每张图贡献给它路径上所有祖先目录（含自身目录）
    // “只想优化性能，不想改前端显示设计”→ statDir 从 O(N) 遍历 pool 改 O(1) 查表
    // 【思路】foldChain 会递归调 statDir 多次，每次 O(N) → O(S×N) 总慢；预计算后每张图只遍历一次 O(N×depth)
    const dirAgg = new Map();            // dir -> {count, mtime, leafImages}
    for (const p of pool) {
      const root = p.rootPath || p.dirId || "Uploaded";
      if (activeDir && root !== activeDir) continue;
      if (activeFilter !== "all" && p.cat !== activeFilter) continue;
      const rel = p.rootPath ? (p.relPath || "") : "";
      const parts = rel.split("/").filter(Boolean);
      const dir = parts.slice(0, -1).join("/");
      const mt = (typeof p.modified === "number" ? p.modified
                 : p.modified ? new Date(p.modified).getTime() : 0) || 0;
      if (dir) {
        dirHasImg.add(dir);
        // 贡献给 dir 及其所有祖先目录（含后代统计）
        const dirParts = dir.split("/");
        for (let i = dirParts.length; i >= 1; i--) {
          const ancestor = dirParts.slice(0, i).join("/");
          let agg = dirAgg.get(ancestor);
          if (!agg) { agg = { count: 0, mtime: 0, leafImages: [] }; dirAgg.set(ancestor, agg); }
          agg.count++;
          if (mt > agg.mtime) agg.mtime = mt;
          if (i === dirParts.length) agg.leafImages.push(p); // 仅直接目录收集
        }
      }
    }

    // 统计目录卡片信息（O(1) 查 dirAgg，不再遍历 pool）
    // 【原代码】function statDir(relPath, root, displayName) { for (const p of pool) { ... } } → O(N) per call
    // 【改为】“只想优化性能，不想改前端显示设计”→ 查预计算表，显示逻辑不变
    function statDir(relPath, root, displayName) {
      const agg = dirAgg.get(relPath) || { count: 0, mtime: 0, leafImages: [] };
      const hasSub = (childMap.get(relPath) || []).length > 0;
      return { name: displayName, relPath, root, count: agg.count, mtime: agg.mtime, hasSub, leafImages: hasSub ? [] : agg.leafImages };
    }

    // “里面有单独图片，但这种情况下不影响，分组是里面有许多文件夹就分组”“怎么搞出3种情况了，明明都应该是同一种”
    // 【旧逻辑】①有直图就拍平 ②无直图+1子目录→合并前缀 ③无直图+多子目录→分组 → 3种不同展示
    // 【新逻辑】有子文件夹→分组（不管1个多个、不管有无直图）；无子文件夹→拍平图片 → 统一1种展示
    // 分组自身如有直图，直图作为分组内首个叶子项（不丢失）
    function foldChain(rel, displayName, root) {
      const kids = childMap.get(rel) || [];
      if (kids.length > 0) {
        // 有子文件夹 → 分组（不再合并前缀；不再因有直图拍平）
        const children = kids.map(k => {
          const r = foldChain(k, k.split("/").pop(), root);
          if (r && r.card)  return r.card;
          if (r && r.group) return r.group;
          return statDir(k, root, k.split("/").pop());
        });
        // 该目录自身也有直图 → 在 children 前面加一个直图叶子项（不丢失直图）
        if (dirHasImg.has(rel)) {
          const ownAgg = dirAgg.get(rel);
          if (ownAgg && ownAgg.leafImages && ownAgg.leafImages.length) {
            children.unshift({
              name: "(" + t("directImg") + ")", relPath: rel, root,
              count: ownAgg.leafImages.length, mtime: ownAgg.mtime,
              hasSub: false, leafImages: ownAgg.leafImages
            });
          }
        }
        return { group: {
          isGroup: true, name: displayName, relPath: rel, root,
          count: children.reduce((s, c) => s + (c.count || 0), 0),
          mtime: Math.max(0, ...children.map(c => c.mtime || 0)),
          children
        }};
      }
      // 无子文件夹 + 有直图 → 拍平 card
      if (dirHasImg.has(rel)) return { card: statDir(rel, root, displayName) };
      return null; // 无子无图（不应出现）
    }

    // 变换：有子文件夹 → foldChain 分组；无子文件夹 → 保留原样（叶子/空目录）
    // 【旧逻辑】if (dirHasImg.has(sd.relPath) || !kids.length) → 有直图也直接 push 不分组
    // 【新逻辑】只有 !kids.length 才直接 push；有 kids 就走 foldChain → 统一分组
    const flat = [];
    for (const sd of Array.from(subDirs.values())) {
      const kids = childMap.get(sd.relPath) || [];
      if (!kids.length) { flat.push(sd); continue; }
      const r = foldChain(sd.relPath, sd.name, sd.root);
      if (r && r.group) { const g = r.group; if (!flat.find(x => x.isGroup && x.name === g.name)) flat.push(g); }
      else if (r && r.card) { const c = r.card; if (!flat.find(x => x.relPath === c.relPath)) flat.push(c); }
    }

    const list = flat;
    if (sortBy === "count") list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    else if (sortBy === "time") list.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));
    else list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    return { subDirs: list, images };
  }

