    /** 面板 DOM 骨架（本项目特化；由模板 28-ui.js 的 ensureUi 通过 buildPanelHtml 钩子调用） */
    function buildPanelHtml() {
        return `
<div id="{{IDP}}head"><b>GameBanana 下载助手</b><span id="{{IDP}}close">✕</span></div>
<div id="{{IDP}}userbar">打开即可发送；没配置凭证时才采集本机 Cookie</div>
<div id="{{IDP}}body">
  <label>📤 发送到服务器（当前 mod 页链接 → 服务器自行解析下载，不读 Cookie）</label>
  <div id="{{IDP}}server-row">
    <select id="{{IDP}}server"></select>
    <button id="{{IDP}}send">📤 发送</button>
  </div>
  <div id="{{IDP}}srv-actions">
    <button id="{{IDP}}add">➕ 添加</button>
    <button id="{{IDP}}del">🗑 删除</button>
    <button id="{{IDP}}inject">🔄 注入登录态到浏览器</button>
  </div>
  <div id="{{IDP}}add-form">
    <input id="{{IDP}}url-new" placeholder="http://IP:端口" spellcheck="false">
    <input id="{{IDP}}pwd-new" type="password" placeholder="访问密码（可空）" autocomplete="off">
    <div id="{{IDP}}srv-actions">
      <button id="{{IDP}}add-ok">确认添加</button>
      <button id="{{IDP}}add-cancel">取消</button>
    </div>
  </div>
  <div id="{{IDP}}srv-status"></div>
  <div id="{{IDP}}local">
    <label>完整 Cookie（仅服务器没有凭证时采集；含 HttpOnly 需 GM_cookie）</label>
    <textarea id="{{IDP}}cookie" readonly spellcheck="false"></textarea>
    <div id="{{IDP}}btns">
      <button id="{{IDP}}copy-all">📋 复制完整 Cookie（粘贴到服务器设置页）</button>
    </div>
  </div>
  <div id="{{IDP}}status"></div>
  <div id="{{IDP}}info"></div>
</div>
`;
    }

    /** 面板事件绑定（与 buildPanelHtml 的 id 一一对应） */
    function bindPanelEvents() {
                panelEl.querySelector("#{{IDP}}close").addEventListener("click", () => { panelEl.style.display = "none"; });
                panelEl.querySelector("#{{IDP}}copy-all").addEventListener("click", async () => {
                    const c = await readCookieGM();
                    copyText(c.text, c.text ? "✅ 已复制完整 Cookie" : "❌ 未读到 Cookie（看诊断）");
                });
                panelEl.querySelector("#{{IDP}}send").addEventListener("click", doSend);
                panelEl.querySelector("#{{IDP}}add").addEventListener("click", () => {
                    panelEl.querySelector("#{{IDP}}add-form").style.display = "block";
                    panelEl.querySelector("#{{IDP}}url-new").value = "";
                    panelEl.querySelector("#{{IDP}}pwd-new").value = "";
                });
                panelEl.querySelector("#{{IDP}}add-cancel").addEventListener("click", () => {
                    panelEl.querySelector("#{{IDP}}add-form").style.display = "none";
                });
                panelEl.querySelector("#{{IDP}}add-ok").addEventListener("click", addServerFromForm);
                panelEl.querySelector("#{{IDP}}del").addEventListener("click", deleteSelectedServer);
                panelEl.querySelector("#{{IDP}}server").addEventListener("change", () => {
                    const url = panelEl.querySelector("#{{IDP}}server").value;
                    const hit = loadServerList().find((it) => it.url === url);
                    if (!hit) return;
                    storeSet(SRV_KEY, hit.url);
                    storeSet(SRV_PWD_KEY, hit.password);
                    openPanel();
                });
                panelEl.querySelector("#{{IDP}}inject").addEventListener("click", srvInjectFlow);
    }



    /** 打开面板即检测：服务器在线 + 账号；服务器有凭证就不读本机 cookie */
    async function openPanel() {
        if (!ensureUi()) return;
        panelEl.style.display = "block";
        const ub = panelEl.querySelector("#{{IDP}}userbar");
        const st = panelEl.querySelector("#{{IDP}}status");
        const ta = panelEl.querySelector("#{{IDP}}cookie");
        const info = panelEl.querySelector("#{{IDP}}info");
        ub.className = "{{IDP}}userbar";
        ub.textContent = "正在检测服务器…";
        st.textContent = ""; st.className = ""; ta.value = ""; info.textContent = "";

        fillServerSelect();
        const cur = currentServer();
        let srv = cur ? cur.url : "";
        let pwd = cur ? cur.password : "";

        // 服务器地址为空 → 提示配置
        if (!normalizeServerBase(srv)) {
            ub.textContent = "未配置服务器地址：在上方填 gbmd 服务器地址后点「💾 记住地址」";
            ub.className = "{{IDP}}userbar err";
            panelEl.classList.remove("server-ok");
            return;
        }
        const p = await probeServer(srv);
        if (!p.ok) {
            ub.textContent = "❌ 无法连接服务器: " + p.error;
            ub.className = "{{IDP}}userbar err";
            panelEl.classList.remove("server-ok");
            return;
        }
        // 需要密码则自动登录
        let session = "";
        if (p.status && p.status.needsAuth) {
            const lg = await serverLogin(p.base, pwd);
            if (!lg.ok) {
                ub.textContent = "❌ 服务器设有密码：" + lg.error + "（在上方填访问密码）";
                ub.className = "{{IDP}}userbar err";
                panelEl.classList.remove("server-ok");
                return;
            }
            session = lg.session;
        }
        // 同步当前浏览器 UA 到服务器（GB 会话绑定完整 UA）
        syncUserAgent(p.base, session);
        const acc = await serverAccount(p.base, session);
        panelEl.classList.toggle("server-ok", !!(acc.ok && acc.info && acc.info.cookieSet));
        if (acc.ok && acc.info && acc.info.loggedIn) {
            const days = acc.info.remainingDays !== null && acc.info.remainingDays !== undefined ? `（剩 ${acc.info.remainingDays} 天）` : "";
            ub.textContent = `✅ 服务器已登录: ${acc.info.username}${days}`;
            ub.className = "{{IDP}}userbar " + (acc.info.warnLevel === "warn" ? "warn" : "ok");
            info.textContent = "服务器已有凭证，直接发送即可；本机 Cookie 不读取不展示。";
            panelEl.classList.add("server-ok");
            // 自动填充当前 mod 链接提示
            const u = currentModUrl();
            if (u) info.textContent += "\n当前 mod: " + u;
        } else if (acc.ok && acc.info) {
            // 2026-10-08 修：原来「没有凭证」和「有凭证但 GB 会话失效」共用同一句
            //   「○ 服务器未配置凭证」——服务端明明已存 2096 字符 Cookie（cookieSet=true）却报未配置，
            //   排查时会被带偏（实测：/api/cred ok=true，/api/gb-login-status loggedIn=false）。
            //   现在按 cookieSet 分流，并把服务端的 detail 原样带出来。
            // 2026-11-27：两种「服务端不可用」都先尝试本机自动回传，成功就不用用户手动粘 Cookie。
            const stale = !!acc.info.cookieSet;
            ub.textContent = stale ? "⚠️ 服务器凭证失效，正在本机采集并自动回传…" : "○ 服务器未配置凭证，正在本机采集并自动回传…";
            ub.className = "{{IDP}}userbar warn";
            panelEl.classList.remove("server-ok");
            const pushed = await pushCredsAndRecheck(p.base, session);
            if (pushed.ok && pushed.info && pushed.info.loggedIn) {
                // 回传并复检成功：按已登录渲染
                const days = pushed.info.remainingDays !== null && pushed.info.remainingDays !== undefined ? `（剩 ${pushed.info.remainingDays} 天）` : "";
                ub.textContent = `✅ 已自动回传并登录: ${pushed.info.username}${days}`;
                ub.className = "{{IDP}}userbar " + (pushed.info.warnLevel === "warn" ? "warn" : "ok");
                info.textContent = "已从本机自动采集 Cookie 回传服务器，服务端复检登录成功。";
                panelEl.classList.add("server-ok");
                const u = currentModUrl();
                if (u) info.textContent += "\n当前 mod: " + u;
                return;
            }
            // 自动回传没成功：说清是「本机读不全」还是「回传/复检失败」，再退回手动路径
            const why = pushed.reason === "no-sess"
                ? "本机读不到 sess（HttpOnly 登录票据），无法自动回传"
                : (pushed.error || pushed.recheckError || "自动回传失败");
            ub.textContent = stale ? "⚠️ 服务器有凭证但 GB 会话已失效（自动回传未成功）" : "○ 服务器未配置凭证（自动回传未成功）";
            ub.className = "{{IDP}}userbar " + (stale ? "warn" : "err");
            info.textContent = "自动回传未成功：" + why
                + (stale ? "\n服务端说明: " + (acc.info.detail || "") : "")
                + "\n可手动复制完整 Cookie（含 HttpOnly 的 sess）粘到服务器设置页。";
            await refreshLocalCred(st, ta, info);
        } else {
            ub.textContent = "❌ 服务器状态获取失败: " + (acc.error || "");
            ub.className = "{{IDP}}userbar err";
            panelEl.classList.remove("server-ok");
        }
    }

    /** 读本机 cookie 展示到面板（仅服务器没凭证时） */
