function bindSettingsSecurity() {
  const gbLoginBtn = $("#loginCheckBtn");
  if (gbLoginBtn) gbLoginBtn.addEventListener("click", checkGbLoginStatus);
  checkGbLoginStatus();
  $("#changePwdBtn").addEventListener("click", async () => {
    const pwd = $("#newPwd").value;
    const old = $("#oldPwd").value;
    if (pwd.length < 4) { $("#pwdStatus").textContent = "密码至少 4 位"; return; }
    try {
      const r = await api("/api/change-password", "POST", { oldPassword: old, password: pwd });
      if (!r.ok) throw new Error(r.error || "修改失败");
      $("#pwdStatus").textContent = "密码已修改";
      $("#pwdStatus").className = "status ok";
      $("#newPwd").value = "";
      $("#oldPwd").value = "";
    } catch (e) {
      $("#pwdStatus").textContent = e.message;
      $("#pwdStatus").className = "status err";
    }
  });
  $("#exportDataBtn").addEventListener("click", async () => {
    const st = $("#dataStatus");
    st.textContent = "正在导出…";
    st.className = "status";
    try {
      const r = await fetch("/api/data/export", withAuth({}));
      if (r.status === 401) { location.href = "/login.html"; return; }
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "导出失败"); }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gbmd-userdata-" + new Date().toISOString().slice(0, 10) + ".zip";
      a.click();
      URL.revokeObjectURL(a.href);
      st.textContent = "✅ 已导出用户数据 zip（含全部清单文件）";
      st.className = "status ok";
    } catch (e) {
      st.textContent = "导出失败: " + (e && e.message || e);
      st.className = "status err";
    }
  });
  $("#importDataBtn").addEventListener("click", () => { $("#importDataFile").click(); });
  $("#importDataFile").addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    const st = $("#dataStatus");
    if (!file) return;
    st.textContent = "正在导入 " + file.name + " …";
    st.className = "status";
    try {
      const b64 = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
      if (!b64) throw new Error("读取文件失败");
      const r = await api("/api/data/import", "POST", { data: b64 });
      if (!r.ok) throw new Error(r.error || "导入失败");
      st.textContent = `✅ 导入完成：恢复 ${r.restored.length} 个文件，跳过 ${r.skipped.length} 个` + (r.note ? "。" + r.note : "");
      st.className = "status ok";
    } catch (e) {
      st.textContent = "导入失败: " + (e && e.message || e);
      st.className = "status err";
    } finally {
      ev.target.value = "";
    }
  });
}

/** 设置-HTML反查/索引重建 */
