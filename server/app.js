// ============================================================
// 组装蓝图：项目入口示例（blueprint/app.js）
//
// 这是「新项目/旧项目组装」时的入口骨架参考：
//   setup.sh 组装时若目标 server/ 没有 app.js，会从本文件复制初始化。
//   项目只做三件事：
//     1. 定义配置 schema（config.schema.json）
//     2. 定义业务路由（用 createRoute 写 handler）
//     3. 调用 createServer() 传入配置
//   框架负责：HTTP 服务、鉴权门、静态文件、MIME、错误处理。
//   不改框架代码，只用框架接口。
//
// 组装后：app.js / config.schema.json / public/ / routes/ / lib/
//   都在目标项目的 server/ 下（生成物，不入库，可反复重装）。
// ============================================================
"use strict";

const path = require("path");
const fs = require("fs");
const {
  createConfig,   // ① 创建配置（传 schema 即可）
  createServer,   // ③ 启动服务（传配置 + 路由 + 静态目录）
  createRoute,    // ② 定义路由（传 handler 函数）
  createAutoUpdate, // ④ 自动更新（可选）
  sendJson,
  appLog,
  auth,
// 框架路径：组装后 app.js 与 framework/ 同级（同在 server/ 下）
} = require("./framework");

// ---------- ① 配置 ----------
appLog.install();

const SCHEMA_FILE = path.join(__dirname, "config.schema.json");
if (!fs.existsSync(SCHEMA_FILE)) {
  console.error("❌ 未找到 config.schema.json —— 请先运行 ./setup.sh <风格> 组装项目层（风格见 ./setup.sh --list）");
  process.exit(1);
}

const config = createConfig({
  configFile: path.join(__dirname, "..", "config.json"),
  schema: require(SCHEMA_FILE),
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
      name: "bench-template",
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

// ---------- ④ 自动更新（可选）----------
// 配置 autoUpdate: { enabled, mode: "watch|git|github", interval, githubRepo, githubBranch, githubToken }
//   watch   = 监控 server/ 文件变更 → 防抖重启（默认）
//   git     = 定时 git pull → 有变更重启（需 .git）
//   github  = 定时从 GitHub 拉取 → 应用并重启（无需 .git，需 githubRepo）
const autoUpdate = createAutoUpdate({
  projectName: "my-project",        // User-Agent / 日志前缀
  defaultRepo: "owner/my-project",  // github 模式缺省仓库
  extraExclude: ["json/data.json"], // github 模式下绝不覆盖的运行态文件
});

// 自动更新路由（挂到 /api/auto-update）
const autoUpdateRoutes = createRoute({
  "GET /status": async (req, res, ctx) => {
    const cfgNow = ctx.cfg.readConfig();
    const cfg = Object.assign({}, cfgNow.autoUpdate || {});
    delete cfg.githubToken; // 脱敏
    sendJson(res, { ok: true, config: cfg, status: autoUpdate.getStatus() });
  },
  "POST /restart": async (req, res) => {
    autoUpdate.scheduleRestart();
    sendJson(res, { ok: true, message: "2 秒后重启" });
  },
  "POST /check": async (req, res) => {
    const au = (ctx.cfg.readConfig().autoUpdate || {});
    if (!au.enabled || au.mode !== "github") {
      return sendJson(res, { ok: false, error: "仅 github 模式支持手动检查" }, 400);
    }
    const before = autoUpdate.getStatus().lastCheck || null;
    autoUpdate.checkGitHubUpdate(au);
    let result = null;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const now = autoUpdate.getStatus().lastCheck || null;
      if (now && now !== before) { result = now; break; }
    }
    sendJson(res, { ok: true, check: result });
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
    // 自动更新路由（挂到 /api/auto-update）
    { prefix: "/api/auto-update", handler: autoUpdateRoutes },
    // 新路由加这里：{ prefix: "/api/xxx", handler: xxxRoutes },
  ],
  onReady(port) {
    // 启动后启用自动更新（config.autoUpdate 控制，默认关）
    autoUpdate.start(config.readConfig().autoUpdate || { enabled: false });
    console.log(`项目就绪，端口 ${port}`);
  },
});
