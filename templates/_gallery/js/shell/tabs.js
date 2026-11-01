  /* ─── 标签页标题 + 图标（设置页 > 品牌链：设置页非空优先，品牌只兜底） ─── */
  // 图片来源判定：<link rel="icon"> 只吃图片/URL；Emoji 塞进 href 会坏图，Emoji 只留给顶部栏
  function isImageRef(value) {
    const v = String(value || "").trim();
    if (!v) return false;
    if (/^(?:https?:|data:|\/|\.\/|\.\.\/)/i.test(v)) return true;
    return /\.(?:png|jpe?g|gif|webp|svg|ico|avif|bmp)(?:[?#]|$)/i.test(v);
  }
  // 生效标题：设置页的值非空 → 用它；否则品牌链（env/.env → 清单 brand 段 → 内置默认）；
  // 两边都空则返回空串，调用方保持页面原有标题，不写死任何默认标题
  function effectiveTitle() {
    return String(galleryTitle || "").trim() || String(brand.title || "").trim();
  }
  // 顶部栏文字：设置页优先，其次品牌 displayTitle → 品牌 title
  function applyBrandText() {
    const text = String(galleryTitle || "").trim()
      || String(brand.displayTitle || "").trim()
      || String(brand.title || "").trim();
    if (!text) return;
    const el = document.querySelector(".logo-text");
    if (el) el.textContent = text;
  }
  // “标签页图标也替换顶部栏的◆这个图标”——favicon 同时更新浏览器标签和顶部栏 logo
  function applyTabMeta() {
    const title = effectiveTitle();
    if (title) document.title = title;
    // 设置页的值非空且是图片/URL → 用它；否则用品牌图标（BRAND_ICON，约定为图片文件名）
    const brandIcon = String(brand.icon || "").trim();
    let href = isImageRef(brandIcon) ? brandIcon : "./favicon.svg";
    let logoContent = "◆"; // 默认
    const fav = String(favicon || "").trim();
    if (fav) {
      if (isImageRef(fav)) {
        href = fav;
        logoContent = ""; // 图片 URL，用 <img> 显示
      } else {
        logoContent = fav; // Emoji/单字符：只做顶部栏图标，不写进 <link rel="icon">
      }
    }
    // 浏览器标签页图标：只拿图片/URL 写 href，Emoji 一律不写（否则标签页坏图）
    if (isImageRef(href)) {
      let icon = document.querySelector('link[rel="icon"]');
      if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; document.head.appendChild(icon); }
      icon.href = href;
    }
    // 顶部栏 logo 图标（“替换顶部栏的◆”）
    const logoIcon = document.getElementById("logoIcon");
    if (logoIcon) {
      if (logoContent && !logoContent.startsWith("http")) {
        logoIcon.textContent = logoContent;
        logoIcon.innerHTML = ""; // 清除可能有的 img
        logoIcon.textContent = logoContent;
      } else if (logoContent === "" && fav) {
        logoIcon.textContent = "";
        logoIcon.innerHTML = `<img src="${escapeHTML(fav)}" alt="" style="width:1.2em;height:1.2em;vertical-align:middle"/>`;
      }
    }
  }

