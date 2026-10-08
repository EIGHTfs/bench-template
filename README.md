# bench-template

零依赖 Node.js 下载器服务的模板仓库：**通用后端框架（framework）+ 前端部件素材（templates）+ 组装脚本（setup.sh）**。

用它可以建立一个新的下载器服务项目，也可以把已有的旧项目改成「组装式」（前端由模板素材组装生成，不再手改）。

---

## 一分钟上手（建新项目）

```bash
# 1. 建目录
mkdir my-downloader && cd my-downloader

# 2. 组装（从模板仓库执行；--to 指向本项目的 assemble.json）
<模板仓库>/setup.sh --to "$PWD/assemble.json"
# 例如：/path/to/bench-template/setup.sh --to "$PWD/assemble.json"

# 3. 之后想同步模板最新素材 → 重跑第 2 步即可（风格由清单声明，无需在命令行指定；
#     ./setup.sh --list 可列出模板自带的所有素材目录）

# 4. 写业务后端（app.js 里填业务路由；蓝图为起点），然后启动
cp <模板仓库>/start.sh ..
cd ..
./start.sh start              # 默认 restart；未启动时相当于 start
```

访问 `http://<本机IP>:<端口>`（端口在 `server/config.json` 的 `port`，默认 8642）。

> 首次访问会引导设置密码（鉴权门由 framework 提供）。
>
> 注意：`setup.sh` 必须**在模板仓库里执行**（脚本以自身位置为素材源），`--to` 指向项目清单。
> 项目里不放 setup.sh，也不放素材副本——素材在模板仓库，项目只保留产出。

> 新项目不需要复制整个模板：目标项目里只有一份 `assemble.json`（素材与组装脚本都留在模板仓库），
> 组装命令从模板仓库执行，见上方步骤 2。

---

## 三个概念

| 概念 | 位置 | 该放什么 |
|---|---|---|
| **素材树** | `templates/` | 按**通用程度**分层：根级 `styles/html/js/json/assets` 最通用（所有项目共用）；`_downloader/`、`_gallery/` 是系级；`_downloader/_iwara/`、`_downloader/_gamebanana-mods/` 是项目独有层。每层内部按类型子目录（`styles/html/js/json/assets`），js/css/html 保留内部层级。**风格层也是项目独有层**：如 `_downloader/_ktoolbox/` 承载一整套路子界面（登录页/侧边栏/全局配置/更新卡 + 配套 CSS），与业务项目层同级，由项目清单选配 |
| **lib** | `lib/` | **通用运行支撑件**：启停脚本、CJS 劫持等「不是业务逻辑、但每个项目都要有」的文件。下发到项目后同样落在 `lib/`（与项目自有业务 JS 同目录，靠文件名区分） |
| **组装产物** | 项目侧 `server/public/`、`server/app.js`、`server/config.schema.json` | 由 setup.sh 按清单生成，**不入库**，可反复重装 |

**素材落位规则（新素材按此判断放哪）**：

| 素材类型 | 放哪 | 判据 |
|---|---|---|
| 通用 JS（后端或前端） | `templates/js/` | 两个以上系共用、内容一致（framework 整树在此） |
| 通用运行支撑件（.sh / 启动劫持） | `lib/` | 每个项目都要有、但不属于业务逻辑 |
| 通用 html / css / json | `templates/` 根级类型目录 | 所有项目共用、且不是 JS |
| 系级通用（任意类型） | `templates/_<系>/` | 下载器系 / 画廊系内部共用，各系内容不同 |
| 项目独有（任意类型） | `templates/_<系>/_<项目>/` | 只有该项目用（如 `_downloader/_iwara/`） |
| 风格层（整套前端界面） | `templates/_<系>/_<风格>/` | 一整套路子界面（登录/侧边栏/配置/更新卡 + 配套 CSS），与业务项目层同级；项目按喜好选配混搭（如 `_downloader/_ktoolbox/`） |

**`lib/` 的判据**：放进来的文件应满足「所有项目内容完全一致」，
且与风格、业务无关——改它等于改所有项目。项目自有的业务 JS 也放 `lib/`，
但那属于项目自己的代码，**不进模板、不进清单**。两类混在同一目录是有意为之：
下发件与业务件在项目里同层，`require("../lib/xxx")` 不用区分来源。

**framework 内部按功能分类**（位于 `templates/js/`，模块间相对 `require` 由工具自动推导，见「路径映射与引用自动推导」）：

| 子目录 | 职责 |
|---|---|
| `templates/js/core/` | 服务主体与聚合出口（`index.js` 是唯一对外出口） |
| `templates/js/route/` | 路由核心：匹配、工厂、注册表、范式适配、鉴权/更新路由表 |
| `templates/js/auth/` | 会话与密码校验 |
| `templates/js/http/` | 底层通用件：HTTP 工具、HTML 工具、异步 IO、路径安全、同级模块定位 |
| `templates/js/config/` | 配置装载与 schema 校验 |
| `templates/js/store/` | 数据存取：JSON 目录、备份、标记清单 |
| `templates/js/update/` | 自动更新 |
| `templates/js/assemble/` | 页面片段装配（`fragment-assembler.js`） |
| `templates/js/tool/` | 通用工具探测（`tool-detect.js`） |

> **前端 JS 为什么不在这里**：通用前端 JS（`theme-init` / `login` / `setup-init` /
> `search-date-range` / `auto-update-card`）按通用程度放在 `templates/js/`（最通用）或
> `templates/_downloader/js/`（系级）等位置，由清单组装进 `server/public/` 供页面直接 `<script src>` 引用。
> 它们不经 `require` 装载、不参与模块解析，故不按后端模块的方式分层；
> 与页面片段同理，属于「组装来源」而非「运行期模块」。

**文件名括号标识（约定，按需启用）**：同一功能出现多种实现、需要彼此区分时，
把描述写进**真实文件名**的括号里，靠**清单重命名**剥掉：

```json
"templates/js/route/route-core.js(默认线性匹配)": "templates/js/route/route-core.js",
"templates/js/route/route-core.js(带通配符匹配)": "templates/js/route/route-core.js"
```

清单左值是素材原名（带括号），右值是落到项目后的真实路径（剥括号）。
**只在重复时加**——不重复就用普通文件名，避免目录里全是括号噪音。

**系级目录是自动发现的，不写死在脚本里**：`setup.sh` 遍历 `templates/` 下一层目录，
把名为 `_<名>/` 的目录识别为一个系级（如 `_downloader/`、`_gallery/`），
系级下的 `_<名>/` 子目录是项目独有层（如 `_downloader/_iwara/`）。

- **新增系**：建目录 `templates/_<名>/`（内含 `styles/`、`html/`、`js/` 等类型子目录）即可，
  `setup.sh` 无需改动，`./setup.sh --list` 会立刻列出它。
- **系级可以只带前端，也可以前后端一起带**：`_downloader/` 只放前端素材，
  业务后端留在各项目自己维护；`_gallery/` 是本仓库第一个**后端也进素材树**的系——
  它除 `styles/html/js/json/assets` 外还带 `server/app.js`、`server/lib/`、`server/routes/`，
  把该系的业务实现一并作为素材分发。两种形态并存，按系需要选择即可。
  （`lib/cjs-bootstrap.cjs` 不属于素材树，它是通用支撑件，由清单下发到项目的 `lib/`。）
- **不适用的目录自动跳过**：不符合 `_*` 规律的目录（`styles/html/js/json/assets` 类型目录、`.trash-*`、备份、临时目录）不会被当成系。
- **输出稳定**：系列表去重后排序，`--list` 与「未知系」错误提示的内容可复现。
| **组装产物** | `server/public/`、`server/app.js`、`server/config.schema.json` | 由 setup.sh 生成，**不入库**，可反复重装 |

后端业务代码（`server/routes/`、`lib/`）**默认不在模板仓库**，由项目自己实现；
但系级**可按需携带**自己的后端实现——`_gallery/` 即携带 `server/`（`app.js` + `lib/` + `routes/`，见 `templates/_gallery/server/`），
组装时一并落到项目侧，作为该系的完整业务素材分发。

---

## 更多文档

| 文档 | 内容 |
|---|---|
| [`docs/功能说明.md`](docs/功能说明.md) | 按功能模块描述能力、设计与边界（功能变更更新此处，不再维护版本记录） |
| [`docs/命令参数总览.md`](docs/命令参数总览.md) | `setup.sh` 与清单工具的全部参数、退出码、扫描范围差异 |
| [`docs/清单驱动重构.md`](docs/清单驱动重构.md) | 多项目重复代码问题的成因与清单驱动解法、各功能实际作用 |
| [`docs/模板化标准手册.md`](docs/模板化标准手册.md) | 模板化改造的实战手册（逐项结论与踩坑记录） |
| [`docs/旧项目模板化改造指南.md`](docs/旧项目模板化改造指南.md) | 把扁平架构的旧项目改为模板架构的实操记录 |
| [`docs/前端片段化改造指南.md`](docs/前端片段化改造指南.md) | 整份 HTML 拆成片段、按需组装的实测数据 |
| [`docs/文件树.md`](docs/文件树.md) | 完整目录结构（`scripts/doc-tree.mjs` 自动维护） |
| [`docs/函数列表.md`](docs/函数列表.md) | 各源码文件的函数清单（`scripts/doc-func.mjs` 自动维护） |

## 命令速查

### 组装（把模板素材变为项目产出）

```bash
./setup.sh --to <项目>/assemble.json          # 组装
./setup.sh --to <项目>/assemble.json --dry-run # 预演：只列会写什么，不写盘
```

落点一律按清单 **dst**——清单是唯一真相。dst 没声明的地方，项目里就不该有文件。

模板侧维护的素材源：`templates/`（含 `templates/js/` framework 整树）+ `lib/`（清单键指向它们）；
组装按清单把选中的文件下发到项目侧的 dst。公共能力改在模板侧，不直接改项目侧。

### 组装前端

```bash
./setup.sh --list                      # 查看可用素材目录
./setup.sh --to example/assemble.json  # 组装模板自带的示例项目 example/
./setup.sh --to /path/to/proj/assemble.json   # 组装指定项目（清单即唯一参数）
./setup.sh --to /path/to/proj/assemble.json --check      # 只做清单一致性检查，不组装
./setup.sh --to /path/to/proj/assemble.json --dry-run    # 组装预演：只列会写什么，不写盘
./setup.sh --to /path/to/proj/assemble.json --untracked  # 列出不在清单里的文件
./setup.sh --fix-perm /path/to/proj                     # 修复执行位：按版本库记录恢复可执行位
```

组装逻辑：按清单逐项拷贝（详见下节）；蓝图框架与分片（HTML/CSS `@frag` 指令）在运行期由 framework 组装器拼装。**风格靠清单表达，没有风格参数**——同一份清单里写多个风格层的条目即可混搭，同名目标「靠后的源覆盖靠前的」（详见 `example/ASSEMBLE-COVERAGE.md`）。

#### `--dry-run`：组装预演（搬模板前先看一眼）

组装是**覆盖式写盘**，且清单常常是整份从别的项目复制过来的。预演回答「这一跑会动到哪些文件」：

```bash
./setup.sh --to /path/to/proj/assemble.json --dry-run
DRY_VERBOSE=1 ./setup.sh --to /path/to/proj/assemble.json --dry-run   # 目录条目展开到逐个文件
```

每个单文件条目标注三种状态之一——**覆盖**项最值得留意，那是会被模板内容盖掉的项目侧文件：

| 标记 | 含义 |
|---|---|
| `[新增]` | 目标不存在，本次会新建 |
| `[覆盖]` | 目标已存在且内容不同，本次会被模板版本盖掉 |
| `[相同]` | 目标已存在且内容一致，写不写都一样 |

目录条目显示「→ 目标（N 个文件）」；加 `DRY_VERBOSE=1` 可展开成逐个文件。

> **为什么值得先跑预演**：清单整份复制会把**本项目用不上的条目**一起带进来（真实案例：gallery
> 搬进了 `search-date-range.cjs`，而 gallery 既没有按时间搜索的路由、前端也没引它）。
> 这类文件不报错、只是静静躺在项目里，要等有人照着它改代码才发现。
> 预演让你在写盘**前**看到完整条目列表；`--check` 的「无引用」告警则在写盘**后**兜底。

#### `--check`：清单一致性检查（不组装）

按清单两端（模板源 → 项目目标）逐文件 md5 比对，回答两个问题：

```bash
./setup.sh --to /path/to/proj/assemble.json --check
```

| 输出类别 | 含义 |
|---|---|
| **不一致** | 清单某条两端内容不同——项目侧被改过（应改模板后重新组装），或模板更新后未重新组装 |
| **缺失** | 清单某条的某一侧不存在——未组装 |
| **无引用**（告警） | 组装下发了该模块，但项目自有代码里没有任何 require 链能到达它 |

「无引用」是**告警不是失败**：它提示该文件可能是搬模板时整份复制清单带进来的、本项目用不上的东西。
判据是**从项目自有入口出发的 require 传递可达性**——不是「有没有人 require 这个名字」。
框架件靠 `core/index.js` 聚合、由项目 `app.js` 引一个入口带进来，逐文件做字符串匹配会把整套框架
全报成无引用（那种误报会让人直接无视这条告警）。前端产物（`public/`）不参与判定：
它们由 HTML 的 `<script src>` 引用，规则不同。

退出码：有不一致或缺失 → `1`，可挂 CI（「无引用」单独不计入失败）。

> 「清单外文件」原先也在这里报，现已独立为 `--untracked`：那需要扫**整棵目录树**并套 `.gitignore`
> （项目文档、截图、本地配置本就该在清单外），与「两端是否一致」是两件事，混在一起只会长期报噪声。

这是发现「改动改错了地方」的**主要手段**：公共能力（`templates/js/` 等最通用层）必须改在模板，
若被改在项目侧，check 会把它报成「不一致」——此时应把改动补进模板再重新组装，
而不是留在项目里（留在项目里的改动会在下次组装时被模板旧版覆盖）。

`check` 的比对遵循组装的**后写覆盖**语义：多个源写同一目标目录时（blueprint 提供共用底座、
风格层提供该风格专属），取清单中最后一个提供该文件的源来比，因此「风格层有意覆盖 blueprint」
不会误报为不一致（例：iwara 风格层的 `row-thumb.css` 覆盖 blueprint 的灯箱版）。

#### `--untracked`：找出目录里不在清单的文件

扫**清单所在目录的整棵树**（含子目录），列出不在清单里的文件：

```bash
./setup.sh --to /path/to/proj/assemble.json --untracked
```

被 `.gitignore` 忽略的文件不计入——**复用 git 自己的规则**（`.git/`、`node_modules/`、
构建产物、日志、本地配置等），不自己实现匹配逻辑（gitignore 语义边角多，自实现必然与 git 漂移）。
无 git、非仓库或无 `.gitignore` 时降级为「不忽略任何文件」并明确提示。

发现清单外文件时**退出码为 1**，可挂 CI。

用途：迁移/重构后确认「该进清单的都进了」，或反过来查「项目里这些文件是哪来的」。
与 `--check` 的分工是——`check` 管「清单两端同不同步」，`untracked` 管「目录里还有什么没被清单覆盖」。

```bash
# 只想要机器可读结果（供脚本消费）
node scripts/assemble-manifest.js untracked /path/to/proj/assemble.json --json
```

#### `--migrate`：按新结构搬文件并改引用

项目已有素材、但结构要重排时（如 `templates/js/` 从平铺改为分子目录），用两份清单对照迁移：

```bash
./setup.sh --migrate <旧清单> --to <新清单> --dry-run   # 预演，不动盘
./setup.sh --migrate <旧清单> --to <新清单>             # 执行
```

- **旧清单**说明「文件现在在哪」，**新清单**说明「该搬到哪」；
- 按**落点文件名**配对（结构重排通常只改目录层级、不改文件名）；
- 搬完**自动改写相对引用**：既改被搬文件内部的 `require`，也改**指向**被搬文件的那些
  （如 `app.js` 的 `require("./js")` → `./js/core/index.js`）；
- 同名文件多个时先按父目录精确配对，仍不能一一对应的**报歧义让人工核对，绝不瞎搬**。

### 体检：扫死文件

重构（样式上移、分片改名、组件下线）后，旧文件常留在原地没人删——它们不再被任何 `@frag` 引用，却容易让人误以为「这块还在生效」。

```bash
node scripts/scan-dead-files.js <项目目录>          # 扫一个项目
node scripts/scan-dead-files.js <模板目录> <项目目录>  # 可给多个目录
node scripts/scan-dead-files.js <目录> --json        # 输出 JSON
```

判定：文件在 `fragments/` 下，且**没有任何 `@frag` 引用、文件名没被任何 HTML/JS/CSS/MD 提及、去扩展名后也没被当作类名/标识符使用**，即判为死文件。入口文件（`index.html` / `style.css` / `app.js` / `login.*`）豁免。

识别三种分片目录：项目形态 `server/public/fragments/`、模板通用层 `templates/（最通用 html/styles）`、模板风格层 `templates/_<系>/（html/ 与 styles/）`。

发现死文件时**退出码为 1**，可直接挂 CI：

```bash
node scripts/scan-dead-files.js . || echo "有死文件，需清理"
```

### assemble.json（按需取用）

每个要用模板的项目，在**项目根**放一份 `assemble.json`，声明「我要从模板取哪些文件」。`setup.sh` 只拷清单里列出的东西，**没列的本地文件永远不动**。

```json
{
  "brand": {
    "title": "My App",
    "logo": "brand.png",
    "icon": "favicon.png",
    "displayTitle": "My<br>App"
  },
  "files": {
    "templates/js/": "templates/js/",
    "templates/_downloader/html/login.html": "server/public/login.html",
    "templates/（最通用 html/styles）": "server/public/fragments/",
    "templates/_downloader/_gamebanana-mods/（html/ 与 styles/）": "server/public/fragments/",
    "templates/_downloader/_gamebanana-mods/assets/logo.png": "server/public/brand.png"
  }
}
```

- **键** = 模板仓库内的相对路径（模板里有什么）
- **值** = 项目内的相对路径（放到哪里；以 `/` 结尾 = 整目录拷贝）
- `app.js` / `config.schema.json` 是**清单素材**：由 `files` 条目显式声明 src 下发（旧 `init` 字段已不生效——setup 不再做蓝图骨架初始化复制）
- `"brand": {...}` = 品牌配置，运行期从本项目根 `assemble.json` 的 `brand` 段直接读取（详见下节）

**整目录取件 vs 逐文件显式列出**（两种写法可混用）：

```json
"templates/_downloader/_iwara/（html/ 与 styles/）": "server/public/fragments/",              // 整目录
"templates/_downloader/_iwara/styles/row-thumb.css":
    "server/public/fragments/styles/row-thumb.css"                                   // 单个文件
```

- **整目录**：适合「这个目录里的件都要」，新增文件自动带上，清单短。
- **逐文件**：适合**风格层覆盖**场景——想看清单就知道哪个文件覆盖了 blueprint 的哪个同名件，
  一望即知，不必展开目录去比对。代价是新增片段要记得补条目。
- 两者可写同一目标目录：组装按清单顺序复制，**靠后的源覆盖靠前的同名文件**。
  逐文件条目通常写在整目录条目之后，以明确其覆盖意图。
- `--check` 两种写法都认：逐文件列出的件不会被判成「无任何源提供」。

**清单里不放注释**：JSON 规范（RFC 8259）不支持注释，而在清单里塞 `_comment`
这样的自定义键会让「哪些是真实取件项」变得含糊。字段含义与用法统一记在本节，
清单本身只保留实际生效的 `files` / `brand` 两项（旧 `init` 段已废除）。

> 解析器仍会忽略 `files` 段内以 `_` 开头的键（历史清单兼容用），但新写的清单
> 不要再依赖这个机制。

**脚本放在模板仓库**：`setup.sh`（总入口，source `scripts/setup-lib.sh` 后按动作
参数分发到 `scripts/setup-*.sh`）及其依赖的
`assemble-manifest.js` / `lib-node.sh` 都只在模板仓库运行，**不复制进项目**。
项目里只留素材（`templates/`、`server/project/`）与产出（`server/public/`）。
组装都从模板仓库执行，见「命令速查」。

**品牌配置（`brand` 段）**：页面里的标题、logo、icon 用 `@brand:key@` 占位符
（HTML 属性位）或 `<!-- @brand:key -->` 注释（元素文本位）书写，运行期由
`templates/js/config/brand.js` 的 `readBrand(serverDir)` 从**项目根 `assemble.json`
的 `brand` 段**直接读取替换——**不再生成独立的 `server/public/brand.json`**。

```json
"brand": {
  "title": "My App",
  "logo": "brand.png",
  "icon": "favicon.png",
  "displayTitle": "My<br>App"
}
```

四个键都建议写上，键名与用途：

| 键 | 用途 | 缺省后果 |
|---|---|---|
| `title` | `<title>` 与 logo 的 `alt` | 页面标题与无障碍文本显示 `@brand:title@` |
| `logo` | 顶栏与登录页的 logo 文件名 | 图片裂开（`src="@brand:logo@"`） |
| `icon` | favicon 文件名 | 图标缺失 |
| `displayTitle` | 顶栏三行大字标题，**允许内嵌 `<br>`** | 顶栏直接显示 `@brand:displayTitle@` 字样 |

**键缺失时占位符会原样留在页面上**（`fragment-assembler` 对未命中的 key
返回原文，以便发现拼写错误），所以 `assemble.json` 的 `brand` 段必须把这四个键补齐。
`displayTitle` 与 `title` 分开是因为顶栏大字常与页面标题不同（例如页面标题
是 `iwara-downloader`，顶栏显示 `Iwara Video Downloader`）。

品牌配置 = 清单 `brand` 段本身，运行期只读，**组装不再生成 `brand.json`**：

- 组装产物里没有品牌配置文件——`readBrand(serverDir)` 运行时读项目根
  `assemble.json` 的 `brand` 段（`serverDir` 传 `server/` 目录，项目根 = 上一级）；
  段缺键或缺整段时返回空并提示，不阻断组装。
- 四个项目（example/iwara/gbmd/gallery）清单均声明 `brand` 段，组装后项目根
  `assemble.json` 存在，运行期即可读取；gallery 无 `@brand` 指令，不依赖品牌读取。
- 品牌参数属于项目自身，所以**不在脚本里内置任何项目名**（风格差异由清单声明）。

logo/icon 的文件本身仍要走 `files` 映射从风格模板拷进 `server/public/`，
`brand` 段里写的是**拷过去之后的文件名**。

> ✅ **改名图片只需改清单一处**
>
> 品牌配置没有第二份副本：logo 改文件名时，把 `assemble.json` 的 `brand.logo`
> 与 `files` 映射的目标路径一起改掉即可——运行期读的就是同一份清单，
> 不存在「`brand.json` 没跟」的静默碎图问题（旧版独立 `brand.json` 的
> 双份漂移问题已随本设计消除）。

**按需取用的三条约定**：

1. **用不上就不填** —— 清单只列你要的，其余一概不碰。
2. **想补充就直接加** —— 之后要用模板的新件（比如 `auto-update-card.js`），加一行即可。
3. **本地改过的，删掉引用** —— 某个文件你想自己维护（如 `app.js` / `style.css`），把它从清单里删掉，`setup.sh` 从此不再覆盖它。

**没有 `assemble.json` 会怎样**：

- `--to` 指定项目时：打印清单格式说明，并**询问是否生成带注释的空模板**
  （交互环境答 `y` 即在项目根生成 `assemble.json`，填好取件项后重跑本命令）。
- 非交互环境（管道 / CI）：不询问，打印提示后退出，不会挂住等输入。
- 不传 `--to`：直接打印帮助（没有「缺省目标」这回事——用哪个项目就显式给哪份清单，
  模板自带的 `example/` 也一样：`--to example/assemble.json`）。

清单内容会在组装**之前**校验：JSON 语法错、`files` 不是对象、值不是字符串
都会立即报错退出，不会留下半成品产物目录。

### 路径映射与引用自动推导

清单的每条 `源 → 目标` **本身就是一份路径映射表**：素材在模板里的位置，搬到项目后往往变了
（最典型的 `lib/cjs-bootstrap.cjs` → `lib/cjs-bootstrap.cjs`）。
素材内部的相对引用（JS 的 `require("./x")`、HTML 的 `<script src="./x.js">`）如果还按老位置写，
搬完就指不到人——**有映射表就不必手抄路径**，工具可以自动推。

#### 推导三步

以 `templates/js/update/auto-update.js` 里的 `require("../http/require-sibling")` 为例：

| 步骤 | 做法 | 本例结果 |
|---|---|---|
| ① 解析成源路径 | 按**源侧**把引用解析为模板内的逻辑位置 | `templates/js/http/require-sibling` |
| ② 查表翻成目标路径 | 用清单映射（含补 `.js` 后缀、目录前缀替换） | `templates/js/http/require-sibling.js` |
| ③ 按目标侧重算相对引用 | 从引用所在文件的目标位置出发 | `./require-sibling.js` |

于是引用自动跟着落点走：**改目录结构、改落点，都不用逐个手改引用**。

#### 两个工具

**`scripts/scan-framework-refs.js` —— 扫描，给分类整理当依据**

```bash
node scripts/scan-framework-refs.js            # 全量报告
node scripts/scan-framework-refs.js --cycles   # 只查循环依赖（拆目录前必跑）
node scripts/scan-framework-refs.js --json     # 机器可读
```

输出三块：每个模块的**正向依赖（→ 它 require 谁）与反向引用（← 谁 require 它）**、
**循环依赖检测**、**前端脚本/样式表被哪些 html 引用**（判断某 js 算不算「前端域」）。

拆子目录前先跑 `--cycles`：**有环就不能直接拆**（移动任一侧都会断链），无环才安全。

**`scripts/rewrite-refs.js` —— 按映射改写相对引用**

```bash
node scripts/rewrite-refs.js <清单>            # 预演：只列出「旧引用 ⇒ 新引用」
node scripts/rewrite-refs.js <清单> --apply     # 执行：写回模板源文件
```

只处理**相对引用**（`./` `../` 开头）。外部包、绝对路径、以及跨边界引用
（如风格层 `app.js` 里的 `require("./framework")` —— 它指的是项目**组装后**的位置，
清单里没有对应源）一律不动，并在报告里标 `⚠️ 无法解析` 供人工判断。

#### 三个已踩的坑（工具里已处理）

| 坑 | 现象 | 处理 |
|---|---|---|
| **注释里的示例代码被当成真依赖** | `require-sibling.js`、`routes-adapter.js` 的用法示例写在注释里，扫出两个**假的自引用循环依赖** | 解析前先剥块注释与行注释 |
| **`require` 省略后缀** | 素材普遍写 `require("./x")`（无 `.js`），而清单键是 `x.js`，**全部匹配不上** | 查表时补 `.js`/`.cjs`/`.mjs`，并支持目录 `index.js` |
| **HTML 引用的缓存查询串** | `./app.js?v=48` 被当成路径一部分，报「无法解析」 | 比对与改写只看路径，查询串原样接回 |

另外：算出的新路径若与**原写法等价**（都是 `./x` 而只是一个带 `.js` 后缀），**保留原写法**——
避免产生无意义的 diff 噪音。

#### 风格与组件

用哪套素材**由清单决定**，`setup.sh` 没有风格参数。要跨风格叠加素材（如 iwara 项目加
gbmd 的设置向导页面），直接在清单里加对应条目即可，同名文件以**清单顺序靠后者**为准。

### 启停

```bash
./start.sh start      # 启动
./start.sh stop       # 停止
./start.sh restart    # 重启（默认动作）
./start.sh status     # 状态
```

PID 写在项目根 `<项目目录名>.pid`。

`start.sh` 是**通用启停脚本**：gallery / gbmd / iwara 三个项目共用同一份（分发后 md5 一致），
拷进项目根即可用，不必按项目改脚本。三处通用化：

| 通用化点 | 说明 |
|---|---|
| **PID 清理不写死项目名** | 历史 PID 位置（旧版落在 `server/` 或 `/tmp`）只按 `$PROJECT_NAME` 枚举——`server/app.pid`、`server/<项目名>.pid`、`/tmp/<项目名>.pid`、`/tmp/<项目名>-macos.pid`、`/tmp/start-<项目名>.pid` |
| **`tools/` 与 `tool/` 双兼容** | 项目自带工具目录命名不一致（gallery 用 `tools/`，gbmd/iwara 用 `tool/`），脚本探测两个名字（先 `tools/` 后 `tool/`），`PATH` 与 `FFMPEG` 都基于探测结果；`find_node()` 候选同样覆盖两种命名 |
| **默认端口读 schema** | 优先读 `server/config.schema.json` 的 `"port": { "default": N }`（gallery 8081；gbmd/iwara 未声明则回落 8642），读不到才用 8642——通用脚本不写死某一个项目的端口 |

实际端口仍以各项目 `server/config.json` 为准，`DEFAULT_PORT` 仅在首次生成配置时作缺省值。

---

## 可选工具：网页截图（`templates/tools/page-shot.mjs`）

改完前端做「真实渲染自检」用的通用截图脚本，**按需接入**（不登记就不下发）。接入方式是在项目 `assemble.json` 的 `files` 里加一行：

```json
"templates/tools/page-shot.mjs": "scripts/page-shot.mjs"
```

```bash
node scripts/page-shot.mjs                                    # 自动推导端口 + 自动登录 + 逐标签截图
node scripts/page-shot.mjs --base http://<host>:8642 --password <访问密码>
node scripts/page-shot.mjs --tabs search,settings --plan shots.json
```

- 浏览器来源与 `headless-browser-env.mjs` 同一套约定（`DSH_PAGE_*` 环境变量 → `<DSH_HOME>/browser-env.json` → 自动探测），不硬编码任何本机路径
- 默认流程：打开 → 页面有 `#pwd` 就自动登录 → 截首屏 → 自动发现 `.tab[data-tab=…]` 逐个切换截图 → 写 `index.json`（含 `console.error` / `pageerror` 收集，前端报错一眼可见）
- 默认输出到**系统临时目录**（不碰仓库、无需改 `.gitignore`），`--out` 可改；`--plan` 加自定义步骤（`goto`/`click`/`fill`/`wait`/`shot`）
- 为什么需要：`curl` 只能拿到原始 HTML，SPA 要浏览器执行 JS 后才有内容（配合 `frontend-render-selfcheck`、`browser-error-observability`）

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

#### 两范式互转：`routes-adapter.js`（表式项目复用闭包式通用件）

框架的通用路由件 `routes-auth.js`（登录/登出/改密/状态）、`routes-auto-update.js`（自动更新四项）
写成了**闭包式** `module.exports = function register(api) { api.route(...) }`——它最初是为 iwara 的
`route-registry` 设计的。而 gbmd / gallery 走 **表式** `createRoute`，拿到通用件用不上，
只能各自手抄一份同逻辑的表式实现：这正是通用件注释里吐槽的**「逻辑漂移」**来源
（remember 长会话一处有一处没有、改密验旧密码一处有一处没有、会话文件一处落 `server/` 一处落 `json/`）。

`templates/js/route/routes-adapter.js` 把这条鸿沟填上——**调用一次闭包式注册件，把 `route` / `routePublic`
收集成表**，返回 `createRoute` 可直接消费的表：

```js
// server/routes/auth.js（表式项目复用闭包式通用件，全部内容）
const { tableFromRegister } = require("../route/routes-adapter");
const authRoutes = require("../route/routes-auth");

module.exports = tableFromRegister(authRoutes, {
  cfg, auth, sendJson, readBody, setSessionCookie,
});
```

| 项 | 说明 |
|---|---|
| 签名 | `tableFromRegister(register, deps, opts)` |
| `register` | 形如 `(api) => void` 的闭包式注册函数（框架通用件即此形态） |
| `deps` | 注入给 `register` 的依赖对象（`cfg` / `auth` / `sendJson` / `readBody` / `autoUpdate` / `setSessionCookie` …），适配器会用 `route` / `routePublic` 补全成 `api` 传入 |
| `opts.prefix` | 给所有路径加前缀（缺省不加） |
| 返回 | `createRoute` 表；**公开路由挂在返回值的 `.public` 上**（对齐 gbmd 的 `module.exports.public` 约定），另外也暴露 `.public` 为空表时的兜底（调用方不必判 `undefined`） |

几点约定：

- **method 统一大写、同一 key 后者覆盖**，与 `createRoute` 同语义；`"*"` 表示任意方法。
- **公开/鉴权分离**：通用件里 `route()` 注册的进主表、`routePublic()` 注册的进 `.public`，
  两边的原有语义不变。
- **依赖注入的时机**：`cfg` 往往在项目 `app.js` 装配阶段才创建，所以项目路由模块通常把适配器
  包一层 `init(deps)` 延迟装配（`_gallery` 的 `server/routes/auth.js`、`routes/auto-update.js` 即此写法）。
- **收益**：gallery 的 `routes/auth.js` 由 89 行降到 44 行、`routes/auto-update.js` 由 89 行降到 37 行，
  且与 iwara 用的是**同一份**通用件实现，逻辑只剩一处。

> 简言之：**闭包式写通用件（方便动态注册）、表式写项目（集中可读），适配器负责对接**——
> 通用件只需要维护一份，表式项目不再复制粘贴。

项目入口只做三件事（完整示例见 `templates/js/app.js`）：

```js
const {
  createConfig, createServer, createRoute, createAutoUpdate,
  sendJson, appLog, auth,
} = require("./core/index.js");

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
| `routes-adapter.js` 的 `tableFromRegister(register, deps, opts)` | 闭包式注册件 → 表式路由表（详见「路由：两种范式」） |
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

**迁移/改动本模块时**：改完是否等价，走项目自己的导出→导入流程验证即可。
（原先配套的 `test/data-backup-equivalence.test.sh` 是「旧 `lib` 实现 → 框架
`createBackup`」的一次性等价性证明；旧实现已从各项目删除、失去对比对象，该脚本随之移除。）

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

**项目侧只写传参，不复制框架代码**——`lib/auto-update.js` 从 framework 引入工厂后传项目参数：

```js
// lib/auto-update.js（项目实例，约 20 行）
const { createAutoUpdate } = require("../update/auto-update.js");

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

框架实现只有一份（`templates/js/update/auto-update.js`），改框架代码全部项目受益；项目侧别再拷贝框架主体。

重启走 `./start.sh restart`（项目唯一启停入口）。

### 自动更新卡片（公共前端件）

设置页的「🔄 自动更新」卡片是**公共件**，gbmd / iwara 及后续项目共用同一份，不用各写一遍：

| 文件 | 作用 |
|---|---|
| `templates/_downloader/html/auto-update-card.html` | 卡片 HTML（靠 `<!-- @frag:auto-update-card -->` 插进设置面板） |
| `templates/js/auto-update-card.js` | 卡片逻辑（自包含：不依赖项目 `api()`/`setStatus()`/`$()`，自己封装 fetch） |

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

卡片对应 4 个框架层接口（各项目 `routes/auto-update.js` 已提供）：`GET /api/auto-update/status`、`POST /api/auto-update/config`、`POST /api/auto-update/check`、`POST /api/auto-update/restart`。后端能力来自 `templates/js/update/auto-update.js`，前端能力来自这个公共件——两头都不用在项目里重复实现。

---

## 前端部件组织

主页面由「蓝图框架 + 片段」组装而成（运行期由 framework 组装器按注释指令拼接）：

| 位置 | 内容 |
|---|---|
| `templates/_downloader/html/index.html` | **共同框架**：页面骨架 + `<!-- @frag:片段名 -->` 注释指令（下载器系共用，唯一权威） |
| `templates/_downloader/html/` 与 `styles/` | **系级分片**：逐字相同的块（`tabs` / `no-pwd-warn` / `global-hud` / `browse-mask` / `topbar` 骨架） |
| `templates/_downloader/_gamebanana-mods/html/` | **gbmd 特有分片**：`topbar/{badge,userscript}` / `tab-panel/panel-*` / `scripts` |
| `templates/_downloader/_iwara/html/` 与 `styles/` | **iwara 特有分片**：`topbar/{badge,userscript}` / `tab-panel/panel-*` / `scripts` / `styles/*` |

各风格仍带 `public/` 目录放非分片部件：

| 部件 | 说明 |
|---|---|
| `app.js` | 主应用逻辑（外部文件，避免内联 XSS） |
| `style.css` | 样式（CSS 变量） |
| `theme-init.js` | 主题初始化（独立 script） |
| `login.html` / `login.js` | 登录页（蓝图共用；**项目可选**——不用独立登录页的风格层不引用它，如 gallery 用页面内 🔒 弹窗） |
| `setup.html` / `setup-init.js` / `path-picker.js` | 设置向导（gbmd 风格） |
| `play.html` / `play-app.js` / `vendor/` | 播放页（iwara 风格） |

**片段指令约定**：框架里写 `<!-- @frag:片段名 -->`（可不带 `.html` 后缀；子目录写 `topbar/brand`），
片段内可再嵌 `@frag` 指令（递归展开，深度上限 8）。片段路径相对片段根目录（目标 `public/fragments/`）。

**HTML 部件约定**：JS 一律外部文件（`<script src="x.js"></script>`），不写内联 `<script>` 代码——内联代码在 XSS 抽取改造时容易残留裸 JS 文本被浏览器当页面内容渲染。仓库提供自检脚本：

```bash
node scripts/scan-bare-js-html.js templates        # 扫描裸 JS 残留
python3 scripts/fix-bare-js-html.py                       # 修复（含 .bak 备份）
```

**组装后目录**（目标 `public/`）：

```
public/
  index.html          ← 蓝图框架（含 @frag 指令，不是完整页面）
  fragments/          ← 通用分片 + 特有分片合并后的片段根
    topbar.html       ← 统一 topbar 骨架（含 topbar/* 子指令）
    topbar/brand.html ← 品牌区（@brand:logo/alt/displayTitle 取值，各项目 assemble.json 的 brand 段提供）
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

### 接入要点：`@brand:` 引用的文件必须真实存在（易漏）

组装器只负责**把 `@brand:key@` 替换成 `assemble.json` 的 `brand` 段里写的字符串**，
它**不检查那个文件是否真的存在**。所以「清单 `brand.logo` 改了、`files` 映射没跟」
这类不一致不会报错，直接产出指向空文件的 `<img>`。

组装后按下面的方式自检——把三处引用 `@brand:logo@` 的模板各展开一次，
确认 src 指向的文件真实存在：

```bash
cd <项目>/server/public
node -e '
const { expandFrags } = require("../assemble/fragment-assembler.js");
const fs = require("fs");
const brand = JSON.parse(fs.readFileSync("../assemble.json", "utf8")).brand;
// 三处引用 @brand:logo@ 的模板：顶栏 / 登录页 / 设置向导
for (const f of ["fragments/topbar/brand.html", "login.html", "setup.html"]) {
  const src = (expandFrags(".", f, 0, brand).text.match(/src="([^"]+)"/) || [])[1];
  console.log(f, "->", src, fs.existsSync(src) ? "OK" : "文件不存在 ❌");
}
'
```

三行都要是 `OK`。出现 `文件不存在` 就是 `brand` 段与 `files` 映射不一致，
按「品牌配置（`brand` 段）」一节改齐两处。

> 同理适用于任何 `@brand:` 值指向文件的键（目前是 `logo` 与 `icon`；
> `title` / `displayTitle` 是纯文本，不涉及文件）。

---

## 把旧项目改成组装式

旧项目（如 gamebanana-mods-downloader / iwara-downloader）的既有结构不动，只把前端改成组装生成：

```bash
# 1. 组装前端到旧项目（覆盖 server/public/；旧项目根放一份 assemble.json 声明要取的素材）
./setup.sh --to /path/to/old-project/assemble.json

# 3. 之后改模板前端 → 重跑第 2 步即同步生效；改后端逻辑 → 直接在旧项目改
```

旧项目的业务后端（`server/routes/`、`lib/`）保持原样，不受组装影响。

---

## 约束

- **零依赖**：不引入 npm 包；不建 `package.json` / lock 文件（父目录有 `"type":"module"` 时，用 `server/boot.cjs` 强制 CJS，见下）
- **CJS**：框架层用 `require()`
- **模板默认不承载业务后端**：业务 `routes/`、`lib/` 在项目侧维护；系级可按需携带自己的后端实现（如 `templates/_gallery/server/`）
- **生成物不入库**：`server/project/*` 入 .gitignore，仅 `templates/` 白名单入库
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

完整文件树（含每项一句话介绍）见 [`docs/文件树.md`](docs/文件树.md) ——
由 `scripts/doc-tree.mjs` 自动维护（`node scripts/doc-tree.mjs gen --write` 刷新，注释映射在 `tree-doc.json`），
README 不再内嵌目录树，避免手工维护漂移。

**素材树顶层速览**（详见文件树）：

```
templates/                 # 素材树：按通用程度分层（父层通用化最高）
├── styles/ html/ js/ json/ assets/   # 最通用层（所有项目共用，可为空）
├── _downloader/           # 下载器系通用（styles/html/js/json/assets/test）
│   ├── _iwara/            # iwara 独有层（含 js/vendor、server 后端、test）
│   └── _gamebanana-mods/  # gbmd 独有层（含 server/lib）
└── _gallery/              # 画廊系（含 server 后端、json/locales）
lib/                       # 通用运行支撑件（cjs-bootstrap / start.sh / preview）
```

**通用级别是动态的，不是写死的**：素材的归属层级可随复用情况上提——
某个项目独有件被第二个项目用上时，拆出通用部分上提到系级（`_downloader/`）；
被所有项目共用时继续上提到根级类型目录（`templates/js/`、`templates/styles/` 等）。
上提后记得把清单里对应条目 src 改到新路径（dst 不变），并用 `--check` 验证两端一致。

---

## 功能说明

各功能模块的能力、设计与边界见 [`docs/功能说明.md`](docs/功能说明.md)——按功能模块组织，随代码更新。

本仓库不维护版本号与版本记录：功能变更直接更新该文档；目录结构与函数清单见
[`docs/文件树.md`](docs/文件树.md) / [`docs/函数列表.md`](docs/函数列表.md)，两者由脚本从真实代码自动生成（改完跑对应 `apply` 刷新）。
