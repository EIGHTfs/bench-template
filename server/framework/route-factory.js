// ============================================================
// 路由工厂：把 handler 函数注册到 HTTP 路由
// 项目路由文件只需导出 handler 函数，框架处理：JSON 响应、错误捕获、body 解析。
// 来源：从 gbmd/iwara 的 routes/*.js 提炼共用模式。
// ============================================================
"use strict";

const { sendJson, readBody } = require("./http-utils");

/**
 * 创建路由处理器。
 * @param {object} handlers - { 'GET /path': fn, 'POST /path': fn, ... }
 *   fn 签名：async (req, res, ctx) => void
 *   ctx 包含：{ cfg, auth, sendJson, readBody, ...项目注入的上下文 }
 * @returns {function} (req, res, url, ctx) => boolean（是否处理了请求）
 */
function createRoute(handlers) {
  // 预解析路由表
  const table = [];
  for (const [key, fn] of Object.entries(handlers)) {
    const parts = key.split(/\s+/);
    const method = parts[0].toUpperCase();
    const pattern = parts[1] || "/";
    // 简单路径匹配（支持 /api/list/:id 模式）
    const re = new RegExp(
      "^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"
    );
    table.push({ method, re, fn });
  }

  return async function routeHandler(req, res, url, ctx) {
    const pathname = url.pathname;
    const method = req.method;

    for (const { method: m, re, fn } of table) {
      if (method !== m) continue;
      const match = pathname.match(re);
      if (!match) continue;

      // 解析 body（POST/PUT/PATCH）
      if (method === "POST" || method === "PUT" || method === "PATCH") {
        try {
          req.body = await readBody(req);
        } catch {
          req.body = {};
        }
      }

      // 提取路由参数
      req.params = match.groups || {};

      try {
        await fn(req, res, ctx);
      } catch (err) {
        console.error(`[route] ${method} ${pathname} error:`, err.message);
        sendJson(res, { ok: false, error: err.message || "内部错误" }, 500);
      }
      return true;
    }
    return false;
  };
}

/**
 * 创建路由组（多个路由合并）。
 * @param  {...function} routes - 多个 createRoute 返回值
 * @returns {function} 合并后的路由处理器
 */
function groupRoutes(...routes) {
  return async function(req, res, url, ctx) {
    for (const route of routes) {
      if (await route(req, res, url, ctx)) return true;
    }
    return false;
  };
}

module.exports = { createRoute, groupRoutes };
