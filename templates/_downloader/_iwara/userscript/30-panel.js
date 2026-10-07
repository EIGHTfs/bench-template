    /** 面板 DOM 骨架（本项目特化；由模板 28-ui.js 的 ensureUi 通过 buildPanelHtml 钩子调用） */
    function buildPanelHtml() {
        return `
<div id="{{IDP}}head"><b>Iwara 下载助手</b><span id="{{IDP}}close">✕</span></div>
<div id="{{IDP}}userbar">打开即可发送；凭证按失效时间缓存</div>
<div id="{{IDP}}body">
  <label>📤 发送到服务器（当前视频链接 → 服务器自行解析下载，不读 Cookie）</label>
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
    <label>完整 Cookie（仅服务器没有凭证时采集；含 cf_clearance 需 GM_cookie）</label>
    <textarea id="{{IDP}}cookie" readonly spellcheck="false"></textarea>
    <label>refresh_token</label>
    <textarea id="{{IDP}}token" readonly spellcheck="false"></textarea>
    <label>access_token</label>
    <textarea id="{{IDP}}atoken" readonly spellcheck="false"></textarea>
    <div id="{{IDP}}btns">
      <button id="{{IDP}}copy-all">📋 复制全部（粘贴到服务器设置页即可）</button>
      <button id="{{IDP}}copy-cookie">📋 仅复制 Cookie</button>
      <button id="{{IDP}}refresh-cred">🔄 强制刷新凭证并回传</button>
    </div>
  </div>
  <div id="{{IDP}}status"></div>
  <div id="{{IDP}}info"></div>
</div>`;
    }

    /** 面板事件绑定（与 panelHtml 的 id 一一对应） */
    function bindPanelEvents() {
        panelEl.querySelector("#{{IDP}}close").addEventListener("click", () => { panelEl.style.display = "none"; });
        panelEl.querySelector("#{{IDP}}copy-all").addEventListener("click", async () => {
            const p = await buildPayload();
            copyText(p, "✅ 已复制全部凭证").then((ok) => setStatus(ok ? "✅ 已复制全部（Cookie+Token）" : "❌ 复制失败", ok ? "ok" : "err"));
        });
        panelEl.querySelector("#{{IDP}}copy-cookie").addEventListener("click", async () => {
            let c = cacheGet(COOKIE_CACHE_KEY);
            if (!c || !c.text) c = await getCookieCached(true);
            copyText(c && c.text || "", "✅ 已复制 Cookie").then((ok) => setStatus(ok ? "✅ 已复制 Cookie" : "❌ 复制失败", ok ? "ok" : "err"));
        });
        panelEl.querySelector("#{{IDP}}refresh-cred").addEventListener("click", () => syncFromServer(true));
        panelEl.querySelector("#{{IDP}}send").addEventListener("click", srvSendFlow);
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

    /** 底部提示条：创建 + 挂载（幂等） */
    function openPanel() {
        if (!ensureUi()) return;
        panelEl.style.display = "block";
        try { fillInstant(); } catch (e) { log("fillInstant", e); }
        if (accountCacheFresh()) {
            renderServerAccount(lastAccount.data);
            return;
        }
        setTimeout(() => { syncFromServer(false).catch((e) => log("syncFromServer", e)); }, 0);
    }

    function hideCtxMenu() {
        const m = document.getElementById("{{IDP}}ctx");
        if (m && m.parentNode) m.parentNode.removeChild(m);
    }

    function showCtxMenu(x, y, videoUrl) {
        hideCtxMenu();
        const m = document.createElement("div");
        m.id = "{{IDP}}ctx";
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "📤 发送到服务器";
        b.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            hideCtxMenu();
            srvSendFlow(videoUrl);
        });
        m.appendChild(b);
        document.documentElement.appendChild(m);
        const pad = 8;
        const w = m.offsetWidth || 188;
        const h = m.offsetHeight || 44;
        let left = x;
        let top = y;
        if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
        if (top + h > window.innerHeight - pad) top = window.innerHeight - h - pad;
        if (left < pad) left = pad;
        if (top < pad) top = pad;
        m.style.left = left + "px";
        m.style.top = top + "px";
    }
