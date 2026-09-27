# blueprint/ — 组装蓝图示例

本目录存放「组装蓝图」：setup.sh 组装项目时的入口骨架参考，**不入组装产物**。

## 用途

- `app.js`：新项目/旧项目组装的入口骨架。setup.sh 组装时，若目标 `server/` 下没有 `app.js`，会从本文件复制初始化。
- `config.schema.json`：配置 schema 示例（gbmd 风格），组装时若目标没有，从本文件复制。

组装后 `app.js / config.schema.json` 落在目标项目的 `server/` 下，成为该项目的入口；业务路由/routes/lib 由项目自己实现（模板不承载后端业务代码）。

## app.js 骨架内容

| 段 | 说明 |
|---|---|
| ① 配置 | `createConfig({ configFile, schema })` — schema 驱动，框架负责加载/保存/校验 |
| ② 业务路由 | `createRoute({ 'GET /path': fn })` — 项目在这里写业务 handler |
| ③ 启动服务 | `createServer({ config, auth, publicDir, routes, onReady })` |
| ④ 自动更新（可选） | `createAutoUpdate({ projectName, defaultRepo, extraExclude })` — watch/git/github 三模式 |

## 协议要点（route handler）

```js
const r = createRoute({
  "GET /list": async (req, res, ctx) => {
    // ctx.cfg / ctx.auth / sendJson 可用
    sendJson(res, { ok: true });
  },
});
// createServer 的 routes: [{ prefix: '/api/xxx', handler: r }]
// handler 签名: async (req, res, url, ctx) => boolean（true=已处理）
```
