# dl-server-template

零依赖 Node.js 下载器服务的模板仓库：**通用后端框架（framework）+ 前端部件素材（templates）+ 组装脚本（setup.sh）**。

用它可以建立一个新的下载器服务项目，也可以把已有的旧项目改成「组装式」（前端由模板素材组装生成，不再手改）。

---

## 一分钟上手（建新项目）

```bash
# 1. 建目录
mkdir my-downloader && cd my-downloader

# 2. 组装（从模板仓库执行；--to 指向本项目的 assemble.json）
<模板仓库>/setup.sh --to "$PWD/assemble.json"
# 例如：/path/to/dl-server-template/setup.sh --to "$PWD/assemble.json"

# 3. 之后想同步模板最新素材 → 重跑第 2 步即可（风格由清单声明，无需在命令行指定；
#     ./setup.sh --list 可列出模板自带的所有素材目录）

# 4. 写业务后端（app.js 里填业务路由；蓝图为起点），然后启动
cp <模板仓库>/start.sh ..
cp <模板仓库>/package.json ..
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
| **framework** | `server/framework/` | **只放通用 JS**（通用指「与风格无关、任何项目都同一份」）。按功能分子目录，见下 |
| **lib** | `server/lib/` | **通用运行支撑件**：启停脚本、CJS 劫持等「不是业务逻辑、但每个项目都要有」的文件。下发到项目后同样落在 `server/lib/`（与项目自有业务 JS 同目录，靠文件名区分） |
| **project** | `server/project/` | **只放通用 html / json / css**（不含 JS）。共用片段、样式、蓝图清单在这里 |
| **templates** | `server/templates/` | 风格专属素材：`_<名>-style/`，html / css / js / json **都可以放** |

**三条落位规则（新素材按此判断放哪）**：

| 素材类型 | 放哪 | 判据 |
|---|---|---|
| 通用 JS（后端或前端） | `server/framework/` | 两个以上风格共用、内容一致 |
| 通用运行支撑件（.sh / 启动劫持） | `server/lib/` | 每个项目都要有、但不属于业务逻辑 |
| 通用 html / css / json | `server/project/blueprint/` | 两个以上风格共用、且不是 JS |
| 风格专属（任意类型） | `server/templates/_<风格>-style/` | 只有该风格用，或各风格内容不同 |

**`server/lib/` 的判据**：放进来的文件应满足「所有项目内容完全一致」，
且与风格、业务无关——改它等于改所有项目。项目自有的业务 JS 也放 `server/lib/`，
但那属于项目自己的代码，**不进模板、不进清单**。两类混在同一目录是有意为之：
下发件与业务件在项目里同层，`require("../lib/xxx")` 不用区分来源。

**framework 内部按功能分类**（子目录，模块间相对 `require` 由工具自动推导，见「路径映射与引用自动推导」）：

| 子目录 | 职责 |
|---|---|
| `framework/core/` | 服务主体与聚合出口（`index.js` 是唯一对外出口） |
| `framework/route/` | 路由核心：匹配、工厂、注册表、范式适配、鉴权/更新路由表 |
| `framework/auth/` | 会话与密码校验 |
| `framework/http/` | 底层通用件：HTTP 工具、HTML 工具、异步 IO、路径安全、同级模块定位 |
| `framework/config/` | 配置装载与 schema 校验 |
| `framework/store/` | 数据存取：JSON 目录、备份、标记清单 |
| `framework/update/` | 自动更新 |
| `framework/assemble/` | 页面片段装配（`fragment-assembler.js`） |
| `framework/search/` | 按时间搜索的日期窗口解析（`search-date-range.cjs`，前后端共用同一套规则） |

> **前端 JS 为什么不在这里**：通用前端 JS（`theme-init` / `login` / `setup-init` /
> `search-date-range` / `auto-update-card`）以「蓝图源文件」形态放在 `server/project/blueprint/`，
> 由清单组装进 `server/public/` 供页面直接 `<script src>` 引用。
> 它们不经 `require` 装载、不参与模块解析，故不按后端模块的方式分层；
> 与页面片段（`server/templates/_<风格>-style/`）同理，属于「组装来源」而非「运行期模块」。

**文件名括号标识（约定，按需启用）**：同一功能出现多种实现、需要彼此区分时，
把描述写进**真实文件名**的括号里，靠**清单重命名**剥掉：

```json
"server/framework/route/route-core.js(默认线性匹配)": "server/framework/route/route-core.js",
"server/framework/route/route-core.js(带通配符匹配)": "server/framework/route/route-core.js"
```

清单左值是素材原名（带括号），右值是落到项目后的真实路径（剥括号）。
**只在重复时加**——不重复就用普通文件名，避免目录里全是括号噪音。

**风格是自动发现的，不写死在脚本里**：`setup.sh` 遍历 `server/templates/` 下一层目录，
把名为 `_<名>-style/` 的目录识别为一个风格，风格名取中间的 `<名>`。

- **新增风格**：建目录 `server/templates/_<名>-style/`（内含 `public/`、`fragments/`）即可，
  `setup.sh` 无需改动，`./setup.sh --list` 会立刻列出它。
- **风格层可以只带前端，也可以前后端一起带**：`_gbmd-style/`、`_iwara-style/` 只放前端素材，
  业务后端留在各项目自己维护；`_gallery-style/` 是本仓库第一个**后端也进风格层**的风格——
  它除 `public/` 外还带 `server/app.js`、`server/lib/`、`server/routes/`，
  把该风格的业务实现一并作为风格素材分发。两种形态并存，按风格需要选择即可。
  （`lib/cjs-bootstrap.cjs` 不属于风格层，它是框架下发文件，由 `setup.sh` 生成到项目的 `server/lib/`。）
- **不适用的目录自动跳过**：不符合 `_*-style` 命名的目录（`.trash-*`、备份、临时目录）不会被当成风格。
- **输出稳定**：风格列表去重后排序，`--list` 与「未知风格」错误提示的内容可复现。
| **组装产物** | `server/public/`、`server/app.js`、`server/config.schema.json` | 由 setup.sh 生成，**不入库**，可反复重装 |

后端业务代码（`server/routes/`、`server/lib/`）**默认不在模板仓库**，由项目自己实现；
但风格层**可按需携带**自己的后端实现——`_gallery-style/` 即携带 `server/`（`app.js` + `lib/` + `routes/`），
组装时一并落到项目侧，作为该风格的完整业务素材分发。

---

## 更多文档

| 文档 | 内容 |
|---|---|
| [`docs/命令参数总览.md`](docs/命令参数总览.md) | `setup.sh` 与清单工具的全部参数、退出码、扫描范围差异 |
| [`docs/清单驱动重构.md`](docs/清单驱动重构.md) | 多项目重复代码问题的成因与清单驱动解法、各功能实际作用 |
| [`docs/旧项目模板化改造指南.md`](docs/旧项目模板化改造指南.md) | 把扁平架构的旧项目改为模板架构的实操记录 |
| [`docs/前端片段化改造指南.md`](docs/前端片段化改造指南.md) | 整份 HTML 拆成片段、按需组装的实测数据 |

## 命令速查

### 组装（把模板素材变为项目产出）

```bash
./setup.sh --to <项目>/assemble.json          # 组装
./setup.sh --to <项目>/assemble.json --dry-run # 预演：只列会写什么，不写盘
```

落点一律按清单 **dst**——清单是唯一真相。dst 没声明的地方，项目里就不该有文件。

模板侧维护的素材源：`framework/` + `templates/` + `project/blueprint/`（清单键指向它们）；
组装按清单把选中的文件下发到项目侧的 dst。公共能力改在模板侧，不直接改项目侧。

### 组装前端

```bash
./setup.sh --list                      # 查看可用素材目录
./setup.sh --to example/assemble.json  # 组装模板自带的示例项目 example/
./setup.sh --to /path/to/proj/assemble.json   # 组装指定项目（清单即唯一参数）
./setup.sh --to /path/to/proj/assemble.json --check      # 只做清单一致性检查，不组装
./setup.sh --to /path/to/proj/assemble.json --dry-run    # 组装预演：只列会写什么，不写盘
./setup.sh --to /path/to/proj/assemble.json --untracked  # 列出不在清单里的文件
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

这是发现「改动改错了地方」的**主要手段**：公共能力（`framework/`、`blueprint/`）必须改在模板，
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

项目已有素材、但结构要重排时（如 `framework/` 从平铺改为分子目录），用两份清单对照迁移：

```bash
./setup.sh --migrate <旧清单> --to <新清单> --dry-run   # 预演，不动盘
./setup.sh --migrate <旧清单> --to <新清单>             # 执行
```

- **旧清单**说明「文件现在在哪」，**新清单**说明「该搬到哪」；
- 按**落点文件名**配对（结构重排通常只改目录层级、不改文件名）；
- 搬完**自动改写相对引用**：既改被搬文件内部的 `require`，也改**指向**被搬文件的那些
  （如 `app.js` 的 `require("./framework")` → `./framework/core/index.js`）；
- 同名文件多个时先按父目录精确配对，仍不能一一对应的**报歧义让人工核对，绝不瞎搬**。

### 体检：扫死文件

重构（样式上移、分片改名、组件下线）后，旧文件常留在原地没人删——它们不再被任何 `@frag` 引用，却容易让人误以为「这块还在生效」。

```bash
node scripts/scan-dead-files.js <项目目录>          # 扫一个项目
node scripts/scan-dead-files.js <模板目录> <项目目录>  # 可给多个目录
node scripts/scan-dead-files.js <目录> --json        # 输出 JSON
```

判定：文件在 `fragments/` 下，且**没有任何 `@frag` 引用、文件名没被任何 HTML/JS/CSS/MD 提及、去扩展名后也没被当作类名/标识符使用**，即判为死文件。入口文件（`index.html` / `style.css` / `app.js` / `login.*`）豁免。

识别三种分片目录：项目形态 `server/public/fragments/`、模板通用层 `server/project/blueprint/fragments/`、模板风格层 `server/templates/_<风格>-style/fragments/`。

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

**整目录取件 vs 逐文件显式列出**（两种写法可混用）：

```json
"server/templates/_iwara-style/fragments/": "server/public/fragments/",              // 整目录
"server/templates/_iwara-style/fragments/styles/row-thumb.css":
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
清单本身只保留实际生效的 `files` / `brand` / `init` 三项。

> 解析器仍会忽略 `files` 段内以 `_` 开头的键（历史清单兼容用），但新写的清单
> 不要再依赖这个机制。

**脚本放在模板仓库**：`setup.sh` 及其依赖的
`assemble-manifest.js` / `lib-node.sh` 都只在模板仓库运行，**不复制进项目**。
项目里只留素材（`server/templates/`、`server/project/`）与产出（`server/public/`）。
组装都从模板仓库执行，见「命令速查」。

**品牌配置（`brand` 段）**：页面里的标题、logo、icon 用 `@brand:key@` 占位符
（HTML 属性位）或 `<!-- @brand:key -->` 注释（元素文本位）书写，运行期由
`framework/fragment-assembler` 读 `server/public/brand.json` 替换。

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
返回原文，以便发现拼写错误），所以 `brand.json` 必须把这四个键补齐。
`displayTitle` 与 `title` 分开是因为顶栏大字常与页面标题不同（例如页面标题
是 `iwara-downloader`，顶栏显示 `Iwara Video Downloader`）。

`setup.sh` 组装时按清单的 `brand` 段生成 `server/public/brand.json`：

- **仅在文件不存在时生成** —— `brand.json` 是运行期可变配置，项目改过就不该被组装覆盖；
  想按清单重置，先删掉该文件再组装。
- **清单没写 `brand` 段就跳过** —— 不报错，也不生成。
- 品牌参数属于项目自身，所以**不在脚本里内置任何项目名**（风格差异由清单声明）。

logo/icon 的文件本身仍要走 `files` 映射从风格模板拷进 `server/public/`，
`brand.json` 里写的是**拷过去之后的文件名**。

> ⚠️ **改名图片时必须手工同步 `brand.json`**
>
> 「存在即保留」意味着 **`brand.json` 与 `assemble.json` 会各自独立地漂移**：
> 你把清单里的 `logo` 从 `brand.png` 改成 `logo.png`、把文件也改了名，
> 组装**不会**去更新已存在的 `brand.json` —— 它仍是旧文件名。
>
> 后果不是报错，是**静默碎图**：`@brand:logo@` 被替换成那个已删除的旧文件名，
> 顶栏 / 登录页 / 设置向导三处 `<img>` 一起 404。组装照旧报「0 缺失」，
> 命令行与日志都看不出问题，只有打开页面才发现图裂了。
>
> 实测（gbmd 项目，2026-09）：`brand.png` 改名 `logo.png` 后 `assemble.json`
> 已同步、`brand.json` 没跟，三处 src 全部指向不存在的 `brand.png`。
>
> **所以改图片文件名要一次改全三处**，改完按下节自检确认：
>
> | 位置 | 要改什么 |
> |---|---|
> | `assemble.json` 的 `brand.logo` | 新文件名 |
> | `brand.json` 的 `logo` | 新文件名（**不会自动跟随，必须手改**） |
> | `files` 映射的目标路径 | 新文件名（如 `server/public/logo.png`） |
>
> 若懒得三处对齐，另一条路是**保持 `brand.json` 与清单同名**：让清单里的
> `brand.logo` 直接写 `brand.png`，图片就叫 `brand.png`，永不改名。

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

清单内容会在初始化蓝图**之前**校验：JSON 语法错、`files` 不是对象、值不是字符串
都会立即报错退出，不会留下「蓝图已初始化、`boot.cjs` 已生成」的半成品目录。

### 路径映射与引用自动推导

清单的每条 `源 → 目标` **本身就是一份路径映射表**：素材在模板里的位置，搬到项目后往往变了
（最典型的 `server/lib/cjs-bootstrap.cjs` → `server/lib/cjs-bootstrap.cjs`）。
素材内部的相对引用（JS 的 `require("./x")`、HTML 的 `<script src="./x.js">`）如果还按老位置写，
搬完就指不到人——**有映射表就不必手抄路径**，工具可以自动推。

#### 推导三步

以 `server/framework/update/auto-update.js` 里的 `require("../http/require-sibling")` 为例：

| 步骤 | 做法 | 本例结果 |
|---|---|---|
| ① 解析成源路径 | 按**源侧**把引用解析为模板内的逻辑位置 | `server/framework/http/require-sibling` |
| ② 查表翻成目标路径 | 用清单映射（含补 `.js` 后缀、目录前缀替换） | `server/lib/require-sibling.js` |
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

`framework/route/routes-adapter.js` 把这条鸿沟填上——**调用一次闭包式注册件，把 `route` / `routePublic`
收集成表**，返回 `createRoute` 可直接消费的表：

```js
// server/routes/auth.js（表式项目复用闭包式通用件，全部内容）
const { tableFromRegister } = require("../framework/route/routes-adapter");
const authRoutes = require("../framework/route/routes-auth");

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
  包一层 `init(deps)` 延迟装配（`_gallery-style` 的 `server/routes/auth.js`、`routes/auto-update.js` 即此写法）。
- **收益**：gallery 的 `routes/auth.js` 由 89 行降到 44 行、`routes/auto-update.js` 由 89 行降到 37 行，
  且与 iwara 用的是**同一份**通用件实现，逻辑只剩一处。

> 简言之：**闭包式写通用件（方便动态注册）、表式写项目（集中可读），适配器负责对接**——
> 通用件只需要维护一份，表式项目不再复制粘贴。

项目入口只做三件事（完整示例见 `server/project/blueprint/app.js`）：

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

**项目侧只写传参，不复制框架代码**——`server/lib/auto-update.js` 从 framework 引入工厂后传项目参数：

```js
// server/lib/auto-update.js（项目实例，约 20 行）
const { createAutoUpdate } = require("../framework/update/auto-update.js");

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

框架实现只有一份（`framework/update/auto-update.js`），改框架代码全部项目受益；项目侧别再拷贝框架主体。

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

卡片对应 4 个框架层接口（各项目 `routes/auto-update.js` 已提供）：`GET /api/auto-update/status`、`POST /api/auto-update/config`、`POST /api/auto-update/check`、`POST /api/auto-update/restart`。后端能力来自 `framework/update/auto-update.js`，前端能力来自这个公共件——两头都不用在项目里重复实现。

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
| `login.html` / `login.js` | 登录页（蓝图共用；**项目可选**——不用独立登录页的风格层不引用它，如 gallery 用页面内 🔒 弹窗） |
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

### 接入要点：`@brand:` 引用的文件必须真实存在（易漏）

组装器只负责**把 `@brand:key@` 替换成 `brand.json` 里写的字符串**，
它**不检查那个文件是否真的存在**。所以「清单里文件名改了、`brand.json` 没跟」
这类漂移不会报错，直接产出指向空文件的 `<img>`。

组装后按下面的方式自检——把三处引用 `@brand:logo@` 的模板各展开一次，
确认 src 指向的文件真实存在：

```bash
cd <项目>/server/public
node -e '
const { expandFrags } = require("../framework/fragment-assembler.js");
const fs = require("fs");
const brand = JSON.parse(fs.readFileSync("brand.json", "utf8"));
// 三处引用 @brand:logo@ 的模板：顶栏 / 登录页 / 设置向导
for (const f of ["fragments/topbar/brand.html", "login.html", "setup.html"]) {
  const src = (expandFrags(".", f, 0, brand).text.match(/src="([^"]+)"/) || [])[1];
  console.log(f, "->", src, fs.existsSync(src) ? "OK" : "文件不存在 ❌");
}
'
```

三行都要是 `OK`。出现 `文件不存在` 就是上面说的 `brand.json` 漂移，
按 `assemble.json` 一节改齐三处。

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

旧项目的业务后端（`server/routes/`、`server/lib/`）保持原样，不受组装影响。

---

## 约束

- **零依赖**：不引入 npm 包；不建 `package.json` / lock 文件（父目录有 `"type":"module"` 时，用 `server/boot.cjs` 强制 CJS，见下）
- **CJS**：框架层用 `require()`
- **模板默认不承载业务后端**：业务 `routes/`、`lib/` 在项目侧维护；风格层可按需携带自己的后端实现（如 `_gallery-style/server/`）
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
├── setup.sh                         # 组装脚本（--to 指定项目清单）
├── example/                         # 完整演示项目（整体入库）：通用件+风格混搭+自研代码+假数据
│   ├── assemble.json                #   清单：演示风格混搭（iwara 骨架 + gbmd 下载面板）
│   ├── ASSEMBLE-COVERAGE.md         #   组装覆盖面速查（通用规则 + example 实例）
│   ├── json/items.json              #   假数据（项目数据，不受组装影响）
│   ├── self-test.sh                 #   自检：组装→自研保留→混搭→启动→API 探测
│   └── server/                      #   组装产物+自研代码，整体入库（运行期 config.json/sessions.json/日志除外）
├── test/
│   ├── run-all.sh                   # 跑全部测试（npm test）
│   ├── lib-test.sh                  # 测试共享库（断言/临时模板/跑组装）
│   ├── manifest-comments.test.sh    # 清单注释键
│   ├── manifest-invalid.test.sh     # 清单错误结构拒绝
│   ├── args.test.sh                 # 参数契约（--to/未知参数/已废除命令）
│   ├── assemble.test.sh             # 组装行为（落点按 dst、不造 templates/）
│   ├── mix.test.sh                  # 风格混搭覆盖顺序
│   ├── scan-sh-commands.test.sh     # sh 命令清单扫描
│   └── check-doc-commands.test.sh   # 文档命令一致性（README/总览 vs 脚本用法注释）
├── server/
│   ├── framework/                 # 通用后端 JS，按功能分 8 个子目录
│   │   ├── core/                  # 服务主体与聚合出口
│   │   │   ├── app.js             # HTTP 服务骨架
│   │   │   ├── app-log.js         # 日志（时间戳 + 事件）
│   │   │   └── index.js           # 统一出口
│   │   ├── route/                 # 路由核心：匹配/工厂/注册表/范式适配/通用路由件
│   │   ├── auth/auth.js           # 鉴权（session + cookie）
│   │   ├── http/                  # 底层通用件：http-utils / html-utils / fs-async / path-safe 等
│   │   ├── config/config-loader.js # 配置加载（schema 驱动）
│   │   ├── store/                 # 数据存取：json-dir / data-backup / marker-manifest
│   │   ├── update/auto-update.js  # 自动更新 createAutoUpdate
│   │   ├── assemble/              # 页面片段装配（fragment-assembler）
│   │   └── search/                # 按时间搜索的日期窗口解析（search-date-range.cjs）
│   ├── lib/                       # 通用运行支撑件（非业务）
│   │   └── cjs-bootstrap.cjs      # CJS 强制引导
│   ├── templates/                 # 风格层素材
│   │   ├── _gbmd-style/
│   │   │   ├── public/            # gbmd 非分片部件（app.js / style.css 等）
│   │   │   └── fragments/         # gbmd 特有分片（topbar/{badge,userscript} / tab-panel/ / styles/ 等）
│   │   ├── _iwara-style/public/   # iwara 风格部件
│   │   └── _gallery-style/        # gallery 风格（唯一「前后端都进风格层」的风格）
│   │       ├── public/            # 前端部件（含 locales/）
│   │       ├── config.schema.json # 该风格的配置 schema（含 port 默认 8081）
│   │       └── server/            # ← 后端业务实现也作为风格素材分发
│   │           ├── app.js         # 入口装配层（建配置/路由/启动，不写业务逻辑）
│   │           ├── lib/           # 领域逻辑（archive / auto-update / config / gif / scan / util）
│   │           └── routes/        # 业务路由（archive / auth / auto-update / browse / favorites / gallery / upload）
│   └── project/
│       └── blueprint/             # 组装蓝图（入库；两风格共用文件都在这里，无独立 _shared/）
│           ├── app.js             # 项目入口骨架
│           ├── config.schema.json # 配置 schema
│           ├── style.css          # CSS 框架（/* @frag:styles/xxx.css */ 指令）
│           ├── login.html / login.js / theme-init.js / search-date-range.js  # 共用静态资源
│           ├── index.html/downloader/index.html   # 共同框架（@frag 指令）
│           └── fragments/         # 通用分片（tabs / topbar.html / topbar/{brand,time} / styles/ 等）
├── scripts/
│   ├── assemble-manifest.js       # 清单解析唯一实现（setup.sh 依赖的清单工具）
│   ├── lib-node.sh                # Node 定位唯一实现（setup/start/测试共用）
│   ├── scan-sh-commands.js        # sh 脚本命令清单扫描（usage/tools → JSON）
│   ├── scan-bare-js-html.js       # 裸 JS 残留扫描
│   ├── fix-bare-js-html.py        # 裸 JS 残留修复
│   ├── func-index.js              # 函数索引（定向读取大文件）
│   └── verify-example-page.js     # example 页面验证（交付前真实渲染检查；jsdom 可选交互级）
├── setup.sh                       # 前端组装（支持 --to 任意目标）
├── start.sh                       # 启停脚本（start/stop/restart/status）
└── README.md
```

---

## 版本

| 版本 | 内容 |
|---|---|
| 1.7.24+ | **_iwara-style 播放页「收藏 / 关注」按钮（未升版）**：`.player-author` 新增按钮区（play.html 加 `.player-state-btns` / `.player-state-btn` 样式与 likeBtn/followBtn 按钮），play-app.js 新增 `refreshVideoState`（拉 `GET /api/video-state` 点亮按钮初始态——官方详情 liked/following + 项目侧本地 like_state 兜底）与 `bindStateButtons`（点「❤️ 收藏」→ `POST /api/like`、点「+ 关注」→ `POST /api/follow`，成功即时翻转按钮态，作者 id 暂缺时禁用并提示）。对应后端接口由项目侧提供（模板不含：official 列表接口 liked/following 恒 false，搜索/播放页展示真实收藏状态靠项目 `like-state.js` 本地缓存）。再次组装即下发到 iwara 等项目 |
| 1.7.23+ | **gallery 风格模板组装化细化（未升版）**：`_gallery-style/public/style.css`（670 行单文件）按组件拆分到 `_gallery-style/fragments/styles/`——base（Reset/壳布局/面包屑）/topbar（顶栏/导航/搜索）/sidebar（目录树/分组）/gallery（分组区/文件夹卡片/横向图片行/压缩包/卡片）/lightbox（三图轮播/下载收藏按钮）/settings（设置面板/登录模态/分类目录管理/目录浏览器）/upload（上传/拖拽覆盖层）/toast（提示/spinner）+ `themes/dark.css`（拾光集深色主题，恒深色）；`public/style.css` 回归 @frag 骨架由 fragment-assembler 运行时拼装。拆前拆后规则级等价验证：211 规则对 / 12 变量 / var() 引用完整性零差异。gallery 清单 3 个目录级条目（server/lib、server/routes、public/locales）改文件级，新增 `_gallery-style/fragments/` 下发条目——主题/组件/清单粒度与 downloader 系（_downloader-style）对齐 |
| 1.7.22+ | **public/framework 按 downloader 系细分（未升版）**：新增 `server/templates/_downloader-style/` 风格模板——`public/`（login.html/login.js/setup.html/setup-init.js/search-date-range.js/style.css/index.html）、`fragments/`（组件样式与页面片段，含 themes/day.css+night.css 每主题一文件）、`search/search-date-range.cjs`（原 `server/framework/search/` 日期范围模块移入，framework/search 移空）。`server/project/blueprint/` 回归通用件：boot.cjs、theme-init.js、auto-update-card.js、app.js、config.schema.json（gallery 也用的这些留在 blueprint）。gbmd/iwara/example 三清单 9 条 src 改引 `_downloader-style/`（`setup.sh --migrate` 新旧 dst 对比验证：gbmd 42 / iwara 52 落点全一致、无搬移，随后组装重新下发）；gallery 确认零 downloader 资产、清单不变（走 `_gallery-style` 自含样式）。主题拆分沿用：白天顶栏改蓝渐变 `linear-gradient(135deg, var(--primary), var(--accent2))` |
| 1.7.21+ | **_iwara-style 播放列表增强（未升版）**：①**自动连播**：侧栏「自动连播」开关（默认开、localStorage 记忆），`video:ended` 后按当前排序播放下一个，列表末尾播完停止；②**排序维度互斥按钮 + 正/倒序**：「时间」「名称」两个互斥按钮（分段控件，选中高亮）选排序维度，旁置「↓ 倒序 / ↑ 正序」按钮切换方向（时间=上传时间、名称=标题拼音），均 localStorage 记忆；③**文件夹分组**：列表按视频所在目录分组，组标题可折叠并显示组内数量，根目录显示为「根目录」；目录数据来自服务端 catalog 条目的 `rel` 字段（相对下载根目录的路径，根目录为空串，由项目侧 `video-index.js` 的 listCatalog 附加——模板不含该模块）；④**点击即播**：autoplay 被浏览器有声自动播放策略拦截时，首次点击画面立即开始播放，并拦截该次内核「单击暂停」；⑤**长按不弹设置菜单 + 左右拖动进度条**：左键/touch 按住画面期间抑制 contextmenu（ArtPlayer 右键「播放速度/画面比例/统计信息」面板不再因长按误弹，右键菜单保留）；桌面端按住画面左右拖动即 seek（拖动超过 10px 自动取消长按快进，document 级跟随 + pointer 捕获保证拖出画面不断）。改动：play.html / play-app.js / play-list.js / play-enhance.js |
| 1.7.20+ | **_iwara-style 播放器交互增强（未升版）**：`server/templates/_iwara-style/public/play-app.js` 三处增强——①**长按画面 3x 快进**：移动端开 ArtPlayer `fastForward`（长按 1 秒→3x，官方实现）；桌面端自实现 pointer 长按（按住 600ms→3x、松开恢复；长按结束的 click 在捕获阶段拦截，避免误触发内核「单击暂停」）；②**控制条右上角倍速按钮**（`art.controls.add` 动态组件：1x→1.25x→1.5x→2x→3x 循环，`video:ratechange` 与点击回调双路同步按钮文字，设置面板/快捷键改速也同步）；③**控制条自动隐藏时长** `Artplayer.CONTROL_HIDE_TIME` 由 3 秒调为 8 秒，不易误以为没有进度条。改动仅 play-app.js，不含 vendor 内核；重新组装即下发到 iwara 等项目 |
| 1.7.19+ | **sh 命令清单扫描 + 文档命令一致性检查（未升版）**：新增 `scripts/scan-sh-commands.js`——扫 sh 脚本，把注释里承诺的用法命令（usage）与实际调用的外部程序（tools）提成 JSON（命令作 key、脚本那句注释作 value，同源不另措辞）；`./` 前缀归一化（`./a.sh --check` 与 `a.sh --check` 视为同一条命令），并防「散文提到脚本名」的误报。新增配套测试 `test/scan-sh-commands.test.sh`。新增 `test/check-doc-commands.test.sh`：用 scan 生成的 JSON 校验 README.md 与 `docs/命令参数总览.md` 的命令命名——文档里写的每个「脚本名+选项」必须能在脚本用法注释中找到，否则报出（实测抓到 5 处不一致：README 3 处已废除的 `gbmd` 风格参数、总览 2 处已废除的 `--sync`/`--self-test`，已同步修正文档；同时修正 README 3 处 `--to` 传目录的旧写法为清单文件路径）。**另同步清理 README 全部「同步/就地组装」旧概念残留**：删除「直接复制模板当新项目（不用 sync）」小节（违反「组装脚本只在模板仓库执行、目标项目只有 assemble.json」的设计；sync 已废除后该场景失去存在理由）；「重同步/未同步/同步内容」等 --sync 时代措辞改为「重新组装/未组装」；项目入口示例 `require` 路径与 `blueprint/app.js` 实际代码对齐（`../framework` → `./core/index.js`）；目录树注释去掉已废除的 `sync-to-project.sh` 引用 | **example 升级为完整演示项目（整体入库）**：`assemble.json`、组装产物、自研代码（`server/routes/items.js`：`GET /api/items` 假数据 API + `/self-demo` 自研渲染页）、假数据（`json/items.json`，源风格混搭 iwara/gbmd/gallery）、自检脚本（`example/self-test.sh`：组装→自研保留→混搭→启动→API 探测一键跑，并接入 `test/example.test.sh` 进统一出口）全部入库，clone 即用、可作测试基准；`.gitignore` 只忽略 example 运行期文件（`config.json`/`sessions.json`/`server/*.log`）；示例端口改 `8090`（`config.schema.json`，避开模板其它项目默认端口）。**浏览器实测补漏**：首次交付后用户实测发现三类问题并已修复——①`@brand:` 原样输出（清单 brand 段键不全，缺 `title`/`displayTitle`/`icon`，顶栏/标题/图标三处原样）；②样式缺失（混搭清单只覆盖了 gbmd 下载面板、没连同其专属样式 `mod-group.css`/`grid-map.css` 一起下发，style.css 两处可选 @frag 残留）；③**标签页没有映射**（业务前端主脚本 `public/app.js` 模板不提供、须项目自研，缺失时页面能开但 tab 切换/列表渲染全不生效——example 已补自研版：tab 切换 + 调 `/api/items` 渲染假数据）。教训固化进 `example/ASSEMBLE-COVERAGE.md` 第九节（坑 6/7/8/9）：品牌键契约、风格专属片段须随面板下发、**交付前必须真实渲染验证（curl 不算）**、业务前端脚本须自研；**前端资源自动版本化**：`fragment-assembler` 装配 HTML 时自动给本地 `.js` 引用加 `?v=<内容 md5 前 8 位>`（静态资源 `Cache-Control: max-age=3600`，不带版本参数时浏览器缓存旧脚本、前端改动不生效——实测踩坑：改完代码用户还看到旧版）；脚本内容一变 hash 自动变、URL 自动变、浏览器强制取新版，模板/项目不用手写 `?v=`（iwara/gbmd 两风格 `scripts.html` 的手写版本参数已清理，统一由装配器接管；脚本文件纳入 mtime 缓存检测，改动即重拼）；**假数据列表走 gbmd 下载列表模板**：下载项/任务列表本就在「下载进度」面板（`#panel-progress` 的 `#taskList`）；示例下载项按 gbmd 模板结构渲染（`.mod-group` 按 style 分组 + `.item` 行 + 进度条 + 组头折叠，复用 `mod-group.css`/`task-list.css`），不自造表格、不放进「下载/搜索」面板 |
| 1.7.17 | **测试跟上 setup.sh 重新设计 + 清理旧设计残留注释**：1967be5 重写 setup.sh 后 `--to` 的语义已从「项目根」改为「项目清单文件」（清单所在目录即项目根），且移除了风格参数，但测试与三处注释没跟着改——①`test/assemble-parse.test.sh` 仍按旧契约传 `<项目根>/server`，12 个用例里 9 个因此失败（报「清单文件不存在」，与被测逻辑无关）。现按新契约重写：`--to` 传清单文件、去掉风格参数，并补 3 个契约用例（`--to` 指向不存在的清单 / `--to` 误传目录 / `--self-test` 组装到 example），从 4/9 变为 15/0。②setup.sh 注释里 `--to <项目根>…自动归一`、`--manifest <清单>`、`--with <组件,…>`三处均为旧设计残留（前者代码里根本没有归一逻辑，后两者参数解析里不存在——`--with` 混搭按新设计已由清单取代、系有意删除），一并删除。③移除 `test/data-backup-equivalence.test.sh`：它证明的是「旧 lib 实现 → 框架 createBackup」等价，而旧实现已从各项目删除、失去对比对象，且路径仍停在 `server/framework/` 旧布局（实际已移到 `server/store/`）；git 历史 2d14865 可恢复。④README 目录树同步实际布局（framework/ 平铺 17 模块 → 8 个子目录 + lib/），并更新已删测试的说明 |
| 1.7.19 | **废除 `--sync`/tree 落点（设计错误）+ 测试拆分**：①`_setup_copy_manifest` 的 `COPY_LAYOUT=tree` 落点用的是清单 **src** 而不是 **dst**——清单里 `templates/` 只作 src 出现（取素材的来处），从不出现在 dst，即清单从未声明过任何文件该落到 `templates/`；tree 模式却凭空往那里写，于是项目里长出 `server/templates/_<风格>-style/` 整个目录（实测 gbmd、iwara 都有，gallery 没有——三者清单写法一致，差异只是跑没跑过 `--sync`）。对 src==dst 的素材条目 tree 与 out 恰好同路，所以问题长期只显现在产出条目上：`templates/_gbmd-style/public/app.js` 本该产出到 `server/public/app.js`，tree 却写回它自己。落点改回 dst 后 tree 与组装完全等价、命令失去存在理由，故 `setup.sh --sync` 与 `scripts/sync-to-project.sh`（含其 `--all` 分支直接 `cp -r server/templates`）一并废除，`--sync` 现按未知参数明确报错而非静默当组装跑。判据确立：**清单 dst 没声明的地方，项目里就不该有文件**。②测试拆分：`test/assemble-parse.test.sh` 单文件 146 行混装 15 组用例，改成按功能域拆的 5 个文件（清单注释键 / 清单错误结构 / 参数契约 / 组装行为 / 风格混搭）+ `lib-test.sh` 共享库 + `run-all.sh` 汇总入口（`npm test`），各自独立进程与临时目录。新增回归：「组装不创建 `server/templates/`」「`--sync` 已废除并报错」——前者反向验证过（临时把落点改回 src，测试立刻失败），不是永远通过的假测试。实测 23 通过 / 0 失败。 |
| 1.7.18 | **组装预演 `--dry-run` + `--check` 新增「无引用」告警**：①组装此前是覆盖式写盘、跑之前看不到会动哪些文件，现支持 `--dry-run` 预演——每个单文件条目标注「新增 / 覆盖 / 相同」（覆盖项最值得留意），目录条目显示文件数、`DRY_VERBOSE=1` 可展开逐个文件；预演全程不落盘（已用「删产物文件→预演→确认未重建→正式组装→恢复」验证）。②`--check` 增加「无引用」告警：组装下发了某模块、但项目自有代码里没有任何 require 链能到达它，提示可能是搬模板时整份复制清单带进来的、本项目用不上的文件（告警不计入失败退出码）。判据刻意用**从项目自有入口出发的 require 传递可达性**，而非「有没有人 require 这个名字」——框架件靠 core/index.js 聚合、由项目 app.js 引一个入口带进来，逐文件字符串匹配会把整套框架全报成无引用；前端产物由 HTML 的 script src 引用，不参与判定。两个功能互为补充：预演让你在写盘前看条目，无引用告警在写盘后兜底。③动因是实际踩到的坑：gallery 从别的项目整份复制清单，搬进了 `search-date-range.cjs`，而 gallery 既没有按时间搜索的路由、前后端也都没有引用它——文件不报错、只是躺着，要等有人照着它改代码才踩坑。已移除该条目（项目侧产物由组装决定，下次组装即消失）。 |
| 1.7.16 | **日期范围检索独立为 `framework/search/`，README 修正不存在的 `frontend/`**：①把一个子目录塞两种职责（页面片段装配 + 日期范围检索）拆开——`framework/assemble/search-date-range.cjs` → `framework/search/search-date-range.cjs`，`assemble/` 只保留 `fragment-assembler.js`，README 目录表相应加 `search/` 行、`assemble/` 行改为只写「页面片段装配」。②README 目录表原先列了 `framework/frontend/`（通用前端 JS），但该目录实际不存在——前端 JS 一直以蓝图源文件形态放在 `server/project/blueprint/`、由清单组装进 `server/public/`，与后端模块不同（不经 require、不参与模块解析）。删掉该行，并把下面那条「为什么前端 JS 也算 framework」的说明改写为实际做法，避免下次照 README 去找不存在的目录 |
| 1.7.15 | **迁移能力补全 + 模板 lib/ 归位 + 组装缺陷修复**：①`assemble-manifest migrate` 的工作列表从「清单条目」扩到「项目内全部 js/cjs」——此前只处理清单提到的文件，漏掉不在清单、却 require 框架的业务代码（实测 gbmd 有 12 个 `server/routes/*.js` 因此未被改写，迁移后启动报 `Cannot find module '../framework'`）；判定改不改仍由「旧落点→新落点」映射决定，解析不到旧落点一律不动，不误伤。②`--dry-run` 预演新增「引用将被改写 N 处（涉及 M 个文件）」清单，逐条列出 `旧引用 ⇒ 新引用`，并标出「本文件也会移动 → 新落点」；预演跑的是与实际执行同一份逻辑的只读模式，不会出现「预演说没事、执行却改了」。③`setup.sh` 内联 python 生成清单改为调新子命令 `assemble-manifest generate <路径>`——清单结构属于工具的知识，散在脚本里会与 `validate`/`loadManifest` 各写一份、逐渐漂移；同时修提示文案（原写「带注释的空模板」，实际无注释）。④新增概念 **lib**（`server/lib/` 放通用运行支撑件）：启停脚本 `start.sh` 与 CJS 劫持 `cjs-bootstrap.cjs` 归位到模板 `server/lib/`，经清单下发到项目根 / `server/lib/`；README「三个概念」与落位判据同步补 lib 一行。⑤删 `setup.sh` 里冗余的 `mkdir -p server/public`（清单条目落到 public/ 时复制分支已建父目录），改为由 `brand.json` 生成处自建父目录——谁写文件谁负责建目录。⑥模板源 `server/templates/_gallery-style/` 与 `server/project/blueprint/` 共 5 个文件 10 处仍写着旧布局引用（`require('./framework')`、`../framework/routes-auth` 等），导致任何新项目组装后都无法启动（实测 `Cannot find module './framework'`）；已全部改为新结构路径，全新项目组装后启动正常。⑦`.gitignore` 补 `example/server/`：`setup.sh` 注释里写「产物不入库（见 .gitignore）」，但并无对应规则，实际组装一次就把 61 个产物文件暴露成未跟踪状态；现只忽略产物目录，保留 `example/assemble.json` 与 `ASSEMBLE-COVERAGE.md`。⑧修 `example/assemble.json`（模板自测清单）残留的旧路径 `server/framework/core/cjs-bootstrap.cjs` → `server/lib/cjs-bootstrap.cjs`，自测从「缺失 1 个」恢复为「缺失 0 个」。 |
 + 修两个鉴权缺陷**：①`framework/app.js` 的 `loginPath` 允许传空串，表示本服务没有独立登录页（登录走页面内弹窗，如 gallery 的 🔒）。原先未登录的页面请求一律 `302 Location: <loginPath>`，项目若不分发登录页就会跳到 404；现 `loginPath` 为空时改为回 `401 JSON {ok:false,error:"未登录",needsLogin:true}`，不写 `Location` 头。②**修白名单空串放行漏洞**：`whitelist = [loginPath, "/api/auth/", ...].concat(extraPaths)` 未过滤空值，而 `isWhitelisted` 用 `pathname.startsWith(entry)` 判定——`startsWith("")` 恒为 `true`，只要 `loginPath` 为空（新支持的用法）就会让**所有路径无条件放行**；现加 `.filter(Boolean)` 剔除空串。此缺陷在 `loginPath` 只能为非空默认值的旧约束下不可达，随①的新用法一并引入风险，故同时堵上。③`loginPath` 默认值保持 `"/login.html"` 不变，gbmd/iwara 行为零变化（两者均显式或隐式使用登录页，文件照常分发）。验证：gallery 组装产物与项目逐文件一致、`--to` 组装缺失 0；设 scrypt 密码后实测——未登录 `POST /api/gallery`、`POST /api/change-password` 均 401，登录后放行，不存在的页面未登录返回 404（证明空串未污染白名单）；gbmd 清单组装缺失 0 不回归 |
| 1.7.13 | **新增路由范式适配器 + gallery 风格层携带后端 + 启停脚本去项目耦合**：①新增 `server/framework/routes-adapter.js`（`tableFromRegister(register, deps, opts)`）——把闭包式 `register(api)` 通用件转成 `createRoute` 表式，公开路由挂在返回值 `.public`（对齐 gbmd 的 `module.exports.public` 约定），`opts.prefix` 可加路径前缀；表式项目因此能直接复用 `framework/routes-auth.js`、`framework/routes-auto-update.js`，不必再手抄同逻辑实现。gallery 的 `routes/auth.js` 89 → 44 行、`routes/auto-update.js` 89 → 37 行，两文件改为注入依赖后延迟装配（`init(deps)`）。②gallery 风格层新增后端：`server/templates/_gallery-style/` 除 `public/` 与 `config.schema.json` 外，现含 `server/app.js` + `server/lib/`（archive/auto-update/config/gif/scan/util）+ `server/routes/`（archive/auth/auto-update/browse/favorites/gallery/upload）——本仓库第一个「后端也进风格层」的风格，风格层从「只带前端素材」扩展为「可按需携带自己的业务实现」。`lib/cjs-bootstrap.cjs` 仍属框架下发文件，不在风格层。③修 `setup.sh` 的 `GEN_PATH` 路径 bug：`$TARGET` 在上方已归一为「项目根」（`--to <项目>/server` 会被剥成项目根），原先再拼 `$TARGET/..` 多退一层，报错提示里的 `cp` 目标落到 `<项目根>/../assemble.json` 幽灵位置，且若真在该处生成、`find_assemble`（只查 `$TARGET` 与 `$TARGET/..`）也找不到而陷入死循环；现统一为 `GEN_PATH="$TARGET/assemble.json"`（实测 `--to tmp/gp2/server`：修复前落 `.../工作区/tmp/assemble.json`、修复后落 `.../工作区/tmp/gp2/assemble.json`）。④`start.sh` 通用化三处：`legacy_pid_files()` 去掉写死的 `gbmd.pid` / `/tmp/gbmd.pid` / `/tmp/gbmd-macos.pid`，改为只按 `$PROJECT_NAME` 枚举（`server/app.pid`、`server/<项目名>.pid`、`/tmp/<项目名>.pid`、`/tmp/<项目名>-macos.pid`、`/tmp/start-<项目名>.pid`）；新增 `TOOL_DIR` 探测，`tools/` 与 `tool/` 两种命名都认（gallery 用 `tools/`、gbmd/iwara 用 `tool/`），`PATH` 与 `FFMPEG` 基于它，`find_node()` 候选同步覆盖两种布局；默认端口改为优先读 `server/config.schema.json` 的 `port.default`（gallery 8081，gbmd/iwara 未声明回落 8642），不再写死 8642。结果：gallery / gbmd / iwara 三项目共用同一份 `start.sh`（分发后 md5 一致），无需按项目改脚本。⑤`framework/app.js` 启动日志补局域网地址：`server.listen(port)` 不传 host 时监听 `::`/`0.0.0.0`（局域网可访问），原日志只打 `http://localhost:<port>` 易被误读成只能本机访问，现输出 `服务启动: http://localhost:<port>  (局域网: http://<本机IP>:<port>)` |
| 1.7.12 | **`--check` 支持「整目录条目 + 单文件条目写同一目标」**：清单可既用整目录取件、又对个别文件逐条显式列出（便于看清谁覆盖谁），但 `--check` 原先只认目录型条目的源，把逐文件列出的件判成「无任何源提供」、或与目录源比不中而误报（实测 iwara 拆出 8 条后误报 8 项）。现 `_checkDirEntry` 把「写该目标的单文件条目源」一并算作提供者，正向比对与反向孤儿判定都纳入。验证：iwara 拆分为 8 条具体条目后 `--check` 由 8 项不一致回到 0；负向测试人为改坏`row-thumb.css`（双源件）报 2 项、改坏 `scripts.html`（单文件条目件）准确报 1 项并指出条目，重新组装后归零；gbmd 回归仍 0 项不一致 |
| 1.7.11 | **风格列表改为目录自动发现，不再硬编码**：`setup.sh` 原写死 `STYLES="gbmd iwara"`，新增风格必须改脚本本身。现改为遍历 `server/templates/` 下一层，把 `_<名>-style/` 目录识别为风格（风格名取中间段），新增风格只需建目录、`--list` 立即列出，脚本零改动。不合规目录名（`.trash-*`、备份、临时目录）自动跳过；列表去重排序，`--list` 与「未知风格」提示输出稳定可复现。同步清理写死风格的两处文案：`setup.sh` 用法/示例与 `blueprint/app.js` 的报错提示改为「`<风格>`，见 `--list`」；README 补「风格自动发现」说明。验证：新建 `_teststyle-style/` 自动出现、`_dash-style` 识别为 `dash`、`.trash-*`/`_backup`/`regular-dir`正确跳过、连跑 3 次输出一致；gbmd/iwara 端到端组装各 48 文件、framework 20 模块、无幽灵目录，gbmd `--check` 0 项不一致 |
| 1.7.10 | **sync 复用 setup.sh 的复制实现 + `--check` 或逻辑修正**：①`sync-to-project.sh` 重写，不再自带一套「按素材根整目录搬」的逻辑，改为 `SETUP_LIB_ONLY=1` 加载 `setup.sh` 并调用它的 `_setup_copy_manifest`——两套复制实现对同一份清单的解读不一致，是长期漏搬的根源，现只有一套实现。落点差异由 `COPY_LAYOUT` 一个变量区分：`out`（组装，缺省）按清单 dst 写产出，`tree`（同步）按 src 落素材树。②`setup.sh` 加只加载守卫（被 source 时只定义函数、不跑主流程），函数定义集中到主流程之前。③修 `--check` 的或逻辑 bug：候选路径漏拼文件名，拿目录算 md5 恒为 null，导致「多源写同一目标目录」（blueprint 底座 + 风格层覆盖，如 iwara 的 `row-thumb.css`）全部误报不一致——iwara 实测 58 项误报清零。④清单不再写 `_comment` 段（字段含义统一在本 README），`setup.sh` 生成的清单同步精简，顶层只留 `files` / `brand` / `init` |
| 1.7.9 | **`setup.sh --check` 清单一致性检查 + `framework/` 异步 IO 归位 + iwara 专属缩略图样式**：①新增 `--check`：按清单两端（模板源 → 项目目标）逐文件 md5 比对，报「不一致 / 缺失 / 清单外文件」三类，退出码可用于 CI；这是发现「公共能力改错地方」的主要手段——改在项目侧的 `framework/` 会被报成不一致。②三个 `framework/` 文件此前被改在项目侧且未回流模板（`app.js` 静态服务异步、`auth.js` 会话写入失败留痕、`data-backup.js` 备份导出异步），本次归位模板，模板与两项目逐字同源，同步不再吞掉改动。③iwara 下载列表不需要点击放大预览图，故其风格层新增 `fragments/styles/row-thumb.css`（无灯箱版）覆盖 blueprint 的共用版——gbmd 仍用 blueprint 的灯箱版。④修三个真实 bug：`setup.sh` 目录复制用 `cp -rf` 不能确定性覆盖同名文件（导致风格层覆盖 blueprint 失效），改为逐文件强制覆盖；`validate` 把「多源写同一目标目录」当 problem 返回 1，使组装中断在自检之后（现降级为提示 ℹ️，它本就是设计允许的覆盖机制）；`check` 比对未考虑后写覆盖语义会误报风格层的有意覆盖 |
| 1.7.8 | **`start.sh` 自包含，成为项目通用启停脚本**：此前它 `source scripts/lib-node.sh`，但 `start.sh` 是「直接拷进项目根」的独立脚本，项目里没有 `scripts/`，换环境即报 lib-node.sh 不存在。现内联 Node 定位逻辑（候选顺序与 `lib-node.sh` 保持一致）。同一份 `start.sh` 现已实测可直接用于 gbmd（port 8642）与 iwara（port 28463）两个项目，端口由各自 `server/config.json` 决定、`DEFAULT_PORT` 仅作回落，故无需按项目改脚本 |

| 1.7.7 | **Node 定位收敛为唯一实现 `scripts/lib-node.sh`**：`start.sh` / `setup.sh` / `sync-to-project.sh` 各有一份 `find_node()` 拷贝，候选路径列表已出现偏差。现统一 source 该库（支持显式传入调用方特有候选，如 `tool/node/`），并修掉 `test/data-backup-equivalence.test.sh` 裸调 `node` 的问题——在 PATH 无 node 的环境（NAS 应用容器）下该测试必然失败，现改用 `$NODE_BIN`，实测通过 2/0。`lib-node.sh` 与 `assemble-manifest.js` 一并随 `setup.sh` 同步进项目（放同级，避开项目自有 `scripts/`） |

| 1.7.6 | **清单解析收敛为唯一实现 `scripts/assemble-manifest.js`**：此前「assemble.json 怎么解析」散在三处各写一遍（`setup.sh` 内嵌 python 两份、`sync-to-project.sh` 内嵌 python 一份），同一约定出现口径漂移。现统一由该模块提供 `resolve-base` / `list` / `asset-roots` / `brand` / `init-flag` / `validate`，bash 侧只消费输出。顺带修掉两个真实 bug：①`sync-to-project.sh` 不过滤 `_` 开头的注释键，把注释当成素材引用（计数虚增）；②其 `.sync-plan` 写在 `$TARGET/.sync-plan` 却从 `$PROJ_ROOT_FOR_PLAN/.sync-plan` 读，路径不一致导致「报成功但一个素材都没复制」。另修复无 node 环境下裸调 `node` 的静默失败（改用与 `start.sh` 同款 `find_node`），并把工具随 `setup.sh` 一起同步进项目（放同级，避开项目自有 `scripts/`）。已验证：重构前后对现网项目组装产物**逐字节一致** |

| 1.7.5 | **`sync-to-project.sh` 改清单驱动**：原先无差别搬 `framework/` + `templates/` + `project/blueprint/` 三个整目录，与 `assemble.json` 职责重叠（清单已精确声明要哪些素材），结果把用不到的 `_iwara-style/`（320K）和模板自己的 `.trash-*/`（1.1M）也搬进项目。现按清单引用只搬被用到的素材根（`framework` + `project/blueprint` + 实际用到的 `templates/_<风格>-style`），并保留组装依赖（framework、init 时的 blueprint 骨架）。实测同步体积 1.5M → 532K；无清单时提示并退回整份同步（`--all` 可显式指定），排除规则仍生效 |
| 1.7.4 | **`setup.sh` 清单源基准自适应**：清单「键」固定写 `server/...`，但解析器原先固定按 `$ROOT` 拼接。synced 布局（素材在 `<项目>/server/`，脚本是 `server/setup.sh`）下会拼成 `<项目>/server/server/templates/...`，表现为「清单找到了、却全部缺失」——README 推荐的 `--to .` 就踩这个。现按素材实际位置自动选源基准（模板仓库=模板根 / synced=项目根），同一份 assemble.json 两种布局通用；已验证 `--to .`、`--to <项目>/server`、`--to <项目根>` 三种写法结果一致 |
| 1.7.3 | **`sync-to-project.sh` 不再搬历史归档**：原实现整目录 `cp -r`，把模板仓库自己的 `.trash-*/`（重构留档，实测 1.1M）与 `*.bak` 一并复制进项目。改用 `sync_dir()`（rsync `--exclude` + `--delete-excluded` 清旧残留；rsync 不可用或失败时回落 `cp -r` 再事后清理，不中断同步）。实测同步体积 1.5M → 848K，素材完整、可独立组装 |
| 1.7.2 | **修复 `setup.sh --to` 幽灵目录**：文档写的 `--to <项目>/server` 与代码里 `SERVER_DIR="$TARGET/server"` 的「项目根」假设相互矛盾，导致组装全部写进 `<项目>/server/server/` —— 每一条都报 ✓、缺失 0，真实文件却一个没更新（`--to` 现统一归一为项目根，两种写法都可用）。另：`app.js` 之前不在组装清单里，项目 `public/app.js` 靠手工放置，现补映射 `_gbmd-style/public/app.js → server/public/app.js`；缩略图灯箱样式落在真正被组装的片段 `blueprint/fragments/styles/row-thumb.css` （非风格层 `style.css`——后者只是 26 行 `@frag` 骨架，运行期由 `framework/fragment-assembler` 展开） |
| 1.7.1 | **gbmd 下载列表缩略图点击放大**：下载进度页的预览图（含 GIF）可点击弹出灯箱看大图，点遮罩 / 按 Esc / 滚轮 关闭；点图片本身不关闭（便于细看）。`style.css` 新增 `.row-thumb-clickable`（`cursor:zoom-in` + hover 高亮）与 `.lightbox-mask`/`.lightbox-img`/`.lightbox-cap`；`app.js` 的 `rowHtml` 给缩略图加 `data-full`/`data-cap`，新增 `openLightbox`/`closeLightbox`，并在既有 `bindRowActionDelegation` 里加一个委托分支（与重试/跳过/错误复制同一套事件模型） |
| 1.7.0 | **作者子目录并入文件名模板**：原先「作者子目录」是独立开关（`useAuthorSubdir`），与 `fileNameTemplate` 各管一半；现模板里的 `/` 直接作为目录分隔——写 `{AUTHOR}/Iwara_-_{TITLE}_[{ID}]` 即按作者分目录，不写则存下载根目录，开关整体移除（`_iwara-style` 设置面板同步删掉该下拉，并补提示说明 `/` 用法） |
| 1.6.2 | **`start.sh` 重启失败根治**（「重启后服务没起来」）：①端口占用检测改为精确匹配——原 `awk '$4 ~ ":8642"'` 是子串匹配，`:18642` / `:86421` 会被误判成同端口，导致误等、误杀；②新增 `port_in_use()` / `wait_port_free()`：`start_server` 发现端口仍被占（上一次 SIGTERM 未走完、连接在 TIME_WAIT、或非 root 看不到占用者 PID）时不再直接启动而是等待端口真正释放（`START_WAIT_SEC`，默认 15s），等到就继续、等不到才明确报错退出——旧逻辑此时 bind 失败后进程秒退，表现为静默不启动；③`restart` 不再依赖固定 `sleep 1` |
| 1.6.1 | `task-list.css` 新增 `a.mm-play-btn`：下载列表「▶ 播放」是 `<a>`，原先只匹配到 `.mm-play-btn` 的尺寸规则、靠 `.btn` 兜底，层叠顺序一变就回落成裸链接；现显式补齐边框/圆角/底色/文字色与 hover，不依赖层叠顺序 |
| 1.6.0 | **`<a>` 当按钮用不再丢样式**：`components.css` 的按钮规则原本全部限定 `button.标签`，而顶栏「油猴脚本」入口与下载列表「▶ 播放」都是 `<a>`，只匹配到尺寸类、拿不到边框/底色/文字色，显示成裸链接。现把按钮外观扩展到 `.btn`（含 `a.btn` / `a.ghost` 去下划线），两个项目的两个入口补 `btn` 类。另：下载列表 gif 预览——`row-thumb.css` 新增 `.row-thumb-wrap` / `.row-thumb-badge`，gif 缩略图右下角显示 GIF 角标 |
| 1.5.0 | **顶栏徽章元素 id 统一为 `UserBadge`**：`topbar/badge.html` 原按项目取名（`gbUserBadge` / `iwaraUserBadge`），导致通用层的 `topbar-badge.css` 必须把两套 id 选择器并列写死；现两个风格层统一用 `UserBadge` / `UserName` / `UserRemain`，CSS 只针对一个 id 写样式（18 处选择器不变，三态 class 前缀 `gb-user-*` / `iwara-user-*` 保留）。同时补上 `blueprint/style.css` 漏引的 `@frag:styles/mod-group.css`、`@frag:styles/grid-map.css`——这两个片段此前虽已拆出但未被引用，导致 gbmd 下载列表分组折叠样式在产物 CSS 中缺失 |
| 1.4.0 | **多项目同 host 部署的 Cookie 名冲突**：框架 `auth` 的会话 cookie 默认名 `session` 被两个项目同时使用，而 Cookie 按 host 隔离、不区分端口，导致互相覆盖（表现为「登录后很快又要重新登录、记住设备形同虚设」）。`auth.js` 增加部署警示注释，项目侧须各用各的 `cookieName`（如 `gbmd_session` / `iwara_session`）。**保存按钮改版**：移除右下角悬浮保存按钮（非设置页误触会把整页设置静默写库），改为每张功能卡片自己的保存按钮——gbmd 在「下载选项」加「保存 Cookie」，iwara 在设置页底部加「保存设置」。**样式上移**：`login-detect.css`、`toast.css`、`topbar-badge.css` 从 gbmd 风格层上移通用层，iwara 此前缺失这些分片导致顶栏错乱；`save-fab.css` 改名 `diff.css`（按钮已移除，仅剩 diff 样式）。**新增 `scripts/scan-dead-files.js`**：扫出没被任何 `@frag` 引用、也没被 HTML/JS/CSS 提及的残留分片，退出码可直接挂 CI |
| 1.3.0 | **顶栏分片归位通用层**：`topbar/brand.html`、`topbar/time.html` 原被当成风格特有件、两个风格各存一份（time 逐字相同，brand 仅 logo 与标题文字不同），实际上是所有项目共用的界面部件，已上移 `blueprint/fragments/topbar/`，风格层副本删除。品牌区改由 `@brand:logo@` / `@brand:title@` / `@brand:displayTitle@` 取值，各项目 `brand.json` 提供（新增 `displayTitle` 键承载顶栏三行标题，因它与 `<title>` 用的 `title` 语义不同）。风格层仅保留真正特异的 `topbar/{badge,userscript}` |
| 1.2.0 | 文档：新增「接入要点：`style.css` 也必须走组装器」——说明组装产物里框架文件只留 `@frag:` 指令骨架，服务端须按 `assembler.list()` 判据（而非扩展名）展开 `.css`，否则页面失去全部样式；附错误/正确写法与自检命令 |
| 1.1.0 | `data-backup` 清单生成改为复用 `marker-manifest`（移除内联扫描解析，273→216 行），修正框架文档示例被当成数据条目、带引号 `desc="..."` 被原样输出的问题；新增 `test/data-backup-equivalence.test.sh` 备份迁移等价性验证脚本；`setup.sh` 缺清单时询问生成带注释的空模板、清单格式预校验前移；`assemble.json` 支持 `_comment` 注释键（组装时跳过 `files` 内 `_` 开头的键）；新增 `test/assemble-parse.test.sh` 组装行为自测 |
| 1.0.0 | 初版：通用后端框架（HTTP / 鉴权 / 配置 / 路由工厂 / 备份 / 自动更新）+ 组装式前端 + 风格模板 |
