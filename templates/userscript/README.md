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

## 结构

```
templates/userscript/
  README.md                    本文档
  cookie-fetch/                模板本体（片段，按数字前缀拼接）
    10-config.default.json     通用默认配置（键名/文案/样式开关等）
    20-core.js                 通用内核（存储/服务器列表/GM 请求/探活/登录/Cookie 采集/复制/注入）
    30-panel.js                通用面板 UI（浮动按钮 + 底部面板 + toast + 样式）
    40-account.js              通用账号状态渲染（到期提醒/用户名/id）
    90-boot.js                 启动（挂 UI、SPA 钩子、首次探活）
```

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
