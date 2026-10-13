function closeLightbox() {
  if (!lightboxEl) return;
  lightboxEl.remove();
  lightboxEl = null;
  document.removeEventListener("keydown", onLightboxKey);
  document.removeEventListener("wheel", onLightboxWheel);
}
function onLightboxKey(e) { if (e.key === "Escape") closeLightbox(); }
function onLightboxWheel() { closeLightbox(); }
function openLightbox(src, cap) {
  closeLightbox();
  const mask = document.createElement("div");
  mask.className = "lightbox-mask";
  const img = document.createElement("img");
  img.className = "lightbox-img";
  img.src = src;
  img.alt = cap || "";
  mask.appendChild(img);
  if (cap) {
    const c = document.createElement("div");
    c.className = "lightbox-cap";
    c.textContent = cap;
    mask.appendChild(c);
  }
  // 点遮罩关闭；点图片本身不关（便于细看）
  mask.addEventListener("click", (e) => { if (e.target === mask) closeLightbox(); });
  document.body.appendChild(mask);
  lightboxEl = mask;
  document.addEventListener("keydown", onLightboxKey);
  document.addEventListener("wheel", onLightboxWheel);
}

// 失败行 🔄重试 / 🚫跳过 / 错误文本复制（事件委托）
