// ============================================================
// 示例项目入口（使用框架）
// 新项目 clone 后改这个文件，注册自己的业务路由。
// ============================================================
"use strict";

const path = require("path");
const {
  createConfig, createServer, createRoute, groupRoutes, sendJson,
  appLog, auth,
} = require("../framework");

// ---------- 安装日志 ----------
appLog.install();

// ---------- 加载配置（项目只需传 schema） ----------
const config = createConfig({
  configFile: path.join(__dirname, "..", "config.json"),
  schema: require("./config.schema.json"),
});

// ---------- 业务路由示例 ----------

// 认证路由
const authRoutes = createRoute({
  "POST /login": async (req, res, ctx) => {
    const { password } = req.body || {};
    if (!password) return sendJson(res, { ok: false, error: "请输入密码" });
    if (!ctx.cfg.verifyPassword(password)) {
      return sendJson(res, { ok: false, error: "密码错误" }, 401);
    }
    const session = ctx.auth.createSession({ hours: ctx.cfg.get("sessionHours") });
    res.setHeader("Set-Cookie", `token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${session.hours * 3600}`);
    sendJson(res, { ok: true });
  },

  "GET /status": async (req, res, ctx) => {
    const token = ctx.auth.extractToken(req);
    sendJson(res, { ok: true, loggedIn: !!(token && ctx.auth.isValidSession(token)) });
  },

  "POST /logout": async (req, res, ctx) => {
    const token = ctx.auth.extractToken(req);
    if (token) ctx.auth.destroySession(token);
    res.setHeader("Set-Cookie", "token=; Path=/; HttpOnly; Max-Age=0");
    sendJson(res, { ok: true });
  },
});

// 示例数据路由
const dataRoutes = createRoute({
  "GET /info": async (req, res, ctx) => {
    sendJson(res, {
      ok: true,
      name: "dl-server-template",
      version: "0.1.0",
      downloadDir: ctx.cfg.get("downloadDir"),
    });
  },
});

// ---------- 启动服务 ----------
const routes = groupRoutes(
  createRoute({}), // 无匹配时返回 false
);

// 注册业务路由到 app.js 骨架（这里简化为直接写路由分发）
// 实际项目中，routes 由 createServer 的 opts.routes 传入
// 这里为了演示，直接在 createServer 外面处理

const server = require("http").createServer(async (req, res) => {
  const urlMod = require("url");
  const url = urlMod.parse(req.url, true);
  const pathname = decodeURIComponent(url.pathname);

  const ctx = { cfg: config, auth, sendJson };

  // 认证路由
  if (pathname.startsWith("/api/auth/")) {
    const sub = pathname.replace("/api/auth", "");
    req.url = sub || "/";
    if (await authRoutes(req, res, urlMod.parse(req.url, true), ctx)) return;
  }

  // 数据路由
  if (pathname.startsWith("/api/data/")) {
    const sub = pathname.replace("/api/data", "");
    req.url = sub || "/";
    if (await dataRoutes(req, res, urlMod.parse(req.url, true), ctx)) return;
  }

  // 静态文件
  const publicDir = path.join(__dirname, "public");
  let filePath = path.join(publicDir, pathname);
  if (pathname.endsWith("/")) filePath = path.join(filePath, "index.html");

  const fs = require("fs");
  const { MIME } = require("../framework");
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(content);
      return;
    }
  } catch {}

  sendJson(res, { error: "未找到" }, 404);
});

const port = config.get("port") || 3000;
server.listen(port, () => {
  console.log(`示例服务启动: http://localhost:${port}`);
});
