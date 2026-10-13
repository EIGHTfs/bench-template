  /* ─── Render gallery (browser: current folder subdirs + images) ─── */
  // 卡片构造（图片/GIF/压缩包内图统一）；opts: { dir, zipName, noGif }
  function makeCard(p, opts = {}) {
    const card = document.createElement("div");
    card.className = "card" + (p.isGif ? " gif-card" : "");
    const title = p.title || p.name || "Untitled";
    const cat   = p.cat   || "unknown";
    const catMeta = categories.find(c => c.name === cat);
    const dir   = opts.dir || p.dirName || p.dir || "";
    const size  = p.size || "";
    const tag = p.isGif
      ? `<span class="card-tag" style="background:rgba(244,114,182,.9)">GIF ${p.frameCount || ""}${escapeHTML(t("gifFramesUnit"))}</span>`
      : `<span class="card-tag" style="background:${catMeta?.color || "rgba(0,0,0,.5)"}">${escapeHTML(catMeta?.label || cat)}</span>`;
    // 已收藏的图片显示 ❤️ 角标（“点了收藏的图片都会在里面平铺”）
    const favMark = favoriteSrcs.has(p.src) ? `<span class="card-fav">❤️</span>` : "";
    card.innerHTML = `
      <img src="${escapeHTML(p.src || "")}" alt="${escapeHTML(title)}" loading="lazy" decoding="async" draggable="false"/>
      ${tag}
      ${favMark}
      <div class="card-overlay">
        <div class="card-title">${escapeHTML(title)}</div>
        <div class="card-meta">${escapeHTML(dir)}${size ? " · " + size : ""}</div>
      </div>`;
    card.addEventListener("click", () => {
      const arr = opts.lbList || [p];
      const idx = arr.findIndex(x => (x.path || x.src) === (p.path || p.src));
      openLightbox(idx >= 0 ? idx : 0, arr);
    });
    return card;
  }

  /* dsh-skip-func-length：既有渲染主流程，拆分易引入显示回归，待独立重构 */
  function render() {  // dsh-skip-func-length 既有渲染主流程，拆分易引入显示回归，待独立重构
    // “增加收藏功能🩷，预设个不可删改的收藏分类，点了收藏的图片都会在里面平铺”
    if (activeFilter === "favorites") {
      gallery.innerHTML = "";
      empty.style.display = "none";
      gallery.style.display = "";
      const sortBar = document.createElement("div");
      sortBar.className = "sort-bar";
      sortBar.innerHTML = `<span class="sort-count">🩷 ${favoriteImages.length} ${escapeHTML(t("imagesCount"))}</span>`;
      gallery.appendChild(sortBar);
      // “收藏里面来自每个分类各一行，不都在一行”→ 按分类分组，每分类一个 section
      // cat 缺失的老收藏：用 root 路径匹配已配置目录反推分类，反推不到才归“未分类”
      const favCat = (p) => {
        if (p.cat) return p.cat;
        const roots = [p.root, p.dir, p.path].filter(Boolean);
        const byPath = [...directories].sort((a, b) => b.path.length - a.path.length);
        for (const r of roots) {
          const hit = byPath.find(d => r && (r === d.path || r.startsWith(d.path + "/")));
          if (hit) return hit.category;
        }
        return "__uncat__";
      };
      const byCat = new Map();
      for (const p of favoriteImages) {
        const cat = favCat(p);
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat).push(p);
      }
      // 分类顺序：按已配置 categories 顺序，未知/未分类放最后
      const catOrder = new Map(categories.map((c, i) => [c.name, i]));
      const keys = [...byCat.keys()].sort((a, b) =>
        (catOrder.has(a) ? catOrder.get(a) : 999) - (catOrder.has(b) ? catOrder.get(b) : 999)
        || a.localeCompare(b, "zh-CN"));
      for (const cat of keys) {
        const imgs = byCat.get(cat);
        const catMeta = categories.find(c => c.name === cat);
        const label = cat === "__uncat__" ? (t("uncategorized") || "未分类") : (catMeta?.label || cat);
        const section = document.createElement("div");
        section.className = "dir-section";
        const header = document.createElement("div");
        header.className = "dir-section-header group";
        header.innerHTML =
          `<span class="dir-section-icon">🩷</span>` +
          `<span class="dir-section-name">${escapeHTML(label)}</span>` +
          `<span class="dir-section-meta">${imgs.length} ${escapeHTML(t("imagesCount"))}</span>`;
        section.appendChild(header);
        const grid = document.createElement("div");
        grid.className = "dir-grid";
        imgs.forEach(p => grid.appendChild(makeCard(p, { dir: p.dir || "", lbList: favoriteImages })));
        section.appendChild(grid);
        gallery.appendChild(section);
      }
      renderBreadcrumb(favoriteImages, favoriteImages.length);
      return;
    }
    // 游客分类（预设，“不登录只能上传到预设分类游客，项目本地实际存储”）
    if (activeFilter === "guest") {
      gallery.innerHTML = "";
      empty.style.display = "none";
      gallery.style.display = "";
      // 服务端 uploads/（持久）+ 本次浏览期内前端上传（去重，按 src）
      const seen = new Set();
      const guestImgs = [];
      [...uploadedImages, ...userImages.filter(p => p.cat === "guest")].forEach(p => {
        const k = p.src || p.id || "";
        if (!k || seen.has(k)) return;
        seen.add(k);
        guestImgs.push(p);
      });
      const sortBar = document.createElement("div");
      sortBar.className = "sort-bar";
      sortBar.innerHTML = `<span class="sort-count">👤 ${guestImgs.length} ${escapeHTML(t("imagesCount"))}</span>`;
      gallery.appendChild(sortBar);
      const grid = document.createElement("div");
      grid.className = "dir-grid";
      guestImgs.forEach(p => grid.appendChild(makeCard(p, { dir: p.dir || "", lbList: guestImgs })));
      gallery.appendChild(grid);
      renderBreadcrumb(guestImgs, guestImgs.length);
      return;
    }
    // 自动下钻：当前层无直图且只有一个折叠链子目录（如 Mods → Mods/.Mods）→ 直接进入内部
    let guard = 0;
    while (guard++ < 40) {
      const sc = currentScope();
      if (sc.images.length) break;                       // 有直图 → 停
      if (sc.subDirs.length !== 1) break;                // 非单目录 → 停
      const only = sc.subDirs[0];
      if (!only.isGroup && !only.hasSub) break;          // 空子目录 → 停（防死循环）
      if (currentPath === only.relPath) break;           // 防重复
      currentPath = only.relPath;
      saveNav();
    }
    const { subDirs, images } = currentScope();
    // 有子文件夹的 → 卡片；无子文件夹的（叶子）→ 平铺图片；分组 → 公共前缀链块
    const groups   = subDirs.filter(sd => sd.isGroup);
    const cardDirs = subDirs.filter(sd => !sd.isGroup && sd.hasSub);
    const leafDirs = subDirs.filter(sd => !sd.isGroup && !sd.hasSub && sd.leafImages.length);
    const totalImgs = images.length + leafDirs.reduce((s, d) => s + d.leafImages.length, 0);

    gallery.innerHTML = "";
    // 纯压缩包目录：无图无子文件夹但可能有压缩包 → 不在此处判空，交给 zip 扫描后决定
    const curAbs0 = activeDir ? (activeDir + (currentPath ? "/" + currentPath : "")) : "";
    if (!groups.length && !cardDirs.length && !leafDirs.length && !images.length && !curAbs0) {
      const pe = empty.querySelector("p"); if (pe) pe.textContent = t("emptyDir");
      empty.style.display = "flex"; gallery.style.display = "none"; return;
    }
    empty.style.display = "none";
    gallery.style.display = "";

    // 排序栏（作用于文件夹：卡片 + 叶子平铺分组）
    if (subDirs.length) {
      const sortBar = document.createElement("div");
      sortBar.className = "sort-bar";
      sortBar.innerHTML = `
        <span class="sort-label">${escapeHTML(t("sort"))}</span>
        <button class="sort-btn ${sortBy === "name" ? "active" : ""}" data-sort="name">${escapeHTML(t("sortName"))}</button>
        <button class="sort-btn ${sortBy === "count" ? "active" : ""}" data-sort="count">${escapeHTML(t("sortCount"))}</button>
        <button class="sort-btn ${sortBy === "time" ? "active" : ""}" data-sort="time">${escapeHTML(t("sortTime"))}</button>
        <span class="sort-count">${subDirs.length} ${escapeHTML(t("folderCount"))}</span>`;
      sortBar.querySelectorAll(".sort-btn").forEach(btn =>
        btn.addEventListener("click", () => {
          sortBy = btn.dataset.sort;
          render();
        })
      );
      gallery.appendChild(sortBar);
    }

    // “分组折叠用的▾太小了改成▲▼。位置应该在后面，点后面▲▼才折叠展开，否则进入”
    // 【原代码】图标在前面(▸)，点名称=展开/折叠，点图标=进入
    // 【改为】名称+meta 在前面(点击=进入)；▲▼符号在后面(点击=折叠/展开)
    groups.forEach(g => {
      const section = document.createElement("div");
      section.className = "dir-section";
      const header = document.createElement("div");
      header.className = "dir-section-header group";
      const collapsed = !expandedGroups.has(g.name);
      const timeStr = g.mtime ? fmtTime(g.mtime) : "";
      const metaText = `${timeStr ? timeStr : ""}${timeStr && g.count ? " · " : ""}${g.count ? g.count + " 张" : ""}${g.children && g.children.length ? " · " + g.children.length + " 项" : ""}`;
      // 前面：名称+meta → 点击=进入该分组目录
      const namePart = document.createElement("span");
      namePart.className = "dir-section-name enter-name";
      namePart.textContent = g.name;
      namePart.style.cursor = "pointer";
      namePart.title = t("enterDir") || "进入";
      namePart.addEventListener("click", () => {
        if (activeDir) {
          currentPath = g.relPath;
          saveNav();
          renderDirTree();
          render();
        }
      });
      const metaPart = document.createElement("span");
      metaPart.className = "dir-section-meta enter-name";
      metaPart.textContent = metaText;
      metaPart.style.cursor = "pointer";
      metaPart.addEventListener("click", () => {
        if (activeDir) {
          currentPath = g.relPath;
          saveNav();
          renderDirTree();
          render();
        }
      });
      // 后面：▲/▼ 折叠/展开符号
      const togglePart = document.createElement("span");
      togglePart.className = "dir-section-toggle";
      togglePart.textContent = collapsed ? "▲" : "▼";
      togglePart.style.cursor = "pointer";
      togglePart.style.fontSize = "1.1em";
      togglePart.style.marginLeft = "auto";
      togglePart.title = t("toggle") || "展开/折叠";
      togglePart.addEventListener("click", (e) => {
        e.stopPropagation();
        if (expandedGroups.has(g.name)) expandedGroups.delete(g.name); else expandedGroups.add(g.name);
        saveCollapsed();
        render();
      });
      header.appendChild(namePart);
      header.appendChild(metaPart);
      header.appendChild(togglePart);
      section.appendChild(header);

      if (!collapsed) {
        // “分组中的分组也是分组，具体区分靠字符大小，外面那层字体大些”
        // 递归渲染 children：嵌套 group → 内层分组(字体小)；card → 文件夹卡片/叶子平铺
        const renderChild = (sd, depth) => {
          // 嵌套分组
          if (sd.isGroup) {
            const subSection = document.createElement("div");
            subSection.className = "dir-section nested-group";
            subSection.style.marginLeft = (depth * 12) + "px";
            const subCollapsed = !expandedGroups.has(sd.name);
            const subHeader = document.createElement("div");
            subHeader.className = "dir-section-header group nested";
            // 内层字体小
            subHeader.style.fontSize = "0.85em";
            const subName = document.createElement("span");
            subName.className = "dir-section-name";
            subName.textContent = sd.name;
            subName.style.cursor = "pointer";
            subName.addEventListener("click", () => {
              if (activeDir) { currentPath = sd.relPath; saveNav(); pushNavHistory(); renderDirTree(); render(); }
            });
            const subMeta = document.createElement("span");
            subMeta.className = "dir-section-meta";
            const st = sd.mtime ? fmtTime(sd.mtime) : "";
            subMeta.textContent = `${st ? st : ""}${st && sd.count ? " · " : ""}${sd.count ? sd.count + " 张" : ""}`;
            subMeta.style.cursor = "pointer";
            subMeta.addEventListener("click", () => {
              if (activeDir) { currentPath = sd.relPath; saveNav(); pushNavHistory(); renderDirTree(); render(); }
            });
            const subToggle = document.createElement("span");
            subToggle.className = "dir-section-toggle";
            subToggle.textContent = subCollapsed ? "▲" : "▼";
            subToggle.style.cursor = "pointer";
            subToggle.style.marginLeft = "auto";
            subToggle.addEventListener("click", (e) => {
              e.stopPropagation();
              if (expandedGroups.has(sd.name)) expandedGroups.delete(sd.name); else expandedGroups.add(sd.name);
              saveCollapsed();
              render();
            });
            subHeader.appendChild(subName);
            subHeader.appendChild(subMeta);
            subHeader.appendChild(subToggle);
            subSection.appendChild(subHeader);
            if (!subCollapsed) {
              const subKids = (sd.children || []).slice();
              if (sortBy === "count") subKids.sort((a, b) => (b.count||0) - (a.count||0) || a.name.localeCompare(b.name));
              else if (sortBy === "time") subKids.sort((a, b) => (b.mtime||0) - (a.mtime||0) || a.name.localeCompare(b.name));
              else subKids.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
              subKids.forEach(k => subSection.appendChild(renderChild(k, depth + 1)));
            }
            return subSection;
          }
          // 叶子目录(hasSub=false 有 leafImages) → 平铺图片
          if (!sd.hasSub && sd.leafImages && sd.leafImages.length) {
            const leafSection = document.createElement("div");
            leafSection.className = "dir-section";
            const leafHeader = document.createElement("div");
            leafHeader.className = "dir-section-header leaf";
            leafHeader.style.fontSize = "0.8em";
            leafHeader.innerHTML = `<span class="dir-section-icon">📂</span><span class="dir-section-name">${escapeHTML(sd.name)}</span>`;
            leafHeader.addEventListener("click", () => {
              if (!activeDir && sd.root) activeDir = sd.root;
              currentPath = sd.relPath; saveNav(); renderDirTree(); render();
            });
            leafSection.appendChild(leafHeader);
            const grid = document.createElement("div");
            grid.className = "dir-grid";
            const isSeq = detectFramesFromNames(sd.leafImages.map(p => p.name));
            if (isSeq && sd.root) {
              const absDir = sd.root + (sd.relPath ? "/" + sd.relPath : "");
              const gifUrl = dirGifUrl(absDir, 0);
              const gifItem = { src: gifUrl, title: t("gifTitle", { name: sd.name, n: sd.leafImages.length }), name: sd.name, isGif: true, frameCount: sd.leafImages.length, cat: sd.leafImages[0]?.cat };
              grid.appendChild(makeCard(gifItem, { dir: sd.name, lbList: [gifItem] }));
            } else {
              sd.leafImages.forEach(p => grid.appendChild(makeCard(p, { dir: sd.name, lbList: sd.leafImages })));
            }
            leafSection.appendChild(grid);
            return leafSection;
          }
          // 有子目录的 → 文件夹卡片
          const fc = document.createElement("div");
          fc.className = "folder-card";
          const ctime = sd.mtime ? fmtTime(sd.mtime) : "";
          fc.innerHTML = `
            <span class="folder-icon">📁</span>
            <span class="folder-name">${escapeHTML(sd.name)}</span>
            <span class="folder-meta">${escapeHTML(ctime)}${ctime && sd.count ? " · " : ""}${sd.count ? sd.count + " 张" : ""}</span>`;
          fc.addEventListener("click", () => {
            if (!activeDir && sd.root) activeDir = sd.root;
            currentPath = sd.relPath; saveNav(); pushNavHistory(); renderDirTree(); render();
          });
          return fc;
        };

        const kids = (g.children || []).slice();
        if (sortBy === "count") kids.sort((a, b) => (b.count||0) - (a.count||0) || a.name.localeCompare(b.name));
        else if (sortBy === "time") kids.sort((a, b) => (b.mtime||0) - (a.mtime||0) || a.name.localeCompare(b.name));
        else kids.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
        // “分组中分组还是独占一行”→ group/leaf 独占一行直接挂 section；folder-card 放 wrap 横排
        let wrap = null;  // 延迟创建 wrap，只有 folder-card 才放进去
        const flushWrap = () => { if (wrap && wrap.children.length) { section.appendChild(wrap); wrap = null; } };
        kids.forEach(sd => {
          const el = renderChild(sd, 1);
          // folder-card → 放 wrap 横排；group/leaf → 先 flush wrap 再独占一行
          if (el.classList.contains("folder-card")) {
            if (!wrap) { wrap = document.createElement("div"); wrap.className = "folder-wrap"; }
            wrap.appendChild(el);
          } else {
            flushWrap();
            section.appendChild(el);
          }
        });
        flushWrap();
      }
      gallery.appendChild(section);
    });

    // 有子文件夹的：竖排卡片，可点击进入
    if (cardDirs.length) {
      const folderWrap = document.createElement("div");
      folderWrap.className = "folder-wrap";
      cardDirs.forEach(sd => {
        const fc = document.createElement("div");
        fc.className = "folder-card";
        const timeStr = sd.mtime ? fmtTime(sd.mtime) : "";
        fc.innerHTML = `
          <span class="folder-icon">📁</span>
          <span class="folder-name">${escapeHTML(sd.name)}</span>
          <span class="folder-meta">${escapeHTML(timeStr)}${timeStr && sd.count ? " · " : ""}${sd.count ? sd.count + " 张" : ""}</span>`;
        fc.addEventListener("click", () => {
          if (!activeDir && sd.root) activeDir = sd.root;
          currentPath = sd.relPath;
          saveNav();
          pushNavHistory();
          renderDirTree(); render();
        });
        folderWrap.appendChild(fc);
      });
      gallery.appendChild(folderWrap);
    }

    // 叶子文件夹：📂+名称 单行标题，下面直接平铺该文件夹图片（序列帧→合成GIF）
    leafDirs.forEach(sd => {
      const section = document.createElement("div");
      section.className = "dir-section";
      const header = document.createElement("div");
      header.className = "dir-section-header leaf";
      header.innerHTML = `<span class="dir-section-icon">📂</span><span class="dir-section-name">${escapeHTML(sd.name)}</span>`;
      header.addEventListener("click", () => {
        if (!activeDir && sd.root) activeDir = sd.root;
        currentPath = sd.relPath;
        saveNav();
        pushNavHistory();
        renderDirTree(); render();
      });
      section.appendChild(header);

      const grid = document.createElement("div");
      grid.className = "dir-grid";
      // 序列帧检测 → 该文件夹用动画GIF替代帧图
      const isSeq = detectFramesFromNames(sd.leafImages.map(p => p.name));
      if (isSeq && sd.root) {
        const absDir = sd.root + (sd.relPath ? "/" + sd.relPath : "");
        const gifUrl = dirGifUrl(absDir, 0);
        const gifItem = { src: gifUrl, title: t("gifTitle", { name: sd.name, n: sd.leafImages.length }), name: sd.name, isGif: true, frameCount: sd.leafImages.length, cat: sd.leafImages[0]?.cat };
        grid.appendChild(makeCard(gifItem, { dir: sd.name, lbList: [gifItem] }));
      } else {
        sd.leafImages.forEach(p => grid.appendChild(makeCard(p, { dir: sd.name, lbList: sd.leafImages })));
      }
      section.appendChild(grid);
      gallery.appendChild(section);
    });

    // 当前文件夹直接图片（平铺；序列帧→合成GIF）
    if (images.length) {
      const grid = document.createElement("div");
      grid.className = "dir-grid";
      const isSeq = detectFramesFromNames(images.map(p => p.name));
      if (isSeq && activeDir) {
        const absDir = activeDir + (currentPath ? "/" + currentPath : "");
        const gifUrl = dirGifUrl(absDir, 0);
        const curName = currentPath.split("/").pop() || t("currentDir");
        const gifItem = { src: gifUrl, title: t("gifTitle", { name: curName, n: images.length }), name: curName, isGif: true, frameCount: images.length };
        grid.appendChild(makeCard(gifItem, { dir: currentPath, lbList: [gifItem] }));
      } else {
        images.forEach(p => grid.appendChild(makeCard(p, { dir: currentPath, lbList: images })));
      }
      gallery.appendChild(grid);
    }

    // 压缩包分组（当前文件夹下 zip/7z/rar，默认展开，可手动收起）
    const curAbs = activeDir ? (activeDir + (currentPath ? "/" + currentPath : "")) : "";
    if (curAbs) {
      scanZipsInDir(curAbs).then(zips => {
        const zipList = zips.filter(z => z.images && z.images.length);
        if (!zipList.length) {
          // 无图无子文件夹（含分组）且无压缩包 → 真·空目录
          if (!cardDirs.length && !leafDirs.length && !groups.length && !images.length) {
            const pe = empty.querySelector("p"); if (pe) pe.textContent = t("emptyDir");
            empty.style.display = "flex"; gallery.style.display = "none";
          }
          return;
        }
        const zipWrap = document.createElement("div");
        zipWrap.className = "zip-wrap";
        zipList.forEach(z => {
          const collapsed = collapsedZips.has(z.path);
          const group = document.createElement("div");
          group.className = "zip-group" + (collapsed ? " collapsed" : "");
          const durMs = parseFrameMs(z.name);   // 包名带间隔（Pixiv 图包 @40ms / 2s）
          const isSeq = detectFramesFromNames(z.images.map(i => i.name));
          // 合成条件（4 条规则）：是序列 且（包名带间隔 或 含 ini 且 ini 有 $speed）。
          // 含 ini 的包图片由 /api/zip/img 自动翻转 180°，前端不需要处理翻转。
          const useGif = isSeq && (durMs > 0 || (z.hasIni && z.speed > 0));
          const head = document.createElement("div");
          head.className = "zip-group-head";
          head.innerHTML = `
            <span class="zip-toggle">${collapsed ? "▸" : "▾"}</span>
            <span class="zip-icon">🗜</span>
            <span class="zip-name">${escapeHTML(z.name)}</span>
            <span class="zip-count">${z.images.length} ${escapeHTML(t("imagesCount"))}</span>`;
          head.addEventListener("click", () => {
            if (collapsedZips.has(z.path)) collapsedZips.delete(z.path); else collapsedZips.add(z.path);
            saveCollapsed();
            render();
          });
          const body = document.createElement("div");
          body.className = "zip-group-body";
          if (!collapsed) {
            const grid = document.createElement("div");
            grid.className = "dir-grid";
            if (useGif) {
              const gifUrl = zipGifUrl(z.path, durMs);
              const gifItem = { src: gifUrl, title: t("gifTitle", { name: z.name, n: z.images.length }), name: z.name, isGif: true, frameCount: z.images.length };
              grid.appendChild(makeCard(gifItem, { dir: z.name, lbList: [gifItem] }));
            } else {
              const items = z.images.map(im => ({ src: zipImgUrl(z.path, im.name), title: im.name, name: im.name, size: im.size ? fmtSize(im.size) : "" }));
              items.forEach(p => grid.appendChild(makeCard(p, { dir: z.name, lbList: items })));
            }
            body.appendChild(grid);
          }
          group.appendChild(head);
          group.appendChild(body);
          zipWrap.appendChild(group);
        });
        gallery.appendChild(zipWrap);
      });
    }

    renderBreadcrumb(images, totalImgs);
  }

