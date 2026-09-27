#!/usr/bin/env bash
# ============================================================
# 清单解析：注释键（_ 开头）与 files 结构
#
# 覆盖「assemble.json 怎么写都行」的那部分容错：
#   · _ 开头的键是注释，值可以是数组 / 字符串 / 对象 / 顶层
#   · 注释键不计入缺失计数、不产生垃圾文件
#   · 空 files 正常完成
#
# 用法：bash test/manifest-comments.test.sh
# ============================================================
source "$(dirname "${BASH_SOURCE[0]}")/lib-test.sh"
new_tpl

echo "══ 清单解析：注释键 ══"

# 从 example 清单动态取一对真实存在的 src→dst（结构变动时测试不失效）
REAL_SRC="$(manifest_lookup "$TMP/tpl/example/assemble.json" login.html src)"
REAL_DST="$(manifest_lookup "$TMP/tpl/example/assemble.json" login.html dst)"
if [ -z "$REAL_SRC" ] || [ -z "$REAL_DST" ]; then
  bad "取真实 src/dst 失败（清单里没有 login.html）"; finish
fi
PAIR="\"$REAL_SRC\":\"$REAL_DST\""

# --- 数组值（旧版会 TypeError 崩溃）---
run_case "{\"files\":{\"_comment\":[\"说明\",\"第二行\"],$PAIR}}"
if [ $RC -eq 0 ] && ! grep -q "TypeError" <<<"$OUT"; then ok "注释键值为数组：不崩溃"; else bad "注释键值为数组：崩溃或无输出"; fi
has "$OUT" "缺失 0" "注释键不计入缺失"

# --- 字符串值（旧版会报「文件不存在: _note」）---
run_case "{\"files\":{\"_note\":\"说明\",$PAIR}}"
hasnt "$OUT" "文件不存在: _note" "注释键值为字符串：不再误报文件不存在"

# --- 对象值 ---
run_case "{\"files\":{\"_help\":{\"用法\":\"x\"},$PAIR}}"
eq "$RC" 0 "注释键值为对象：正常"

# --- 顶层注释键 ---
run_case "{\"_comment\":[\"顶层说明\"],\"files\":{$PAIR}}"
eq "$RC" 0 "顶层注释键：正常（本就忽略）"

# --- 不产生 _ 开头的垃圾文件 ---
run_case "{\"files\":{\"_comment\":[\"x\"],$PAIR}}"
if ! find "$CASE_DIR" -name "_*" -not -name "assemble.json" | grep -q .; then
  ok "未产生 _ 开头的垃圾文件"
else
  bad "产生了 _ 开头的垃圾文件"
fi

# --- 空 files 正常完成 ---
run_case '{"files":{}}'
if [ $RC -eq 0 ] && grep -q "文件 0 个" <<<"$OUT"; then ok "空 files：正常完成（0 文件）"; else bad "空 files：异常"; fi

finish
