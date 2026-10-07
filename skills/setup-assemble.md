---
name: setup-assemble
description: bench-template 模板化组装：setup.sh 命令用法 + assemble.json 清单 JSON 完整规范（组装/检查/扫描/迁移/回流五个动作、文件键规则、brand 段、素材 vs 产出、漏发体检对照法）。处理「跑 setup.sh 组装」「assemble.json 怎么写」「清单漏发检查」「模板怎么同步到项目」「setup 参数用哪个」类场景时加载。
whenToUse: 组装/检查/扫描/迁移/回流 bench-template 系项目（gallery/gbmd/iwara/example）时、编写或修改其 assemble.json 时、排查「清单声明了但项目缺文件/多处实现」类问题时。
generatedBy: deepseek-v4-flash
---

# 先记住我

- 清单（assemble.json）是「要哪些素材」的**唯一真相**；脚本没有风格参数，用哪套风格完全由清单条目决定（混搭 = 把想要的条目写进同一份清单）。
- 清单所在文件夹 = 项目根：所有相对路径以它解析，**只需传一个 `--to <清单路径>` 参数**，不需要也不能另传项目根。
- 目录条目（dst 以 `/` 结尾）= 整目录拷贝（含子目录与点文件）。
- **src==dst 是素材**（templates/ 素材树、lib/ 支撑件）参与回流；**src!=dst 是组装产出**（→ server/public/ 等）不参与回流。
- 组装是**覆盖式写盘**：先 `--dry-run` 预演，覆盖项最值得留意；正式组装前自动跑「分发前预检」亮出将被覆盖的项目改动与将补下发的缺失（只看不阻断）。
- 坑：素材在项目侧被项目自己改过 → 重装会被模板覆盖；`_` 开头键是注释（跳过校验与复制）；缺失只警告不阻断（全部缺失时提醒查源基准）。
- 全文以 `setup.sh`（总入口）+ `scripts/setup-*.sh` 与 `scripts/assemble-manifest.js` 实际代码为准（md 可能滞后）。

# 一、setup.sh 命令用法（总入口，内部按动作拆分为 scripts/setup-*.sh）

```
./setup.sh --to <项目清单>                    组装：按清单产出（清单 = <项目根>/assemble.json）
./setup.sh --to <项目清单> --dry-run          组装预演：只列将写入的文件（新增/覆盖/相同），不写盘 ★
./setup.sh --to <项目清单> --check            检查：清单两端是否同步（不一致 / 缺失 / 无引用）
./setup.sh --to <项目清单> --untracked        扫描：目录里有哪些文件不在清单（按 .gitignore 排除）
./setup.sh --migrate <旧清单> --to <新清单>    迁移：按新结构搬文件并自动改引用（缺省即执行）
./setup.sh --migrate <旧清单> --to <新清单> --dry-run   迁移预演（不改盘）
./setup.sh --to <项目清单> --pull             回流预演：列出项目侧改过的素材（项目 → 模板）
./setup.sh --to <项目清单> --pull --write     回流：把改动写回模板（写前备份模板原文件）
./setup.sh --fix-perm [<仓库路径>]            修复执行位：按版本库记录恢复可执行位
./setup.sh --list                             列出可用风格素材目录
./setup.sh  /  -h  /  --help                  输出帮助
```

参数要点（实测行为）：
- `--to` 必须指向 `assemble.json`（文件名校验，否则报错）；清单不存在/文件名为其他一律报错退出。
- 未知参数、多余位置参数**直接报错退出**（不再静默吞掉、不再兜底组装内置清单）。
- `--check` 只比对清单两端（报不一致 / 缺失），**不扫清单外文件**（实测输出会提示「查清单外请用 --untracked」）；`--untracked` 扫整棵树回答「目录里还有什么没进清单」（按 .gitignore 排除）——两者分工不同。
- `--migrate` 按落点**文件名配对**搬文件（结构重排只改目录层级），搬后自动改写被搬文件的相对引用；缺省即真迁移，`--dry-run` 才预演。
- `--fix-perm` 按 `git ls-files -s` 里记录为 `100755` 的文件逐个恢复工作区执行位（只动权限位、不改内容/索引），修完 `git status` 的 `mode change` 噪音清零；幂等。参数传仓库路径（缺省当前仓库）。跨挂载点搬运（NFS/CIFS、整目录拷贝、解包）会丢执行位，换环境后先跑一次。若目标落在 `noexec` 挂载点，执行位恢复了 `./x.sh` 仍会被内核拒绝——命令会探测并提示改用 `bash x.sh`。判断「有无执行位」必须用 `stat -c '%A'`，`[ -x file ]` 在 noexec 下恒为假（实测踩坑）。
- `--pull` 只处理素材条目（src==dst）；产出条目（src!=dst）不参与双向同步，产物由组装生成。
- `DRY_VERBOSE=1` 配合组装预演可展开目录条目下的逐个文件；`SETUP_SKIP_PRECHECK=1` 跳过分发前预检（CI 批量组装用）。
- 无 `--to` 时不静默组装，报错并提示（交互式可回答 y 生成空白清单骨架；非交互 `cp example/assemble.json <项目根>/assemble.json`）。

组装流程顺序（理解输出日志）：
1. 定位清单（`--to` 唯一入口）→ 校验可解析（JSON 语法/结构，提前失败防半成品目录）
2. 分发前预检（`--check` 同款比对，亮出将被覆盖的项目改动与将补下发的缺失）
3. 按清单复制（`setup-assemble.sh` 的 `_setup_copy_manifest`：逐文件 `cp -f`，目录条目逐个 mkdir+cp——保证「后写必覆盖」，多源写同一目标目录时靠后源覆盖靠前源是**设计意图**）
4. 品牌不导出（无 `brand.json`）：运行期由 `templates/js/config/brand.js` 的 `readBrand(serverDir)` 从项目根 `assemble.json` 的 `brand` 段读取
5. 收尾输出目标与 public/ 文件数

# 二、assemble.json 清单 JSON 规范

## 结构

```json
{
  "_comment": "JSON 不支持注释，_ 开头的键是注释说明，必须跳过（不校验不复制不计数）",
  "files": {
    "templates/js/auth/auth.js": "server/auth/auth.js",
    "templates/_downloader/_gamebanana-mods/assets/logo.png": "server/public/logo.png",
    "templates/_downloader/html/": "server/public/fragments/",
    "templates/_downloader/styles/": "server/public/"
  },
  "brand": { "name": "拾光集", "title": "拾光集", "displayTitle": "拾光集", "icon": "logo.png", "logo": "logo.png" }
}
```

## 键（files 的 key）——模板（源）内相对路径

- **键** = 模板仓库内的相对路径（模板里有什么）
- **值** = 项目内的相对路径（放到哪里；以 `/` 结尾 = 整目录拷贝）
- `app.js` / `config.schema.json` 是**清单素材**：由 `files` 条目显式声明 src 下发
- `"brand": {...}` = 品牌配置，运行期从本项目根 `assemble.json` 的 `brand` 段直接读取（详见下节）

**整目录取件 vs 逐文件显式列出**（两种写法可混用）：

```json
"templates/_downloader/_iwara/html/": "server/public/fragments/",                  // 整目录
"templates/_downloader/_iwara/styles/row-thumb.css":
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

- `src==dst`：素材条目（templates/ 素材树、lib/ 支撑件）→ 双向同步（`--pull` 回流、`--check` 比对）
- `src!=dst`：产出条目（如 → `server/public/`）→ 由组装生成，不参与回流

## 顶层其它段

- `brand`: 可选（建议写全四键）。**不导出任何文件**——运行期由 `templates/js/config/brand.js` 的 `readBrand(serverDir)` 从项目根 `assemble.json` 的 `brand` 段读取，替换页面里 fragment-assembler 的 `@brand:key` 占位符（标题/logo/icon）。缺键或缺整段时返回空并提示，不阻断组装。
- `commands`: 可选（字符串或字符串数组）。组装完成后在**项目根**逐条执行的钩子命令，用于生成下游产物（如油猴脚本 `node "$SETUP_TEMPLATE_ROOT/scripts/build-userscript.js" ...`）；注入 `SETUP_TEMPLATE_ROOT`（模板仓库根）/ `SETUP_PROJECT_ROOT`（项目根）两个环境变量。`--dry-run` 只打印不执行；任一命令失败则该次组装以非 0 退出（便于 CI 发现）。
- boot.cjs 与 cjs-bootstrap.cjs 由清单下发（`templates/js/boot.cjs` → `server/boot.cjs`、`lib/cjs-bootstrap.cjs` → `server/lib/cjs-bootstrap.cjs`），路径对不上时 `--check` 直接报「缺失」。

# 三、素材源布局（模板仓库内）

```
templates/styles|html|js|json|assets ← 最通用层（所有项目共用，可为空）
templates/_downloader/     ← 下载器系（_iwara/ _gamebanana-mods/ 为项目独有层）
templates/_gallery/        ← 画廊系（含 server/ 后端）
templates/js/              ← 通用 JS（framework 整树：core/route/http/store/update/auth/assemble/tool/config）
lib/                       ← cjs-bootstrap.cjs、start.sh、preview/（通用支撑件）
```

- 后端业务 JS 不在模板：通用件在 framework/，业务实现由各项目自己维护。
- `_gallery` 例外：它连同 `server/app.js` + `lib/` + `routes/` 一起带（gallery 全量后端为模板下发件，见 `templates/_gallery/server/`）。
- `example/` 是模板自带示例项目（组装效果参考 + test/ 测试对象），组装方式与普通项目一致。

# 四、漏发体检（A 类：模板有源、清单漏声明）

模板每个源目录下所有文件都应有清单条目覆盖（或所属目录条目覆盖）。对照法（通用件 + 本项目实际使用的风格）：

1. 通用件候选 = `templates/js/**`（framework 整树）+ `templates/` 根级类型目录 + `lib/` 的 `cjs-bootstrap.cjs`/`start.sh`/`preview/**`。
2. 系级候选 = 清单实际声明的 `templates/<系>/` 目录下全部文件（只对照本项目用到的系；gallery 用 `_gallery`，gbmd 用 `_downloader/_gamebanana-mods`，iwara 用 `_downloader/_iwara`）。
3. 漏发 = 候选 − 清单声明（目录条目按前缀展开覆盖）。
4. ✗ 误报要排除：模板仓库自身运行件（项目侧 `server/log`、`sessions.json` 等非模板源）、其它项目素材文件、自研件（清单无源但项目有文件，如 iwara 的 `public/app.js`）、旧源未切（接入项需用户定夺，勿擅自切）。

历史 A 类实例（2026-09-20）：gallery/iwara/gbmd 的 `server/update/` 缺 `tree-copy.js`、`apply-staged-update.cjs`（清单只声明了 `auto-update.js`）→ 部署机 requireUp 找不到 `tree-copy.js` 启动即崩（本地测试被工作区模板仓库兜底掩盖，本地能跑≠部署能跑）；后补清单条目对齐。`config.schema.json` 同理（`_gbmd-style`/`_iwara-style` 有源但清单漏声明 → 项目侧缺失，start.sh 默认端口读取与 schema 驱动配置加载不对齐）。

# 五、坑与纪律

- 组装是覆盖式写盘：项目侧对下发件做过定制（端口/脚本）会被重装覆盖。正式跑前先 `--dry-run` + 看 `--check` 预检输出。
- 「多个源写入同一目标目录」（blueprint 共用底座 + 风格层专属）靠后源覆盖靠前源，是设计意图不是 bug（如 iwara 风格层覆盖 blueprint 的 row-thumb.css）；改清单顺序会改变覆盖结果。
- 品牌配置没有独立文件：组装不生成 `brand.json`，运行期从项目根 `assemble.json` 的 `brand` 段读取——改品牌只改清单一处，不存在双份漂移。
- 改模板源（framework/ 或 templates/）后，三项目要各自 `--to` 重组装同步才会生效——模板源不是自动下发。
- 漏发体检的候选集合必须是「清单实际引用的源 + 通用件」，否则会把模板仓库自身运行件/其它项目风格误报为漏发。
- 模块化常识：`assemble-manifest.js` 是清单解析唯一实现（list/check/untracked/migrate/pull/validate/init-flag/brand/resolve-base/asset-roots/generate 子命令）；`setup.sh` 是总入口（source `scripts/setup-lib.sh` + 按动作参数 exec 分发到 `scripts/setup-*.sh`），组装逻辑在 `setup-assemble.sh`（按行复制 + 计数 + 报缺失），不再自行解析 JSON。

# 修改记录

- 2026-09-28：同步三项代码重构——①setup.sh 拆分为总入口 + `scripts/setup-*.sh`（setup-lib/list/check/untracked/migrate/pull/assemble，命令完全不变）；②brand 从清单读取：不再生成 `server/public/brand.json`，运行期由 `templates/js/config/brand.js` 的 `readBrand(serverDir)` 从项目根 `assemble.json` 的 `brand` 段读取；③setup init 初始化复制删除（app.js/config.schema.json 由清单 src 显式下发，init 字段已废除）；另清理 example/setup.sh 与 example/scripts/ 副本（17 个文件 git rm，example 从模板仓库组装）。
- 2026-09-20：初版固化（基于 setup.sh 616 行 + assemble-manifest.js + 三项目漏发体检实战）。