// 登录页逻辑（两端共用）：回车/按钮提交密码 → /api/login → 跳首页。
// 标题与图标取自配置，与主页面保持一致（不依赖组装期占位符替换）。
(async function syncBrand() {
  try {
    const j = await fetch("/api/gallery").then((r) => r.json());
    // /api/gallery 把 title / favicon 平铺在顶层返回
    const cfg = (j && j.config) || j || {};
    const icon = document.getElementById("logoIcon");
    const text = document.getElementById("logoText");
    if (cfg.favicon && icon) icon.textContent = cfg.favicon;
    if (cfg.title && text) {
      text.textContent = cfg.title;
      document.title = "登录 · " + cfg.title;
    }
  } catch (e) {
    // 配置拉取失败时保留静态兜底文案即可，不影响登录
  }
})();

document.getElementById("pwd").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
document.getElementById("btn").addEventListener("click", login);
async function login() {
  const st = document.getElementById("status");
  try {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: document.getElementById("pwd").value, remember: document.getElementById("remember").checked })
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "登录失败");
    location.href = "/";
  } catch (e) {
    st.textContent = e.message;
    st.className = "status err";
  }
}