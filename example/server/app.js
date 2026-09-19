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
  routesAuth,     // 框架层通用认证路由（登录/登出/改密 + 公开的 /api/status）
  sendJson,
  readBody,
  appLog,
  auth,
} = require("./core/index.js");
const { tableFromRegister } = require("./route/routes-adapter.js");

// ---------- 自研路由（example 项目自己的代码） ----------
// server/routes/** 不在模板里、不在清单里，组装/check 都不管 —— 改它≠改模板。
// routes/items.js 演示「项目自研 API + 假数据页面」：读 json/items.json 出列表。
const itemsRoutes = require("./routes/items.js");

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

// 认证路由：用框架层的 routes-auth（登录/登出/改密 + **公开**的 /api/status）。
// 不要自己写一份 —— 各项目各写会导致逻辑漂移（remember 有无、改密是否验旧密码、
// 会话文件落 server/ 还是 json/ 都曾不一致），框架层已收敛为唯一实现。
// routes-auth 是闭包式（register(api)），用 routes-adapter 转成表式即可直接用；
// 其中公开路由挂在返回值的 .public 上，要作为独立路由表挂载 + 列进 publicRoutes。
// ⚠ /api/status 必须公开：start.sh 的健康检查就打它，挂在鉴权门后会一直 401，
//   启动被判「失败」而服务其实是好的（实测踩坑）。
const authRoutes = tableFromRegister(routesAuth, {
  sendJson, readBody, cfg: config, auth,
  setSessionCookie(res, token, hours) {
    res.setHeader("Set-Cookie",
      `${auth.cookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${hours * 3600}`);
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

// HTML 片段组装：public/ 下的页面里写 <!-- @frag:名称 -->，运行时由组装器
// 从 public/fragments/ 取对应片段替换。缺这段，页面会原样输出 @frag 注释
// （页面结构看着「没坏」，但内容全是空的 —— 实测踩坑）。
// pages：页面名 → 框架文件；style.css 也走片段（CSS 里用 /* @frag:名称 */）。
const PUBLIC_DIR = path.join(__dirname, "public");
const FRAGMENT_PAGES = ["index.html", "style.css", "login.html", "setup.html"];
const fragmentPages = {};
for (const name of FRAGMENT_PAGES) {
  const f = path.join(PUBLIC_DIR, name);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) fragmentPages[name] = f;
}
// 品牌配置：@brand:key 指令替换用；不存在则保留原注释（不报错）
let brandConf = null;
try {
  const bf = path.join(PUBLIC_DIR, "brand.json");
  if (fs.existsSync(bf)) brandConf = JSON.parse(fs.readFileSync(bf, "utf8"));
} catch (_) { brandConf = null; }

createServer({
  config,
  auth,
  publicDir: PUBLIC_DIR,
  fragments: Object.keys(fragmentPages).length
    ? { dir: path.join(PUBLIC_DIR, "fragments"), pages: fragmentPages, watch: true, brand: brandConf }
    : null,
  routes: [
    // 公开路由（含 /api/status）——prefix 为 ""，路径自带 /api/ 全称
    { prefix: "",              handler: authRoutes.public },
    { prefix: "/api/data",     handler: dataRoutes },
    { prefix: "/api/download", handler: downloadRoutes },
    // 自动更新路由（挂到 /api/auto-update）
    { prefix: "/api/auto-update", handler: autoUpdateRoutes },
    // 需鉴权的认证路由（改密等；登录/登出/状态在 public 表里）
    { prefix: "",              handler: authRoutes },
    // 自研路由（挂根前缀，路径自带 /api/ 全称）：items 列表 + 自研演示页
    { prefix: "", handler: itemsRoutes },
    // 新路由加这里：{ prefix: "/api/xxx", handler: xxxRoutes },
  ],
  // 认证前放行的路径：健康检查打 /api/status，不加这里会 401 → start.sh 判启动失败
  publicRoutes: ["/api/status", "/api/login", "/api/logout", "/api/items", "/self-demo"],
  onReady(port) {
    // 启动后启用自动更新（config.autoUpdate 控制，默认关）
    autoUpdate.start(config.readConfig().autoUpdate || { enabled: false });
    console.log(`项目就绪，端口 ${port}`);
  },
});
