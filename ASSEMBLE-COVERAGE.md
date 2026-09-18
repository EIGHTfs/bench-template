# 组装覆盖面速查（改代码前先看这个）

`setup.sh <风格> --to <项目根>` 会按**项目自己**的 `assemble.json` 从模板拷文件进项目。
**凡是出现在 assemble.json 里的目标路径，都是模板的拷贝 —— 改项目侧会被下次组装覆盖。**

## --to 传什么

传**项目根**（如 `.../iwara-downloader`），不是 `server/`。

- 传项目根：目标 = 项目根 + 清单值（`server/framework/` → `<项目>/server/framework/`）
- 传 `server/`：目标 = `server/` + 清单值 → **多一层 `server/server/`**（组装静默报 ✓ 却写错位置）

## iwara-downloader 的组装目标（改这些 = 改模板）

| 模板源 | 项目目标 |
|--------|----------|
| `server/framework/` | `server/framework/` |
| `server/project/blueprint/login.html` | `server/public/login.html` |
| `server/project/blueprint/login.js` | `server/public/login.js` |
| `server/project/blueprint/setup.html` | `server/public/setup.html` |
| `server/project/blueprint/setup-init.js` | `server/public/setup-init.js` |
| `server/project/blueprint/search-date-range.js` | `server/public/search-date-range.js` |
| `server/project/blueprint/theme-init.js` | `server/public/theme-init.js` |
| `server/project/blueprint/auto-update-card.js` | `server/public/auto-update-card.js` |
| `server/project/blueprint/index.html/downloader/index.html` | `server/public/index.html` |
| `server/project/blueprint/style.css` | `server/public/style.css` |
| `server/project/blueprint/fragments/` | `server/public/fragments/` |
| `server/templates/_iwara-style/fragments/` | `server/public/fragments/` |
| `server/templates/_iwara-style/public/iwara-logo.png` | `server/public/brand.png` |
| `server/templates/_iwara-style/public/play.html` | `server/public/play.html` |
| `server/templates/_iwara-style/public/play-app.js` | `server/public/play-app.js` |
| `server/templates/_iwara-style/public/vendor/` | `server/public/vendor/` |

## 不受组装影响的（改项目侧正确）

- `server/app.js`、`server/config.js`、`server/config.schema.json`
- `server/routes/**`、`server/lib/**`、`server/*.cjs`
- `json/**`、`tool/**`、`docs/**`、`README.md`

> 判断方法：`python3 -c "import json;print(json.load(open('assemble.json'))['files'])"`

## 模板改完必须重新组装

改模板后项目侧不会自动更新，要重跑：

```bash
cd dl-server-template
./setup.sh iwara --to ../iwara-downloader
./setup.sh gbmd  --to ../gamebanana-mods-downloader
```

## 已知坑

1. **`cp -rf` 不报错**：目标路径算错时会静默建出 `server/server/`，日志仍打印 `✓`。组装后检查有无 `server/server/`。
2. **`--to` 传 `server/` 是错的**：脚本注释（第 8 行用法）与实际实现（第 126 行注释：值相对项目根）矛盾，以**项目根**为准。
