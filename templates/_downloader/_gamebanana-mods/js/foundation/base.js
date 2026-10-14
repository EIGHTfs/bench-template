// ============================================================
// GameBanana Mod Downloader - 前端主逻辑（tab + 轮询）
// ============================================================
"use strict";

const $ = (sel) => document.querySelector(sel);

let settings = null;
let searchResults = [];
// 2026-10-09：已渲染到列表里的 modId 集合（增量渲染用）。
// 背景（实测）：搜索任务每 2 秒轮询一次 → searchResults = t.results; renderSearchResults()，
//   而旧实现每次整块重建 #searchResultList.innerHTML ⇒ 用户刚勾的复选框被全部清空，
//   表现为「1680 项点全选后点下载无效」（实测：全选后 +145ms 勾中 1680，+830ms 变 0）；
//   同时 1680 行每 2 秒白重建一次。改为增量渲染：只追加尚未渲染的行，已有行的 DOM 与勾选状态保持不动。
let renderedIds = new Set();
let searchPollTimer = null;
let taskPollTimer = null;

// 会话 cookie 兜底（2026-10-14 实测故障）：
//   Cookie 按 host 隔离、**不看端口** —— 同一台机器有多个地址（多网卡 IP / 主机名 / zerotier），
//   换个地址打开就带不上 cookie，前端一遇 401 就跳登录页，表现为「刚登录又要登录」。
//   实测：gbmd 今天 3 次登录全部签了 30 天、服务端当天未重启，说明丢的不是服务端会话而是 cookie。
//   服务端 extractToken() 本就支持 Authorization: Bearer（server/auth/auth.js），
//   因此登录时把服务端返回的 token 存本地、请求时一并带上：cookie 丢失也能免登录。
const AUTH_TOKEN_KEY = "auth-token";
function readAuthToken() {
  try { return localStorage.getItem(AUTH_TOKEN_KEY) || ""; } catch (_) { return ""; }
}
function saveAuthToken(t) {
  try { t ? localStorage.setItem(AUTH_TOKEN_KEY, t) : localStorage.removeItem(AUTH_TOKEN_KEY); } catch (_) {}
}
/** 给请求配置补上 Bearer 头；没有 token 时原样返回（不影响原有 cookie 鉴权） */
function withAuth(opts) {
  const o = Object.assign({}, opts || {});
  const t = readAuthToken();
  if (t) o.headers = Object.assign({}, o.headers || {}, { Authorization: "Bearer " + t });
  return o;
}

async function api(path, method = "GET", body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, withAuth(opts));
  if (r.status === 401) {
    location.href = "/login.html";
    throw new Error("未登录");
  }
  return r.json();
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 2026-08-31 优美化：统一状态行写入（文本 + 样式），替代散落的 textContent/className 样板
function setStatus(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = type && type !== "status" ? "status " + type : "status";
}

// 2026-09-02 任务 json 导出：浏览器端生成 Blob 下载文件
function downloadJsonFile(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename || "download.json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 300);
}

// 2026-09-01 悬浮提示（右下角 toast，自动淡出；保存设置等操作反馈用）
let _toastTimer = null;
function showToast(msg, type) {
  let el = $("#appToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "appToast";
    el.className = "app-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = "app-toast " + (type === "err" ? "err" : "ok") + " show";
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.classList.remove("show"); }, 3200);
}

function fmtTs(ts) {
  if (!ts) return "-";
  const d = new Date(ts * 1000);
  return isNaN(d.getTime()) ? "-" : d.toLocaleString("zh-CN", { hour12: false });
}

function typeIcon(t) {
  switch (t) {
    case "file": return "📦";
    case "image": return "🖼";
    case "blocked": return "🚫";
    case "skipped": return "⏭";
    case "error": return "⚠";
    default: return "•";
  }
}

function typeLabel(t) {
  switch (t) {
    case "file": return "文件";
    case "image": return "图片";
    case "blocked": return "已屏蔽";
    case "skipped": return "已忽略";
    case "error": return "错误";
    default: return t;
  }
}

// ---------- Tab 切换 ----------
