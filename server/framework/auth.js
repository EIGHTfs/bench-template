// 鉴权框架（通用）
// 密码 scrypt 哈希存储；登录成功签发随机 session token
// 存内存 Map + HttpOnly Cookie；可选持久化到磁盘。
"use strict";

const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

let SESSION_FILE = null;
const sessions = new Map(); // token -> { expiresAt, hours, deviceId }

/**
 * 初始化鉴权模块。
 * @param {object} opts
 * @param {string} [opts.sessionFile] 持久化文件路径（不传则纯内存）
 */
function init(opts = {}) {
  SESSION_FILE = opts.sessionFile || null;
  if (!SESSION_FILE) return;
  try {
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
    for (const [token, info] of Object.entries(data)) {
      if (info.expiresAt > Date.now()) sessions.set(token, info);
    }
  } catch (_) { /* 文件不存在或损坏，从空会话开始 */ }
}

function persist() {
  if (!SESSION_FILE) return;
  try {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(Object.fromEntries(sessions), null, 2));
  } catch (_) { /* 写盘失败不影响内存会话 */ }
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
  const session = sessions.get(token);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
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
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
  if (match) return match[1];
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

function pruneExpired() {
  let count = 0;
  for (const [token, session] of sessions) {
    if (session.expiresAt <= Date.now()) { sessions.delete(token); count++; }
  }
  if (count) persist();
  return count;
}

function loadSessions() {
  return sessions.size;
}

module.exports = { init, createSession, isValidSession, destroySession, extractToken, pruneExpired, loadSessions };
