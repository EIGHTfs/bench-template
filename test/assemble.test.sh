#!/usr/bin/env bash
# ============================================================
# 组装行为：落点、产出、初始化
#
# 核心契约：**落点一律按清单 dst**——清单是唯一真相，
# dst 没声明的地方，项目里就不该有文件。
# （历史缺陷：曾有 COPY_LAYOUT=tree 按 src 落点，凭空造出
#   server/templates/ 整个目录。故这里还要显式验证 templates/ 不会被创建。）
#
# 用法：bash test/assemble.test.sh
# ============================================================
source "$(dirname "${BASH_SOURCE[0]}")/lib-test.sh"
new_tpl

echo "══ 组装行为 ══"

# --- example/ 用普通项目方式组装：清单即唯一真相 ---
run_setup --to example/assemble.json
if [ $RC -eq 0 ] && grep -q "缺失 0" <<<"$OUT"; then ok "example：--to 组装正常、无缺失"; else bad "example：组装失败或有缺失"; fi
if [ -f "$TMP/tpl/example/server/app.js" ]; then ok "example：骨架 app.js 已初始化（server/ 不存在时也能建）"; else bad "example：app.js 未生成（server/ 未 mkdir 的老问题）"; fi

# --- 落点按 dst：素材 src 在 templates/，产出必须落 public/ ---
if [ -f "$TMP/tpl/example/server/public/login.html" ]; then
  ok "落点按 dst：blueprint 素材产出到 public/"
else
  bad "落点按 dst：public/ 未拿到产出"
fi

# --- 组装不得凭空创建 server/templates/（废除 tree 模式的核心回归）---
# 清单里 templates/ 只作 src 出现、从不出现在 dst，所以组装后项目里
# 不该有 templates/。若这里失败，说明 tree 落点逻辑又回来了。
if [ ! -d "$TMP/tpl/example/server/templates" ]; then
  ok "组装不创建 server/templates/（tree 落点未复活）"
else
  bad "组装凭空创建了 server/templates/（tree 落点复活了）"
fi

# --- 组装幂等：连跑两次都成功且无缺失 ---
run_setup --to example/assemble.json
if [ $RC -eq 0 ] && grep -q "缺失 0" <<<"$OUT"; then ok "组装幂等：重复跑仍成功无缺失"; else bad "组装幂等：第二次跑失败"; fi

finish
