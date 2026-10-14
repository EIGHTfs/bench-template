function bindLogout() {
  $("#logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", "POST", {});
    // 2026-10-14：登出时一并清掉本地 token，否则 Bearer 兜底会把刚登出的会话又「自动登录」回来
    saveAuthToken("");
    location.href = "/login.html";
  });
}

// ---------- 启动 ----------
