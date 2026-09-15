# dl-server-template

零依赖 Node.js 下载器服务的前端模板仓库。从 gbmd（GameBanana Mod Downloader）和 iwara-downloader 的共用前端中提炼，模板只负责**前端 HTML 部件组装**，后端 JS 不在模板。

## 背景

gbmd 和 iwara 是同一架构的两个项目：零依赖 CJS Node.js HTTP 服务 + 路由拆分 + 前端 SPA + start.sh 启停脚本。两者前端结构高度重合。每次改一个项目的前端，另一个项目要手动同步——容易漏、容易分叉。

本模板把**前端**抽成部件（每个部件一个 HTML，setup.sh 引用组装成完整前端），后端 JS 留在各自旧项目（`gamebanana-mods-downloader` / `iwara-downloader`）。

## 架构设计

```
dl-server-template/              ← 模板仓库（本仓库）
├── server/
│   ├── framework/               ← 通用 JS（两个风格共用，直接复用不改）
│   │   ├── app.js               # HTTP 服务骨架（路由注册 + 静态文件 + 鉴权门）
│   │   ├── config-loader.js     # 配置加载器（schema 驱动）
│   │   ├── auth.js              # 鉴权框架（session CRUD + cookie + 过期清理）
│   │   ├── route-factory.js     # 路由工厂（createRoute）
│   │   ├── data-backup.js       # 数据备份（createBackup）
│   │   ├── app-log.js           # 日志（console 加时间戳）
│   │   ├── json-dir.js          # JSON 目录存储
│   │   ├── cjs-bootstrap.cjs    # CJS 引导（零依赖项目）
│   │   ├── search-date-range.cjs # 日期范围工具（后端）
│   │   ├── http-utils.js        # HTTP 工具（sendJson/readBody）
│   │   ├── fs-async.js          # fs 异步封装
│   │   ├── html-utils.js        # HTML 工具
│   │   └── index.js             # 框架统一出口
│   ├── templates/               ← 前端素材（只读，setup.sh 组装）
│   │   ├── _shared/             # 两端共用前端（login.html/login.js/theme-init.js）
│   │   ├── _gbmd-style/public/  # gbmd 前端部件（index/app/setup/style/logo）
│   │   └── _iwara-style/public/ # iwara 前端部件（index/app/play/style/vendor）
│   └── project/                 ← 组装目标（前端生成物，可反复重装）
│       ├── app.js               # 项目入口骨架（require 框架 + 注册业务路由）
│       ├── config.schema.json   # 由旧项目提供（业务配置）
│       └── public/              # 由 setup.sh 组装（完整前端）
├── setup.sh                     # 前端组装脚本（只组装 public，支持 --with 混搭）
├── start.sh                     # 启停脚本（直接复用，只需改 PROJECT_NAME）
└── README.md
```

## 后端 JS 去向（2026-09-16 定）

后端 JS **不在模板仓库**：

| 分类 | 去向 |
|---|---|
| 通用 JS（两端共用） | `server/framework/`（本仓库） |
| gbmd 特有 JS（lib/routes） | `gamebanana-mods-downloader/server/`（旧项目，同步回） |
| iwara 特有 JS（lib/routes） | `iwara-downloader/server/`（旧项目，同步回） |
| 前端部件（public） | `server/templates/*/public/`（本仓库，setup.sh 组装） |

改模板前端 → `./setup.sh <风格>` 重新组装即生效。改后端逻辑 → 直接在旧项目改（模板不承载后端代码）。

## 前端组装（setup.sh）

```bash
./setup.sh              # 查看可用风格与组件
./setup.sh gbmd         # 组装 gbmd 风格前端 → server/project/public/
./setup.sh iwara        # 组装 iwara 风格前端
./setup.sh gbmd --with play   # gbmd 风格 + iwara 播放器部件
./setup.sh reset        # 清空 server/project/public/
```

组装逻辑：`_shared/`（共用部件）→ 复制进 public/ → 风格部件（`_gbmd-style/public/` 或 `_iwara-style/public/`）覆盖同名文件 → `--with` 组件从另一风格叠加前端文件（同名不覆盖，以主风格为准）。

### 混搭组件（--with）

| 组件 | 来源 | 前端内容 |
|---|---|---|
| `play` | iwara | play.html + play-app.js + vendor/artplayer.js + iwara-logo.png |
| `setup` | gbmd | setup.html + setup-init.js + path-picker.js + logo.png |
| `video` | iwara | （无独立前端文件，随主风格） |
| `merge` | gbmd | （无独立前端文件，随主风格） |
| `search` | iwara | search-date-range.js |

**混搭边界**：前端主应用（`index.html + app.js + style.css`）是整体，二选一不可拆；前端附加页（play.html/setup.html/vendor/）可自由跨风格叠加。

## 框架接口（server/framework/）

```js
// 项目入口只需：
const framework = require('../framework');
const app = framework.createServer({
  config: require('./config.schema.json'),
  publicDir: path.join(__dirname, 'public'),
  routes: [
    { prefix: '/api/auth', handler: require('./routes/auth') },
    // ... 业务路由（后端 JS 在旧项目，项目层自行组织）
  ],
  onReady(port) { console.log(`服务启动: http://localhost:${port}`); }
});
```

路由工厂：

```js
const { createRoute } = require('../framework/route-factory');
module.exports = createRoute({
  'GET /list': async (req, res, ctx) => { /* ... */ },
  'POST /start': async (req, res, ctx) => { /* ... */ },
});
```

## 前端部件组织

每个风格一个 `public/` 目录，部件文件：

| 部件 | 说明 |
|---|---|
| `index.html` | 主页面（引用 app.js / theme-init.js / style.css） |
| `app.js` | 主应用逻辑（搜索/下载/设置交互） |
| `theme-init.js` | 主题初始化（独立 script，避免内联 XSS） |
| `login.html` / `login.js` | 登录页（_shared 共用） |
| `style.css` | 样式（CSS 变量，两端共用变量名） |

## 约束

- **零依赖**：不引入 npm 包，保持零依赖特性
- **CJS 优先**：框架层保持 `require()`，不强制 ESM
- **模板只装前端**：templates/ 下只有 public 前端素材，无后端 JS
- **后端归项目**：业务 lib/routes 在各自旧项目维护，模板不承载