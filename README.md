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
| **templates** | `server/templates/` | 前端素材：`_gbmd-style/`（gbmd 风格）+ `_iwara-style/`（iwara 风格），每个风格含 `public/`（非分片部件）+ `fragments/`（特有分片） |
| **blueprint** | `server/project/blueprint/` | 组装蓝图：共用框架/分片/静态资源 + `app.js`（入口骨架）+ `config.schema.json`。两风格共用文件（login、theme-init、search-date-range）在这里；组装时目标没有就从这里复制 |
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
./setup.sh gbmd                        # 组装到 server/project/（缺省，模板自测，用 blueprint 默认清单）
./setup.sh gbmd --to .                 # 组装到当前目录（项目根）
./setup.sh gbmd --to /path/to/proj     # 组装到指定项目根
./setup.sh iwara --with play,search    # iwara 风格 + 混搭组件
```

组装逻辑：按项目根的 `assemble.json` 逐项拷贝（详见下节）；蓝图框架与分片（HTML/CSS `@frag` 指令）在运行期由 framework 组装器拼装；`--with` 组件从另一风格叠加（同名不覆盖，以主风格为准）。

### assemble.json（按需取用）

每个要用模板的项目，在**项目根**放一份 `assemble.json`，声明「我要从模板取哪些文件」。`setup.sh` 只拷清单里列出的东西，**没列的本地文件永远不动**。

```json
{
  "_comment": [
    "assemble.json —— 从模板取哪些文件到本项目",
    "  键 = 模板内相对路径（以 / 结尾 = 整目录拷贝）",
    "  值 = 本项目内相对路径（相对项目根）",
    "  以 _ 开头的键仅供阅读，解析器会忽略"
  ],
  "brand": {
    "title": "My App",
    "logo": "brand.png",
    "icon": "favicon.png"
  },
  "init": false,
  "files": {
    "server/framework/": "server/framework/",
    "server/project/blueprint/login.html": "server/public/login.html",
    "server/project/blueprint/fragments/": "server/public/fragments/",
    "server/templates/_gbmd-style/fragments/": "server/public/fragments/",
    "server/templates/_gbmd-style/public/logo.png": "server/public/brand.png"
  }
}
```

- **键** = 模板仓库内的相对路径（模板里有什么）
- **值** = 项目内的相对路径（放到哪里；以 `/` 结尾 = 整目录拷贝）
- `"init": false` = 跳过蓝图骨架初始化（`app.js` / `config.schema.json`），项目自带后端时用
- `"brand": {...}` = 品牌配置，组装时写入 `server/public/brand.json`（详见下节）

**怎么写注释**：JSON 规范（RFC 8259）不支持注释，所以用 **`_comment` 键**承载说明
（合法 JSON，编辑器不报错）。以 `_` 开头的键会被 `setup.sh` 忽略，值可以是
数组、字符串或对象，随便写。顶层或 `files` 内部都可以放 —— 但更推荐放顶层，
`files` 里保持只有真实的取件项更清爽。

> `files` 内部若放 `_` 开头键同样安全：`setup.sh` 在展开前会过滤它们。
> （不加这层过滤的话，数组值会让脚本 `os.path.join` 抛 `TypeError` 崩溃，
> 字符串值则被当成源路径报「文件不存在」并虚增缺失计数。）

**品牌配置（`brand` 段）**：页面里的标题、logo、icon 用 `@brand:key@` 占位符
（HTML 属性位）或 `<!-- @brand:key -->` 注释（元素文本位）书写，运行期由
`framework/fragment-assembler` 读 `server/public/brand.json` 替换。

```json
"brand": { "title": "My App", "logo": "brand.png", "icon": "favicon.png" }
```

`setup.sh` 组装时按清单的 `brand` 段生成 `server/public/brand.json`：

- **仅在文件不存在时生成** —— `brand.json` 是运行期可变配置，项目改过就不该被组装覆盖；
  想按清单重置，先删掉该文件再组装。
- **清单没写 `brand` 段就跳过** —— 不报错，也不生成。
- 品牌参数属于项目自身，所以**不在脚本里内置任何项目名**（风格差异由清单声明）。

logo/icon 的文件本身仍要走 `files` 映射从风格模板拷进 `server/public/`，
`brand.json` 里写的是**拷过去之后的文件名**。

**按需取用的三条约定**：

1. **用不上就不填** —— 清单只列你要的，其余一概不碰。
2. **想补充就直接加** —— 之后要用模板的新件（比如 `auto-update-card.js`），加一行即可。
3. **本地改过的，删掉引用** —— 某个文件你想自己维护（如 `app.js` / `style.css`），把它从清单里删掉，`setup.sh` 从此不再覆盖它。

**没有 `assemble.json` 会怎样**：

- `--to` 指定项目时：打印清单格式说明，并**询问是否生成带注释的空模板**
  （交互环境答 `y` 即在项目根生成 `assemble.json`，填好取件项后重跑本命令）。
- 非交互环境（管道 / CI）：不询问，打印提示后退出，不会挂住等输入。
- 不带 `--to` 的模板自测：走 `project/blueprint/assemble.json` 默认清单（纯公共件）。

清单内容会在初始化蓝图**之前**校验：JSON 语法错、`files` 不是对象、值不是字符串
都会立即报错退出，不会留下「蓝图已初始化、`boot.cjs` 已生成」的半成品目录。

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

### 路由：两种范式，共用一套匹配核心

框架同时提供两种路由注册范式，**项目按自己的写法二选一即可**，匹配语义完全一致（都走 `route-core`）：

| 范式 | 模块 | 写法 | 适合 |
|------|------|------|------|
| **表式** | `route-factory.js` | `createRoute({ "GET /api/x": fn })` | 路由集中可读，能被脚本静态扫描；支持 `:param` 具名捕获（`ctx.params`） |
| **闭包式** | `route-registry.js` | `createRegistry()` → `route(method, path, fn)` / `routePublic(...)` | 需在函数体内按条件/循环动态注册；`routePublic` 与 `route` 天然区分鉴权与公开 |

两者共同支持：`"*"` method 通配、数字 method 数组（如 `["GET","HEAD"]`）、字符串精确路径、RegExp 路径。

```js
// ① 表式（gbmd 用）
const browse = createRoute({
  "GET /api/browse": (req, res, ctx) => { /* ctx.params / ctx.query */ },
  "GET /api/games/:id": (req, res, ctx) => { /* ctx.params.id */ },
});

// ② 闭包式（iwara 用）
const registry = createRegistry();
registry.routePublic("POST", "/api/login", handler);   // 免鉴权
registry.route(["GET","HEAD"], "/api/thumb", handler); // 需鉴权
registry.routePublic(["GET","HEAD"], /^\/avatar\//, handler);
// 分发：const h = registry.matchPublic(method, path) || registry.match(method, path);
```

匹配核心 `route-core.js` 单独可用：`matchMethod` / `matchPath` / `match` / `normalizeRule` / `compilePattern`。
闭包式的 handler 签名保持 `(req, res, api)`，框架不组装 ctx、不预读 body、默认不捕获异常
（需要统一错误处理时给 `createRegistry({ onError })` 传回调）。

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
| `createBackup(...)` | 数据备份（用法见下） |
| `sendJson` / `readBody` / `parseCredentialText` / `cleanCookie` | HTTP 工具 |
| `fsAsync` / `htmlUtils` / `appLog` / `jsonDir` / `auth` | 模块（日志、JSON 目录、鉴权等） |
| `DEFAULT_MIME` | 默认 MIME 表 |

### 数据备份/恢复（`createBackup`）

用户数据打包导出 / 按清单白名单恢复。**清单由源码注释自动生成**，不用手写：
在写文件的那行代码旁标注 `//userdata-manifest.json file <相对路径> <说明>`，
导出时会扫出来汇总成清单（`dir` 用于目录，可跟 `.后缀` 限定扩展名；
支持 `key=value` 附加字段与 `desc="带 空格的值"`）。

```js
const { createBackup } = require("./framework");
const dataBackup = createBackup({
  appName: "my-app",                       // 写进清单的 app 字段
  appRoot: path.join(__dirname, ".."),     // 项目根（清单里相对路径的基准）
  toolDir: path.join(__dirname, "..", "tool", "bin"),  // 自带 zip/unzip 的目录
});

await dataBackup.exportZip();              // → Buffer，打包清单里列出的文件
await dataBackup.importZip(zipPath);       // 按本地清单白名单校验后恢复
dataBackup.readManifest();                 // 读清单（文件缺失/损坏会自动重建）
```

**关于 `toolDir`**：目录里的工具会**先实测能否执行**（`-v`），不可用则回退系统
`PATH`。所以自带的群晖专用二进制在本机跑不起来时会自动降级，不会中断备份。
目录不存在或为空都安全。

**关于清单文件**：`json/userdata-manifest.json` 是**生成物**（文件里自己写着
「不要手改」），内容全部可从源码推导，**不应入库** —— 仓库 `.gitignore` 忽略它，
首次导出或调用 `readManifest()` 时会自动生成。

**迁移/改动本模块时**：改完新旧实现是否等价，用
`test/data-backup-equivalence.test.sh <项目目录>` 验证（导出 zip 逐文件 hash 比对）。

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

**github 模式保护**：`server/config.json`、`json/` 运行态数据、`*.log`、`*.pid`、`.bak`、`node_modules` 等不会被覆盖；项目特有运行态文件用 `extraExclude` 追加。

**项目侧只写传参，不复制框架代码**——`server/lib/auto-update.js` 从 framework 引入工厂后传项目参数：

```js
// server/lib/auto-update.js（项目实例，约 20 行）
const { createAutoUpdate } = require("../framework/auto-update.js");

module.exports = createAutoUpdate({
  projectName: "my-downloader",       // 日志前缀 + User-Agent
  defaultRepo: "owner/my-downloader", // github 模式缺省仓库
  extraExclude: ["json/my-data.json"], // github 模式绝不覆盖的运行态文件
  // watch 模式不重启的路径（前端框架文件改由组装器热更新）
  extraWatchExclude: ["index.html", "public/index.html", "style.css", "public/style.css"],
  // tarball 解压后需恢复可执行位的脚本
  extraChmodScripts: ["crx/native-host/install-linux.sh"],
});
```

两个参数的区别：

| 参数 | 作用范围 | 用途 |
|---|---|---|
| `extraExclude` | **github 模式** | 列出的路径**绝不覆盖**（运行态数据、本机权威配置） |
| `extraWatchExclude` | **watch 模式** | 列出的路径**改动不触发重启**（前端框架/片段，由组装器 mtime 热更新） |

框架实现只有一份（`framework/auto-update.js`），改框架代码全部项目受益；项目侧别再拷贝框架主体。

重启走 `./start.sh restart`（项目唯一启停入口）。

### 自动更新卡片（公共前端件）

设置页的「🔄 自动更新」卡片是**公共件**，gbmd / iwara 及后续项目共用同一份，不用各写一遍：

| 文件 | 作用 |
|---|---|
| `blueprint/fragments/auto-update-card.html` | 卡片 HTML（靠 `<!-- @frag:auto-update-card -->` 插进设置面板） |
| `blueprint/auto-update-card.js` | 卡片逻辑（自包含：不依赖项目 `api()`/`setStatus()`/`$()`，自己封装 fetch） |

接入三步：

```html
<!-- 1. 设置面板里插入指令 -->
<!-- @frag:auto-update-card -->

<!-- 2. 页面 scripts 里引用（在 app.js 之前） -->
<script src="auto-update-card.js"></script>
```

```js
// 3. 初始化时挂载（卡片不在页面上会自动跳过）
if (window.AutoUpdateCard) window.AutoUpdateCard.mount();
```

卡片对应 4 个框架层接口（各项目 `routes/auto-update.js` 已提供）：`GET /api/auto-update/status`、`POST /api/auto-update/config`、`POST /api/auto-update/check`、`POST /api/auto-update/restart`。后端能力来自 `framework/auto-update.js`，前端能力来自这个公共件——两头都不用在项目里重复实现。

---

## 前端部件组织

主页面由「蓝图框架 + 片段」组装而成（运行期由 framework 组装器按注释指令拼接）：

| 位置 | 内容 |
|---|---|
| `blueprint/index.html/downloader/index.html` | **共同框架**：页面骨架 + `<!-- @frag:片段名 -->` 注释指令（两个风格共用，唯一权威） |
| `blueprint/fragments/` | **通用分片**：两风格逐字相同的块（`tabs` / `no-pwd-warn` / `global-hud` / `browse-mask` / `topbar` 骨架） |
| `templates/_gbmd-style/fragments/` | **gbmd 特有分片**：`head-extra` / `topbar/{badge,userscript}` / `tab-panel/panel-*` / `scripts` |
| `templates/_iwara-style/fragments/` | **iwara 特有分片**：`topbar/{badge,userscript}` / `tab-panel/panel-*` / `scripts` / `styles/*` |

各风格仍带 `public/` 目录放非分片部件：

| 部件 | 说明 |
|---|---|
| `app.js` | 主应用逻辑（外部文件，避免内联 XSS） |
| `style.css` | 样式（CSS 变量） |
| `theme-init.js` | 主题初始化（独立 script） |
| `login.html` / `login.js` | 登录页（蓝图共用） |
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
    topbar/brand.html ← 品牌区（@brand:logo/alt/displayTitle 取值，各项目 brand.json 提供）
    topbar/time.html  ← 服务器时间（serverDate/serverClock）
    tabs.html         ← 通用
    tab-panel/panel-*.html
```

改任一片段 → 刷新页面即生效（mtime 热更新，不重启服务）；改框架文件同理。

### 接入要点：`style.css` 也必须走组装器（易漏）

框架文件（`index.html` / `style.css` / `login.html` / `setup.html`）在组装产物里
**只保留 `@frag:` 指令骨架，不含真实内容**。例如产物 `public/style.css` 通常只有几十字节：

```css
/* @frag:styles/variables.css */
/* @frag:styles/base.css */
/* @frag:styles/topbar.css */
```

服务端**必须在响应这些文件时调用组装器展开指令**，否则浏览器拿到的是指令文本本身，
CSS 等于空文件——页面会完全失去样式（HTML 结构正常，但看起来像纯文本）。

**接入时最容易踩的坑**：只对 `.html` 做组装。

```js
// ❌ 错误：只组装 HTML，style.css 原样输出 → 页面无样式
if (ext === ".html") {
  if (assembler.list().includes(rel)) raw = assembler.render(rel).text;
}

// ✅ 正确：按「组装清单」判断，与扩展名无关（框架 serveFragment 即此写法）
const name = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
if (assembler.list().includes(name)) {
  const r = assembler.render(name);
  const ctype = mimeMap[path.extname(name).toLowerCase()] || "text/html; charset=utf-8";
  res.writeHead(200, { "Content-Type": ctype, "Cache-Control": "no-cache" });
  return res.end(Buffer.from(r.text));
}
```

框架层 `serveFragment()` 已按此实现，**自建静态路由时不要另写一套判据**；
若确需自建，判据一律用 `assembler.list()`，不要用扩展名。

**自检**：请求 `style.css`，响应体里不应出现 `@frag:`

```bash
curl -s http://127.0.0.1:<port>/style.css | grep -c '@frag:'   # 期望 0
```

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
├── setup.sh                         # 组装脚本（--to 指定项目）
├── test/
│   ├── assemble-parse.test.sh       # 清单解析/组装行为自测（bash test/... 运行）
│   └── data-backup-equivalence.test.sh  # 备份迁移等价性验证（传项目目录）
├── server/
│   ├── framework/                 # 通用后端 JS（17 个模块）
│   │   ├── app.js                 # HTTP 服务骨架
│   │   ├── config-loader.js       # 配置加载（schema 驱动）
│   │   ├── route-core.js          # 路由匹配核心（两范式共享）
│   │   ├── route-factory.js       # 路由工厂 createRoute（表式）
│   │   ├── route-registry.js      # 路由注册 createRegistry（闭包式）
│   │   ├── auth.js                # 鉴权（session + cookie）
│   │   ├── auto-update.js         # 自动更新 createAutoUpdate
│   │   ├── data-backup.js         # 数据备份
│   │   ├── http-utils.js          # sendJson / readBody
│   │   ├── cjs-bootstrap.cjs      # CJS 强制引导
│   │   └── index.js               # 统一出口
│   ├── templates/                 # 前端素材
│   │   ├── _gbmd-style/
│   │   │   ├── public/            # gbmd 非分片部件（app.js / style.css 等）
│   │   │   └── fragments/         # gbmd 特有分片（topbar/{badge,userscript} / tab-panel/ / styles/ 等）
│   │   └── _iwara-style/public/   # iwara 风格部件
│   └── project/
│       └── blueprint/             # 组装蓝图（入库；两风格共用文件都在这里，无独立 _shared/）
│           ├── app.js             # 项目入口骨架
│           ├── config.schema.json # 配置 schema
│           ├── style.css          # CSS 框架（/* @frag:styles/xxx.css */ 指令）
│           ├── login.html / login.js / theme-init.js / search-date-range.js  # 共用静态资源
│           ├── index.html/downloader/index.html   # 共同框架（@frag 指令）
│           └── fragments/         # 通用分片（tabs / topbar.html / topbar/{brand,time} / styles/ 等）
├── scripts/
│   ├── sync-to-project.sh         # 素材同步到项目
│   ├── scan-bare-js-html.js       # 裸 JS 残留扫描
│   ├── fix-bare-js-html.py        # 裸 JS 残留修复
│   └── func-index.js              # 函数索引（定向读取大文件）
├── setup.sh                       # 前端组装（支持 --to 任意目标）
├── start.sh                       # 启停脚本（start/stop/restart/status）
└── README.md
```

---

## 版本

| 版本 | 内容 |
|---|---|
| 1.3.0 | **顶栏分片归位通用层**：`topbar/brand.html`、`topbar/time.html` 原被当成风格特有件、两个风格各存一份（time 逐字相同，brand 仅 logo 与标题文字不同），实际上是所有项目共用的界面部件，已上移 `blueprint/fragments/topbar/`，风格层副本删除。品牌区改由 `@brand:logo@` / `@brand:title@` / `@brand:displayTitle@` 取值，各项目 `brand.json` 提供（新增 `displayTitle` 键承载顶栏三行标题，因它与 `<title>` 用的 `title` 语义不同）。风格层仅保留真正特异的 `topbar/{badge,userscript}` |
| 1.2.0 | 文档：新增「接入要点：`style.css` 也必须走组装器」——说明组装产物里框架文件只留 `@frag:` 指令骨架，服务端须按 `assembler.list()` 判据（而非扩展名）展开 `.css`，否则页面失去全部样式；附错误/正确写法与自检命令 |
| 1.1.0 | `data-backup` 清单生成改为复用 `marker-manifest`（移除内联扫描解析，273→216 行），修正框架文档示例被当成数据条目、带引号 `desc="..."` 被原样输出的问题；新增 `test/data-backup-equivalence.test.sh` 备份迁移等价性验证脚本；`setup.sh` 缺清单时询问生成带注释的空模板、清单格式预校验前移；`assemble.json` 支持 `_comment` 注释键（组装时跳过 `files` 内 `_` 开头的键）；新增 `test/assemble-parse.test.sh` 组装行为自测 |
| 1.0.0 | 初版：通用后端框架（HTTP / 鉴权 / 配置 / 路由工厂 / 备份 / 自动更新）+ 组装式前端 + 风格模板 |
