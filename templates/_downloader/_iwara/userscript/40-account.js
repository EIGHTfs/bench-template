    function jwtExpMs(token) {
        try {
            const p = JSON.parse(atob(String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
            return p && p.exp ? p.exp * 1000 : 0;
        } catch (_) { return 0; }
    }

    function toMs(n) {
        n = Number(n) || 0;
        if (n <= 0) return 0;
        return n < 1e12 ? n * 1000 : n;
    }

    function cacheGet(key) {
        try { return GM_getValue(key, null) || null; } catch (_) { return null; }
    }
    function cacheSet(key, val) {
        try { GM_setValue(key, val); } catch (_) {}
    }

    /** 服务器地址/密码：GM 存储 + localStorage 双写。重装油猴或 GM 读失败时还能从本站 localStorage 回填。 */
    async function buildPayload() {
        let c = cacheGet(COOKIE_CACHE_KEY);
        if (!c || !c.text) c = await getCookieCached(true);
        return [
            "Cookie=" + (c && c.text || ""),
            "Token=" + ls("token"),
            "AccessToken=" + ls("accessToken")
        ].join("\n");
    }

    function unwrapUser(raw) {
        if (!raw) return null;
        if (raw.user && (raw.user.id || raw.user.username || raw.user.name)) return raw.user;
        if (raw.id || raw.username || raw.name) return raw;
        return null;
    }

    async function fetchIwaraUser(cookieText) {
        let accessToken = ls("accessToken");
        const refresh = ls("token");
        const headersOf = (acc) => {
            const h = {};
            if (cookieText) h["Cookie"] = cookieText;
            if (acc) h["Authorization"] = "Bearer " + acc;
            return h;
        };
        let r = await gmRequest("GET", "https://api.{{SITE_DOMAIN}}/user", undefined, 10000, headersOf(accessToken));
        if ((!r.ok || r.status === 401) && refresh) {
            const tok = await gmRequest("POST", "https://api.{{SITE_DOMAIN}}/user/token", {}, 8000, {
                Authorization: "Bearer " + refresh,
                Cookie: cookieText || ""
            });
            const acc = tok.json && tok.json.accessToken;
            if (acc) {
                accessToken = acc;
                try { localStorage.setItem("accessToken", acc); } catch (_) {}
                r = await gmRequest("GET", "https://api.{{SITE_DOMAIN}}/user", undefined, 10000, headersOf(acc));
            }
        }
        if (r.ok && r.json) {
            const u = unwrapUser(r.json);
            const username = (u && (u.username || u.name)) || "";
            const id = (u && u.id) || "";
            const name = (u && (u.name || u.username)) || username;
            return { ok: true, loggedIn: true, username, name, id, profileUrl: username ? ("https://www.{{SITE_DOMAIN}}/profile/" + username) : "" };
        }
        if (refresh) return { ok: true, loggedIn: true, username: "", name: "", id: "", tokenOnly: true };
        return { ok: false, loggedIn: false };
    }

    function sessionHeaders(session) {
        // session 已是完整 name=value（会话 cookie 名可能带项目前缀，如 iwara_session）
        return session ? { Cookie: session } : {};
    }

    /** 拿服务器 session cookie。有密码则 POST /api/login，session 缓存约 70 小时。 */
    async function ensureServerSession(base) {
        base = normalizeServerBase(base);
        if (!base) return { ok: false, error: "没有服务器地址", base: "" };
        const cached = cacheGet(SRV_SESSION_KEY);
        if (cached && cached.base === base && cached.session && Date.now() < (cached.expiresAt || 0)) {
            return { ok: true, session: cached.session, base, cached: true };
        }
        const probe = await probeServer(base);
        if (!probe.ok) return { ok: false, error: probe.error, base };
        let session = "";
        if (probe.status && probe.status.needsAuth) {
            const pwd = String((currentServer() && currentServer().password) || storeGet(SRV_PWD_KEY) || "");
            if (!pwd) return { ok: false, error: "服务器设有密码，请填写服务器访问密码", base, needsPwd: true };
            const lg = await serverLogin(base, pwd);
            if (!lg.ok) return { ok: false, error: lg.error, base };
            session = lg.session;
            cacheSet(SRV_SESSION_KEY, { base, session, expiresAt: Date.now() + 70 * 3600 * 1000 });
        }
        return { ok: true, session, base };
    }

    /** GET /api/account-check：用户信息 + 脱敏 cred。成功即证明服务器在线。 */
    async function getServerAccountCheck(base, session) {
        const r = await gmRequest("GET", base + "/api/account-check", undefined, 12000, sessionHeaders(session));
        if (r.status === 401) {
            cacheSet(SRV_SESSION_KEY, null);
            return { ok: false, status: 401, error: "服务器会话失效" };
        }
        if (r.ok && r.json) return { ok: true, data: r.json };
        return { ok: false, error: (r.json && r.json.error) || r.error || ("HTTP " + r.status), status: r.status };
    }

    /** 本机 Cookie+Token 组合成设置页同款文本，POST /api/settings 存到服务器。 */
    function accountCacheFresh() {
        return !!(lastAccount.data && Date.now() - lastAccount.at < ACCOUNT_TTL_MS);
    }

    /** 同步弹出。网络/Cookie 全部丢到下一拍，避免点击无反馈。 */
    function fmtExp(ms) {
        const n = Number(ms) || 0;
        if (!n) return "未知";
        const d = new Date(n);
        const pad = (x) => String(x).padStart(2, "0");
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    function loginWarn(c) {
        const cookieExp = Number(c && c.expiresAt) || 0;
        const refreshExp = jwtExpMs(ls("token")) || 0;
        const expiresAt = [cookieExp, refreshExp].filter(Boolean).sort((a, b) => a - b)[0] || refreshExp || cookieExp || 0;
        if (!expiresAt) return { level: "unknown", expiresAt: 0, remainingDays: null, remainText: "" };
        const remainingMs = expiresAt - Date.now();
        const remainingDays = remainingMs / 86400000;
        let remainText = "";
        if (remainingDays <= 0) remainText = "已过期";
        else if (remainingDays < 1) remainText = "不足 1 天";
        else remainText = "剩 " + (remainingDays < 10 ? remainingDays.toFixed(1) : Math.floor(remainingDays)) + " 天";
        let level = "ok";
        if (remainingMs <= 0) level = "expired";
        else if (remainingDays <= LOGIN_WARN_DAYS) level = "warn";
        return { level, expiresAt, remainingDays, remainText };
    }

    function remainTextOf(r) {
        if (!r || r.remainingDays == null) return "";
        const d = r.remainingDays;
        if (d <= 0) return "已过期";
        if (d < 1) return "不足 1 天";
        return "剩 " + (d < 10 ? d.toFixed(1) : Math.floor(d)) + " 天";
    }

    /** 服务器已登录：隐藏本机 Cookie/Token/复制区。未登录才展开采集区。 */
    function setLocalCredVisible(show) {
        if (!panelEl) return;
        if (show) panelEl.classList.remove("server-ok");
        else panelEl.classList.add("server-ok");
    }

    function renderServerAccount(r, extra) {
        const userbar = panelEl.querySelector("#{{IDP}}userbar");
        const L = [];
        const cred = (r && r.cred) || {};
        const name = (r && (r.username || r.user)) || "";
        const remain = remainTextOf(r);
        const serverLoggedIn = !!(r && r.loggedIn && r.warnLevel !== "expired");
        setLocalCredVisible(!serverLoggedIn);
        if (!r) {
            L.push("❌ 未能读取服务器账号");
            userbar.className = "err";
        } else if (!r.cookieSet) {
            L.push("❌ 服务器未配置 Cookie / Token");
            userbar.className = "err";
        } else if (r.warnLevel === "expired") {
            L.push("❌ 登录已过期" + (remain ? "（" + remain + "）" : ""));
            userbar.className = "err";
        } else if (r.loggedIn) {
            L.push((r.warnLevel === "warn" ? "⚠️ 已登录" : "✅ 已登录") + (remain ? "（" + remain + "）" : ""));
            L.push("👤 用户名: " + (name || "(未取到)"));
            if (r.userId) L.push("🆔 用户 id: " + r.userId);
            if (r.username) L.push("🔗 https://www.{{SITE_DOMAIN}}/profile/" + r.username);
            if (r.warnLevel === "warn") L.push("请尽快更新凭证");
            userbar.className = r.warnLevel === "warn" ? "warn" : "ok";
        } else {
            L.push("❌ 未登录");
            if (r.error) L.push(r.error);
            if (r.cfChallenge) L.push("（需含 cf_clearance）");
            userbar.className = "err";
        }
        if (!serverLoggedIn) {
            L.push("───");
            L.push("来源: 服务器 GET /api/account-check（能读到 = 服务器在线）");
            L.push("完整 Cookie: " + (cred.cookieChars || 0) + " 字符 / " + (cred.cookieItems || 0) + " 项 ｜ 存于服务器（不回传明文）");
            L.push("含 cf_clearance: " + (cred.hasCfClearance ? "✅ 有" : "❌ 无"));
            L.push("refresh_token: " + (cred.hasToken ? "✅ 有" : "❌ 无")); // dsh-skip-sensitive（纯文本标签，非凭据）
            L.push("access_token: " + (cred.hasAccessToken ? "✅ 有" : "❌ 无")); // dsh-skip-sensitive（纯文本标签，非凭据）
        }
        if (extra) L.push(extra);
        userbar.textContent = L.join("\n");
        panelEl.querySelector("#{{IDP}}info").textContent = serverLoggedIn
            ? "服务器已登录。点发送只推当前视频链接，不读本机 Cookie。"
            : "服务器没有可用登录。下面采集本机 Cookie/Token 并回传保存。Chrome Tampermonkey 读不到 cf_clearance。";
    }

    /** 立刻填地址/密码/本机 token 框。不发请求、不读 GM_cookie。 */
    /** 会话失效（401）就清缓存重登一次，返回最终 account-check 结果 */
    async function fetchAccountCheckWithRetry(base, session) {
        let chk = await getServerAccountCheck(base, session);
        if (!chk.ok && chk.status === 401) {
            cacheSet(SRV_SESSION_KEY, null);
            const again = await ensureServerSession(base);
            if (again.ok) chk = await getServerAccountCheck(again.base, again.session);
        }
        return chk;
    }

    /** 服务器没有凭证（或强制刷新）时：采集本机凭证回传并复检渲染 */
    async function pushCredsAndRecheck(sess, data, forcePush) {
        renderServerAccount(data, forcePush ? "正在强制采集本机凭证并回传…" : "服务器没有 Cookie，正在本机采集并回传…");
        const pushed = await pushLocalCreds(sess.base, sess.session);
        if (!pushed.ok) {
            renderServerAccount(data, "回传失败：" + (pushed.error || "未知错误"));
            if (forcePush) setStatus("回传失败: " + (pushed.error || ""), "err");
            return;
        }
        const chk2 = await getServerAccountCheck(sess.base, sess.session);
        if (chk2.ok) {
            lastAccount = { at: Date.now(), data: chk2.data };
            renderServerAccount(chk2.data, "✅ 已回传并保存到服务器");
        } else renderServerAccount(data, "✅ 已回传（再次检测失败：" + chk2.error + "）");
        if (forcePush) setStatus("✅ 已强制刷新并回传", "ok");
    }

    /** 面板顶部账号信息条（统一入口，避免各分支重复取节点/设 class） */
    function setUserbar(text, cls) {
        const el = panelEl && panelEl.querySelector("#{{IDP}}userbar");
        if (!el) return;
        el.textContent = text;
        el.className = cls || "";
    }

    /** 从服务器同步账号状态（forcePush=强制采集本机凭证并回传） */
    async function syncFromServer(forcePush) {
        if (!ensureUi()) return;
        if (credRefreshing) return;
        if (!forcePush && accountCacheFresh()) {
            renderServerAccount(lastAccount.data);
            return;
        }
        credRefreshing = true;
        try {
            const cur = currentServer();
            const base = cur ? cur.url : "";
            if (!base) {
                setUserbar("没有服务器地址：点「添加」写入后再从 /api/account-check 读取登录信息", "err");
                srvSetStatus("请先添加并选择服务器", "err");
                return;
            }
            setUserbar("正在从服务器读取账号（GET /api/account-check）…");
            const sess = await ensureServerSession(base);
            if (!sess.ok) {
                setUserbar("服务器离线或无法登录：\n" + sess.error, "err");
                srvSetStatus(sess.error, "err");
                return;
            }
            srvSetStatus("✅ 服务器在线：" + sess.base, "ok");
            const chk = await fetchAccountCheckWithRetry(sess.base, sess.session);
            if (!chk.ok) {
                setUserbar("读取 /api/account-check 失败：\n" + chk.error, "err");
                srvSetStatus(chk.error, "err");
                return;
            }
            const data = chk.data;
            lastAccount = { at: Date.now(), data };
            const cred = data.cred || {};
            const serverHasCred = !!(data.cookieSet || cred.hasCookie || cred.hasToken);
            if (!serverHasCred || forcePush) {
                await pushCredsAndRecheck(sess, data, forcePush);
                return;
            }
            renderServerAccount(data);
            if (forcePush) setStatus("✅ 已从服务器刷新账号信息", "ok");
        } catch (e) {
            setUserbar("同步失败: " + (e && e.message || e), "err");
            if (forcePush) setStatus("刷新失败: " + (e && e.message || e), "err");
        } finally {
            credRefreshing = false;
        }
    }
