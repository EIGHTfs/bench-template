# 迁移计划：templates 通用层级重构

> 2026-09-27 制定（EIGHTfs 确认方案，分批次执行，控制 CPU/内存）。
> 目标：`server/templates/` 上提为仓库根 `templates/`，按「通用程度排子文件夹」，素材按类型归类（类型目录统一用 `styles/`，不用 `css`），js/css/html 内部层级保留，test 按层级整理。

## 一、目标结构

```
bench-template/
├── templates/                      ← 原 server/templates/ + framework + blueprint + public 并入
│   ├── styles/                     ← 最通用（所有项目共用），可为空
│   ├── html/
│   ├── js/                         ← framework 整树 + blueprint js 骨架
│   ├── json/
│   ├── assets/                     ← 图片（favicon/logo/iwara-logo 等）
│   ├── test/                       ← 最通用测试，可为空
│   ├── _downloader/                ← 下载器系通用
│   │   ├── styles/  html/  js/  json/  assets/  test/
│   │   ├── _iwara/                 ← iwara 独有
│   │   │   └── styles/  html/  js/  json/  assets/  test/
│   │   └── _gamebanana-mods/       ← gbmd 独有
│   │       └── styles/  html/  js/  json/  assets/  test/
│   └── _gallery/                   ← 画廊系通用
│       └── styles/  html/  js/  json/  assets/  server/
├── lib/                            ← 原 server/lib/ 上提到根（cjs-bootstrap/start.sh/preview）
├── scripts/  test/  docs/  skills/  setup.sh  example/   ← 不变
```

**通用程度原则**：父文件夹通用化最高 —— 根级 `styles/html/js/json/assets` 最通用（所有项目共用）；
`_downloader`、`_gallery` 是系级通用；`_downloader/_iwara`、`_downloader/_gamebanana-mods` 是项目独有。
内部一律按类型子文件夹（`styles/` 统一命名，不用 `css/`），js/css/html 内部保留原有子目录层级
（如 `styles/themes/day.css`、`html/tab-panel/panel-download.html`、`js/core/app.js`）。

## 二、迁移映射（源 → 目标）

### 2.1 framework → templates/js/（整树移动，内部子目录保留）

| 源（server/framework/） | 目标（templates/js/） |
|---|---|
| core/app.js、core/app-log.js、core/index.js | js/core/ 同名 |
| route/route-core.js、route-factory.js、route-registry.js、routes-adapter.js、routes-auth.js、routes-auto-update.js | js/route/ 同名 |
| http/fs-async.js、html-utils.js、http-utils.js、path-safe.js、require-sibling.js | js/http/ 同名 |
| store/data-backup.js、json-dir.js、marker-manifest.js | js/store/ 同名 |
| update/auto-update.js、tree-copy.js、apply-staged-update.cjs | js/update/ 同名 |
| auth/auth.js | js/auth/auth.js |
| config/config-loader.js | js/config/config-loader.js |
| assemble/fragment-assembler.js | js/assemble/fragment-assembler.js |
| tool/tool-detect.js | js/tool/tool-detect.js |

> 整树移动，内部相对 `require("../http/...")` 全部不变，零改写。

### 2.2 blueprint → templates/ 最通用层

| 源（server/project/blueprint/） | 目标 |
|---|---|
| app.js | templates/js/app.js（项目入口骨架） |
| boot.cjs | templates/js/boot.cjs |
| theme-init.js | templates/js/theme-init.js |
| auto-update-card.js | templates/js/auto-update-card.js |
| config.schema.json | templates/json/config.schema.json |
| assemble.json | templates/json/assemble.json（模板自测默认清单） |
| README.md | templates/README.md（模板库说明） |

### 2.3 lib → 根 lib/

| 源（server/lib/） | 目标 |
|---|---|
| cjs-bootstrap.cjs | lib/cjs-bootstrap.cjs |
| start.sh | lib/start.sh |
| preview/start-preview.mjs | lib/preview/start-preview.mjs |
| preview/start.sh | lib/preview/start.sh |

### 2.4 _downloader-style → templates/_downloader/

| 源 | 目标 |
|---|---|
| public/login.html、setup.html、index.html | html/ 同名 |
| public/login.js、setup-init.js、search-date-range.js | js/ 同名 |
| public/style.css | styles/style.css |
| fragments/*.html（auto-update-card、browse-mask、global-hud、head-extra、no-pwd-warn、tabs、topbar.html） | html/ 同名 |
| fragments/topbar/brand.html、topbar/time.html | html/topbar/ 同名 |
| fragments/styles/*.css | styles/ 同名（扁平到 styles/，去掉 styles/ 前缀） |
| fragments/styles/themes/day.css、night.css | styles/themes/ 同名 |
| search/search-date-range.cjs | js/search-date-range.cjs |
| test/helpers/*.cjs、test/p0-smoke.test.cjs | test/ 同名 |

### 2.5 _gbmd-style → templates/_downloader/_gamebanana-mods/

| 源 | 目标 |
|---|---|
| public/app.js、path-picker.js | js/ 同名 |
| public/style.css | styles/style.css |
| public/favicon.ico、favicon.png、logo.png | assets/ 同名 |
| fragments/scripts.html | html/scripts.html |
| fragments/tab-panel/panel-*.html | html/tab-panel/ 同名 |
| fragments/topbar/badge.html、userscript.html | html/topbar/ 同名 |
| fragments/styles/grid-map.css、mod-group.css | styles/ 同名 |
| fragments/manifest.json | json/manifest.json |
| config.schema.json | json/config.schema.json |
| server/lib/auto-update.js | server/lib/auto-update.js（保留 server 后端层） |

### 2.6 _iwara-style → templates/_downloader/_iwara/

| 源 | 目标 |
|---|---|
| public/app.js、play-app.js、play-enhance.js、play-list.js | js/ 同名 |
| public/style.css | styles/style.css |
| public/play.html | html/play.html |
| public/favicon.ico、favicon.png、iwara-logo.png | assets/ 同名 |
| public/vendor/artplayer.js、artplayer-plugin-vtt-thumbnail.js、NOTICE.md | js/vendor/ 同名 |
| fragments/scripts.html | html/scripts.html |
| fragments/styles/row-thumb.css | styles/row-thumb.css |
| fragments/tab-panel/panel-*.html | html/tab-panel/ 同名 |
| fragments/topbar/badge.html、userscript.html | html/topbar/ 同名 |
| config.schema.json | json/config.schema.json |
| server/lib/auto-update.js、iwara-api.js、like-state.js | server/lib/ 同名 |
| server/routes/like.js | server/routes/like.js |
| test/play-test.cjs、play-record.cjs、test-author-avatar.cjs、.test | test/ 同名 |

### 2.7 _gallery-style → templates/_gallery/

| 源 | 目标 |
|---|---|
| public/api-client.js、app.js | js/ 同名 |
| public/index.html | html/index.html |
| public/style.css | styles/style.css |
| public/favicon.png、favicon.svg | assets/ 同名 |
| public/locales/en.json、zh-CN.json | json/locales/ 同名 |
| fragments/styles/*.css（含 themes/dark.css） | styles/ 同名 |
| config.schema.json | json/config.schema.json |
| server/app.js、lib/*.js、routes/*.js | server/ 同名（保留后端层） |

### 2.8 server/public → 重复删、不重复重新分类

| 文件 | 处理 |
|---|---|
| login.html、login.js、setup.html、setup-init.js、search-date-range.js、index.html（与 _downloader-style/public 相同） | 删（素材已有） |
| theme-init.js、auto-update-card.js（与 blueprint 相同） | 删（素材已有） |
| fragments/*.html、fragments/styles/*.css（24 个与 _downloader-style/fragments 相同） | 删（素材已有） |
| fragments/styles/topbar.css（与素材异：旧渐变） | 删（以素材新版为准） |
| fragments/styles/variables.css（素材侧缺失） | 删（新版用 themes/day+night，无引用） |
| style.css（旧版：引 variables.css） | 删（素材 style.css 是权威新版） |
| **partial-refresh.js**（素材侧不存在，被 _iwara scripts.html 引用） | **保留 → templates/js/partial-refresh.js** |

### 2.9 server/ 根剩余文件

| 文件 | 处理 |
|---|---|
| app.js | **保留 → templates/js/server/app.js**（后端服务示例入口，放最通用 js 层的 server/ 子目录，与 _gallery 后端层命名一致） |
| boot.cjs | → templates/js/server/boot.cjs（配套启动器，与 blueprint/boot.cjs 内容几乎一致，随 app.js 保留） |
| config.schema.json | 与 blueprint/config.schema.json 完全相同 → 删（权威版已入 templates/json/config.schema.json） |
| config.json、sessions.json、server.log | 运行态 → 删 + .gitignore（sessions.json 敏感出库） |
| server/templates/.trash-*、根 .trash/ | 物理清理（已 gitignore） |

## 三、引用面联动（必须同步改）

1. **assemble.json 键**（src 全部变化，dst 不变）：
   - `example/assemble.json`（24 条）
   - `server/project/blueprint/assemble.json` → `templates/json/assemble.json`（模板自测清单）
   - 下游：gallery（24）、iwara（32）、gbmd（18）—— 先 gallery 验证，iwara/gbmd 最后
   - 键改写规则：`server/framework/X` → `templates/js/X`；`server/templates/_downloader-style/X` → `templates/_downloader/X`；
     `server/templates/_gbmd-style/X` → `templates/_downloader/_gamebanana-mods/X`；
     `server/templates/_iwara-style/X` → `templates/_downloader/_iwara/X`；
     `server/templates/_gallery-style/X` → `templates/_gallery/X`；
     `server/project/blueprint/X` → `templates/X`（js→js/、json→json/）；
     `server/lib/X` → `lib/X`
2. **setup.sh**：
   - `TEMPLATES_DIR` 探测：`server/templates` → `templates`（detect_dir 已有 fallback，需调主路径）
   - `BLUEPRINT_DIR` 探测：`server/project/blueprint` → `templates`（blueprint 并入，不再单独目录）
   - `_detect_styles`：原遍历 `_*-style` 目录，改为按新结构识别系级/项目级（`_downloader/_iwara` 等）
3. **README.md**：目录树、三个概念表、命令示例路径全部更新
4. **docs/**：命令参数总览、清单驱动重构、旧项目模板化改造指南、前端片段化改造指南
5. **skills/setup-assemble.md**：素材源布局、漏发体检路径更新
6. **.gitignore**：`server/project/*` → `templates/` 相关；补 `server/sessions.json`（或已删）；`.trash-*` 规则保持
7. **example/**：组装产物路径不变（dst），但若重跑组装需新清单键

## 四、批次执行计划（每批独立验证、控制资源）

| 批次 | 内容 | 验证 |
|---|---|---|
| 0 | 本计划文档落盘 + 全量清单 dry-run | 数量核对（152 素材 + public 36） |
| 1 | 建 templates/ 目录树 + 移动素材（2.4~2.7，先 _downloader 系再 gallery） | find 数量核对、git mv 无冲突 |
| 2 | framework 整树 → templates/js/ + lib → 根 lib/（2.1、2.3） | node --check 全部 js、require 链抽查 |
| 3 | blueprint → templates/ 最通用层（2.2）+ public 清理（2.8）+ server 根清理（2.9） | git status 干净、无引用残留 |
| 4 | assemble.json 键改写（本仓库 example/blueprint 清单）+ setup.sh 适配（三） | `./setup.sh --to example/assemble.json --dry-run`、`--check` |
| 5 | gallery 下游清单同步 + 组装验证（先 gallery） | gallery 仓库 `--dry-run`、`--check`、`--untracked` |
| 6 | README/docs/skills 更新（三） | link_check、文档命令一致性测试 |
| 7 | test 全套回归 + example self-test | `bash test/run-all.sh`、`bash example/self-test.sh` |
| 8 | iwara/gbmd 下游清单同步（最后） | 同批次 5 验证 |
| 9 | git 提交推送（分次 commit，README 版本记录表同步） | git status 干净 |

## 五、风险与注意

- **素材内部引用按产物位置写**（组装后扁平），素材目录重排不影响产物正确性 —— 只改清单键 src，dst 与 @frag 全部不变。
- framework 整树移动相对 require 不变；blueprint/app.js 与 framework/core/app.js 不同路径不冲突。
- `_gallery-style/server/` 后端层保留 `server/` 命名（与前端 js 区分，避免 app.js 重名）。
- 下游三个仓库重组装前模板键会失效 —— 先 gallery 验证流程，iwara/gbmd 最后慢慢来。
- 每批完成后 git 本地提交（暂存点），全部验证通过再推送（可强推）。
