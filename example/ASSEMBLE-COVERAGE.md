# 组装覆盖面速查（改代码前先看这个）

`setup.sh --to <项目清单>` 会按**项目自己**的 `assemble.json` 从模板拷文件进项目。
**凡是出现在 assemble.json 里的目标路径，都是模板的拷贝 —— 改项目侧会被下次组装覆盖。**

本文以模板自带的 `example/` 为实例讲通用规则。example 是个**普通项目**：组装、启动
方式与任何真实项目完全一样，可以直接拿它试手。

```bash
./setup.sh --to example/assemble.json    # 组装（幂等，可反复跑）
cd example && ./start.sh start           # 启动（首次无密码，会提示但可用）
```

---

## 一、`--to` 传什么

**一律传「项目清单文件」**（`assemble.json`），不是项目根、也不是 `server/`：

```bash
./setup.sh --to example/assemble.json        # ✅ 清单文件
./setup.sh --to ../gallery/assemble.json     # ✅ 另一个项目
```

清单所在文件夹**就是项目根**，清单里的相对路径全部相对它解析：

```
--to <项目根>/assemble.json  →  项目根 = dirname(清单)  →  目标 = 项目根 + 清单值
```

所以 `"server/framework/core/app.js": "server/core/app.js"` 会落到
`<项目根>/server/core/app.js`。**只需给清单路径一个参数**，项目根自动得出。

> 传目录会被明确拒绝（报「清单文件不存在」）。旧写法 `--to <项目根>` 已不支持。

## 二、清单怎么写：`源 → 落点`

`files` 里每条都是「模板内相对路径 → 项目内相对路径」：

| 写法 | 含义 |
|------|------|
| `"server/framework/core/app.js": "server/core/app.js"` | 单文件：改名/换目录都行 |
| `"server/project/blueprint/fragments/": "server/public/fragments/"` | 以 `/` 结尾 = 整目录拷贝 |
| `"_comment": [...]` | 以 `_` 开头的键 = 注释，解析器忽略（可放任意说明） |

顶层还有两个可选段：

- `"brand": {...}` → 生成 `server/public/brand.json`，供 `@brand:key` 指令取值。
  **仅在文件不存在时生成**：它是运行期可变配置，项目改过就不该被组装覆盖。
- `"init": false` → 跳过蓝图骨架初始化（项目自带 `app.js` / `config.schema.json` 时用）。

## 三、风格混搭：靠后的源覆盖靠前的同名文件

这是混搭的核心机制（`assemble-manifest.js` 的既定规则）：

> **按清单顺序复制，后面的源覆盖前面的同名目标。**

example 就是一份混搭清单：**骨架用 iwara，下载面板换成 gbmd**。

```jsonc
{
  "files": {
    // ① iwara 风格骨架：脚本 / 样式 / 顶栏 / 各面板
    "server/templates/_iwara-style/fragments/tab-panel/panel-download.html":
      "server/public/fragments/tab-panel/panel-download.html",
    "server/templates/_iwara-style/fragments/tab-panel/panel-search.html":
      "server/public/fragments/tab-panel/panel-search.html",
    // …其余 iwara 条目

    // ② 混搭：gbmd 的下载面板覆盖上面 iwara 的同名分片 ★ 必须在 iwara 之后
    "server/templates/_gbmd-style/fragments/tab-panel/panel-download.html":
      "server/public/fragments/tab-panel/panel-download.html"
  }
}
```

**顺序不能调**。把 ② 挪到 ① 前面，胜出的就变成 iwara —— 实测反序后
`panel-download.html` 内容确实变回 iwara 的「下载视频」。

组装后可直接验证胜出的是谁：

```bash
grep -oE "下载视频|下载 Mod" example/server/public/fragments/tab-panel/panel-download.html
# → 下载 Mod   （gbmd 胜出）
```

混搭的粒度是**文件级**：同名文件整体替换，不做行级合并。想要「一半 iwara 一半 gbmd」
得新建一个风格目录放那个中间版本，再让清单指向它。

### 通用件与风格件的关系

- `server/project/blueprint/` —— **通用底座**：登录/设置页、分片容器、样式底座。
- `server/templates/_<风格>-style/` —— **风格层**：顶栏、各 tab 面板、风格样式。
- 风格层条目放在 blueprint 之后，覆盖掉底座里的同名件。

## 四、框架件要按子目录摊平下发

框架源在 `server/framework/<功能>/`，落点要摊到 `server/` 根下**逐文件**写：

```jsonc
"server/framework/core/app.js":   "server/core/app.js",
"server/framework/core/index.js": "server/core/index.js",
"server/framework/store/data-backup.js": "server/store/data-backup.js",
```

⚠️ **不能整目录拷成 `server/framework/`**。蓝图 `app.js` 里写的是
`require("./core/index.js")`，它假定这些模块就在 `server/` 下；保持多一层
`framework/` 会变成 `MODULE_NOT_FOUND`（实测：example 一开始就这么错，起不来）。

## 五、example 的组装目标（改这些 = 改模板）

| 模板源 | example 目标 |
|--------|--------------|
| `server/framework/<功能>/<文件>.js` | `server/<功能>/<文件>.js` |
| `server/lib/cjs-bootstrap.cjs` | `server/lib/cjs-bootstrap.cjs` |
| `server/lib/start.sh` | `start.sh` |
| `server/project/blueprint/boot.cjs` | `server/boot.cjs` |
| `server/project/blueprint/*.html` `*.js` `style.css` | `server/public/*` |
| `server/project/blueprint/fragments/` | `server/public/fragments/` |
| `server/templates/_iwara-style/fragments/` | `server/public/fragments/` |
| `server/templates/_iwara-style/public/iwara-logo.png` | `server/public/iwara-logo.png` |
| `server/templates/_gbmd-style/fragments/tab-panel/panel-download.html` | `server/public/fragments/tab-panel/panel-download.html`（**覆盖 iwara**） |

`app.js` 与 `config.schema.json` 不在清单里：全新项目首跑时由 setup.sh 从蓝图
**初始化**（不存在才拷）。已有自己机制的项目用 `"init": false` 跳过。

## 六、不受组装影响的（改项目侧正确）

- `server/app.js`、`server/config.schema.json`（初始化后即项目自有）
- `server/config.json`、`server/sessions.json`（运行期生成）
- 项目自己写的 `server/routes/**`、`server/lib/**`
- `json/**`、`tool/**`、`docs/**`、`README.md`

> 判断方法：`python3 -c "import json;print(*json.load(open('assemble.json'))['files'],sep='\n')"`

## 七、模板改完必须重新组装

模板改了项目侧不会自动更新，要重跑（组装幂等，可反复跑）：

```bash
cd dl-server-template
./setup.sh --to example/assemble.json          # 示例项目
./setup.sh --to ../iwara-downloader/assemble.json
./setup.sh --to ../gamebanana-mods-downloader/assemble.json
```

## 八、常用检查

```bash
./setup.sh --to <清单> --check        # 清单两端是否同步（不一致 / 缺失 / 无引用告警）
./setup.sh --to <清单> --untracked    # 目录里有哪些文件不在清单（按 .gitignore 排除）
./setup.sh --to <清单> --dry-run      # 预演：只列会写入/覆盖哪些文件，不写盘
```

## 九、已知坑

1. **组装「成功」不代表写对位置**：路径算错时会静默写偏，日志仍打 `✓`、缺失仍报 0。
   组装后留意「报组装了 N 个文件、项目却看不出变化」，以及多出来的 `server/server/`。
2. **`brand.json` 不会跟随清单更新**：它「存在即保留」，改图片名后 `assemble.json`
   会跟、`brand.json` 不会，导致 `@brand:logo@` 指向已删除的文件（静默碎图）。
   改文件名要三处同改。
3. **`/api/status` 必须注册为公开路由**：`start.sh` 的健康检查打它，若被鉴权门拦住
   会一直 401，启动被判「失败」而服务其实是好的（实测：blueprint 一开始只挂了
   自己的 `/api/auth/status`，就是这个问题）。
4. **片段装配器不接就白搭**：`createServer` 要传 `fragments: {dir, pages, watch, brand}`，
   否则页面原样输出 `@frag:xxx` 注释 —— 结构看着没坏，内容全是空的（实测：首页
   857 字节 vs 正确装配后 18327 字节）。
5. **首跑初始化会因 `server/` 不存在而静默失败**：骨架初始化发生在清单复制**之前**，
   全新项目首跑时 `server/` 还没建，`cp` 报错却仍打 `✓`，结果 `app.js` 根本没生成、
   项目起不来。已在 setup.sh 里 `mkdir -p "$SERVER_DIR"` 并检查 `cp` 返回值修掉。
