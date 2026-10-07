# 通用油猴脚本模板（userscript/）

## 定位

**通用「Cookie 获取并注入」油猴脚本模板**，给任意带服务端的项目复用。

两条能力线，**获取与复制不依赖服务端**：

| 能力 | 依赖服务端 | 说明 |
|---|---|---|
| 采集 Cookie / Token + 复制到剪贴板 | ❌ 不需要 | 纯浏览器侧：`GM_cookie.list`（含 HttpOnly）→ 组合文本 → 剪贴板/通知 |
| 注入回浏览器 | ❌ 不需要 | `GM_cookie.set` + `document.cookie` 写回站点域 |
| 一键发送到服务端（注入服务端） | ✅ 需要 | `POST /api/settings` 保存；服务端不在时面板降级为「仅采集+复制」 |
| 服务器探活/登录/账号状态 | ✅ 需要 | `/api/status` `/api/login` `/api/account-check` |

## 结构（通用 / 特化 分层）

**模板里只放真正通用的**；项目特化的 UI 与业务逻辑作为**项目侧片段**，由组装器一起拼接：

```
templates/userscript/cookie-fetch/        ← 通用（所有项目共用）
    header.tpl      UserScript 头模板（{{name}}/{{match}}/{{grant}} 占位）
    20-core.js      网络与数据层：GM 请求、服务器列表、探活/登录、Cookie 采集、复制、写回浏览器
    25-style.js     面板 CSS 常量（id 前缀走 {{IDP}} 占位）
templates/_downloader/_iwara/userscript/  ← 项目特化（iwara）
    00-config.json  项目配置（站名/匹配/键名/id 前缀/文案/图标/域列表）
    10-consts.js    常量（VER/键名/图标等，值走占位符）
    30-panel.js     该项目的面板 DOM 与事件绑定
    40-account.js   该项目的账号状态检测与渲染（端点各项目不同）
    50-project.js   项目专属业务（如 iwara 的视频发送、SPA 钩子）
```

组装器**不区分**通用与特化 —— 它把两侧片段按**文件名数字前缀**统一排序拼接，所以上例自然得到
`10-consts → 20-core → 25-style → 30-panel → 40-account → 50-project`。
新项目接入时：复用 `20-core`/`25-style`，自己写 `00-config.json` + 面板/账号/业务片段即可。

> 若某项目的面板与账号逻辑足够通用，再上提到模板 `cookie-fetch/` 即可（换个目录，组装器无感）。

## 项目接入

在项目模板目录下建 `userscript/`，只放**差异**：

```
templates/_downloader/_iwara/userscript/
  00-config.json               项目配置（站名/匹配/键名/文案/图标/Cookie 域）
  50-project.js                项目专属逻辑（如视频页解析、专属 API）
  95-project-boot.js           项目专属启动（可选）
```

## 组装

```
node scripts/build-userscript.js <项目 userscript 目录> <输出 .user.js>
```

拼接规则：

1. 收集 `templates/userscript/cookie-fetch/*` 与 `<项目>/userscript/*` 两侧片段
2. 按**文件名数字前缀**统一排序（所以项目用 `00-`/`50-` 就能插进通用片段之间）
3. 读 `<项目>/userscript/00-config.json` → ①替换 `header.tpl` 占位符 ②生成 `const CFG = {...}` 注入产物
4. 产物头部写「由模板组装，勿手改」标记

## 约定

- **零依赖**：只允许浏览器 API 与 GM_* API，不引入 npm 包
- **不硬编码**：站点、键名、id 前缀、文案、图标全部来自 `00-config.json`
- **id 前缀**：统一用 `CFG.idPrefix`（如 `iwcred-` / `gbcred-`），内核代码用 `CFG.id.x` 取值，不写字面量
- **无隐私**：模板与配置里不得出现任何 Cookie/Token/密码
