  /* ─── Slug helper ─── */
  function slugify(text) {
    return text.toLowerCase().trim()
      .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cat-" + Date.now().toString(36);
  }

