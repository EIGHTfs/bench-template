// ============================================================
// HTTP 服务骨架（框架层）
// 项目只需传：config + routes + publicDir，框架负责其他一切。
// ============================================================
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const urlMod = require("url");

const { sendJson } = require("./http-utils");

// 完整 MIME 集合（合并 gbmd + iwara，项目可追加）
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

/**
 * 创建 HTTP 服务。
 *
 * @param {object} opts
 * @param {object}   opts.config       - 配置管理器（createConfig 返回值）
 * @param {object}   opts.auth         - 鉴权模块
 * @param {string}   opts.publicDir    - 静态文件目录（绝对路径）
 * @param {Array}    opts.routes       - 路由列表，每项 { prefix, handler }
 *   - prefix: "/api/auth"（匹配 pathname 前缀）
 *   - handler: createRoute() 返回的函数
 * @param {string}   [opts.loginPath]  - 登录页路径（默认 /login.html）
 * @param {object}   [opts.extraMime]  - 额外 MIME 类型
 * @param {function} [opts.onReady]    - 启动回调 (port)
 * @returns {http.Server}
 */
function createServer(opts) {
  const {
    config,
    auth,
    publicDir,
    routes = [],
    loginPath = "/login.html",
    extraMime = {},
    onReady,
  } = opts;

  const mime = { ...DEFAULT_MIME, ...extraMime };

  // 鉴权白名单（不需要登录就能访问）
  const authWhitelist = [
    loginPath,
    "/api/auth/",
  ];

  function needsAuth(pathname) {
    for (const w of authWhitelist) {
      if (pathname === w || pathname.startsWith(w)) return false;
    }
    // 静态资源（有扩展名）不鉴权
    if (path.extname(pathname)) return false;
    return true;
  }

  // 静态文件
  function serveStatic(res, pathname) {
    let filePath = path.join(publicDir, pathname);
    if (pathname.endsWith("/")) filePath = path.join(filePath, "index.html");
    if (!filePath.startsWith(publicDir)) return false;

    try {
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
      const ext = path.extname(filePath).toLowerCase();
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        "Content-Type": mime[ext] || "application/octet-stream",
        "Content-Length": content.length,
        "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
      });
      res.end(content);
      return true;
    } catch {
      return false;
    }
  }

  // 主请求处理器
  async function handleRequest(req, res) {
    const url = urlMod.parse(req.url, true);
    const pathname = decodeURIComponent(url.pathname);

    // 鉴权检查
    if (needsAuth(pathname)) {
      const token = auth.extractToken(req);
      if (!token || !auth.isValidSession(token)) {
        if (pathname.startsWith("/api/")) {
          return sendJson(res, { ok: false, error: "未登录" }, 401);
        }
        res.writeHead(302, { Location: loginPath });
        return res.end();
      }
    }

    // 路由分发：按 prefix 匹配，去掉前缀后传给 handler
    const ctx = { cfg: config, auth, sendJson };
    for (const { prefix, handler } of routes) {
      if (!pathname.startsWith(prefix)) continue;
      const subPath = pathname.slice(prefix.length) || "/";
      const subUrl = urlMod.parse(subPath + (url.search || ""), true);
      req._originalUrl = url;
      if (await handler(req, res, subUrl, ctx)) return;
    }

    // 静态文件
    if (serveStatic(res, pathname)) return;

    // 404
    sendJson(res, { error: "未找到" }, 404);
  }

  // 创建服务
  const server = http.createServer(handleRequest);
  const port = config.get("port") || 3000;

  server.listen(port, () => {
    console.log(`服务启动: http://localhost:${port}`);
    if (onReady) onReady(port);
  });

  return server;
}

module.exports = { createServer, DEFAULT_MIME };
