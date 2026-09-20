---
name: setup-assemble
description: dl-server-template 模板化组装：setup.sh 命令用法 + assemble.json 清单 JSON 完整规范（组装/检查/扫描/迁移/回流五个动作、文件键规则、brand/init 段、素材 vs 产出、漏发体检对照法）。处理「跑 setup.sh 组装」「assemble.json 怎么写」「清单漏发检查」「模板怎么同步到项目」「setup 参数用哪个」类场景时加载。
whenToUse: 组装/检查/扫描/迁移/回流 dl-server-template 系项目（gallery/gbmd/iwara/example）时、编写或修改其 assemble.json 时、排查「清单声明了但项目缺文件/多处实现」类问题时。
generatedBy: deepseek-v4-flash
---

# 先记住我

- 清单（assemble.json）是「要哪些素材」的**唯一真相**；脚本没有风格参数，用哪套风格完全由清单条目决定（混搭 = 把想要的条目写进同一份清单）。
- 清单所在文件夹 = 项目根：所有相对路径以它解析，**只需传一个 `--to <清单路径>` 参数**，不需要也不能另传项目根。
- 目录条目（dst 以 `/` 结尾）= 整目录拷贝（含子目录与点文件）。
- **src==dst 是素材**（templates/ 风格层、framework/ 框架、project/blueprint/ 蓝图）参与回流；**src!=dst 是组装产出**（→ server/public/ 等）不参与回流。
- 组装是**覆盖式写盘**：先 `--dry-run` 预演，覆盖项最值得留意；正式组装前自动跑「分发前预检」亮出将被覆盖的项目改动与将补下发的缺失（只看不阻断）。
- 坑：素材在项目侧被项目自己改过 → 重装会被模板覆盖；`_` 开头键是注释（跳过校验与复制）；缺失只警告不阻断（全部缺失时提醒查源基准）。
- 全文以 `setup.sh` 与 `scripts/assemble-manifest.js` 实际代码为准（md 可能滞后）。

# 一、setup.sh 命令用法（四个动作一入口）

```
./setup.sh --to <项目清单>                    组装：按清单产出（清单 = <项目根>/assemble.json）
./setup.sh --to <项目清单> --dry-run          组装预演：只列将写入的文件（新增/覆盖/相同），不写盘 ★
./setup.sh --to <项目清单> --check            检查：清单两端是否同步（不一致 / 缺失 / 无引用）
./setup.sh --to <项目清单> --untracked        扫描：目录里有哪些文件不在清单（按 .gitignore 排除）
./setup.sh --migrate <旧清单> --to <新清单>    迁移：按新结构搬文件并自动改引用（缺省即执行）
./setup.sh --migrate <旧清单> --to <新清单> --dry-run   迁移预演（不改盘）
./setup.sh --to <项目清单> --pull             回流预演：列出项目侧改过的素材（项目 → 模板）
./setup.sh --to <项目清单> --pull --write     回流：把改动写回模板（写前备份模板原文件）
./setup.sh --list                             列出可用风格素材目录
./setup.sh  /  -h  /  --help                  输出帮助
```

参数要点（实测行为）：
- `--to` 必须指向 `assemble.json`（文件名校验，否则报错）；清单不存在/文件名为其他一律报错退出。
- 未知参数、多余位置参数**直接报错退出**（不再静默吞掉、不再兜底组装内置清单）。
- `--check` 只比对清单两端（报不一致 / 缺失），**不扫清单外文件**（实测输出会提示「查清单外请用 --untracked」）；`--untracked` 扫整棵树回答「目录里还有什么没进清单」（按 .gitignore 排除）——两者分工不同。
- `--migrate` 按落点**文件名配对**搬文件（结构重排只改目录层级），搬后自动改写被搬文件的相对引用；缺省即真迁移，`--dry-run` 才预演。
- `--pull` 只处理素材条目（src==dst）；产出条目（src!=dst）不参与双向同步，产物由组装生成。
- `DRY_VERBOSE=1` 配合组装预演可展开目录条目下的逐个文件；`SETUP_SKIP_PRECHECK=1` 跳过分发前预检（CI 批量组装用）。
- 无 `--to` 时不静默组装，报错并提示（交互式可回答 y 生成空白清单骨架；非交互 `cp server/project/blueprint/assemble.json <项目根>/assemble.json`）。
- `SETUP_LIB_ONLY=1` 时脚本只加载函数不做主流程（供 sync-to-project.sh 复用组装逻辑）。

组装流程顺序（理解输出日志）：
1. 定位清单（`--to` 唯一入口）→ 校验可解析（JSON 语法/结构，提前失败防半成品目录）
2. 目标初始化：蓝图骨架（`app.js`、`config.schema.json` 不存在才复制；清单 `init:false` 跳过）
3. 分发前预检（`--check` 同款比对，亮出将被覆盖的项目改动与将补下发的缺失）
4. 按清单复制（`_setup_copy_manifest`：逐文件 `cp -f`，目录条目逐个 mkdir+cp——保证「后写必覆盖」，多源写同一目标目录时靠后源覆盖靠前源是**设计意图**）
5. 品牌导出：brand 段 → `server/public/brand.json`（仅文件不存在时生成；rc=3 = 未声明 brand 段，非错误）
6. 收尾输出目标与 public/ 文件数

# 二、assemble.json 清单 JSON 规范

## 结构

```json
{
  "_comment": "JSON 不支持注释，_ 开头的键是注释说明，必须跳过（不校验不复制不计数）",
  "files": {
    "server/framework/auth/auth.js": "server/auth/auth.js",
    "server/templates/_gbmd-style/public/logo.png": "server/public/logo.png",
    "server/project/blueprint/fragments/": "server/public/fragments/",
    "server/templates/_downloader-style/public/": "server/public/"
  },
  "brand": { "name": "拾光集", "title": "拾光集", "displayTitle": "拾光集", "icon": "logo.png", "logo": "logo.png" },
  "init": true
}
```

## 键（files 的 key）——模板（源）内相对路径

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
## 值（files 的 value）——本项目（落点）相对路径

- 相对项目根（`dirname(清单)`）；以 `/` 结尾 = 整目录拷贝（含子目录与点文件）。
- 落点**一律按清单 dst**，清单 dst 没声明的地方项目里就不该有模板仓库的文件。

## 素材 vs 产出（判断条目是否参与回流）

- `src==dst`：素材条目（templates/ 风格层、framework/ 框架、project/blueprint/ 蓝图）→ 双向同步（`--pull` 回流、`--check` 比对）
- `src!=dst`：产出条目（如 → `server/public/`）→ 由组装生成，不参与回流

## 顶层其它段

- `brand`: 可选。导出为 `server/public/brand.json`（运行期由 fragment-assembler 的 `@brand:key` 注释指令取值替换页面标题/logo/icon）。**仅在 brand.json 不存在时生成**——它是运行期可变配置，项目改过就不该被组装覆盖（重置需先删文件）。
- `init`: 可选，缺省 true。`false` 时跳过蓝图骨架初始化（app.js/config.schema.json 不补、假设项目自带）。
- boot.cjs 与 cjs-bootstrap.cjs 改由清单下发（写死在项目清单里：`server/project/blueprint/boot.cjs` → `server/boot.cjs`、`server/lib/cjs-bootstrap.cjs` → `server/lib/cjs-bootstrap.cjs`），路径对不上时 `--check` 直接报「缺失」，不再悄悄跳过。

# 三、素材源布局（模板仓库内）

```
server/framework/          ← 通用 JS（HTTP/鉴权/路由工厂/配置/备份/自动更新/update 三件套）
server/templates/          ← 风格素材（只读）：_<名>-style/，新增风格 = 建目录，脚本自动发现
server/project/blueprint/  ← 组装蓝图（共用分片/静态资源 + app.js 骨架 + config.schema.json，入库）
server/project/            ← 缺省组装目标（生成物，不入库）
server/lib/                ← cjs-bootstrap.cjs、start.sh（模板源）
```

- 后端业务 JS 不在模板：通用件在 framework/，业务实现由各项目自己维护。
- `_gallery-style` 例外：它连同 `server/app.js` + `lib/` + `routes/` 一起带（gallery 全量后端为模板下发件）。
- `example/` 是模板自带示例项目（组装效果参考 + test/ 测试对象），组装方式与普通项目一致。

# 四、漏发体检（A 类：模板有源、清单漏声明）

模板每个源目录下所有文件都应有清单条目覆盖（或所属目录条目覆盖）。对照法（通用件 + 本项目实际使用的风格）：

1. 通用件候选 = `server/framework/**` + `server/project/blueprint/**`（除去 blueprint 自身元件 `README.md`/`app.js`/`assemble.json`/`config.schema.json`）+ `server/lib/` 的 `cjs-bootstrap.cjs`/`start.sh`。
2. 风格候选 = 清单实际声明的 `server/templates/<风格>/` 目录下全部文件（只对照本项目用到的风格；gallery 用 `_gallery-style`，gbmd 混用 `_downloader-style`+`_gbmd-style`，iwara 混用 `_downloader-style`+`_iwara-style`）。
3. 漏发 = 候选 − 清单声明（目录条目按前缀展开覆盖）。
4. ✗ 误报要排除：模板仓库自身运行件（`server/public/`、`server/app.js`、`server.log`、`sessions.json` 等非模板源）、其它项目风格文件、自研件（清单无源但项目有文件，如 iwara 的 `public/app.js`）、旧源未切（如 gbmd/iwara 的 style.css 仍从 `_downloader-style` 下发而 `_gbmd-style`/`_iwara-style` 的新 style.css 未接入——接入项需用户定夺，勿擅自切）。

历史 A 类实例（2026-09-20）：gallery/iwara/gbmd 的 `server/update/` 缺 `tree-copy.js`、`apply-staged-update.cjs`（清单只声明了 `auto-update.js`）→ 部署机 requireUp 找不到 `tree-copy.js` 启动即崩（本地测试被工作区模板仓库兜底掩盖，本地能跑≠部署能跑）；后补清单条目对齐。`config.schema.json` 同理（`_gbmd-style`/`_iwara-style` 有源但清单漏声明 → 项目侧缺失，start.sh 默认端口读取与 schema 驱动配置加载不对齐）。

# 五、坑与纪律

- 组装是覆盖式写盘：项目侧对下发件做过定制（端口/脚本）会被重装覆盖。正式跑前先 `--dry-run` + 看 `--check` 预检输出。
- 「多个源写入同一目标目录」（blueprint 共用底座 + 风格层专属）靠后源覆盖靠前源，是设计意图不是 bug（如 iwara 风格层覆盖 blueprint 的 row-thumb.css）；改清单顺序会改变覆盖结果。
- `brand.json` 已存在会被保留（组装不覆盖运行期可变配置）。
- 改模板源（framework/ 或 templates/）后，三项目要各自 `--to` 重组装同步才会生效——模板源不是自动下发。
- 漏发体检的候选集合必须是「清单实际引用的源 + 通用件」，否则会把模板仓库自身运行件/其它项目风格误报为漏发。
- 模块化常识：`assemble-manifest.js` 是清单解析唯一实现（list/check/untracked/migrate/pull/validate/init-flag/brand/resolve-base/asset-roots/generate 子命令）；setup.sh 只做「按行复制 + 计数 + 报缺失」，不再自行解析 JSON。

# 修改记录

- 2026-09-20：初版固化（基于 setup.sh 616 行 + assemble-manifest.js + 三项目漏发体检实战）。