  /* ─── Directory tree (sidebar, hierarchical) ─── */
  // 构建当前根目录的完整目录树（只含实际存在图片的层级）
  function buildDirTreeFor(rootPath) {
    const root = { name: rootPath.split("/").pop() || rootPath, relPath: "", children: new Map() };
    apiImages.forEach(p => {
      if (p.rootPath !== rootPath) return;
      const parts = (p.relPath || "").split("/").filter(Boolean);
      parts.pop(); // 去掉文件名
      let node = root;
      let acc = "";
      parts.forEach(part => {
        acc = acc ? acc + "/" + part : part;
        if (!node.children.has(part)) node.children.set(part, { name: part, relPath: acc, children: new Map() });
        node = node.children.get(part);
      });
    });
    return root;
  }

  function renderDirTree() {
    if (!categories.length) { dirTree.innerHTML = ""; return; }
    let html = `<li class="dir-item ${activeDir === null ? "active" : ""}"
        data-root="all"><span class="dir-icon">◈</span><span>${escapeHTML(t("all"))}</span></li>`;

    // Group configured roots by category
    const catOrder = {};
    categories.forEach((c, i) => catOrder[c.name] = i);
    const grouped = {};
    directories.forEach(d => {
      const cat = catOrder[d.category] !== undefined ? d.category : (categories[0]?.name || "all");
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(d);
    });

    const activeRoot = activeDir;
    const activePath = currentPath;

    categories.forEach(c => {
      const dirs = grouped[c.name] || [];
      if (!dirs.length) return;
      html += `<li class="dir-group">
        <span class="dir-group-label" style="color:${c.color}">
          <span class="dot" style="background:${c.color}"></span>${escapeHTML(c.label)}
        </span>
        <ul>`;
      dirs.forEach(d => {
        const name = d.path.split("/").pop() || d.path;
        const isActiveRoot = activeRoot === d.path;
        // 高亮当前激活的文件夹节点
        const cls = (activeRoot === d.path && !currentPath) ? "active" : "";
        html += `<li class="dir-item ${cls}" data-root="${escapeHTML(d.path)}" data-path="">
          <span class="dir-icon">${isActiveRoot ? "🗂" : "📁"}</span><span title="${escapeHTML(d.path)}">${escapeHTML(name)}</span>
        </li>`;
        // 若当前就在这个根目录内，展开它的子目录树
        if (isActiveRoot) {
          const tree = buildDirTreeFor(d.path);
          html += renderTreeChildren(tree, activePath, 1, d.path);
        }
      });
      html += `</ul></li>`;
    });
    dirTree.innerHTML = html;
  }

  // “侧边栏只能展开不能折叠”→ 已展开(ancestor)点击=折叠不导航；未展开点击=展开+导航
  // 【原代码】展开条件 = active || isAncestor（无法手动折叠）
  // 【改为】展开条件 = (active || isAncestor) && !collapsedTreeNodes.has(key)（手动折叠后不展开）
  function renderTreeChildren(parentNode, activePath, depth, rootPath) {
    let html = "";
    parentNode.children.forEach(child => {
      const active = activePath === child.relPath;
      const isAncestor = !!activePath && (activePath === child.relPath || activePath.startsWith(child.relPath + "/"));
      const nodeKey = rootPath + "|" + child.relPath;
      const manuallyCollapsed = collapsedTreeNodes.has(nodeKey);
      const expanded = (active || isAncestor) && !manuallyCollapsed;
      const hasKids = child.children.size > 0;
      // 有子节点且展开着 → ▾；有子节点但折叠 → ▸；无子节点 → 📁
      const icon = hasKids ? (expanded ? "▾" : "▸") : "📁";
      html += `<li class="dir-item ${active ? "active" : ""} ${manuallyCollapsed ? "collapsed" : ""}" data-root="${escapeHTML(rootPath)}" data-path="${escapeHTML(child.relPath)}" data-node-key="${escapeHTML(nodeKey)}" style="padding-left:${30 + depth * 16}px">
        <span class="dir-icon">${icon}</span><span title="${escapeHTML(child.relPath)}">${escapeHTML(child.name)}</span>
      </li>`;
      if (expanded && hasKids) html += renderTreeChildren(child, activePath, depth + 1, rootPath);
    });
    return html;
  }

  function escapeHTML(str) {
    return String(str ?? "").replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  // 时间戳 → 短日期 2024-01-05
  function fmtTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // 字节 → 可读大小
  function fmtSize(bytes) {
    if (bytes == null) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  // ─── 路径保存/还原（刷新回到上次文件夹）───
  // “分别记录用户点进去了哪个目录”→ 每个根目录独立记录 currentPath
  // 【原代码】saveNav 只存一个 {activeDir, currentPath} → 切目录会覆盖上个目录的路径
  // 【改为】navByDir: Map<rootPath, currentPath>，每个目录各自记录；activeDir 单独记
  function saveNav() {
    // 同步当前目录路径到 navByDir（“分别记录用户点进去了哪个目录”）
    if (activeDir) navByDir[activeDir] = currentPath;
    try {
      localStorage.setItem("galleryNav", JSON.stringify({
        activeDir,
        navByDir: navByDir
      }));
    } catch (_) {}
  }
  // “顶部导航栏前后加< >实现文件路径后退前进”
  // 路径历史栈：每次导航 push 状态；后退/前进移动指针恢复状态
  function pushNavHistory() {
    if (navHistorySuppress) return;  // 恢复历史时不 push（防循环）
    const state = { activeDir, currentPath, activeFilter };
    // 截断前进栈（当前指针之后的历史丢弃）
    navHistory = navHistory.slice(0, navHistoryIdx + 1);
    // 避免连续重复
    const last = navHistory[navHistory.length - 1];
    if (last && last.activeDir === state.activeDir && last.currentPath === state.currentPath) return;
    navHistory.push(state);
    navHistoryIdx = navHistory.length - 1;
  }
  function navBack() {
    if (navHistoryIdx <= 0) return;
    navHistoryIdx--;
    const s = navHistory[navHistoryIdx];
    navHistorySuppress = true;
    activeDir = s.activeDir; currentPath = s.currentPath; activeFilter = s.activeFilter;
    saveNav(); renderNavBtns(); renderDirTree(); render();
    navHistorySuppress = false;
  }
  function navForward() {
    if (navHistoryIdx >= navHistory.length - 1) return;
    navHistoryIdx++;
    const s = navHistory[navHistoryIdx];
    navHistorySuppress = true;
    activeDir = s.activeDir; currentPath = s.currentPath; activeFilter = s.activeFilter;
    saveNav(); renderNavBtns(); renderDirTree(); render();
    navHistorySuppress = false;
  }

  // 每个根目录各自记录的 currentPath（切换目录时恢复）
  let navByDir = {};   // rootPath -> currentPath

  function restoreNav() {
    try {
      const s = localStorage.getItem("galleryNav");
      if (!s) return;
      const o = JSON.parse(s);
      if (o && o.navByDir) navByDir = o.navByDir;
      if (o && o.activeDir && directories.some(d => d.path === o.activeDir)) {
        activeDir = o.activeDir;
        currentPath = navByDir[activeDir] || "";
      }
    } catch (_) {}
  }

  // 切换根目录时：保存旧目录路径 → 设新 activeDir → 恢复新目录路径
  function switchDir(newDir) {
    // 保存当前目录路径
    if (activeDir) navByDir[activeDir] = currentPath;
    activeDir = newDir;
    currentPath = navByDir[newDir] || "";  // 恢复该目录上次路径（默认根目录）
    activeFilter = "all";
    saveNav();
    pushNavHistory();
    renderNavBtns();
    renderDirTree();
    render();
  }

  // ─── 序列帧检测 / 帧间隔解析：规则已抽到唯一实现文件 ───
  // 规则文件：server/lib/rule/gif-rule.js（前端由 js/manifest.json 内联，后端由 assemble.json 映射后 require）
  // 此处只做转发，保证调用点不变；口径改动请只改规则文件。
  // 【原实现】保留痕迹便于回退：
  // function detectFramesFromNames(names) {
  //   if (!names || names.length < 3) return false;
  //   const byPre = {};
  //   for (const n of names) {
  //     const m = String(n).match(/^(.*?)(\d+)(\.\w+)$/);
  //     if (!m) continue;
  //     (byPre[m[1]] = byPre[m[1]] || []).push(parseInt(m[2], 10));
  //   }
  //   let best = 0;
  //   for (const ns of Object.values(byPre)) {
  //     ns.sort((a, b) => a - b);
  //     let run = 1;
  //     for (let i = 1; i < ns.length; i++) {
  //       if (ns[i] - ns[i - 1] === 1) { run++; if (run > best) best = run; }
  //       else run = 1;
  //     }
  //     if (ns.length && best < 1) best = ns.length ? 1 : 0;
  //   }
  //   return best >= 3;
  // }
  // function parseFrameMs(name) {
  //   if (!name) return 0;
  //   let m = String(name).match(/(\d+(?:\.\d+)?)\s*(?:s|sec|秒)/i);
  //   if (m) { const v = Math.round(parseFloat(m[1]) * 1000); return v > 0 ? v : 0; }
  //   m = String(name).match(/(\d+)\s*ms/i);
  //   if (m) { const v = parseInt(m[1], 10); return v > 0 ? v : 0; }
  //   return 0;
  // }
  function detectFramesFromNames(names) { return globalThis.GifRule.detectFramesFromNames(names); }
  function parseFrameMs(name) { return globalThis.GifRule.parseFrameMs(name); }

  // ─── 压缩包：当前目录下 zip/7z/rar 扫描 + 内图平铺 ───
  const ZIP_EXT_RE = /\.(zip|7z|rar)$/i;
  function scanZipsInDir(absDir) {
    return window.API.apiGet(`/zip/scan?dir=${encodeURIComponent(absDir)}`)
      .then(j => (j && j.zips) || [])
      .catch(() => []);
  }

  function zipImgUrl(zipPath, fileName) {
    return `${window.API.apiUrl(`/api/zip/img?path=${encodeURIComponent(zipPath)}&file=${encodeURIComponent(fileName)}`)}`;
  }
  function zipGifUrl(zipPath, durMs) {
    return `${window.API.apiUrl(`/api/zip/gif?path=${encodeURIComponent(zipPath)}&dur_ms=${durMs || 0}`)}`;
  }
  function dirGifUrl(absDir, durMs) {
    return `${window.API.apiUrl(`/api/gif?dir=${encodeURIComponent(absDir)}&dur_ms=${durMs || 0}`)}`;
  }

