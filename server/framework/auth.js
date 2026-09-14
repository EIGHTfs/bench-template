// ============================================================
// 鉴权框架（通用）
// 密码 scrypt 哈希存储；登录成功签发随机 session token
// 存内存 Map + HttpOnly Cookie；可选持久化到磁盘。
// 来源：从 gbmd/iwara auth.js 提炼共用接口。
// ============================================================
"use strict";

const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

let SESSION_FILE = null; // 持久化文件路径（init 时设置）
const sessions = new Map(); // token -> { expiresAt, hours, deviceId }

/**
 * 初始化鉴权模块。
 * @param {object} opts
 * @param {string} [opts.sessionFile] 持久化文件路径（不传则纯内存）
 */
function init(opts = {}) {
  SESSION_FILE = opts.sessionFile || null;
  if (SESSION_FILE) {
    try {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
      for (const [token, info] of Object.entries(data)) {
        if (info.expiresAt > Date.now()) sessions.set(token, info);
      }
    } catch {}
  }
}

function persist() {
  if (!SESSION_FILE) return;
  try {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(Object.fromEntries(sessions), null, 2));
  } catch {}
}

function createSession(opts = {}) {
  const hours = opts.hours || 72;
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    expiresAt: Date.now() + hours * 3600 * 1000,
    hours,
    deviceId: opts.deviceId || null,
  });
  persist();
  return { token, hours };
}

function isValidSession(token) {
  const s = sessions.get(token);
  if (!s) return false;
  if (s.expiresAt <= Date.now()) {
    sessions.delete(token);
    persist();
    return false;
  }
  return true;
}

function destroySession(token) {
  sessions.delete(token);
  persist();
}

function extractToken(req) {
  // Cookie
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)token=([^;]+)/);
  if (m) return m[1];
  // Authorization header
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

function pruneExpired() {
  let count = 0;
  for (const [token, s] of sessions) {
    if (s.expiresAt <= Date.now()) { sessions.delete(token); count++; }
  }
  if (count) persist();
  return count;
}

function loadSessions() {
  // 兼容旧接口：返回当前会话数
  return sessions.size;
}

module.exports = { init, createSession, isValidSession, destroySession, extractToken, pruneExpired, loadSessions };
