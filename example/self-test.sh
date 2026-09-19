#!/usr/bin/env bash
# ============================================================
# example 项目自检：以 example 为测试对象跑一遍完整链路
#
# 验证：
#   ① 组装成功、无缺失
#   ② 自研代码（server/routes/items.js + app.js 注册）与假数据
#      （json/items.json）组装后仍在，且重装不被覆盖
#   ③ 风格混搭仍生效（gbmd 下载面板胜出 iwara）
#   ④ 启动后公开 API 可探测：/api/status、/api/items、/self-demo
#
# 用法：
#   bash example/self-test.sh [模板根]
#   （在模板根的临时副本上运行，不污染工作区的 example/）
# ============================================================
set -uo pipefail

TPL_ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PORT="8090"

pass=0; fail=0
ok()  { echo "  ✓ $1"; pass=$((pass + 1)); }
bad() { echo "  ✗ $1"; fail=$((fail + 1)); }

echo "══ example 自检（模板根：$TPL_ROOT） ══"

# --- 副本：不污染工作区的 example/ ---
cp -r "$TPL_ROOT" "$TMP/tpl" 2>/dev/null || { echo "✗ 复制模板副本失败"; exit 1; }
rm -rf "$TMP/tpl/.git"
cd "$TMP/tpl" || { echo "✗ 进入副本失败"; exit 1; }

# --- ① 组装（普通项目方式，与 README 一致）---
OUT="$(./setup.sh --to example/assemble.json 2>&1)" || { bad "组装失败：$OUT"; }
if echo "$OUT" | grep -q "缺失 0"; then ok "组装成功、无缺失"; else bad "组装有缺失"; fi

# --- ② 自研代码 / 假数据：组装后仍在（不受组装影响）---
if [ -f example/server/routes/items.js ] && grep -q "GET /api/items" example/server/routes/items.js; then
  ok "自研路由 items.js 存在且已实现"
else
  bad "自研路由 items.js 缺失"
fi
if [ -f example/json/items.json ] && grep -q '"items"' example/json/items.json; then
  ok "假数据 json/items.json 存在"
else
  bad "假数据 json/items.json 缺失"
fi
if grep -q "itemsRoutes" example/server/app.js; then ok "自研路由已在 app.js 注册"; else bad "app.js 未注册自研路由"; fi
if [ -f example/server/public/app.js ] && grep -q "switchPanel" example/server/public/app.js; then
  ok "自研前端 public/app.js 存在（标签页切换/列表渲染依赖它）"
else
  bad "自研前端 public/app.js 缺失"
fi

# --- 重装后自研不被覆盖（清单里没有它们，重跑也不该动）---
./setup.sh --to example/assemble.json >/dev/null 2>&1
if grep -q "GET /api/items" example/server/routes/items.js && grep -q "itemsRoutes" example/server/app.js &&
   grep -q '"port".*8090' example/server/config.schema.json; then
  ok "重装后自研代码与配置（端口 8090）仍保留"
else
  bad "重装覆盖了自研代码或配置"
fi

# --- ③ 风格混搭仍生效（gbmd 下载面板胜出 iwara）---
PANEL="example/server/public/fragments/tab-panel/panel-download.html"
if [ -f "$PANEL" ] && grep -q "下载 Mod" "$PANEL"; then
  ok "混搭生效：gbmd 下载面板胜出"
else
  bad "混搭未生效：panel-download 不是 gbmd 版"
fi

# --- ④ 启动 + API 探测（公开端点，无需登录）---
(cd example && ./start.sh restart >/dev/null 2>&1) || bad "start.sh 启动失败"
ready=0
for _ in $(seq 1 30); do
  if curl -fs "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.5
done
[ "$ready" = 1 ] && ok "启动成功（端口 $PORT 就绪）" || bad "服务未就绪（端口 $PORT）"

ITEMS="$(curl -fs "http://127.0.0.1:$PORT/api/items" 2>/dev/null || true)"
if echo "$ITEMS" | grep -q "星辉长枪"; then ok "/api/items 返回假数据"; else bad "/api/items 未返回假数据"; fi

DEMO="$(curl -fs "http://127.0.0.1:$PORT/self-demo" 2>/dev/null || true)"
if echo "$DEMO" | grep -q "假数据" && echo "$DEMO" | grep -q "星辉长枪"; then
  ok "/self-demo 渲染自研页面（含假数据）"
else
  bad "/self-demo 未渲染出假数据"
fi

# 停止（start.sh 自带停服务逻辑）
(cd example && ./start.sh stop >/dev/null 2>&1) || true

echo "── 结果：通过 $pass / 失败 $fail ──"
[ "$fail" -eq 0 ]