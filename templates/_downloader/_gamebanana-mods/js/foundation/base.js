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

async function api(path, method = "GET", body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
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
