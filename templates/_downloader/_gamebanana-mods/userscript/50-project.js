    function $(sel) { return document.querySelector(sel); }

    /** 服务器地址/密码：GM 存储 + localStorage 双写（重装油猴/GM 读失败时从本站回填）。 */

    /** 规范化服务器地址：没写协议补 http://；去末尾 / */


    /** 从 GM_cookie 读取完整 cookie（含 HttpOnly）。返回 { text, count, source, diag } */

    /** 本机 {{SITE_DOMAIN}} 登录态（网页本身，不发给服务器） */
    async function sendModToServer(base, modUrl, session) {
        // 会话 cookie 名由内核 sessionHeaders 按服务端实际名拼接（本项目是 gbmd_session；
        // 旧写法硬编码 "session=" 会让服务端登录后带不上会话，表现为 401/未登录）
        const headers = sessionHeaders(session);
        const r = await gmRequest("POST", base + "/api/receive", { url: modUrl }, 12000, headers);
        if (r.ok && r.json && r.json.ok) return { ok: true, received: r.json.received || 1, status: r.status };
        return { ok: false, error: (r.json && r.json.error) || r.error || ("HTTP " + r.status), status: r.status };
    }

    /** 当前 mod 页链接（非 mod 页返回 ""） */
    function currentModUrl() {
        try {
            const m = location.pathname.match(/\/mods\/(\d+)/i);
            if (!m) return "";
            return location.origin + "/mods/" + m[1];
        } catch (_) { return ""; }
    }


    /* ---------- UI ---------- */


    async function doSend() {
        if (!ensureUi()) return;
        const sendBtn = panelEl.querySelector("#{{IDP}}send");
        const u = currentModUrl();
        if (!u) { srvSetStatus("❌ 当前不是 mod 页（需 {{SITE_DOMAIN}}/mods/数字）", "err"); return; }
        const cur = currentServer();
        const base = cur ? cur.url : "";
        const pwdEl = { value: cur ? cur.password : "" };
        if (!base) { srvSetStatus("❌ 请先添加并选择服务器", "err"); return; }
        sendBtn.disabled = true;
        try {
            srvSetStatus(`服务器在线，正在发送 mod…（${u}）`, "info");
            const p = await probeServer(base);
            if (!p.ok) { srvSetStatus("发送失败：无法连接服务器 " + p.error, "err"); return; }
            let session = "";
            if (p.status && p.status.needsAuth) {
                const lg = await serverLogin(base, pwdEl.value || "");
                if (!lg.ok) { srvSetStatus("发送失败：服务器设有密码 " + lg.error, "err"); return; }
                session = lg.session;
            }
            // 同步当前浏览器 UA 到服务器（GB 会话绑定完整 UA）
            syncUserAgent(base, session);
            const r = await sendModToServer(base, u, session);
            if (r.ok) {
                srvSetStatus(`✅ 已发送，服务器已添加 ${r.received} 个下载任务`, "ok");
                showToast("✅ 已发送到服务器");
            } else {
                srvSetStatus(`发送失败：${r.error}`, "err");
            }
        } finally {
            sendBtn.disabled = false;
        }
    }

    /* ---------- 注入登录态到浏览器（v4.3.0，参照 iwara：直接写 cookie，不拦截）---------- */

    /** 从服务器拉明文凭证（GET /api/cred，需登录会话）。 */

    /** 把 Cookie 项写进浏览器：document.cookie（当前域）+ GM_cookie.set 兜底（双域）。 */

    /** 注入主流程：连接服务器 → GET /api/cred → 写 cookie，提示刷新。 */
    function boot() {
        try { if (ensureUi()) log("已就绪，点击 🍌 打开面板"); } catch (e) { log("启动异常", e); }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
    // 防 SPA 把按钮剥掉：只是重新挂按钮，不弹面板
    setInterval(() => { try { ensureUi(); } catch (_) {} }, 3000);
