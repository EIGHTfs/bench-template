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
  let galleryTitle  = "";   // 标题只由配置下发（/api/gallery → data.title）；不写死任何默认标题
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

