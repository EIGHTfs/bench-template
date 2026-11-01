# bench-template

> 零依赖 Node.js 服务的模板仓库：通用后端框架 + 前端素材 + 组装脚本。
> 项目在自己根目录放一份 `assemble.json` 清单声明「要哪些件」，从本仓库组装到项目目录；素材只在本仓库维护一份。

## 功能

| 功能 | 做什么 | 入口 |
| --- | --- | --- |
| 组装 | 按清单把框架与素材复制到项目落点，覆盖式写盘、可反复跑 | `bash setup.sh --to <清单>` |
| 组装预演 | 列出每个条目是「新增 / 覆盖 / 相同」，不写盘 | 同上加 `--dry-run` |
| 一致性检查 | 逐文件 md5 比对清单两端，报「不一致 / 缺失」 | 同上加 `--check` |
| 清单外扫描 | 扫项目整棵树，列出清单未覆盖的文件 | 同上加 `--untracked` |
| 素材回流 | 把项目侧改过的素材写回模板，默认只列差异 | 同上加 `--pull`，写入加 `--write` |
| 结构迁移 | 按新旧两份清单搬文件，并改写相对引用 | `--migrate <旧清单> --to <新清单>` |
| 修复执行位 | 按 git 索引恢复丢失的可执行位 | `bash setup.sh --fix-perm` |
| 列素材目录 | 列出 `templates/` 下的系级与风格素材 | `bash setup.sh --list` |
| 后端通用件 | HTTP 服务、鉴权门、路由、配置、日志、片段组装 | `templates/js/` |
| 自动更新 | watch / git / github 三种模式 | `templates/js/update/` |
| 数据备份与恢复 | 用户数据打包导出、按清单白名单恢复 | `templates/js/store/data-backup.js` |
| 状态文件写入 | 原子替换、节流合并写 | `templates/js/store/state-store.js` |
| 页面截图 | 自动登录、逐页截图并收集前端错误 | `templates/tools/page-shot.mjs` |

## 环境要求

| 项 | 要求 |
| --- | --- |
| Node.js | 22+（零 npm 依赖，不建 `package.json`） |
| 平台 | Linux / macOS；Windows 用项目侧的 `start-windows*.bat` |
| shell | bash（`setup.sh` 与 `start.sh`） |

## 快速开始

### 方式一：把素材组装进一个新项目

```bash
mkdir my-service && cd my-service
cp <下游项目根>/assemble.json ./assemble.json    # 清单：键=模板内路径，值=项目内落点

cd <模板仓库>                                     # 以下两条在模板仓库根目录执行
bash setup.sh --to ../my-service/assemble.json --dry-run   # 预演：新增 / 覆盖 / 相同
bash setup.sh --to ../my-service/assemble.json             # 组装（幂等，可反复跑）
```

启动后访问 `http://<本机IP>:<端口>/`；端口取项目侧 `server/config.schema.json` 的 `port.default`。

### 方式二：在本仓库维护素材

```bash
bash test/run-all.sh                        # 全部自检：组装行为 / 清单解析 / 混搭 / 文档门禁
node scripts/doc-tree.mjs check             # 文件树与真实目录是否同步
node scripts/doc-func.mjs check --root .    # 函数列表与源码是否同步
```

## 用法

### setup.sh 子命令

| 命令 | 作用 | 说明 |
| --- | --- | --- |
| `--to <清单>` | 组装 | 清单所在目录即项目根；`--to` 必须指向 `assemble.json` |
| `--to <清单> --dry-run` | 组装预演 | 标出新增 / 覆盖 / 相同；`DRY_VERBOSE=1` 展开目录条目 |
| `--to <清单> --check` | 一致性检查 | 有不一致 / 缺失即退出码 1；「无引用」只告警 |
| `--to <清单> --untracked` | 清单外文件扫描 | 有清单外文件时退出码 1，按 `.gitignore` 排除 |
| `--to <清单> --pull` | 回流预演 | 只列出项目侧被改过的素材 |
| `--to <清单> --pull --write` | 回流写入 | 写回模板并备份模板原文件 |
| `--migrate <旧> --to <新>` | 结构迁移 | 默认执行；加 `--dry-run` 只预演 |
| `--fix-perm [<仓库路径>]` | 修复执行位 | 只改权限不改内容 |
| `--list` | 列素材目录 | 无参、`-h`、`--help` 同样输出帮助 |

### assemble.json 字段

| 字段 | 语义 |
| --- | --- |
| `files` | 取件表：键 = 模板内相对路径，值 = 项目内落点；两端以 `/` 结尾表示整目录 |
| 条目顺序 | 同一落点有多个源时，靠后的条目覆盖靠前的（风格层覆盖底座靠它） |
| `brand` | 品牌键值：`title` / `logo` / `icon` / `displayTitle` |
| `commands` | 组装后在项目根逐条执行的钩子；注入 `SETUP_TEMPLATE_ROOT`、`SETUP_PROJECT_ROOT` |
| `_` 开头键 | 阅读用注释，解析器忽略 |
| `init` | 历史字段，已不生效 |

```json
{
  "files": {
    "templates/js/core/index.js": "server/core/index.js",
    "templates/js/http/http-utils.js": "server/http/http-utils.js"
  },
  "brand": { "title": "My App", "logo": "brand.png", "icon": "favicon.png", "displayTitle": "My<br>App" }
}
```

### 品牌配置

```bash
BRAND_TITLE="My App" bash start.sh restart     # 用环境变量临时覆盖品牌
cp templates/.env.example .env                 # 或写进项目根 .env（值支持内联 HTML）
```

- 键名：`BRAND_TITLE` / `BRAND_LOGO` / `BRAND_ICON` / `BRAND_DISPLAY_TITLE`。
- 优先级：进程环境变量 > 项目根 `.env` > 清单 `brand` 段 > 内置默认（`title=Downloader`、`logo`/`icon=favicon.png`）。
- 任一键留空等于没配，继续向下一级取；`@brand:` 的四个标准键始终有值。

### 启停

```bash
bash start.sh start               # 启动
bash start.sh stop                # 停止
bash start.sh restart             # 重启（默认动作）
bash start.sh status              # 状态：进程 / 端口 / 健康检查
bash start.sh --set-password "…"  # 设置或修改访问密码
```

## API

本仓库不提供 HTTP 服务，入口是命令行脚本；`setup.sh` 的子命令与退出码见上表，完整参数与退出码见 [命令参数总览](docs/命令参数总览.md)。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [项目结构与工程约定](docs/项目结构与工程约定.MD) | 目录结构、素材分层、工程约定、新增组件流程、行为细节 |
| [功能说明](docs/功能说明.md) | 各功能模块的能力与边界 |
| [模板化标准手册](docs/模板化标准手册.md) | 模板化约定集：分层、清单、改造判据 |
| [命令参数总览](docs/命令参数总览.md) | `setup.sh` 与清单工具的全部参数、退出码 |
| [清单驱动重构](docs/清单驱动重构.md) | 清单驱动要解决的问题与各功能作用 |
| [旧项目模板化改造指南](docs/旧项目模板化改造指南.md) | 把已有项目改成组装式的步骤 |
| [前端片段化改造指南](docs/前端片段化改造指南.md) | HTML 拆片段与组装 |
| [文件树](docs/文件树.md) | 完整目录结构（脚本自动生成） |
| [函数列表](docs/函数列表.md) | 各源码文件函数清单（脚本自动生成） |
