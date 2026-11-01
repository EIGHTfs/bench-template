  /* ─── Breadcrumb (hierarchical navigation) ─── */
  function renderBreadcrumb(items, totalImgs) {
    const count = totalImgs != null ? totalImgs : (items && items.length) || 0;
    // “顶部导航栏前后加< >实现文件路径后退前进”
    const canBack = navHistoryIdx > 0;
    const canForward = navHistoryIdx < navHistory.length - 1;
    let html = `<button class="nav-arrow ${canBack ? "" : "disabled"}" id="navBack" title="${escapeHTML(t("back") || "后退")}" ${canBack ? "" : "disabled"}>‹</button>`;
    html += `<span class="crumb ${!activeDir ? "active" : ""}" data-nav-root data-root="all">${escapeHTML(t("home"))}</span>`;
    // 当前激活根目录
    if (activeDir) {
      const rootName = activeDir.split("/").pop() || activeDir;
      const rootActive = !currentPath;
      html += `<span class="crumb-sep">›</span><span class="crumb ${rootActive ? "active" : ""}" data-nav-root data-root="${escapeHTML(activeDir)}" data-path="">${escapeHTML(rootName)}</span>`;
      // 当前路径层级
      if (currentPath) {
        const parts = currentPath.split("/");
        let acc = "";
        parts.forEach((part, i) => {
          acc = acc ? acc + "/" + part : part;
          const isLast = i === parts.length - 1;
          html += `<span class="crumb-sep">›</span><span class="crumb ${isLast ? "active" : ""}" data-nav-root data-root="${escapeHTML(activeDir)}" data-path="${escapeHTML(acc)}">${escapeHTML(part)}</span>`;
        });
      }
    }
    html += `<span class="crumb-sep" style="margin-left:auto;font-size:12px;color:var(--muted)">${count} ${escapeHTML(t("imagesCount"))}</span>`;
    html += `<button class="nav-arrow ${canForward ? "" : "disabled"}" id="navForward" title="${escapeHTML(t("forward") || "前进")}" ${canForward ? "" : "disabled"}>›</button>`;
    breadcrumb.innerHTML = html;
    breadcrumb.querySelectorAll("[data-nav-root]").forEach(el =>
      el.addEventListener("click", () => {
        const root = el.dataset.root;
        const path = el.dataset.path || "";
        if (root === "all") { activeDir = null; currentPath = ""; }
        else { activeDir = root; currentPath = path; }
        saveNav();
        pushNavHistory();
        renderNavBtns(); renderDirTree(); render();
      })
    );
    // 后退/前进按钮
    document.getElementById("navBack")?.addEventListener("click", navBack);
    document.getElementById("navForward")?.addEventListener("click", navForward);
  }

