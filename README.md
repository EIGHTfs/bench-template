# dl-server-template

零依赖 Node.js 下载器服务脚手架模板。从 gbmd（GameBanana Mod Downloader）和 iwara-downloader 的共用架构中提炼，新项目 clone 后只填业务代码。

## 背景

gbmd 和 iwara 是同一架构的两个项目：零依赖 CJS Node.js HTTP 服务 + 路由拆分 + 前端 SPA + start.sh 启停脚本。两者 19 个文件同名，其中 4 个几乎一模一样，其余结构相同但细节不同。每次改一个项目的功能（修 bug、加特性），另一个项目要手动同步——容易漏、容易分叉。

本模板把**框架层**（与业务无关的部分）抽出来，项目只实现**业务层**。

## 架构设计

```
dl-server-template/              ← 模板仓库（本仓库）
├── server/
│   ├── framework/               ← 框架层（直接复用，不改）
│   │   ├── app.js               # HTTP 服务骨架（路由注册 + 静态文件 + 鉴权门）
│   │   ├── config-loader.js     # 配置加载器（schema 驱动，项目传 schema）
│   │   ├── auth.js              # 鉴权框架（session CRUD + cookie + 过期清理）
│   │   ├── app-log.js           # 日志（console 重定向到文件 + stderr）
│   │   ├── json-dir.js          # JSON 目录存储（读/写/列表）
│   │   ├── data-backup.js       # 数据备份（定时 + 旋转 + 通知）
│   │   ├── http-utils.js        # HTTP 工具（sendJson/readBody/parseCredentialText）
│   │   ├── path-safe.js         # 路径安全（防遍历/系统目录拦截）
│   │   ├── fs-async.js          # fs 异步封装（ensureDir/copyRecursive 等）
│   │   ├── html-utils.js        # HTML 工具（escape/index.html 生成）
│   │   └── index.js             # 框架统一出口
│   └── project/                 ← 项目层（每个项目只填这里）
│       ├── app.js               # 项目入口（require 框架 + 注册业务路由）
│       ├── config.schema.json   # 配置 schema（字段/默认值/类型）
│       ├── lib/                 # 业务模块（API 客户端、索引、下载器等）
│       ├── routes/              # 业务路由（搜索、下载、设置等）
│       └── public/              # 前端（HTML/CSS/JS）
├── start.sh                     # 启停脚本（直接复用，只需改 PROJECT_NAME）
├── test/                        # 测试
└── README.md
```

## 模块接口设计

### 框架层：config-loader.js

```js
// 项目只需传 schema，框架负责加载/保存/校验
const config = require('./framework/config-loader');

// schema 示例（项目提供 config.schema.json）
{
  "port": { "type": "number", "default": 3000 },
  "sessionHours": { "type": "number", "default": 72 },
  "downloadDir": { "type": "string", "required": true },
  "sourceApi": { "type": "string", "default": "https://api.example.com" }
}

// 导出接口
config.readConfig()          // 读配置（合并默认值）
config.writeConfig(patch)    // 写配置（合并）
config.setPassword(pwd)      // 设置密码（scrypt 哈希）
config.get(field)            // 快捷读单字段
```

### 框架层：auth.js

```js
const auth = require('./framework/auth');

// 导出接口（与现有两个项目完全一致）
auth.loadSessions()                    // 加载会话
auth.createSession(opts)               // 创建会话（可选 hours/deviceId）
auth.isValidSession(token)             // 校验会话
auth.destroySession(token)             // 销毁会话
auth.extractToken(req)                 // 从请求提取 token
auth.pruneExpired()                    // 清理过期会话
```

### 框架层：app.js（HTTP 服务骨架）

```js
// 项目入口只需：
const framework = require('./framework');
const app = framework.createServer({
  config: require('./config.schema.json'),
  publicDir: path.join(__dirname, 'public'),
  routes: [
    { prefix: '/api/auth', handler: require('./routes/auth') },
    { prefix: '/api/search', handler: require('./routes/search') },
    { prefix: '/api/download', handler: require('./routes/download') },
    // ... 项目业务路由
  ],
  onReady(port) {
    console.log(`服务启动: http://localhost:${port}`);
  }
});
```

### 框架层：路由工厂（route-factory.js）

```js
// 常见路由模式工厂化，项目只需传 handler
const { createRoute } = require('./framework/route-factory');

// 项目路由文件只需导出 handler 函数
module.exports = createRoute({
  // 自动处理：JSON 响应、错误捕获、401 检查、body 解析
  'GET /list': async (req, res, ctx) => { /* ... */ },
  'POST /start': async (req, res, ctx) => { /* ... */ },
  'GET /status': async (req, res, ctx) => { /* ... */ },
});
```

### 框架层：前端公共模块（public/framework.js）

```js
// 前端公共函数（两个项目完全一致的部分）
export function api(path, method, body) { /* fetch + 401 处理 */ }
export function esc(s) { /* HTML 转义 */ }
export function setStatus(el, msg, type) { /* 状态行统一写入 */ }
export function showToast(msg, type) { /* 右下角 toast */ }
export function fmtSize(b) { /* 文件大小格式化 */ }
export function fmtSpeed(s) { /* 速度格式化 */ }
export function downloadJsonFile(obj, filename) { /* JSON 文件下载 */ }
```

## 模块提取对照表

| 模块 | gbmd 来源 | iwara 来源 | 提取策略 |
|---|---|---|---|
| `fs-async.js` | `server/utils/fs-async.js` (74行) | 同名 (74行, diff 4) | 直接复制，合并差异 |
| `app-log.js` | `server/lib/app-log.js` (37行) | 同名 (36行, diff 5) | 直接复制 |
| `json-dir.js` | `server/lib/json-dir.js` (39行) | 同名 (39行, diff 4) | 直接复制 |
| `html-utils.js` | `server/utils/html.js` (12行) | 同名 (11行, diff 4) | 直接复制 |
| `http-utils.js` | `server/utils/http.js` (97行) | 同名 (98行, diff 55) | 合并，抽出差异为参数 |
| `path-safe.js` | `server/utils/path-safe.js` (66行) | 同名 (52行, diff 96) | 抽接口，项目传配置 |
| `config-loader.js` | `server/config.js` (292行) | 同名 (150行, diff 321) | 重写为 schema 驱动 |
| `auth.js` | `server/auth.js` (118行) | 同名 (70行, diff 105) | 抽接口，差异外置 |
| `data-backup.js` | `server/lib/data-backup.js` (274行) | 同名 (235行, diff 67) | 抽接口，差异外置 |
| `app.js` | `server/app.js` (入口) | 同名 (入口) | 框架化，项目传配置 |
| `start.sh` | `start.sh` | `start.sh` | 直接复制 |
| `MIME 类型` | app.js 内 | app.js 内 (多视频类型) | 合并为完整集合 |
| 前端公共函数 | `public/app.js` 开头 | `public/app.js` 开头 | 抽为 `framework.js` |

## 项目迁移步骤

### gbmd 迁移

1. clone dl-server-template
2. 把 `server/config.js` 的字段搬到 `config.schema.json`
3. 把 `server/lib/gb-api.js`、`search.js`、`mapping.js` 等搬到 `server/project/lib/`
4. 把 `server/routes/games.js`、`merge.js` 等搬到 `server/project/routes/`
5. 写 `server/project/app.js`（require 框架 + 注册路由）
6. `start.sh` 改 PROJECT_NAME
7. 测试通过后替换原仓库

### iwara 迁移

1. clone dl-server-template
2. 同上，把 iwara 特有模块搬到 `server/project/`
3. 写 `server/project/app.js`
4. 测试通过后替换原仓库

## 优先级

| 阶段 | 内容 | 工作量 |
|---|---|---|
| **P0** | 框架层代码（fs-async/app-log/json-dir/html-utils/http-utils/auth/config-loader） | 1天 |
| **P1** | app.js 骨架 + 路由工厂 + start.sh | 0.5天 |
| **P2** | 前端公共模块 (framework.js) + CSS 变量化 | 0.5天 |
| **P3** | gbmd 迁移验证 | 1天 |
| **P4** | iwara 迁移验证 | 1天 |

## 约束

- **零依赖**：不引入 npm 包，保持现有项目的零依赖特性
- **CJS 优先**：保持 `require()`，不强制 ESM（项目可自行在 project/ 层用 ESM）
- **向后兼容**：框架层的 API 与现有两个项目的导出接口尽量一致，减少迁移改动
- **可独立使用**：模板仓库本身能 `node server/project/app.js` 启动（带示例路由）
