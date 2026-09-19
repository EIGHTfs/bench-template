#!/usr/bin/env bash
# ============================================================
# 清单解析：错误结构必须被拒绝，且不留半成品
#
# 「宁可报错退出，也不要组装出一半」——坏清单在写完一部分文件后
# 才发现问题的代价，比一开始就拒绝大得多。
#
# 用法：bash test/manifest-invalid.test.sh
# ============================================================
source "$(dirname "${BASH_SOURCE[0]}")/lib-test.sh"
new_tpl

echo "══ 清单解析：错误结构 ══"

# --- 损坏 JSON：拒绝 + 不留半成品 ---
run_case '{ 坏掉的'
if [ $RC -ne 0 ] && grep -q "解析失败" <<<"$OUT"; then ok "损坏 JSON：报错退出"; else bad "损坏 JSON：未正确报错"; fi
if ! ls "$CASE_DIR/server" | grep -q .; then ok "损坏 JSON：未留半成品"; else bad "损坏 JSON：产生了半成品"; fi

# --- files 值非字符串 ---
run_case '{"files":{"a/b.html":["不是字符串"]}}'
has "$OUT" "必须是字符串" "files 值非字符串：被拒绝"

# --- files 非对象 ---
run_case '{"files":"字符串"}'
has "$OUT" "格式错误" "files 非对象：被拒绝"

finish
