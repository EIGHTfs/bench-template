(() => {
  /* ─── State ─── */
  let activeFilter  = "all";    // selected category name, or "all"
  let activeDir     = null;     // 当前配置根目录 path
  let currentPath   = "";       // 当前相对路径（相对根目录，""=根）
  let searchQuery   = "";
  let sortBy        = "name";   // "name" | "count" | "time"
  let lightboxIdx   = -1;
  // “顶部导航栏前后加< >实现文件路径后退前进”
  let navHistory = [];           // 路径历史栈 [{activeDir, currentPath, activeFilter}, ...]
  let navHistoryIdx = -1;        // 当前指针（-1=空栈）
  let navHistorySuppress = false; // 恢复历史时不 push（防循环）
  // “增加收藏功能🩷，预设个不可删改的收藏分类，点了收藏的图片都会在里面平铺；登录用户可点收藏，游客可以看”
  let favoriteImages = [];       // 收藏图片列表 [{src, name, title, cat, ...}]
  let favoriteSrcs = new Set();  // 收藏 src 集合（快速查找）
  let authedUser = false;        // 是否登录（登录后才能点收藏）
  let galleryTitle  = "崩坏3";
  let favicon       = "";   // 由设置页决定：emoji 或图片 URL
  let loading       = false;

  let categories = [];          // [{ name, label, color }]
  let directories = [];         // [{ path, category }]
  let apiImages  = [];          // from server filesystem
  let userImages = [];          // locally uploaded
  let uploadedImages = [];      // 服务端 uploads/ 目录图片（游客上传，重启后仍可见）
  let lbList = [];              // 当前 lightbox 可浏览数组
  let collapsedZips = new Set(); // 手动收起的压缩包（key=zip路径）
  // 折叠状态持久化：localStorage
  const ZIPS_KEY = 'galleryCollapsedZips';
  const GROUPS_KEY = 'galleryExpandedGroups';
  const TREENODES_KEY = 'galleryCollapsedTreeNodes';
  let expandedGroups = new Set(); // 手动展开的分组（默认折叠，key=分组名）
  let collapsedTreeNodes = new Set(); // “侧边栏只能展开不能折叠”→ 手动折叠的侧边栏节点（key=rootPath|relPath）

  /* ─── 秒出图优化（2026-10-14）────────────────────────────
     背景（实测）：总览页一次渲染 1000+ 张卡片（.dir-section 553 个、内容高 36 万像素）；
     图片虽有 loading="lazy"，但首屏仍要等 lazy 判定 + 串行解码（单张 1920×1080 解码均 57ms）；
     且刷新后**不记滚动位置**、URL 里也没有位置信息 ⇒ 回到顶部、丢浏览位置。
     这里做三件不依赖缩略图的事：① 首屏图片提优先级并预热解码 ② 位置写进 URL
     ③ 滚动位置落 localStorage 并在启动时恢复。
     注意：这不降低单张原图的解码成本（那由图片像素决定），只是把能并行的并行、能跳过的跳过。 */
  const SCROLL_KEY = "galleryScroll";

  /** 首屏（含一屏余量）图片：解除 lazy、提高优先级、主动 decode() 预热，避免串行解码拖慢出图 */
  function warmFirstScreen(limit) {
    try {
      const imgs = document.querySelectorAll("#gallery .card img");
      const vh = window.innerHeight || 800;
      let k = 0;
      for (const img of imgs) {
        const r = img.getBoundingClientRect();
        if (r.top < vh * 1.5 && r.bottom > -200) {
          img.loading = "eager";
          try { img.fetchPriority = "high"; } catch (_) {}
          if (img.decode) img.decode().catch(() => {});
          if (++k >= (limit || 12)) break;
        }
      }
    } catch (_) { /* 预热失败不影响显示 */ }
  }

  /** 把当前位置写进 URL（可分享、刷新可回到原处）；replaceState 不污染后退历史 */
  function syncUrlState() {
    try {
      const p = new URLSearchParams(location.search);
      if (activeDir) p.set("dir", activeDir); else p.delete("dir");
      if (currentPath) p.set("path", currentPath); else p.delete("path");
      if (activeFilter && activeFilter !== "all") p.set("cat", activeFilter); else p.delete("cat");
      const qs = p.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + (location.hash || ""));
    } catch (_) { /* 不支持 history 时忽略 */ }
  }

  /** 启动时按 URL 恢复位置（优先于 localStorage 的上次位置） */
  function restoreFromUrl() {
    try {
      const p = new URLSearchParams(location.search);
      if (!p.has("dir") && !p.has("path") && !p.has("cat")) return false;
      const dir = p.get("dir");
      if (dir && directories.some((d) => d.path === dir)) {
        activeDir = dir;
        currentPath = p.get("path") || "";
      } else if (!dir) {
        activeDir = null;
        currentPath = p.get("path") || "";
      }
      const cat = p.get("cat");
      if (cat) activeFilter = cat;
      return true;
    } catch (_) { return false; }
  }

  /** 记住滚动位置（节流写入，避免滚动时频繁写 localStorage） */
  function bindScrollMemory() {
    const g = document.getElementById("gallery");
    if (!g || g.__scrollBound) return;
    g.__scrollBound = true;
    let t = null;
    g.addEventListener("scroll", () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        try { localStorage.setItem(SCROLL_KEY, String(g.scrollTop)); } catch (_) {}
      }, 200);
    }, { passive: true });
  }

  /** 恢复上次滚动位置（图片是 lazy 的，跳过去后再由浏览器按可视区加载） */
  function restoreScrollPos() {
    try {
      const y = Number(localStorage.getItem(SCROLL_KEY) || 0);
      const g = document.getElementById("gallery");
      if (g && y > 0) g.scrollTop = y;
    } catch (_) {}
  }

  function loadCollapsed() {
    try {
      const z = JSON.parse(localStorage.getItem(ZIPS_KEY) || '[]');
      if (Array.isArray(z)) collapsedZips = new Set(z);
      const g = JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]');
      if (Array.isArray(g)) expandedGroups = new Set(g);
      const tn = JSON.parse(localStorage.getItem(TREENODES_KEY) || '[]');
      if (Array.isArray(tn)) collapsedTreeNodes = new Set(tn);
    } catch (_) {}
  }
  function saveCollapsed() {
    try {
      localStorage.setItem(ZIPS_KEY, JSON.stringify([...collapsedZips]));
      localStorage.setItem(GROUPS_KEY, JSON.stringify([...expandedGroups]));
      localStorage.setItem(TREENODES_KEY, JSON.stringify([...collapsedTreeNodes]));
    } catch (_) {}
  }

