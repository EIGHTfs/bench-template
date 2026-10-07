    function cookieCacheValid() {
        const c = cacheGet(COOKIE_CACHE_KEY);
        if (!c || !c.text) return false;
        const exp = Number(c.expiresAt) || 0;
        if (!exp) return false;
        return Date.now() < exp - SKEW_MS;
    }

    /** 从 GM_cookie 读取完整 cookie（含 HttpOnly）。仅在缓存过期 / 强制刷新时调用。 */
    async function getCookieCached(force) {
        if (!force && cookieCacheValid()) return cacheGet(COOKIE_CACHE_KEY);
        const fresh = await readCookieGM();
        cacheSet(COOKIE_CACHE_KEY, fresh);
        return fresh;
    }

    async function pushLocalCreds(base, session) {
        const c = await getCookieCached(true);
        const body = {
            iwaraCookie: [
                "Cookie=" + (c && c.text || ""),
                "Token=" + ls("token"),
                "AccessToken=" + ls("accessToken")
            ].join("\n"),
            // 一并回传本机浏览器 UA：Cloudflare 的 cf_clearance 与生成它的那个浏览器的 UA 绑定，
            // 服务端若用别的 UA 请求会重新吃挑战（403 "Just a moment"）。服务端存为 iwaraUA，
            // 之后所有 API/下载/aria2 请求都优先用它（见 iwara-api.js effectiveUA）。
            iwaraUA: navigator.userAgent || ""
        };
        const r = await gmRequest("POST", base + "/api/settings", body, 12000, sessionHeaders(session));
        return { ok: !!(r.ok && r.json && r.json.ok), error: (r.json && r.json.error) || r.error, cookie: c };
    }

    /** 只推当前视频 URL。服务器走 /api/receive → 同一套 /api/download 解析。不读 Cookie。 */
    async function sendVideoToServer(base, videoUrl, session) {
        const headers = session ? { "Cookie": session } : {};
        const r = await gmRequest("POST", base + "/api/receive", { url: videoUrl }, 12000, headers);
        if (r.ok && r.json && r.json.ok) return { ok: true, total: r.json.received || r.json.total || 1, status: r.status };
        return { ok: false, error: (r.json && r.json.error) || r.error || ("HTTP " + r.status), status: r.status };
    }

    function currentVideoUrl() {
        try {
            const m = location.pathname.match(/\/(?:video|v)\/([\w-]+)/i);
            if (!m) return "";
            return location.origin + "/video/" + m[1];
        } catch (_) { return ""; }
    }

    function fillInstant() {
        if (!ensureUi()) return;
        const c = cacheGet(COOKIE_CACHE_KEY);
        if (panelEl.querySelector("#{{IDP}}cookie")) panelEl.querySelector("#{{IDP}}cookie").value = (c && c.text) || "";
        panelEl.querySelector("#{{IDP}}token").value = ls("token");
        panelEl.querySelector("#{{IDP}}atoken").value = ls("accessToken");
        const userbar = panelEl.querySelector("#{{IDP}}userbar");
        if (userbar && !userbar.textContent) userbar.textContent = "正在从服务器读取账号…";

        fillServerSelect();
        const cur = currentServer();
        const saved = cur ? cur.url : "";
        if (saved) {
            const srvEl = panelEl.querySelector("#{{IDP}}srv-status");
            if (srvEl && !srvEl.textContent) srvEl.textContent = "正在从服务器读取账号…";
        }
    }

    /** 取要发送的视频链接：显式传入优先，否则从当前页面解析；无效时提示并返回空 */
    function resolveVideoUrl(explicitUrl) {
        const videoUrl = (typeof explicitUrl === "string" && explicitUrl) ? explicitUrl : currentVideoUrl();
        if (!videoUrl) {
            srvSetStatus("当前不是视频页（未匹配 /video/xxx），请打开视频页再发", "err");
            showToast("请在视频链接上右键 / 长按");
        }
        return videoUrl;
    }

    /** 服务器要访问密码时自动登录；返回会话串（""=无需登录），null=失败/没密码（已提示） */
    async function ensureSendSession(base, cur, probe) {
        if (!(probe.status && probe.status.needsAuth)) return "";
        const pwd = String((cur && cur.password) || storeGet(SRV_PWD_KEY) || "");
        if (!pwd) {
            srvSetStatus("⚠️ 服务器设有访问密码：请删除后重新添加并填写密码", "err");
            return null;
        }
        srvSetStatus("服务器设有密码，正在自动登录…", "info");
        const lg = await serverLogin(base, pwd);
        if (!lg.ok) {
            srvSetStatus("自动登录失败：" + lg.error, "err");
            return null;
        }
        return lg.session;
    }

    /** 发送当前视频链接到服务器（服务器自行解析下载，不读本机 Cookie） */
    async function srvSendFlow(explicitUrl) {
        if (!ensureUi()) return;
        const videoUrl = resolveVideoUrl(explicitUrl);
        if (!videoUrl) return;
        const cur = currentServer();
        const base = cur ? cur.url : "";
        if (!base) {
            openPanel();
            srvSetStatus("没有服务器地址：请先点「添加」写入服务端", "err");
            showToast("请先在面板添加服务器");
            return;
        }
        const sendBtn = panelEl.querySelector("#{{IDP}}send");
        if (sendBtn) sendBtn.disabled = true;
        try {
            srvSetStatus(`正在探测 ${base} 是否在线…`, "info");
            const probe = await probeServer(base);
            if (!probe.ok) {
                srvSetStatus(`服务器离线：${probe.error}`, "err");
                return;
            }
            const session = await ensureSendSession(base, cur, probe);
            if (session === null) return;
            srvSetStatus(`服务器在线（端口 ${probe.status.port || "?"}），正在发送视频…`, "info");
            const r = await sendVideoToServer(base, videoUrl, session);
            if (r.ok) {
                srvSetStatus(`✅ 已发送，服务器已添加 ${r.total} 个下载任务`, "ok");
                storeSet(SRV_KEY, base);
                showToast("✅ 已发送到服务器");
            } else if (r.status === 401) {
                srvSetStatus("发送失败：未登录（401）。请检查服务器访问密码", "err");
            } else {
                srvSetStatus(`发送失败：${r.error}`, "err");
            }
        } finally {
            if (sendBtn) sendBtn.disabled = false;
        }
    }

    function srvSaveFlow() {
        fillServerSelect();
    }

    /** 从服务器拉明文凭证（GET /api/cred，需登录会话）。 */
    async function srvInjectFlow() {
        if (!ensureUi()) return;
        const cur = currentServer();
        const base = cur ? cur.url : "";
        if (!base) { srvSetStatus("没有服务器地址：先添加并选择服务端", "err"); return; }
        const btn = panelEl.querySelector("#{{IDP}}inject");
        if (btn) btn.disabled = true;
        try {
            srvSetStatus("正在连接服务器…", "info");
            const sess = await ensureServerSession(base);
            if (!sess.ok) { srvSetStatus(sess.error, "err"); return; }
            srvSetStatus("正在读取服务器凭证…", "info");
            const got = await fetchServerCreds(sess.base, sess.session);
            if (!got.ok) { srvSetStatus("读取凭证失败：" + got.error, "err"); return; }
            const cred = got.cred || {};
            const n = applyCookieToBrowser(cred.cookie);
            if (cred.token) { try { localStorage.setItem("token", cred.token); } catch (_) {} }
            if (cred.accessToken) { try { localStorage.setItem("accessToken", cred.accessToken); } catch (_) {} }
            const hasCf = /(?:^|;\s*)cf_clearance=/i.test(String(cred.cookie || ""));
            const log = [];
            log.push(`已写入 ${n} 个 Cookie 项` + (hasCf ? "（含 cf_clearance）" : ""));
            if (cred.token) log.push("refresh_token 已注入");
            if (cred.accessToken) log.push("access_token 已注入");
            const ok = n > 0 || cred.token || cred.accessToken;
            if (ok) {
                srvSetStatus("✅ " + log.join("；") + " —— 请刷新页面生效", "ok");
                showToast("✅ 登录态已注入，请刷新页面");
            } else {
                srvSetStatus("服务器没有可注入的凭证（Cookie/Token 都为空）", "err");
            }
        } catch (e) {
            srvSetStatus("注入失败：" + (e && e.message || e), "err");
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /** 监听 SPA 路由：只把 UI 挂回去，不重建、不重拉账号。 */
    function onSpaNav() {
        const href = location.href;
        if (href === lastHref) {
            ensureUi();
            return;
        }
        lastHref = href;
        ensureUi();
        log("SPA 换页", href);
    }

    function hookSpa() {
        if (spaHooked) return;
        spaHooked = true;
        const wrap = (type) => {
            const orig = history[type];
            if (typeof orig !== "function") return;
            history[type] = function () {
                const ret = orig.apply(this, arguments);
                try { window.dispatchEvent(new Event("{{IDP}}nav")); } catch (_) {}
                return ret;
            };
        };
        wrap("pushState");
        wrap("replaceState");
        window.addEventListener("popstate", onSpaNav);
        window.addEventListener("hashchange", onSpaNav);
        window.addEventListener("{{IDP}}nav", onSpaNav);
        const mo = new MutationObserver(() => { ensureUi(); });
        try { mo.observe(document.documentElement, { childList: true, subtree: false }); } catch (_) {}
        lastHref = location.href;
    }


    function videoUrlFromNode(node) {
        let el = node;
        if (el && el.nodeType === 3) el = el.parentElement;
        while (el && el !== document.documentElement) {
            if (el.tagName === "A") {
                const href = el.getAttribute("href") || el.href || "";
                const m = String(href).match(/\/(?:video|v)\/([\w-]+)/i);
                if (m) return location.origin + "/video/" + m[1];
            }
            el = el.parentElement;
        }
        return "";
    }

    function bindContextSend() {
        if (window.__{{IDP_BARE}}CtxBound) return;
        window.__{{IDP_BARE}}CtxBound = true;
        document.addEventListener("contextmenu", (ev) => {
            const url = videoUrlFromNode(ev.target);
            if (!url) return;
            ev.preventDefault();
            ev.stopPropagation();
            showCtxMenu(ev.clientX, ev.clientY, url);
        }, true);

        let pressTimer = 0, sx = 0, sy = 0, pressUrl = "";
        const cancelPress = () => {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; }
        };
        document.addEventListener("touchstart", (ev) => {
            if (!ev.touches || ev.touches.length !== 1) return;
            const url = videoUrlFromNode(ev.target);
            if (!url) return;
            const t = ev.touches[0];
            sx = t.clientX; sy = t.clientY; pressUrl = url;
            cancelPress();
            pressTimer = setTimeout(() => {
                pressTimer = 0;
                showCtxMenu(sx, sy, pressUrl);
            }, 480);
        }, { capture: true, passive: true });
        document.addEventListener("touchmove", (ev) => {
            if (!pressTimer || !ev.touches || !ev.touches[0]) return;
            const t = ev.touches[0];
            if (Math.abs(t.clientX - sx) > 12 || Math.abs(t.clientY - sy) > 12) cancelPress();
        }, { capture: true, passive: true });
        document.addEventListener("touchend", cancelPress, { capture: true, passive: true });
        document.addEventListener("touchcancel", cancelPress, { capture: true, passive: true });
        document.addEventListener("click", (ev) => {
            const m = document.getElementById("{{IDP}}ctx");
            if (!m) return;
            if (m.contains(ev.target)) return;
            hideCtxMenu();
        }, true);
    }

    function boot() {
        injectStyle();
        ensureUi();
        bindContextSend();
        hookSpa();
        log("已加载 v" + VER + "（SPA 常驻，换页不重载）");
        setInterval(() => { ensureUi(); }, 2500);
    }

    try {
        boot();
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => { ensureUi(); }, { once: true });
        }
    } catch (e) {
        log("启动异常:", e);
    }
