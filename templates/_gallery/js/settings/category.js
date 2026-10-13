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
      categories.push({ name: slugify(name), label: name, color: colors[categories.length % colors.length] });
      renderCategories(); renderNavBtns(); renderDirTree(); renderDirectories(); render();
      saveSettings();
    }
    btn.addEventListener("click", confirmAdd);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); confirmAdd(); }
      if (e.key === "Escape") li.remove();
    });
  });

