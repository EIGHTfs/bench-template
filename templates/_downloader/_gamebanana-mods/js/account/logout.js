function bindLogout() {
  $("#logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", "POST", {});
    location.href = "/login.html";
  });
}

// ---------- 启动 ----------
