    /** 面板样式（独立片段承载：CSS 体量大，放常量里便于项目覆盖与审阅） */
    const PANEL_CSS = `
#{{IDP}}fab{position:fixed;right:14px;bottom:14px;z-index:2147483647;width:56px;height:56px;border-radius:50%;
  padding:0;border:none;cursor:pointer;overflow:hidden;background:#fff;
  box-shadow:0 4px 16px rgba(0,0,0,.35);-webkit-tap-highlight-color:transparent;pointer-events:auto}
#{{IDP}}fab img{width:100%;height:100%;display:block;object-fit:cover}
#{{IDP}}panel{position:fixed;left:0;right:0;bottom:0;z-index:2147483647;max-height:80vh;overflow:auto;
  background:#fff;border-radius:16px 16px 0 0;box-shadow:0 -6px 30px rgba(0,0,0,.3);
  font:14px/1.6 system-ui,-apple-system,"Microsoft YaHei",sans-serif;color:#222;padding:0 0 16px}
#{{IDP}}head{position:sticky;top:0;background:#fff;padding:12px 16px;border-bottom:1px solid #eef1f5;
  display:flex;align-items:center;justify-content:space-between;z-index:1}
#{{IDP}}close{font-size:20px;color:#8a94a3;cursor:pointer;padding:0 6px}
#{{IDP}}body{padding:12px 16px}
#{{IDP}}body label{display:block;font-size:12px;color:#5a6472;margin:10px 0 4px}
#{{IDP}}body textarea{width:100%;box-sizing:border-box;resize:none;padding:8px;border:1px solid #c9cfd8;
  border-radius:8px;font:11px/1.5 ui-monospace,Consolas,monospace;background:#fafbfc;color:#222;overflow:auto}
#{{IDP}}cookie{height:80px}
#{{IDP}}token,#{{IDP}}atoken{height:48px}
#{{IDP}}btns{display:flex;flex-direction:column;gap:8px;margin-top:12px}
#{{IDP}}btns button{width:100%;padding:12px;border:none;border-radius:10px;cursor:pointer;font-size:15px;font-weight:600}
#{{IDP}}copy-all{background:#2f6fed;color:#fff}
#{{IDP}}copy-cookie{background:#eef4ff;color:#2f6fed;border:1px solid #c9dcff!important}
#{{IDP}}refresh-cred{background:#fff;color:#5a6472;border:1px solid #c9cfd8!important;font-weight:500!important}
#{{IDP}}panel.server-ok #{{IDP}}local{display:none}
#{{IDP}}status{margin-top:10px;font-size:13px;text-align:center;min-height:18px}
#{{IDP}}status.ok{color:#1a9d4b}
#{{IDP}}status.err{color:#d0392f}
#{{IDP}}info{margin-top:6px;padding:10px;background:#f7f9fc;border-radius:8px;font-size:13px;color:#5a6472}
#{{IDP}}userbar{margin:10px 16px 0;padding:12px 16px;background:#f0f7ff;border-radius:10px;
  font-size:14px;color:#1a3d6d;white-space:pre-wrap;line-height:1.6}
#{{IDP}}userbar.ok{background:#e8f7ee;color:#1a7a3a}
#{{IDP}}userbar.warn{background:#fff8e1;color:#8a5a00}
#{{IDP}}userbar.err{background:#fdecea;color:#b3392b}
#{{IDP}}toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:2147483647;
  background:rgba(20,24,30,.92);color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;
  max-width:86vw;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.3);display:none}
#{{IDP}}server-row{display:flex;gap:6px;margin-top:4px;align-items:center}
#{{IDP}}server{flex:1;min-width:0;padding:8px;border:1px solid #c9cfd8;border-radius:8px;
  font:13px/1.4 ui-monospace,Consolas,monospace;color:#222;background:#fafbfc}
#{{IDP}}pwd-row{display:flex;gap:6px;margin-top:4px}
#{{IDP}}add-form{display:none;margin-top:8px;padding:8px;background:#f7f9fc;border-radius:8px}
#{{IDP}}add-form input{width:100%;box-sizing:border-box;margin:4px 0;padding:8px;border:1px solid #c9cfd8;border-radius:8px}
#{{IDP}}send{background:#1a9d4b;color:#fff;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;
  font-weight:600;white-space:nowrap;font-size:13px}
#{{IDP}}send:disabled{background:#9cc9ac;cursor:wait}
#{{IDP}}srv-actions{display:flex;gap:8px;margin-top:8px}
#{{IDP}}srv-actions button{flex:1;padding:8px;border-radius:8px;cursor:pointer;font-size:13px}
#{{IDP}}save{background:#eef4ff;color:#2f6fed;border:1px solid #c9dcff}
#{{IDP}}srv-status{margin-top:8px;font-size:13px;min-height:18px;color:#5a6472}
#{{IDP}}srv-status.ok{color:#1a9d4b}
#{{IDP}}srv-status.err{color:#d0392f}
#{{IDP}}srv-status.info{color:#2f6fed}
#{{IDP}}ctx{position:fixed;z-index:2147483647;min-width:188px;background:#fff;border:1px solid #c9cfd8;
  border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.2);overflow:hidden;font:14px/1.4 system-ui,-apple-system,"Microsoft YaHei",sans-serif}
#{{IDP}}ctx button{display:block;width:100%;text-align:left;padding:12px 14px;border:none;background:#fff;
  color:#222;font-size:15px;cursor:pointer}
#{{IDP}}ctx button:active,#{{IDP}}ctx button:hover{background:#eef4ff}
a[href*="/video/"],a[href*="/v/"]{-webkit-touch-callout:none}
`;
