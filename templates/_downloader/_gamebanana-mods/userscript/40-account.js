    async function detectLocalLogin() {
        try {
            const r1 = await fetch("/apiv13/Member/UiConfig?_sUrl=" + encodeURIComponent(location.pathname), { headers: { "Accept": "application/json" } });
            const cfg = await r1.json();
            if (!cfg || cfg._bIsLoggedIn !== true) return { loggedIn: false, detail: "未登录（UiConfig._bIsLoggedIn=false）" };
            const idRow = cfg._idMemberRow || null;
            let name = "", profileUrl = "";
            if (idRow) {
                try {
                    const r2 = await fetch("/apiv13/Member/" + idRow + "/ProfilePage", { headers: { "Accept": "application/json" } });
                    const m = await r2.json();
                    name = (m && m._sName) || "";
                    profileUrl = (m && m._sProfileUrl) || "";
                } catch (e) { log("ProfilePage 失败:", e); }
            }
            return { loggedIn: true, idRow, name, profileUrl, detail: "已登录" };
        } catch (e) {
            return { loggedIn: false, detail: "检测失败: " + (e && e.message || e) };
        }
    }

    /* ---------- 发送到服务器 ---------- */

    /** 探测服务器在线 + 账号信息：GET /api/status（公开）→ 若需密码则 /api/login */

    /** 服务器自动登录：POST /api/login，返回 session cookie */

    /** 服务器账号状态：GET /api/gb-login-status（需 session） */
    async function serverAccount(base, session) {
        // 会话 cookie 名由内核 sessionHeaders 按服务端实际名拼接（本项目是 gbmd_session，
        // 旧写法硬编码 "session=" 会让服务端登录后带不上会话，表现为 401/未登录）
        const headers = sessionHeaders(session);
        const r = await gmRequest("GET", base + "/api/gb-login-status", undefined, 8000, headers);
        if (r.ok && r.json && r.json.ok) return { ok: true, info: r.json, status: r.status };
        return { ok: false, error: (r.json && r.json.error) || r.error || ("HTTP " + r.status), status: r.status };
    }

    /** 发送当前 mod 页链接：POST /api/receive { url } */
    async function refreshLocalCred(st, ta, info) {
        st.textContent = "读取本机 Cookie…"; st.className = "";
        const c = await readCookieGM();
        const L = [];
        L.push("GM_cookie 诊断: " + c.diag);
        L.push("完整 Cookie: " + c.text.length + " 字符 / " + c.count + " 项 ｜ 来源: " + c.source);
        L.push("含 sess: " + (c.text.indexOf("sess=") >= 0 ? "✅ 有" : "❌ 无"));
        L.push("含 rmc: " + (c.text.indexOf("rmc=") >= 0 ? "✅ 有" : "❌ 无"));
        st.textContent = L.join("\n");
        st.className = c.count > 0 ? "ok" : "err";
        ta.value = c.text;
        if (info) info.textContent += "\n" + L.slice(1).join("\n");
        if (c.diag !== "OK") info.textContent = "如果 GM_cookie 诊断显示『未定义/0 个』：请用 Violentmonkey 或 Firefox 的 Tampermonkey，并给脚本开启 cookie 权限后重试。";
    }

    /** 发送当前 mod 页链接到服务器 */
    async function srvInjectFlow() {
        if (!ensureUi()) return;
        const cur = currentServer();
        const base = cur ? cur.url : "";
        if (!base) { srvSetStatus("❌ 请先添加并选择服务器", "err"); return; }
        const btn = panelEl.querySelector("#{{IDP}}inject");
        if (btn) btn.disabled = true;
        try {
            srvSetStatus("正在连接服务器…", "info");
            const p = await probeServer(base);
            if (!p.ok) { srvSetStatus("注入失败：无法连接服务器 " + p.error, "err"); return; }
            let session = "";
            if (p.status && p.status.needsAuth) {
                const lg = await serverLogin(base, (cur && cur.password) || "");
                if (!lg.ok) { srvSetStatus("注入失败：服务器设有密码 " + lg.error, "err"); return; }
                session = lg.session;
            }
            srvSetStatus("正在读取服务器凭证…", "info");
            const got = await fetchServerCreds(base, session);
            if (!got.ok) { srvSetStatus("读取凭证失败：" + got.error, "err"); return; }
            const cred = got.cred || {};
            const cookieText = String(cred.cookie || "");
            if (!cookieText.trim()) { srvSetStatus("服务器没有可注入的 Cookie（gbCookie 为空）", "err"); return; }

            // 写入 cookie（document.cookie + GM_cookie.set 双域兜底）
            const n = applyCookieToBrowser(cookieText);
            const hasSess = /(?:^|;\s*)sess=/i.test(cookieText);
            if (n > 0) {
                srvSetStatus(`✅ 已写入 ${n} 个 Cookie 项` + (hasSess ? "（含 sess）" : "") + " —— 请刷新页面生效", "ok");
                showToast("✅ 登录态已注入，请刷新页面");
            } else {
                srvSetStatus("Cookie 写入失败（0 项），请确认已开启 GM_cookie 权限", "err");
            }
        } catch (e) {
            srvSetStatus("注入失败：" + (e && e.message || e), "err");
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ---------- 启动：只挂悬浮按钮，绝不自动弹面板 ---------- */
