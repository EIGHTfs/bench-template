  /* ─── Add Category (inline edit box — “分类的添加改成编辑框输入”) ─── */
  document.getElementById("addCategoryBtn").addEventListener("click", () => {
    // 在分类列表下方插入一个内联编辑框
    const li = document.createElement("li");
    li.className = "category-add-inline";
    li.innerHTML = `<input type="text" class="cat-name-input" placeholder="${escapeHTML(t("newCategoryName"))}" autofocus/><button class="cat-confirm">✓</button>`;
    categoryList.appendChild(li);
    const input = li.querySelector(".cat-name-input");
    const btn = li.querySelector(".cat-confirm");
    input.focus();
    function confirmAdd() {
      const name = input.value.trim();
      if (!name) { li.remove(); return; }
      const colors = ["#c084fc","#4ade80","#f472b6","#60a5fa","#fbbf24","#fb923c","#38bdf8","#34d399"];
      // 分类 id（name）与显示名（label）保持一致（2026-10-15 改）：
      //   原先 name = slugify(label)，会把「崩坏3」变成 id「bh3」——索引目录按 id 命名
      //   （cache-index/<id>），于是前端显示「崩坏3」而索引文件夹叫「bh3」，看着对不上。
      //   目录名由 index-store 的 slugKey() 负责文件系统安全，不需要在这里 slug 化。
      categories.push({ name: name, label: name, color: colors[categories.length % colors.length] });
      renderCategories(); renderNavBtns(); renderDirTree(); renderDirectories(); render();
      saveSettings();
    }
    btn.addEventListener("click", confirmAdd);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); confirmAdd(); }
      if (e.key === "Escape") li.remove();
    });
  });

