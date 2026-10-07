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
            ub.textContent = "○ 服务器未配置凭证";
            ub.className = "{{IDP}}userbar err";
            panelEl.classList.remove("server-ok");
            info.textContent = "服务器还没凭证：先点「📋 复制完整 Cookie」把本机 Cookie 粘到服务器设置页，或直接发送（服务器会提示需要 Cookie）。";
            await refreshLocalCred(st, ta, info);
        } else {
            ub.textContent = "❌ 服务器状态获取失败: " + (acc.error || "");
            ub.className = "{{IDP}}userbar err";
            panelEl.classList.remove("server-ok");
        }
    }

    /** 读本机 cookie 展示到面板（仅服务器没凭证时） */
