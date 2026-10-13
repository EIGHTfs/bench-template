function fmtGbLoginRemain(r) {
  if (!r || r.remainingDays == null) return "";
  const d = r.remainingDays;
  if (d <= 0) return "已过期";
  return "剩 " + Math.floor(d) + " 天";
}

// 2026-09-01 参照 iwara formatIwaraLoginBlock：检测登录状态多行块（含凭证明细）
function fmtGbLoginBlock(r) {
  const L = [];
  const cred = (r && r.cred) || {};
  const name = (r && r.username) || "";
  if (!r || !r.cookieSet) {
    L.push("❌ 未配置 Cookie");
  } else if (r.warnLevel === "expired") {
    L.push("❌ 登录已过期" + (r.remainingDays != null ? "（" + fmtGbLoginRemain(r) + "）" : ""));
  } else if (r.loggedIn) {
    const remain = fmtGbLoginRemain(r);
    L.push((r.warnLevel === "warn" ? "⚠️ 已登录" : "✅ 已登录") + (remain ? "（" + remain + "）" : ""));
    L.push("👤 用户名: " + (name || "(未取到)"));
    if (r.idRow) L.push("🆔 用户 id: " + r.idRow);
    if (r.profileUrl) L.push("🔗 " + r.profileUrl);
    if (r.warnLevel === "warn") L.push("请尽快更新凭证");
  } else {
    L.push("❌ 未登录");
    if (r.detail) L.push(r.detail);
  }
  L.push("───");
  L.push("完整 Cookie: " + (cred.cookieChars || 0) + " 字符 / " + (cred.cookieItems || 0) + " 项 ｜ 存于服务器（不回传明文）");
  L.push("含 sess: " + (cred.hasSess ? "✅ 有" : "❌ 无"));
  L.push("含 rmc: " + (cred.hasRmc ? "✅ 有" : "❌ 无"));
  return L.join("\n");
}

async function checkGbLoginStatus() {
  const el = $("#loginStatus");
  const btn = $("#loginCheckBtn");
  if (!el) return;
  el.className = "login-detect";
  el.textContent = "检测中…";
  if (btn) btn.disabled = true;
  try {
    const r = await api("/api/gb-login-status");
    updateGbUserBadge(r);
    el.textContent = fmtGbLoginBlock(r);
    el.className = "login-detect " + (r.warnLevel === "expired" || !r.loggedIn || !r.cookieSet ? "err" : (r.warnLevel === "warn" ? "warn" : "ok"));
  } catch (e) {
    el.textContent = "❌ 检测失败: " + (e.message || String(e));
    el.className = "login-detect err";
  } finally {
    if (btn) btn.disabled = false;
  }
}

// 2026-09-01：顶部时间前面显示当前登录的用户名（复用 /api/gb-login-status 的 username）
// 2026-09-01 参照 iwara updateIwaraUserBadge：r 可传入复用（检测按钮点完直接刷新），否则自取
async function updateGbUserBadge(r) {
  const el = $("#UserBadge");
  const nameEl = $("#UserName");
  const remainEl = $("#UserRemain");
  if (!el) return;
  const setStack = (name, remain, cls) => {
    if (nameEl) nameEl.textContent = name;
    else el.textContent = name;
    if (remainEl) remainEl.textContent = remain || "";
    el.className = "sub header-stack " + cls;
  };
  try {
    if (!r) r = await api("/api/gb-login-status");
    const name = r.username || "";
    const remain = fmtGbLoginRemain(r);
    // 顶部两行：第一行用户名（加粗样式），第二行剩余天数（嵌套 span 只填文本）
    if (!r || !r.cookieSet) {
      setStack("未配置凭证", "需粘贴 Cookie", "gb-user-err");
      el.title = "设置页粘贴 GameBanana Cookie（sess+rmc）";
      return;
    }
    if (r.warnLevel === "expired" || !r.loggedIn) {
      setStack(r.warnLevel === "expired" ? "已过期" : "未登录", remain, "gb-user-err");
      el.title = r.detail || "GameBanana Cookie 已过期，请重新复制";
    } else if (r.warnLevel === "warn") {
      setStack(name || "已登录", "⚠️ " + remain, "gb-user-warn");
      el.title = r.profileUrl || "GameBanana 已登录用户";
    } else {
      setStack(name || "已登录", remain, "gb-user-ok");
      el.title = r.profileUrl || "GameBanana 已登录用户";
    }
  } catch (_) {
    setStack("", "", "");
  }
}

