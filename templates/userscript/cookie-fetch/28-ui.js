            function notify(msg) {
                try { if (typeof GM_notification === "function") GM_notification({ text: msg, title: "{{NOTIFY_TITLE}}", timeout: 5000 }); } catch (_) {}
            }
    function uiHost() { return document.documentElement; }

    function mountUi(el) {
        const host = uiHost();
        if (!host || !el) return;
        if (el.parentNode !== host) host.appendChild(el);
    }

    /** 浮动按钮：创建 + 挂载（幂等；SPA 换页后 DOM 被替换会重新挂） */
    function ensureFab() {
        if (fabEl && document.documentElement.contains(fabEl)) return;
        if (!fabEl) {
            fabEl = document.createElement("button");
            fabEl.id = "{{IDP}}fab";
            fabEl.title = "Iwara 下载助手";
            const img = document.createElement("img");
            img.src = "{{ICON}}";   // 图标走配置占位符：各项目只提供 ICON，模板不依赖项目特有常量名（曾误用 IWARA_ICON 致别的项目 ReferenceError）
            img.alt = "Iwara";
            fabEl.appendChild(img);
            fabEl.addEventListener("click", openPanel);
        }
        mountUi(fabEl);
    }

    /** 面板 DOM 骨架（id 统一 {{IDP}} 前缀，组装时替换） */
    function ensureToast() {
        if (toastEl && document.documentElement.contains(toastEl)) return;
        if (!toastEl) {
            toastEl = document.createElement("div");
            toastEl.id = "{{IDP}}toast";
        }
        mountUi(toastEl);
    }

    /** 组装 UI：样式 + 浮动按钮 + 面板 + 提示条（幂等；供各处调用，只建一次） */
    function ensureUi() {
        if (!document.documentElement) return false;
        injectStyle();
        ensureFab();
        if (!panelEl || !document.documentElement.contains(panelEl)) {
            if (!panelEl) {
                panelEl = document.createElement("div");
                panelEl.id = "{{IDP}}panel";
                // 面板 DOM 与事件绑定由项目片段提供（buildPanelHtml / bindPanelEvents 钩子，拼接后同作用域）；
                // 项目未提供时留空壳也不报错——通用骨架（浮动按钮/提示条/服务器列表/探活登录）照常可用。
                panelEl.innerHTML = (typeof buildPanelHtml === "function") ? buildPanelHtml() : "";
                panelEl.style.display = "none";
                panelEl.classList.add("server-ok");
                if (typeof bindPanelEvents === "function") bindPanelEvents();
            }
            mountUi(panelEl);
        }
        ensureToast();
        return true;
    }

    function setStatus(msg, cls) {
        if (!panelEl) return;
        const el = panelEl.querySelector("#{{IDP}}status");
        el.textContent = msg;
        el.className = cls || "";
        setTimeout(() => { el.textContent = ""; el.className = ""; }, 3500);
    }
