# bench-template

零依赖 Node.js 服务的模板仓库：通用后端框架（`templates/js/`）+ 前端素材（`templates/`）+ 组装脚本（`setup.sh`）。
项目在自己根目录放一份清单 `assemble.json` 声明「要哪些件」，从本仓库组装到项目目录；素材只在本仓库维护一份。

## 一、能做什么

| 能力 | 说明 | 入口 |
| --- | --- | --- |
| 组装 | 按清单把框架与前端素材复制到项目落点，覆盖式写盘，可反复跑 | `bash setup.sh --to <项目>/assemble.json` |
| 组装预演 | 列出每个条目是「新增 / 覆盖 / 相同」，不写盘 | 同上加 `--dry-run` |
| 一致性检查 | 逐文件 md5 比对清单两端，报「不一致 / 缺失」，另给「无引用」告警 | 同上加 `--check` |
| 清单外扫描 | 扫项目整棵树，列出清单未覆盖的文件（按 `.gitignore` 排除） | 同上加 `--untracked` |
| 素材回流 | 把项目侧改过的素材写回模板（默认只列差异，`--write` 才写，写前备份） | 同上加 `--pull` / `--pull --write` |
| 结构迁移 | 按新旧两份清单搬文件，并自动改写相对引用 | `bash setup.sh --migrate <旧清单> --to <新清单>` |
| 修复执行位 | 按 git 索引恢复丢失的可执行位 | `bash setup.sh --fix-perm [<仓库路径>]` |
| 列素材目录 | 列出 `templates/` 下的系级 / 风格素材 | `bash setup.sh --list` |
| 后端通用件 | HTTP 服务、鉴权门、路由（表式 / 闭包式）、配置 schema、日志、静态文件、片段组装 | `templates/js/` |
| 自动更新 | watch / git / github 三种模式 | `templates/js/update/` |
| 数据备份 | 用户数据打包导出、按清单白名单恢复 | `templates/js/store/data-backup.js` |
| 状态文件写入 | 原子替换、节流合并写 | `templates/js/store/state-store.js` |
| 页面截图 | 前端渲染自检，可选接入 | `templates/tools/page-shot.mjs` |

## 二、目录结构

```
bench-template/
├── setup.sh          # 唯一入口：按动作分发到 scripts/setup-*.sh
├── scripts/          # 组装、检查、迁移、回流，以及文档与体检工具
├── templates/        # 素材树（按通用程度分层，见下表）
├── lib/              # 通用运行支撑件：start.sh、cjs-bootstrap.cjs
├── test/             # 自检脚本（bash test/<名称>.test.sh）+ 组装测试夹具（test/fixtures/）
├── docs/             # 使用文档与自动生成的文件树 / 函数清单
├── skills/           # 组装用法的说明性 skill
└── tree-doc.json     # 文件树注释映射（scripts/doc-tree.mjs 用）
```

`templates/` 内部按通用程度分层：

| 层级 | 位置 | 放什么 |
| --- | --- | --- |
| 最通用层 | `templates/js/`、`templates/json/`、`templates/tools/`、`templates/userscript/` | 所有项目共用；后端框架整树在 `templates/js/` |
| 系级 | `templates/_downloader/`、`templates/_lumigather/` | 某系共用：html / js / styles / json / assets |
| 项目独有 / 风格层 | `templates/_downloader/_iwara/`、`_gamebanana-mods/`、`_ktoolbox/` | 单项目专用；`_ktoolbox` 是整套界面风格层，与项目层同级、按清单选配 |
| 后端随系分发 | `templates/_lumigather/server/` | 该系连业务后端一起下发的形态 |

素材里的引用按「组装后在项目里的位置」写（`require("./x")`、`<script src>`、`<!-- @frag:x -->`），不按素材当前所在目录写。

## 三、怎么用

### 3.1 建一个新项目

```bash
# 1. 建项目目录，把清单放到项目根（清单所在目录就是项目根）
mkdir my-service && cd my-service
# 清单写法参考下游项目的 <项目根>/assemble.json（gbmd / iwara / gallery），
# 或按 3.3 的字段说明写一份最小清单：{"files":{"templates/...":"server/..."}}
cp <下游项目根>/assemble.json ./assemble.json

# 2~3. 预演 + 正式组装：切到模板仓库根目录执行（<模板仓库> 换成模板仓库实际路径）
cd <模板仓库>
bash setup.sh --to ../my-service/assemble.json --dry-run   # 预演：新增 / 覆盖 / 相同
bash setup.sh --to ../my-service/assemble.json             # 正式组装（幂等，可反复跑；落点按清单 dst）

# 4. 回到项目目录：写业务入口（从骨架复制，再填自己的路由）
cd ../my-service
cp <模板仓库>/templates/js/app.js server/app.js

# 5. 启动
bash start.sh start
```

启动后访问 `http://<NAS-IP>:<端口>/`。端口取 `server/config.schema.json` 的 `port.default`，首次生成的 `server/config.json` 会写入该值。

- 脚本始终留在模板仓库，用它的路径调用即可；项目里不需要复制 `setup.sh`，也不需要素材副本。
- `--to` 指向的文件必须叫 `assemble.json`（脚本会校验文件名）；写相对路径时相对当前目录。
- 想先看效果：拿任一真实项目的清单跑一遍预演（`bash setup.sh --to <下游项目根>/assemble.json --dry-run`），跑完不写盘。

### 3.2 setup.sh 子命令

| 命令 | 作用 | 注意 |
| --- | --- | --- |
| `--to <清单>` | 组装 | 覆盖式写盘；清单所在目录即项目根 |
| `--to <清单> --dry-run` | 组装预演 | 标出「新增 / 覆盖 / 相同」；`DRY_VERBOSE=1` 把目录条目展开到逐个文件 |
| `--to <清单> --check` | 一致性检查 | 报「不一致 / 缺失」，出现即退出码 1；「无引用」只是告警，不计失败 |
| `--to <清单> --untracked` | 清单外文件扫描 | 有清单外文件时退出码 1；按 `.gitignore` 排除 |
| `--to <清单> --pull` | 回流预演 | 只列出项目侧被改过的素材 |
| `--to <清单> --pull --write` | 回流写入 | 写回模板对应位置，写前备份模板原文件 |
| `--migrate <旧清单> --to <新清单>` | 结构迁移 | 脚本层默认执行，加 `--dry-run` 才预演；按落点文件名配对，歧义只报告不搬 |
| `--fix-perm [<仓库路径>]` | 修复执行位 | 按 git 索引恢复可执行位，只改权限不改内容 |
| `--list` | 列素材目录 | 无参数、`-h`、`--help` 同样输出帮助 |

补充几点：

- 组装前会先按前端 `js/manifest.json` 把 JS 分片拼成单文件，再按清单下发。
- 清单语法错误会直接报错退出，不会留下半成品；**源路径写错不报错**，用 `--check` 的「缺失」发现。
- `--check` 是发现「改错地方」的主要手段：通用件改在项目侧会被报「不一致」，应改回模板再重新组装。
- 清单整份复制会带进用不上的条目，预演时重点看「覆盖」项——那是会被模板内容盖掉的项目侧文件。

### 3.3 assemble.json 字段

| 字段 | 语义 |
| --- | --- |
| `files` | 取件表：键 = 模板内相对路径，值 = 项目内落点；两端以 `/` 结尾表示整目录 |
| 条目顺序 | 同一落点有多个源时，**靠后的条目覆盖靠前的**（风格层覆盖底座就是靠这个） |
| `brand` | 品牌键值（`title` / `logo` / `icon` / `displayTitle`），运行期由 `readBrand` 四级兜底取值（环境变量 → 项目根 `.env` → 本段 → 内置默认），不生成中间文件 |
| `commands` | 组装后在项目根逐条执行的钩子；注入 `SETUP_TEMPLATE_ROOT`、`SETUP_PROJECT_ROOT`；任一失败则本次非 0 退出，`--dry-run` 只打印 |
| `_` 开头键 | 阅读用注释，解析器忽略 |
| `init` | 历史字段，已不生效 |

```json
{
  "files": {
    "templates/js/core/index.js": "server/core/index.js",
    "templates/_downloader/html/index.html": "server/public/index.html",
    "templates/_downloader/html/tab-panel/": "server/public/fragments/tab-panel/"
  },
  "brand": { "title": "My App", "logo": "brand.png", "icon": "favicon.png", "displayTitle": "My<br>App" }
}
```

完整可跑的清单见下游项目（`gamebanana-mods-downloader` / `iwara-downloader` / `gallery`）项目根的 `assemble.json`，含框架、前端与启停脚本；新项目从它删改比从零写快。
上面只是写法示意，实际要把该组件依赖的模块一起列上，否则组装后启动会报找不到模块。

品牌也可以不改清单：用环境变量或项目根 `.env` 覆盖（优先级 `BRAND_*` 环境变量 > `.env` > 清单 `brand` 段 > 内置默认，键名 `BRAND_TITLE` / `BRAND_LOGO` / `BRAND_ICON` / `BRAND_DISPLAY_TITLE`，样例见 `templates/.env.example`）。

```bash
BRAND_TITLE="My App" BRAND_DISPLAY_TITLE="My<br>App" bash start.sh restart
```

- 用不上就不填；想补件就加一行；某个文件想自己维护，就从清单里删掉它，此后组装不再覆盖。
- `@brand:` 的四个标准键始终有值（四级兜底后页面不会残留占位符）；自定义键未命中时**原样留在页面上**，便于发现拼写错误。

### 3.4 新增一个可复用组件

1. 定层：所有项目共用 → `templates/js/`、`templates/json/`；某系共用 → `templates/_<系>/`；单项目 → `templates/_<系>/_<项目>/`。
2. 放文件：按类型放子目录（`js` / `html` / `styles` / `json` / `assets`），保留内部层级。
3. 接清单：在用到它的每个项目 `assemble.json` 的 `files` 里加一行 `"templates/...": "server/..."`。
4. 组装并验证：`--dry-run` 看落点 → 组装 → `--check` 应报两端一致。
5. 页面片段：框架 HTML 里加 `<!-- @frag:片段名 -->`，片段文件落到 `server/public/fragments/` 的对应路径（子目录写 `topbar/brand`）。
6. 引用不用手改：素材内部引用按组装后的落点写；需要批量搬目录时用 `scripts/rewrite-refs.js`，拆目录前先跑 `scripts/scan-framework-refs.js --cycles`。
7. 自检：`bash test/assemble.test.sh`（组装行为，用 `test/fixtures/` 的夹具清单）、`bash test/run-all.sh`（全部）。

### 3.5 启停

```bash
bash start.sh start               # 启动
bash start.sh stop                # 停止
bash start.sh restart             # 重启（默认动作）
bash start.sh status              # 状态：进程 / 端口 / 健康检查
bash start.sh --set-password "…"  # 设置或修改访问密码
```

`start.sh` 由清单从 `lib/start.sh` 下发到项目根；PID 写项目根 `<项目名>.pid`，日志写 `server/server.log`。
端口以 `server/config.json` 的 `port` 为准，首次启动按 `server/config.schema.json` 的 `port.default` 生成；要换端口改配置文件后重启。

## 四、约定

| 约定 | 说明 |
| --- | --- |
| 清单是唯一真相 | 落点一律按 `files` 的值；清单没声明的地方，项目里不该有文件 |
| 素材 vs 产物 | 清单里 src==dst 的是素材（可 `--pull` 回流）；src!=dst 的是产物（只由组装生成） |
| 产物必须入库 | 下游项目组装出的 `server/` 等产物要提交进仓库：部署端靠自动更新从仓库拉代码，不入库就拿不到新版 |
| 测试夹具 | `test/fixtures/` 只放测试用的最小清单，不参与任何项目运行；真实完整清单看下游三仓 |
| 执行位 | 跨文件系统拷贝会丢可执行位 → `--fix-perm` 修；落在 noexec 挂载点上 `./x.sh` 仍会被拒，改用 `bash x.sh` |
| 零依赖 / CJS | 不引 npm 包、不建 `package.json`；父目录是 `"type":"module"` 时用 `server/boot.cjs` 强制 CJS |
| 单文件 ≤ 400 行 | 超过就按功能拆分 |
| 前端产物要走组装器 | 产物里的 `index.html` / `style.css` 只留 `@frag:` 指令，服务端响应时必须展开后再返回，不能只对 `.html` 展开 |

## 五、已知下游

- `gamebanana-mods-downloader`：项目根有 `assemble.json`，取下载器系素材与对应风格层。
- `iwara-downloader`：同一套组装方式，取 iwara 风格层与系级通用件。
- `gallery`：取画廊系素材，含 `server/` 后端实现。

三个项目的素材与脚本都留在本仓库，项目侧只保留清单与产物。

## 六、文档索引

| 文档 | 内容 |
| --- | --- |
| [功能说明](docs/功能说明.md) | 各功能模块的能力与边界 |
| [模板化标准手册](docs/模板化标准手册.md) | 模板化约定集：分层、清单、改造判据 |
| [命令参数总览](docs/命令参数总览.md) | `setup.sh` 与清单工具的全部参数、退出码 |
| [清单驱动重构](docs/清单驱动重构.md) | 清单驱动要解决的问题与各功能作用 |
| [旧项目模板化改造指南](docs/旧项目模板化改造指南.md) | 把已有项目改成组装式的步骤 |
| [前端片段化改造指南](docs/前端片段化改造指南.md) | HTML 拆片段与组装 |
| [文件树](docs/文件树.md) | 完整目录结构（脚本自动生成） |
| [函数列表](docs/函数列表.md) | 各源码文件函数清单（脚本自动生成） |
