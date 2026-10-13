  /* ─── Settings ─── */
  // “展开折叠都是点设置按钮，单独搞个关闭按钮”→ ⚙ 切换 open，✕ 只关不切换
  settingsBtn.addEventListener("click", () => {
    if (passwordSet && !authed) { openLoginModal(); return; }  // 登录后才能修改设置
    const isOpen = settingsPanel.classList.toggle("open");
    if (isOpen) renderSettings();
  });
  // “展开折叠都是点设置按钮，单独搞个关闭按钮”→ 已删 ✕ 关闭按钮，⚙ 即可展开/折叠
  loginBtn.addEventListener("click", () => { if (!authed) openLoginModal(); });
  // 设置面板内 logout 按钮
  const settingsLogoutBtn = document.getElementById("settingsLogout");
  if (settingsLogoutBtn) settingsLogoutBtn.addEventListener("click", () => doLogout());

  // 设置面板内「设置/修改密码」：首次进入无需旧密码，已设密码则须验旧密码
  async function submitPassword() {
    if (!pwNewEl || !pwSubmitBtn) return;
    const next = pwNewEl.value || "";
    if (pwErrorEl) pwErrorEl.style.display = "none";
    if (pwOkEl) pwOkEl.style.display = "none";

    const fail = (msg) => { if (pwErrorEl) { pwErrorEl.textContent = msg; pwErrorEl.style.display = "block"; } };
    if (next.length < 4) return fail(t("pwTooShort"));
    if (next !== (pwConfirmEl ? pwConfirmEl.value : "")) return fail(t("pwMismatch"));
    if (passwordSet && !(pwOldEl && pwOldEl.value)) return fail(t("pwNeedOld"));

    pwSubmitBtn.disabled = true;
    try {
      await window.API.apiPost("/change-password", {
        password: next,
        oldPassword: pwOldEl ? pwOldEl.value : "",
      });
      // 首次设置后服务端即要求登录，本机已是设置态 → 标记为已登录
      passwordSet = true;
      authed = true;
      updateAuthUI();
      syncPasswordUI();
      if (pwOldEl) pwOldEl.value = "";
      pwNewEl.value = "";
      if (pwConfirmEl) pwConfirmEl.value = "";
      if (pwOkEl) pwOkEl.style.display = "block";
    } catch (e) {
      fail(e && e.message ? e.message : t("pwFailed"));
    } finally {
      pwSubmitBtn.disabled = false;
    }
  }

  if (pwSubmitBtn) pwSubmitBtn.addEventListener("click", submitPassword);
  // 确认框回车直接提交
  if (pwConfirmEl) pwConfirmEl.addEventListener("keydown", e => { if (e.key === "Enter") submitPassword(); });

  loginClose.addEventListener("click", closeLoginModal);
  loginSubmit.addEventListener("click", doLogin);
  loginModal.addEventListener("click", e => { if (e.target === loginModal) closeLoginModal(); });
  loginPassword.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });

  galleryTitleInput.addEventListener("input", e => {
    galleryTitle = e.target.value || "Gallery";
    document.querySelector(".logo-text").textContent = galleryTitle;
    applyTabMeta();
    saveSettings();
  });
  faviconInput.addEventListener("input", e => {
    favicon = e.target.value || "";
    applyTabMeta();
    saveSettings();
  });

  function renderSettings() {
    galleryTitleInput.value = galleryTitle;
    faviconInput.value = favicon;
    renderCategories();
    renderDirectories();
    renderUserImages();
    renderUpdateTime();
    // 自动更新卡片：blueprint 通用件（auto-update-card.js 自包含，mount 幂等）
    if (window.AutoUpdateCard && document.getElementById("autoUpdateToggle")) {
      window.AutoUpdateCard.mount();
    }
  }

  // 更新时间：只读展示自动更新后端上报的 lastUpdatedAt，不含任何操作入口
  async function renderUpdateTime() {
    const el = document.getElementById("updateTimeText");
    if (!el) return;
    try {
      const res = await window.API.apiGet("/auto-update/status");
      const ts = (res && res.status && res.status.lastUpdatedAt) || 0;
      if (!ts) { el.textContent = t("updateTimeNever"); return; }
      const d = new Date(ts);
      const pad = n => String(n).padStart(2, "0");
      el.textContent = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
        + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) {
      // 后端未启用自动更新时接口可能不可达，保持提示文案即可
      el.textContent = t("updateTimeNever");
    }
  }

  function renderCategories() {
    categoryList.innerHTML = categories.map((c, i) => `
      <li class="category-item">
        <label class="category-color" title="${escapeHTML(t("editColor"))}">
          <input type="color" value="${c.color}" data-idx="${i}" class="cat-color-input"/>
        </label>
        <input type="text" value="${escapeHTML(c.label)}" data-idx="${i}" class="cat-name-input" placeholder="${escapeHTML(t("categoryName"))}"/>
        <button class="category-del" data-idx="${i}" title="${escapeHTML(t("delete"))}">✕</button>
      </li>
    `).join("");

    categoryList.querySelectorAll(".cat-name-input").forEach(inp => {
      inp.addEventListener("input", e => {
        const idx = +e.target.dataset.idx;
        categories[idx].label = e.target.value;
        renderNavBtns(); renderDirTree(); renderDirectories(); render();
      });
    });
    categoryList.querySelectorAll(".cat-color-input").forEach(inp => {
      inp.addEventListener("input", e => {
        const idx = +e.target.dataset.idx;
        categories[idx].color = e.target.value;
        renderNavBtns(); renderDirTree(); renderDirectories(); render();
      });
    });
    categoryList.querySelectorAll(".category-del").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = +btn.dataset.idx;
        const removed = categories[idx].name;
        categories.splice(idx, 1);
        // 引用被删分类的目录 → 回退 "all"
        directories.forEach(d => { if (d.category === removed) d.category = "all"; });
        if (activeFilter === removed) activeFilter = "all";
        renderCategories(); renderNavBtns(); renderDirTree(); renderDirectories(); render();
        saveSettings();
      });
    });
  }

  function renderDirectories() {
    dirList.innerHTML = directories.map((d, i) => `
      <li class="dir-item-settings">
        <span class="dir-icon">📁</span>
        <input type="text" value="${escapeHTML(d.path)}" data-idx="${i}" class="dir-path-input" placeholder="${escapeHTML(t("dirPath"))}"/>
        <select data-idx="${i}" class="dir-cat-select" title="${escapeHTML(t("belongsTo"))}">
          <option value="all" ${d.category === "all" || !d.category ? "selected" : ""}>${escapeHTML(t("all"))}</option>
          ${categories.map(c =>
            `<option value="${c.name}" ${d.category === c.name ? "selected" : ""}>${escapeHTML(c.label)}</option>`
          ).join("")}
        </select>
        <button class="dir-del" data-idx="${i}" title="${escapeHTML(t("delete"))}">✕</button>
      </li>
    `).join("");

    dirList.querySelectorAll(".dir-path-input").forEach(inp => {
      inp.addEventListener("input", e => {
        directories[+e.target.dataset.idx].path = e.target.value;
        renderDirTree(); render();
        saveSettings();
      });
    });
    dirList.querySelectorAll(".dir-cat-select").forEach(sel => {
      sel.addEventListener("change", e => {
        directories[+e.target.dataset.idx].category = e.target.value;
        renderDirTree();
        saveSettings(true); // reload images (category assignment changed)
      });
    });
    dirList.querySelectorAll(".dir-del").forEach(btn => {
      btn.addEventListener("click", () => {
        directories.splice(+btn.dataset.idx, 1);
        if (activeDir && !directories.find(d => d.path === activeDir)) activeDir = null;
        renderDirectories(); renderDirTree(); render();
        saveSettings(true);
      });
    });
  }

  function renderUserImages() {
    imageList.innerHTML = userImages.map((img, i) => `
      <li class="image-item">
        <img src="${escapeHTML(img.src)}" alt=""/>
        <span>${escapeHTML(img.title)}</span>
        <button class="img-del" data-idx="${i}" title="${escapeHTML(t("delete"))}">✕</button>
      </li>
    `).join("");
    imageList.querySelectorAll(".img-del").forEach(btn => {
      btn.addEventListener("click", () => {
        userImages.splice(+btn.dataset.idx, 1);
        renderUserImages(); render();
      });
    });
  }

