// ============================================================
// HTTP 服务骨架（框架层）
// 项目只需传配置 + 路由，框架负责：HTTP 服务、静态文件、鉴权门、MIME。
// 来源：从 gbmd/iwara server/app.js 提炼共用骨架。
// ============================================================
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const urlMod = require("url");

const { sendJson } = require("./http-utils");
const { isBrowsableDir, isBlocked } = require("./path-safe");

// 完整 MIME 集合（合并 gbmd + iwara）
const MIME = {
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
 * @param {object} opts
 * @param {string} opts.publicDir 静态文件目录
 * @param {object} opts.config 配置管理器（createConfig 返回值）
 * @param {object} opts.auth 鉴权模块
 * @param {function} opts.routes 路由处理器 (req, res, url, ctx) => boolean
 * @param {function} [opts.onReady] 启动回调 (port)
 * @param {string} [opts.loginPath] 登录页路径（默认 /login.html）
 * @param {object} [opts.extraMime] 额外 MIME 类型
 * @returns {http.Server}
 */
function createServer(opts) {
  const {
    publicDir,
    config,
    auth,
    routes,
    onReady,
    loginPath = "/login.html",
    extraMime = {},
  } = opts;

  const mime = { ...MIME, ...extraMime };

  // 鉴权白名单（不需要登录就能访问的路径）
  const authWhitelist = new Set([loginPath, "/api/auth/login", "/api/auth/status"]);

  function isWhitelisted(pathname) {
    if (authWhitelist.has(pathname)) return true;
    if (pathname.startsWith("/api/auth/")) return true;
    // 静态资源（.html/.js/.css/.png 等）在登录页前可访问
    const ext = path.extname(pathname);
    if (ext && mime[ext]) return true;
    return false;
  }

  // 静态文件服务
  function serveStatic(res, pathname) {
    let filePath = path.join(publicDir, pathname);
    if (pathname.endsWith("/")) filePath = path.join(filePath, "index.html");

    // 安全检查
    if (!filePath.startsWith(publicDir)) {
      sendJson(res, { error: "禁止访问" }, 403);
      return true;
    }

    try {
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mime[ext] || "application/octet-stream";
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        "Content-Type": contentType,
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
    if (!isWhitelisted(pathname)) {
      const token = auth.extractToken(req);
      if (!token || !auth.isValidSession(token)) {
        // API 请求返回 401，页面请求重定向登录
        if (pathname.startsWith("/api/")) {
          sendJson(res, { ok: false, error: "未登录" }, 401);
        } else {
          res.writeHead(302, { Location: loginPath });
          res.end();
        }
        return;
      }
    }

    // 路由处理
    const ctx = { cfg: config, auth, sendJson };
    if (await routes(req, res, url, ctx)) return;

    // 静态文件
    if (serveStatic(res, pathname)) return;

    // 404
    sendJson(res, { error: "未找到" }, 404);
  }

  // 创建 HTTP 服务
  const server = http.createServer(handleRequest);

  // 启动
  const port = config.get("port") || 3000;
  server.listen(port, () => {
    console.log(`服务启动: http://localhost:${port}`);
    if (onReady) onReady(port);
  });

  return server;
}

module.exports = { createServer, MIME };
