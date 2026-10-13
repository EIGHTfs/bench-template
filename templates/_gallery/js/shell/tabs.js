  /* ─── 标签页标题 + 图标（由设置页/config 决定） ─── */
  // “标签页图标也替换顶部栏的◆这个图标”——favicon 同时更新浏览器标签和顶部栏 logo
  function applyTabMeta() {
    document.title = galleryTitle || "拾光集";
    let fav = (favicon || "").trim();
    let href = "./favicon.svg";
    let logoContent = "◆"; // 默认
    if (fav) {
      if (/^https?:\/\//i.test(fav) || fav.startsWith("data:") || fav.startsWith("/") || fav.startsWith("./") || fav.startsWith("..")) {
        href = fav;
        logoContent = ""; // 图片 URL，用 <img> 显示
      } else {
        // emoji/单字符 → 内嵌 SVG 生成 data URI
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#7c5cfc"/><text x="32" y="42" font-size="38" text-anchor="middle" dominant-baseline="middle">${escapeHTML(fav)}</text></svg>`;
        href = "data:image/svg+xml," + encodeURIComponent(svg);
        logoContent = fav; // emoji 直接显示在顶部栏
      }
    }
    // 浏览器标签页图标
    let icon = document.querySelector('link[rel="icon"]');
    if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; document.head.appendChild(icon); }
    icon.href = href;
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

