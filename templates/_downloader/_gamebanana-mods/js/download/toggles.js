function currentDownloadToggles() {
  const filesEl = $("#dlToggleFiles");
  const imagesEl = $("#dlToggleImages");
  return {
    files: filesEl ? filesEl.checked : true,
    images: imagesEl ? imagesEl.checked : true
  };
}

async function persistDownloadToggles() {
  const downloadToggles = currentDownloadToggles();
  try {
    const r = await api("/api/settings", "POST", { downloadToggles });
    if (r && r.ok && r.settings) settings = r.settings;
  } catch (_) {}
  return downloadToggles;
}

function bindDownloadToggles() {
  ["dlToggleFiles", "dlToggleImages"].forEach((id) => {
    const el = $("#" + id);
    if (!el) return;
    el.addEventListener("change", () => { persistDownloadToggles(); });
  });
}

