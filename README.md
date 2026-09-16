# dl-server-template

零依赖 Node.js 下载器服务的模板仓库：**通用后端框架（framework）+ 前端部件素材（templates）+ 组装脚本（setup.sh）**。

用它可以建立一个新的下载器服务项目，也可以把已有的旧项目改成「组装式」（前端由模板素材组装生成，不再手改）。

---

## 一分钟上手（建新项目）

```bash
# 1. 建目录
mkdir my-downloader && cd my-downloader

# 2. 从模板仓库同步素材（在模板仓库里执行，目标指向新项目的 server/）
<模板仓库>/scripts/sync-to-project.sh "$PWD/server"
# 例如：/path/to/dl-server-template/scripts/sync-to-project.sh "$PWD/server"

# 3. 组装前端（选一个风格：gbmd 或 iwara）
cd server
./setup.sh gbmd --to .        # 生成 server/public/（13 个前端文件）+ 蓝图初始化 app.js

# 4. 写业务后端（app.js 里填业务路由；蓝图为起点），然后启动
cp <模板仓库>/start.sh ..
cp <模板仓库>/package.json ..
cd ..
./start.sh start              # 默认 restart；未启动时相当于 start
```

访问 `http://<本机IP>:<端口>`（端口在 `server/config.json` 的 `port`，默认 8642）。

> 首次访问会引导设置密码（鉴权门由 framework 提供）。
>
> 注意：`sync-to-project.sh` 必须**在模板仓库里执行**（脚本以自身位置为素材源）。在项目自身里执行会被拒绝（防自毁）。

### 直接复制模板当新项目（不用 sync）

```bash
cp -r dl-server-template my-downloader
cd my-downloader/server
mv ../setup.sh .              # setup.sh 移到 server/ 下就地组装
./setup.sh gbmd --to .        # 素材已在 server/ 下（framework/ + templates/ + project/blueprint/）
cd .. && ./start.sh start
```

---

## 三个概念

| 概念 | 位置 | 说明 |
|---|---|---|
| **framework** | `server/framework/` | 通用后端 JS（HTTP 服务/鉴权/配置/路由工厂/备份/自动更新）。两个风格共用，改它两个项目同时受益 |
| **templates** | `server/templates/` | 前端素材：`_shared/`（两端共用）+ `_gbmd-style/public/` + `_iwara-style/public/`（各风格 HTML 部件） |
| **blueprint** | `server/project/blueprint/` | 组装蓝图：`app.js`（项目入口骨架）+ `config.schema.json`。组装时目标没有就从这里复制 |
| **组装产物** | `server/public/`、`server/app.js`、`server/config.schema.json` | 由 setup.sh 生成，**不入库**，可反复重装 |

后端业务代码（`server/routes/`、`server/lib/`）由项目自己实现，**不在模板仓库**。

---

## 命令速查

### 同步素材（把模板能力搬到项目）

```bash
./scripts/sync-to-project.sh <目标server目录>
# 例：./scripts/sync-to-project.sh /path/to/my-downloader/server
```

同步内容：`framework/` + `templates/` + `project/blueprint/` + `setup.sh`（覆盖式，模板为权威）。目标项目的 `app.js` / `public/` / `routes/` / `lib/` 不动。

### 组装前端

```bash
./setup.sh --list                      # 查看风格与组件
./setup.sh gbmd                        # 组装到 server/project/（缺省，测试用）
./setup.sh gbmd --to .                 # 组装到当前目录（项目 server/）
./setup.sh gbmd --to /path/to/proj/server
./setup.sh iwara --with play,search    # iwara 风格 + 混搭组件
```

组装逻辑：`_shared/` → 复制进目标 `public/` → 风格部件覆盖同名 → `--with` 组件从另一风格叠加（同名不覆盖，以主风格为准）。

### 混搭组件（`--with`）

| 组件 | 来源 | 前端内容 |
|---|---|---|
| `play` | iwara | play.html + play-app.js + vendor/artplayer.js + iwara-logo.png |
| `setup` | gbmd | setup.html + setup-init.js + path-picker.js + logo.png |
| `search` | iwara | search-date-range.js |
| `video` / `merge` | iwara / gbmd | 随主风格（无独立前端文件） |

**混搭边界**：主应用（`index.html + app.js + style.css`）是整体，二选一不可拆；附加页（play.html / setup.html / vendor/）可跨风格叠加。

### 启停

```bash
./start.sh start      # 启动
./start.sh stop       # 停止
./start.sh restart    # 重启（默认动作）
./start.sh status     # 状态
```

PID 写在项目根 `<项目目录名>.pid`。

---

## 框架接口

项目入口只做三件事（完整示例见 `server/project/blueprint/app.js`）：

```js
const {
  createConfig, createServer, createRoute, createAutoUpdate,
  sendJson, appLog, auth,
} = require("../framework");   // 已同步素材时路径为 ./framework

// ① 配置（schema 驱动）
appLog.install();
const config = createConfig({
  configFile: path.join(__dirname, "..", "config.json"),
  schema: require("./config.schema.json"),
});
auth.init({ sessionFile: path.join(__dirname, "..", "sessions.json") });

// ② 业务路由
const myRoutes = createRoute({
  "GET /list": async (req, res, ctx) => sendJson(res, { ok: true, items: [] }),
  "POST /start": async (req, res, ctx) => {
    const { url } = req.body || {};            // framework 已解析 body
    if (!url) return sendJson(res, { ok: false, error: "缺少 url" });
    sendJson(res, { ok: true, taskId: "t1" });
  },
});

// ③ 启动（框架负责 HTTP 服务/鉴权门/静态文件/MIME/错误捕获）
createServer({
  config,
  auth,
  publicDir: path.join(__dirname, "public"),
  routes: [
    { prefix: "/api/my", handler: myRoutes },
  ],
  onReady(port) { console.log("就绪 " + port); },
});
```

### framework 导出清单

| 导出 | 作用 |
|---|---|
| `createConfig({ configFile, schema })` | 配置加载/保存/校验（schema 驱动） |
| `createServer({ config, auth, publicDir, routes, onReady })` | HTTP 服务 + 鉴权门 + 静态文件 |
| `createRoute({ 'GET /path': fn })` | 路由工厂（handler 签名 `(req, res, ctx)`，返回 true=已处理） |
| `groupRoutes(...routes)` | 多个路由合并 |
| `createAutoUpdate({ projectName, defaultRepo, extraExclude })` | 自动更新（watch/git/github 三模式） |
| `createBackup(...)` | 数据备份 |
| `sendJson` / `readBody` / `parseCredentialText` / `cleanCookie` | HTTP 工具 |
| `fsAsync` / `htmlUtils` / `appLog` / `jsonDir` / `auth` | 模块（日志、JSON 目录、鉴权等） |
| `DEFAULT_MIME` | 默认 MIME 表 |

---

## 自动更新（可选）

三种模式，`server/config.json` 的 `autoUpdate` 控制：

```json
{
  "autoUpdate": {
    "enabled": false,
    "mode": "watch",
    "interval": 300,
    "githubRepo": "owner/repo",
    "githubBranch": "main",
    "githubToken": ""
  }
}
```

| 模式 | 行为 | 前提 |
|---|---|---|
| `watch`（默认） | 监控 `server/` 文件变更 → 防抖 2 秒 → 重启 | 无 |
| `git` | 定时 `git pull` → 有变更则重启 | 项目有 `.git` |
| `github` | 定时查 GitHub 最新 commit → 拉 tarball 应用 → 重启 | 配 `githubRepo`；私有仓库才需 `githubToken` |

**github 模式保护**：`server/config.json`、`json/` 运行态数据、`*.log`、`*.pid`、`.bak`、`node_modules` 等不会被覆盖；项目特有运行态文件用 `extraExclude` 追加：

```js
const autoUpdate = createAutoUpdate({
  projectName: "my-downloader",       // 日志前缀 + User-Agent
  defaultRepo: "owner/my-downloader", // github 模式缺省仓库
  extraExclude: ["json/my-data.json"],// 绝不覆盖的运行态文件
});
```

重启走 `./start.sh restart`（项目唯一启停入口）。

---

## 前端部件组织

主页面由「蓝图框架 + 片段」组装而成（运行期由 framework 组装器按注释指令拼接）：

| 位置 | 内容 |
|---|---|
| `blueprint/index.html/downloader/index.html` | **共同框架**：页面骨架 + `<!-- @frag:片段名 -->` 注释指令（两个风格共用，唯一权威） |
| `blueprint/fragments/` | **通用分片**：两风格逐字相同的块（`tabs` / `no-pwd-warn` / `global-hud` / `browse-mask` / `topbar` 骨架） |
| `templates/_gbmd-style/fragments/` | **gbmd 特有分片**：`head-extra` / `topbar/{brand,badge,time,userscript}` / `tab-panel/panel-*` / `scripts` |
| `templates/_iwara-style/fragments/` | iwara 特有分片（迁移中） |

各风格仍带 `public/` 目录放非分片部件：

| 部件 | 说明 |
|---|---|
| `app.js` | 主应用逻辑（外部文件，避免内联 XSS） |
| `style.css` | 样式（CSS 变量） |
| `theme-init.js` | 主题初始化（独立 script） |
| `login.html` / `login.js` | 登录页（`_shared/` 共用） |
| `setup.html` / `setup-init.js` / `path-picker.js` | 设置向导（gbmd 风格） |
| `play.html` / `play-app.js` / `vendor/` | 播放页（iwara 风格） |

**片段指令约定**：框架里写 `<!-- @frag:片段名 -->`（可不带 `.html` 后缀；子目录写 `topbar/brand`），
片段内可再嵌 `@frag` 指令（递归展开，深度上限 8）。片段路径相对片段根目录（目标 `public/fragments/`）。

**HTML 部件约定**：JS 一律外部文件（`<script src="x.js"></script>`），不写内联 `<script>` 代码——内联代码在 XSS 抽取改造时容易残留裸 JS 文本被浏览器当页面内容渲染。仓库提供自检脚本：

```bash
node scripts/scan-bare-js-html.js server/templates        # 扫描裸 JS 残留
python3 scripts/fix-bare-js-html.py                       # 修复（含 .bak 备份）
```

**组装后目录**（目标 `public/`）：

```
public/
  index.html          ← 蓝图框架（含 @frag 指令，不是完整页面）
  fragments/          ← 通用分片 + 特有分片合并后的片段根
    topbar.html       ← 统一 topbar 骨架（含 topbar/* 子指令）
    topbar/brand.html ← 各风格品牌区（三行换行标题）
    tabs.html         ← 通用
    tab-panel/panel-*.html
```

改任一片段 → 刷新页面即生效（mtime 热更新，不重启服务）；改框架文件同理。

---

## 把旧项目改成组装式

旧项目（如 gamebanana-mods-downloader / iwara-downloader）的既有结构不动，只把前端改成组装生成：

```bash
# 1. 同步素材到旧项目（旧项目自带 framework + templates 副本）
./scripts/sync-to-project.sh /path/to/old-project/server

# 2. 组装前端到旧项目（覆盖 server/public/）
./setup.sh gbmd --to /path/to/old-project/server

# 3. 之后改模板前端 → 重跑第 2 步即同步生效；改后端逻辑 → 直接在旧项目改
```

旧项目的业务后端（`server/routes/`、`server/lib/`）保持原样，不受组装影响。

---

## 约束

- **零依赖**：不引入 npm 包；不建 `package.json` / lock 文件（父目录有 `"type":"module"` 时，用 `server/boot.cjs` 强制 CJS，见下）
- **CJS**：框架层用 `require()`
- **模板不承载业务后端**：业务 `routes/`、`lib/` 在项目侧维护
- **生成物不入库**：`server/project/*` 入 .gitignore，仅 `server/project/blueprint/` 白名单入库
- **单文件 ≤ 400 行**：超过按功能拆分

### 父目录 `"type":"module"` 兼容

若项目位于 `"type":"module"` 的目录树下（本项目工作区中的旧项目即如此），直接 `node server/app.js` 会把 `.js` 当 ESM 导致 `require` 报错。解决方式是加一个 `.cjs` 启动器（不再写本地 `package.json`）：

```js
// server/boot.cjs
require("./lib/cjs-bootstrap.cjs"); // CJS 强制（只劫持本项目根内的 .js）
require("./app.js");
```

`start.sh` 启动 `boot.cjs`，事件循环正常。

---

## 目录结构

```
dl-server-template/
├── server/
│   ├── framework/                 # 通用后端 JS（15 个模块）
│   │   ├── app.js                 # HTTP 服务骨架
│   │   ├── config-loader.js       # 配置加载（schema 驱动）
│   │   ├── route-factory.js       # 路由工厂 createRoute
│   │   ├── auth.js                # 鉴权（session + cookie）
│   │   ├── auto-update.js         # 自动更新 createAutoUpdate
│   │   ├── data-backup.js         # 数据备份
│   │   ├── http-utils.js          # sendJson / readBody
│   │   ├── cjs-bootstrap.cjs      # CJS 强制引导
│   │   └── index.js               # 统一出口
│   ├── templates/                 # 前端素材
│   │   ├── _shared/               # 共用部件（login / theme-init）
│   │   ├── _gbmd-style/
│   │   │   ├── public/            # gbmd 非分片部件（app.js / style.css 等）
│   │   │   └── fragments/         # gbmd 特有分片（topbar/ tab-panel/ 等）
│   │   └── _iwara-style/public/   # iwara 风格部件
│   └── project/
│       └── blueprint/             # 组装蓝图（入库）
│           ├── app.js             # 项目入口骨架
│           ├── config.schema.json # 配置 schema
│           ├── index.html/downloader/index.html   # 共同框架（@frag 指令）
│           └── fragments/         # 通用分片（tabs / topbar 骨架 等）
├── scripts/
│   ├── sync-to-project.sh         # 素材同步到项目
│   ├── scan-bare-js-html.js       # 裸 JS 残留扫描
│   ├── fix-bare-js-html.py        # 裸 JS 残留修复
│   └── func-index.js              # 函数索引（定向读取大文件）
├── setup.sh                       # 前端组装（支持 --to 任意目标）
├── start.sh                       # 启停脚本（start/stop/restart/status）
└── README.md
```
