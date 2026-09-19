#!/usr/bin/env bash
# ============================================================
# setup.sh 参数契约
#
# --to 收【清单文件路径】，不是项目根目录；未知参数必须明确报错，
# 不能被静默吞掉当成别的参数（历史缺陷：--self-test 被静默忽略后
# 当普通组装跑，落到幽灵路径）。--sync 同理——它是设计错误，已废除，
# 传了必须报未知参数而不是悄悄执行组装。
#
# 用法：bash test/args.test.sh
# ============================================================
source "$(dirname "${BASH_SOURCE[0]}")/lib-test.sh"
new_tpl

echo "══ setup.sh 参数契约 ══"

# --- --to 指向不存在的清单：非交互下不挂起、退出非 0、不擅自生成 ---
dir="$TMP/no-manifest"; mkdir -p "$dir/server"
OUT="$(cd "$TMP/tpl" && echo "" | timeout 20 ./setup.sh --to "$dir/assemble.json" 2>&1)"; RC=$?
if [ $RC -ne 0 ] && grep -q "清单文件不存在" <<<"$OUT"; then ok "--to 清单不存在：报错退出"; else bad "--to 清单不存在：行为不符"; fi
if [ ! -f "$dir/assemble.json" ]; then ok "--to 清单不存在：未擅自生成"; else bad "--to 清单不存在：擅自生成了文件"; fi

# --- --to 传目录（旧设计写法）：明确报错 ---
dir="$TMP/dir-as-to"; mkdir -p "$dir/server"; echo '{"files":{}}' > "$dir/assemble.json"
run_setup --to "$dir"
if [ $RC -ne 0 ] && grep -q "清单文件不存在" <<<"$OUT"; then ok "--to 传目录：明确报错（不再支持项目根写法）"; else bad "--to 传目录：未按预期报错"; fi

# --- 已移除 --self-test：应被拒绝 ---
run_setup --self-test
if [ $RC -ne 0 ] && grep -q "未知参数\|用法" <<<"$OUT"; then ok "--self-test：已移除并明确报错"; else bad "--self-test：仍被接受（应已删除）"; fi

# --- 已废除 --sync：应被拒绝，不能悄悄当组装跑 ---
# 原设计落点用 src 而非 dst，会在项目里凭空造出 server/templates/ 目录；
# 落点改回 dst 后它与组装等价，故连同命令一并废除。
run_setup --to example/assemble.json --sync
if [ $RC -ne 0 ] && grep -q "未知参数" <<<"$OUT"; then
  ok "--sync：已废除并明确报错（不会静默当组装跑）"
else
  bad "--sync：仍被接受或未报未知参数"
fi

finish
