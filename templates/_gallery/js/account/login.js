  /* ─── 登录：游客可浏览，登录后才能修改设置 ─── */
  let authed = false;       // 当前会话已登录
  let passwordSet = false;  // 服务端是否设置了访问密码

  async function refreshAuth() {
    try {
      const s = await window.API.apiAuthStatus();
      authed = !!s.authed;
      passwordSet = !!s.passwordSet;
    } catch (e) {
      authed = false; passwordSet = false;
    }
    updateAuthUI();
  }

  // 设置面板内「设置/修改密码」相关元素（提前取引用，updateAuthUI 会用到）
  const pwOldEl = document.getElementById("pwOld");
  const pwNewEl = document.getElementById("pwNew");
  const pwConfirmEl = document.getElementById("pwConfirm");
  const pwSubmitBtn = document.getElementById("pwSubmit");
  const pwErrorEl = document.getElementById("pwError");
  const pwOkEl = document.getElementById("pwOk");

  // 已设密码 → 显示旧密码框、按钮文案改「修改密码」；未设 → 首次设置
  function syncPasswordUI() {
    if (pwOldEl) pwOldEl.style.display = passwordSet ? "block" : "none";
    if (pwSubmitBtn) pwSubmitBtn.textContent = t(passwordSet ? "pwChange" : "pwSet");
  }

  function updateAuthUI() {
    if (!loginBtn || !settingsBtn) return;
    // “登录之前设置按钮不显示，点击锁了输入正确密码，显示设置按钮。然后不再显示🔒的图片”
    if (!passwordSet) {
      // 未设密码：无需登录，设置直接可用，不显锁
      loginBtn.style.display = "none";
      settingsBtn.style.display = "inline-block";
    } else if (authed) {
      // 已登录：只显⚙设置，不显🔒/🔓（logout 移到设置面板内）
      loginBtn.style.display = "none";
      settingsBtn.style.display = "inline-block";
    } else {
      // 游客：只显🔒登录，不显⚙设置
      loginBtn.style.display = "inline-block";
      loginBtn.textContent = "🔒";
      loginBtn.title = t("login");
      settingsBtn.style.display = "none";
    }
    // 设置面板内的 logout 按钮
    const settingsLogout = document.getElementById("settingsLogout");
    if (settingsLogout) settingsLogout.style.display = (passwordSet && authed) ? "block" : "none";
    syncPasswordUI();
  }

  function openLoginModal() {
    if (!loginModal) return;
    loginModal.classList.add("open");
    loginError.style.display = "none";
    loginPassword.value = "";
    setTimeout(() => loginPassword.focus(), 50);
  }
  function closeLoginModal() {
    if (loginModal) loginModal.classList.remove("open");
  }
  async function doLogin() {
    const pw = loginPassword.value || "";
    const r = await window.API.apiLogin(pw);
    if (r && r.ok) {
      authed = true;
      authedUser = true;            // 登录后立即可收藏（原来只设 authed，收藏按钮仍报未登录）
      closeLoginModal();
      updateAuthUI();
      showNotification(t("loginSuccess") || "登录成功", "success");
      // 登录后自动打开设置
      settingsPanel.classList.add("open");
      renderSettings();
      loadFavorites();              // 刷新收藏状态（authedUser / 收藏列表）
    } else {
      loginError.style.display = "block";
    }
  }
  async function doLogout() {
    await window.API.apiLogout();
    authed = false;
    authedUser = false;
    favoriteImages = [];
    favoriteSrcs = new Set();
    updateAuthUI();
    settingsPanel.classList.remove("open");
    showNotification(t("logoutSuccess") || "已退出登录", "success");
  }

