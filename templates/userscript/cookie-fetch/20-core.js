/* ============================================================
 * Iwara 下载助手（油猴）
 *
 * 职责分工：
 *   0. Iwara 是 SPA：脚本只在整页刷新时注入一次。UI 挂在 <html> 上，
 *      换视频/换页不重建、不重拉账号（账号缓存 5 分钟）
 *   1. 点右下角图标立刻弹出面板（同步，不读 Cookie、不发请求）
 *   2. 后台 GET {服务器}/api/account-check
 *      - 能读到 = 服务器在线
 *      - 返回的用户名/id/到期提醒就是网页「检测登录状态」那串
 *   3. 服务器已登录：面板只留「发送视频 + 账号信息」，不展示本机 Cookie/Token
 *   4. 服务器没有凭证：才 GM_cookie 采集，POST /api/settings 回传保存
 *   5. 发送视频：只 POST /api/receive { url }，服务器自己解析下载，不读 Cookie
 *
 * Chrome Tampermonkey 没有 GM_cookie，读不到 HttpOnly 的 cf_clearance。
 * 需要完整 Cookie 时请用 Violentmonkey 或 Firefox Tampermonkey。
 * ============================================================ */

    function ls(key) { try { return localStorage.getItem(key) || ""; } catch (_) { return ""; } }
    function log(...a) { try { console.log("[{{LOG_TAG}} " + VER + "]", ...a); } catch (_) {} }

    /** 解析 JWT exp（秒）→ 毫秒时间戳。access_token 只有约 1 小时，登录到期看 refresh_token。 */
    function storeGet(key) {
        try {
            if (typeof GM_getValue === "function") {
                const v = GM_getValue(key, "");
                if (v !== undefined && v !== null && String(v).trim()) return String(v);
            }
        } catch (_) {}
        try {
            const v = localStorage.getItem("{{STORE_PREFIX}}" + key);
            if (v && String(v).trim()) return String(v);
        } catch (_) {}
        return "";
    }
    function storeSet(key, val) {
        const s = String(val || "");
        try { if (typeof GM_setValue === "function") GM_setValue(key, s); } catch (_) {}
        try {
            if (s) localStorage.setItem("{{STORE_PREFIX}}" + key, s);
            else localStorage.removeItem("{{STORE_PREFIX}}" + key);
        } catch (_) {}
    }

    function normalizeServerBase(url) {
        let s = String(url || "").trim();
        if (!s) return "";
        s = s.replace(/\/+$/, "");
        if (!/^https?:\/\//i.test(s)) s = "http://" + s;
        return s;
    }
    function loadServerList() {
        let list = [];
        try { list = JSON.parse(storeGet(SRV_LIST_KEY) || "[]"); } catch (_) { list = []; }
        if (!Array.isArray(list)) list = [];
        list = list.map((it) => ({ url: normalizeServerBase(it && it.url), password: String((it && it.password) || "") })).filter((it) => it.url);
        const seen = new Set();
        const uniq = [];
        for (const it of list) { if (seen.has(it.url)) continue; seen.add(it.url); uniq.push(it); }
        const legacy = normalizeServerBase(storeGet(SRV_KEY));
        if (legacy && !uniq.some((it) => it.url === legacy)) {
            uniq.unshift({ url: legacy, password: storeGet(SRV_PWD_KEY) });
            saveServerList(uniq);
        }
        return uniq;
    }
    function saveServerList(list) { storeSet(SRV_LIST_KEY, JSON.stringify(list || [])); }
    function currentServer() {
        const list = loadServerList();
        const sel = normalizeServerBase(storeGet(SRV_KEY));
        return list.find((it) => it.url === sel) || list[0] || null;
    }
    function fillServerSelect() {
        const sel = panelEl && panelEl.querySelector("#{{IDP}}server");
        if (!sel) return;
        const list = loadServerList();
        const cur = currentServer();
        sel.innerHTML = "";
        if (!list.length) {
            const o = document.createElement("option");
            o.value = ""; o.textContent = "尚未添加服务端";
            sel.appendChild(o); return;
        }
        for (const it of list) {
            const o = document.createElement("option");
            o.value = it.url; o.textContent = it.url;
            sel.appendChild(o);
        }
        sel.value = cur ? cur.url : list[0].url;
        if (cur) { storeSet(SRV_KEY, cur.url); storeSet(SRV_PWD_KEY, cur.password); }
    }
    function addServerFromForm() {
        const url = normalizeServerBase(panelEl.querySelector("#{{IDP}}url-new").value);
        const password = panelEl.querySelector("#{{IDP}}pwd-new").value || "";
        if (!url) { srvSetStatus("请填写服务器地址", "err"); return; }
        const list = loadServerList();
        if (list.some((it) => it.url === url)) { srvSetStatus("已存在该地址", "err"); return; }
        list.push({ url, password });
        saveServerList(list);
        storeSet(SRV_KEY, url);
        storeSet(SRV_PWD_KEY, password);
        panelEl.querySelector("#{{IDP}}add-form").style.display = "none";
        fillServerSelect();
        srvSetStatus("已添加 " + url, "ok");
        showPanel();
    }
    function deleteSelectedServer() {
        const sel = panelEl.querySelector("#{{IDP}}server");
        const url = sel && sel.value;
        if (!url) { srvSetStatus("没有可删除的服务端", "err"); return; }
        const list = loadServerList().filter((it) => it.url !== url);
        saveServerList(list);
        const next = list[0] || { url: "", password: "" };
        storeSet(SRV_KEY, next.url);
        storeSet(SRV_PWD_KEY, next.password);
        fillServerSelect();
        srvSetStatus("已删除 " + url, "ok");
        showPanel();
    }

    /** 读本机 Cookie：GM_cookie 优先（含 HttpOnly 项），不可用时回退 document.cookie。
     *  【差异取优合并】到期计算取 iwara 侧（cf_clearance > 各 cookie 最早到期 > token exp），
     *  诊断文案取 gbmd 侧（diag 说明为什么读不到：未装 GM_cookie / 未授权 / 返回 0 个），
     *  这样「读不到」时用户能直接看到原因，而不是只看到一段空文本。 */
    function readCookieGM() {
        return new Promise((resolve) => {
            const fallback = (why) => {
                const text = document.cookie || "";
                const tokenExp = jwtExpMs(ls("token"));
                resolve({
                    text,
                    count: text ? text.split(";").filter(Boolean).length : 0,
                    source: "document.cookie",
                    diag: why || "GM_cookie 不可用，回退 document.cookie（HttpOnly 项读不到）",
                    expiresAt: tokenExp || (Date.now() + 6 * 3600 * 1000),
                    fetchedAt: Date.now()
                });
            };
            try {
                if (typeof GM_cookie === "undefined" || !GM_cookie || typeof GM_cookie.list !== "function") {
                    return fallback("GM_cookie 未定义（Chrome Tampermonkey 读不到 HttpOnly；请用 Violentmonkey 或 Firefox Tampermonkey）");
                }
                GM_cookie.list({}, (cookies, error) => {
                    if (error) { log("GM_cookie.list error:", error); return fallback("GM_cookie.list 报错：" + JSON.stringify(error)); }
                    if (!Array.isArray(cookies)) return fallback("GM_cookie.list 返回非数组");
                    if (cookies.length === 0) return fallback("GM_cookie.list 返回 0 个（可能未授予 cookie 权限）");
                    const hit = cookies.filter((c) => c && c.domain && String(c.domain).indexOf("{{SITE_DOMAIN}}") >= 0);
                    const listSrc = hit.length > 0 ? hit : cookies;
                    const list = listSrc.map((c) => (c && c.name) ? c.name + "=" + (c.value || "") : "").filter(Boolean);
                    const text = list.join("; ");
                    const exps = listSrc.map((c) => toMs(c && c.expirationDate)).filter((n) => n > Date.now());
                    const cf = listSrc.find((c) => c && c.name === "cf_clearance");
                    const cfExp = toMs(cf && cf.expirationDate);
                    const tokenExp = jwtExpMs(ls("token"));
                    let expiresAt = 0;
                    if (cfExp) expiresAt = cfExp;
                    else if (exps.length) expiresAt = Math.min.apply(null, exps);
                    else if (tokenExp) expiresAt = tokenExp;
                    else expiresAt = Date.now() + 6 * 3600 * 1000;
                    resolve({
                        text,
                        count: list.length,
                        source: "GM_cookie（" + listSrc.length + " 个）",
                        diag: "OK",
                        expiresAt,
                        fetchedAt: Date.now()
                    });
                });
            } catch (e) { log("GM_cookie exception:", e); fallback("GM_cookie 异常：" + (e && e.message || e)); }
        });
    }

    /** 仅复制/回传/服务器没凭证时调用。force=true 无视缓存。 */
    function gmRequest(method, url, body, timeout, extraHeaders) {
        return new Promise((resolve) => {
            try {
                if (typeof GM_xmlhttpRequest !== "function") {
                    return resolve({ ok: false, error: "无 GM_xmlhttpRequest 权限" });
                }
                GM_xmlhttpRequest({
                    method,
                    url,
                    timeout: timeout || 8000,
                    data: body !== undefined ? JSON.stringify(body) : undefined,
                    headers: Object.assign(body !== undefined ? { "Content-Type": "application/json" } : {}, extraHeaders || {}),
                    onload: (r) => {
                        let j = null;
                        try { j = JSON.parse(r.responseText); } catch (_) {}
                        let setCookie = "";
                        try {
                            const hdrs = r.responseHeaders || "";
                            // 会话 cookie 名可能带项目前缀（如 iwara_session —— 同机多项目各用一名，
                            // 避免 iwara/gbmd/gallery 互相覆盖会话）。这里连名字一起取，存完整 name=value，
                            // 后续请求头直接可用；同时兼容旧的无前缀 session。
                            const m = hdrs.match(/Set-Cookie:\s*([A-Za-z0-9_-]*session)=([^;\s]+)/i);
                            if (m) setCookie = m[1] + "=" + m[2];
                        } catch (_) {}
                        resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: j, text: r.responseText, error: "", setCookie });
                    },
                    onerror: (r) => resolve({ ok: false, status: r.status, json: null, text: "", error: r.error || "网络错误" }),
                    ontimeout: () => resolve({ ok: false, status: 0, json: null, text: "", error: "超时" })
                });
            } catch (e) {
                resolve({ ok: false, status: 0, json: null, text: "", error: String(e.message || e) });
            }
        });
    }

    /** GET /api/status，不需要登录。用来判断 needsAuth。 */
    async function probeServer(url) {
        const base = normalizeServerBase(url);
        if (!base) return { ok: false, error: "地址无效", base };
        const r = await gmRequest("GET", base + "/api/status", undefined, 4000);
        if (r.ok && r.json && r.json.ok) return { ok: true, status: r.json, base };
        return { ok: false, error: (r.json && r.json.error) || r.error || ("HTTP " + r.status), base };
    }

    async function serverLogin(base, password) {
        const r = await gmRequest("POST", base + "/api/login", { password }, 8000);
        if (r.ok && r.setCookie) return { ok: true, session: r.setCookie };
        if (r.status === 401) return { ok: false, error: "密码错误（服务器访问密码不对）" };
        // 登录 2xx 却拿不到会话 cookie：多半是服务端换了会话 cookie 名或响应头格式变了，
        // 明确报出来，别让它退化成含糊的「HTTP 200」。
        if (r.ok) return { ok: false, error: "登录成功但未取到会话 cookie（服务端会话名可能已变，请更新脚本）" };
        return { ok: false, error: (r.json && r.json.error) || r.error || ("HTTP " + r.status) };
    }

    /** 复制到剪贴板：GM_setClipboard 优先，退 navigator.clipboard。
     *  【差异取优合并】提示统一走面板内 showToast（gbmd 侧做法，面板里能看见），
     *  不再用页面级 GM_notification —— 两条提示路径并存时行为不一致（一个在系统通知、一个在面板）。 */
    function copyText(text, okMsg) {
        return new Promise((resolve) => {
            const done = () => { if (okMsg) showToast(okMsg); resolve(true); };
            try {
                if (typeof GM_setClipboard === "function") {
                    GM_setClipboard(text, { type: "text", mimetype: "text/plain" });
                    done(); return;
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(done, () => resolve(false));
                    return;
                }
            } catch (_) {}
            resolve(false);
        });
    }

    function injectStyle() {
        if (document.getElementById("{{IDP}}style")) return;
        const style = document.createElement("style");
        style.id = "{{IDP}}style";
        style.textContent = PANEL_CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    let fabEl, panelEl, toastEl;
    let credRefreshing = false;
    let lastAccount = { at: 0, data: null };
    let lastHref = "";
    let spaHooked = false;

    /** 挂到 <html>，避开 SPA 替换 <body> 把按钮带走。 */
    function showToast(msg) {
        if (!ensureUi()) return;
        toastEl.textContent = msg;
        toastEl.style.display = "block";
        setTimeout(() => { toastEl.style.display = "none"; }, 4000);
    }
    function srvSetStatus(msg, cls) {
        if (!panelEl) return;
        const el = panelEl.querySelector("#{{IDP}}srv-status");
        if (!el) return;
        el.textContent = msg;
        el.className = "srv" + (cls ? " " + cls : "");
        if (cls !== "info") setTimeout(() => { el.textContent = ""; el.className = ""; }, 6000);
    }
    function srvInput() { return panelEl ? panelEl.querySelector("#{{IDP}}server") : null; }

    async function fetchServerCreds(base, session) {
        const r = await gmRequest("GET", base + "/api/cred", undefined, 12000, sessionHeaders(session));
        if (!r.ok || !r.json || !r.json.ok) return { ok: false, error: (r.json && r.json.error) || r.error || ("HTTP " + r.status) };
        return { ok: true, cred: r.json };
    }

    /** 把 Cookie 项写回浏览器：document.cookie 写当前域，GM_cookie.set 兜底 HttpOnly 项。
     *  【差异取优合并】站点可能有多个域（如 gamebanana.com 与 www.gamebanana.com 要双写），
     *  域列表取配置 SITE_DOMAINS（逗号分隔）；单域项目照常工作（gbmd 侧的多域写法下沉到内核）。 */
    function applyCookieToBrowser(cookieText) {
        const items = String(cookieText || "").split(";").map((s) => s.trim()).filter((p) => p && !/^=/.test(p) && !/deleted/i.test(p));
        const hosts = String("{{SITE_DOMAINS}}").split(",").map((s) => s.trim()).filter(Boolean);
        let written = 0;
        for (const item of items) {
            const eq = item.indexOf("=");
            if (eq <= 0) continue;
            const name = item.slice(0, eq).trim();
            const value = item.slice(eq + 1).trim();
            if (!name || !value) continue;
            try { document.cookie = name + "=" + value + "; path=/"; written++; } catch (_) {}
            // HttpOnly（如 cf_clearance / sess / rmc）document.cookie 写不进，用 GM_cookie.set 逐域兜底
            if (typeof GM_cookie !== "undefined" && GM_cookie && typeof GM_cookie.set === "function") {
                for (const host of hosts) {
                    try {
                        GM_cookie.set({ url: "https://" + host + "/", name, value, path: "/" }, () => {});
                    } catch (_) {}
                }
            }
        }
        return written;
    }

    /** 注入主流程：GET /api/cred → 写 cookie + localStorage，提示刷新。 */
