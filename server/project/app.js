// ============================================================
// 项目入口（正确接入方式）
//
// 项目只做三件事：
//   1. 定义配置 schema（config.schema.json）
//   2. 定义业务路由（用 createRoute 写 handler）
//   3. 调用 createServer() 传入配置
//
// 框架负责：HTTP 服务、鉴权门、静态文件、MIME、错误处理。
// 不改框架代码，只用框架接口。
// ============================================================
"use strict";

const path = require("path");
const {
  createConfig,   // ① 创建配置（传 schema 即可）
  createServer,   // ③ 启动服务（传配置 + 路由 + 静态目录）
  createRoute,    // ② 定义路由（传 handler 函数）
  sendJson,
  appLog,
  auth,
} = require("../framework");

// ---------- ① 配置 ----------
appLog.install();

const config = createConfig({
  configFile: path.join(__dirname, "..", "config.json"),
  schema: require("./config.schema.json"),
});

// 初始化鉴权（持久化会话到磁盘，重启免登录）
auth.init({
  sessionFile: path.join(__dirname, "..", "sessions.json"),
});

// ---------- CLI 参数 ----------
if (process.argv.includes("--set-password")) {
  const idx = process.argv.indexOf("--set-password");
  const pwd = process.argv[idx + 1];
  if (!pwd) { console.error("用法: node app.js --set-password \"密码\""); process.exit(1); }
  config.setPassword(pwd);
  console.log("密码已设置");
  process.exit(0);
}

// ---------- ② 业务路由 ----------

// 认证路由（挂到 /api/auth）
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

// 数据路由（挂到 /api/data）
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

// 下载路由（挂到 /api/download）——项目在这里实现下载逻辑
const downloadRoutes = createRoute({
  "GET /list": async (req, res, ctx) => {
    sendJson(res, { ok: true, items: [] });
  },

  "POST /start": async (req, res, ctx) => {
    const { url } = req.body || {};
    if (!url) return sendJson(res, { ok: false, error: "缺少 url" });
    // TODO: 项目实现下载逻辑
    sendJson(res, { ok: true, taskId: "demo-001" });
  },
});

// ---------- ③ 启动服务 ----------
createServer({
  config,
  auth,
  publicDir: path.join(__dirname, "public"),
  routes: [
    { prefix: "/api/auth",     handler: authRoutes },
    { prefix: "/api/data",     handler: dataRoutes },
    { prefix: "/api/download", handler: downloadRoutes },
    // 新路由加这里：{ prefix: "/api/xxx", handler: xxxRoutes },
  ],
  onReady(port) {
    console.log(`项目就绪，端口 ${port}`);
  },
});
