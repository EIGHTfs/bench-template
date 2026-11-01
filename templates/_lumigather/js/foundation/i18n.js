  /* ─── 国际化：语言 JSON 驱动 ─── */
  const LANGS = ['zh-CN', 'en'];
  let lang = localStorage.getItem('galleryLang') || 'zh-CN';
  if (!LANGS.includes(lang)) lang = 'zh-CN';
  let i18n = {};   // 当前语言字典

  async function loadLang(l) {
    lang = l;
    localStorage.setItem('galleryLang', lang);
    try {
      const res = await fetch(`./locales/${lang}.json?t=${Date.now()}`);
      i18n = await res.json();
    } catch (e) {
      console.warn('lang load failed:', e);
      i18n = {};
    }
    document.documentElement.lang = lang;
    applyI18nStatic();
    const lb = document.getElementById("langBtn");
    if (lb) { lb.textContent = lang === "en" ? "EN" : "中"; lb.title = t("langSwitch"); }
    renderNavBtns();
    renderDirTree();
    render();
    renderSettings();
  }

  // 读取当前语言文本，支持 {n} 占位符
  function t(key, vars) {
    let s = i18n[key] != null ? i18n[key] : key;
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }

  // 一次性填充 index.html 的 data-i18n 静态文本
  function applyI18nStatic() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (i18n[key] != null) el.textContent = i18n[key];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const key = el.dataset.i18nPh;
      if (i18n[key] != null) el.placeholder = i18n[key];
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      if (i18n[key] != null) el.title = i18n[key];
    });
  }

