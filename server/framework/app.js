// HTTP 服务骨架（框架层）
// 项目只需传：config + routes + publicDir，框架负责其他一切。
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const urlMod = require("url");

const { sendJson } = require("./http-utils");

const DEFAULT_PORT = 3000;
const CACHE_MAX_AGE = 3600;

const DEFAULT_MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".m3u": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".flv": "video/x-flv",
  ".mpd": "application/dash+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function isWhitelisted(pathname, whitelist) {
  for (const entry of whitelist) {
    if (pathname === entry || pathname.startsWith(entry)) return true;
  }
  return false;
}

function serveStaticFile(res, publicDir, pathname, mime) {
  let filePath = path.join(publicDir, pathname);
  if (pathname.endsWith("/")) filePath = path.join(filePath, "index.html");
  if (!filePath.startsWith(publicDir)) return false;

  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath);
    const cacheControl = ext === ".html" ? "no-cache" : "public, max-age=" + CACHE_MAX_AGE;
    res.writeHead(200, {
      "Content-Type": mime[ext] || "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": cacheControl,
    });
    res.end(content);
    return true;
  } catch (_) { return false; }
}

function dispatchAuth(req, res, pathname, auth, loginPath) {
  const hasExt = path.extname(pathname);
  if (hasExt) return true; // 静态资源不鉴权
  if (isWhitelisted(pathname, [loginPath, "/api/auth/"])) return true;

  const token = auth.extractToken(req);
  if (token && auth.isValidSession(token)) return true;

  if (pathname.startsWith("/api/")) {
    sendJson(res, { ok: false, error: "未登录" }, 401);
  } else {
    res.writeHead(302, { Location: loginPath });
    res.end();
  }
  return false;
}

async function dispatchRoutes(req, res, url, pathname, routes, ctx) {
  for (const { prefix, handler } of routes) {
    if (!pathname.startsWith(prefix)) continue;
    const subPath = pathname.slice(prefix.length) || "/";
    const subUrl = urlMod.parse(subPath + (url.search || ""), true);
    req._originalUrl = url;
    if (await handler(req, res, subUrl, ctx)) return true;
  }
  return false;
}

/**
 * 创建 HTTP 服务。
 * @param {object} opts
 * @param {object}   opts.config       - 配置管理器
 * @param {object}   opts.auth         - 鉴权模块
 * @param {string}   opts.publicDir    - 静态文件目录
 * @param {Array}    opts.routes       - 路由列表 [{ prefix, handler }]
 * @param {string}   [opts.loginPath]  - 登录页路径
 * @param {object}   [opts.extraMime]  - 额外 MIME
 * @param {function} [opts.onReady]    - 启动回调
 */
function createServer(opts) {
  const {
    config, auth, publicDir, routes = [],
    loginPath = "/login.html", extraMime = {}, onReady,
  } = opts;

  const mime = { ...DEFAULT_MIME, ...extraMime };

  async function handleRequest(req, res) {
    const url = urlMod.parse(req.url, true);
    const pathname = decodeURIComponent(url.pathname);

    if (!dispatchAuth(req, res, pathname, auth, loginPath)) return;

    const ctx = { cfg: config, auth, sendJson };
    if (await dispatchRoutes(req, res, url, pathname, routes, ctx)) return;
    if (serveStaticFile(res, publicDir, pathname, mime)) return;

    sendJson(res, { error: "未找到" }, 404);
  }

  const server = http.createServer(handleRequest);
  const port = config.get("port") || DEFAULT_PORT;

  server.listen(port, () => {
    console.log("服务启动: http://localhost:" + port);
    if (onReady) onReady(port);
  });

  return server;
}

module.exports = { createServer, DEFAULT_MIME };
