#!/usr/bin/env bash
# ============================================================
# assemble.json 清单解析 + setup.sh 组装行为 的自测
#
# 覆盖：
#   · 注释键（_ 开头）被忽略，值可为数组 / 字符串 / 对象
#   · 损坏 JSON、错误结构被拒绝且不留半成品
#   · 正常清单组装产物正确
#
# 用法：bash test/assemble-parse.test.sh
# 全程在临时目录操作，不触碰仓库内文件。
#
# ── setup.sh 契约（改设计时请同步本文件）─────────────────
#   --to 收的是【清单文件路径】<项目根>/assemble.json，
#   不是项目根目录，也没有风格参数（用哪套素材由清单决定）。
#   项目根 = dirname(清单)，清单内相对路径全部相对它解析。
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0; fail=0
ok()   { echo "  ✓ $1"; pass=$((pass+1)); }
bad()  { echo "  ✗ $1"; fail=$((fail+1)); }

# 在临时目录准备一份模板副本（避免污染仓库）
cp -r "$ROOT" "$TMP/tpl" 2>/dev/null
rm -rf "$TMP/tpl/.git"

# 跑一次组装：$1=清单内容；返回 stdout 到 $OUT，退出码到 $RC
# 清单写进 <dir>/assemble.json，--to 指向该文件（项目根即 <dir>）
run_case() {
  local manifest="$1"
  local dir="$TMP/case-$RANDOM"
  mkdir -p "$dir/server"
  [ -n "$manifest" ] && printf '%s' "$manifest" > "$dir/assemble.json"
  OUT="$(cd "$TMP/tpl" && timeout 30 ./setup.sh --to "$dir/assemble.json" 2>&1)"; RC=$?
  CASE_DIR="$dir"
}

echo "══ assemble.json 清单自测 ══"

# --- 1. 注释键：数组值（旧版会 TypeError 崩溃）---
run_case '{"files":{"_comment":["说明","第二行"],"server/project/blueprint/login.html":"server/public/login.html"}}'
if [ $RC -eq 0 ] && ! grep -q "TypeError" <<<"$OUT"; then ok "注释键值为数组：不崩溃"; else bad "注释键值为数组：崩溃或无输出"; fi
if grep -q "缺失 0" <<<"$OUT"; then ok "注释键不计入缺失"; else bad "注释键虚增了缺失计数"; fi

# --- 2. 注释键：字符串值（旧版报「文件不存在」）---
run_case '{"files":{"_note":"说明","server/project/blueprint/login.html":"server/public/login.html"}}'
if ! grep -q "文件不存在: _note" <<<"$OUT"; then ok "注释键值为字符串：不再误报文件不存在"; else bad "注释键仍被当成源路径"; fi

# --- 3. 注释键：对象值 ---
run_case '{"files":{"_help":{"用法":"x"},"server/project/blueprint/login.html":"server/public/login.html"}}'
if [ $RC -eq 0 ]; then ok "注释键值为对象：正常"; else bad "注释键值为对象：失败"; fi

# --- 4. 顶层注释键 ---
run_case '{"_comment":["顶层说明"],"files":{"server/project/blueprint/login.html":"server/public/login.html"}}'
if [ $RC -eq 0 ]; then ok "顶层注释键：正常（本就忽略）"; else bad "顶层注释键：失败"; fi

# --- 5. 不产生 _ 开头的垃圾文件 ---
run_case '{"files":{"_comment":["x"],"server/project/blueprint/login.html":"server/public/login.html"}}'
if ! find "$CASE_DIR" -name "_*" -not -name "assemble.json" | grep -q .; then ok "未产生 _ 开头的垃圾文件"; else bad "产生了 _ 开头的垃圾文件"; fi

# --- 6. 损坏 JSON：拒绝 + 不留半成品 ---
run_case '{ 坏掉的'
if [ $RC -ne 0 ] && grep -q "解析失败" <<<"$OUT"; then ok "损坏 JSON：报错退出"; else bad "损坏 JSON：未正确报错"; fi
if ! ls "$CASE_DIR/server" | grep -q .; then ok "损坏 JSON：未留半成品"; else bad "损坏 JSON：产生了半成品"; fi

# --- 7. files 值非字符串 ---
run_case '{"files":{"a/b.html":["不是字符串"]}}'
if grep -q "必须是字符串" <<<"$OUT"; then ok "files 值非字符串：被拒绝"; else bad "files 值非字符串：未拒绝"; fi

# --- 8. files 非对象 ---
run_case '{"files":"字符串"}'
if grep -q "格式错误" <<<"$OUT"; then ok "files 非对象：被拒绝"; else bad "files 非对象：未拒绝"; fi

# --- 9. 空 files 正常完成 ---
run_case '{"files":{}}'
if [ $RC -eq 0 ] && grep -q "文件 0 个" <<<"$OUT"; then ok "空 files：正常完成（0 文件）"; else bad "空 files：异常"; fi

# --- 10. --to 指向不存在的清单：非交互下不挂起、退出非 0 ---
# 新设计：--to 必须是存在的清单文件，故此处传一个不存在的路径。
dir="$TMP/no-manifest"; mkdir -p "$dir/server"
OUT="$(cd "$TMP/tpl" && echo "" | timeout 20 ./setup.sh --to "$dir/assemble.json" 2>&1)"; RC=$?
if [ $RC -ne 0 ] && grep -q "清单文件不存在" <<<"$OUT"; then ok "--to 清单不存在：报错退出"; else bad "--to 清单不存在：行为不符"; fi
if [ ! -f "$dir/assemble.json" ]; then ok "--to 清单不存在：未擅自生成"; else bad "--to 清单不存在：擅自生成了文件"; fi

# --- 11. --to 传目录（旧设计写法）：明确报错而非静默出错 ---
dir="$TMP/dir-as-to"; mkdir -p "$dir/server"; echo '{"files":{}}' > "$dir/assemble.json"
OUT="$(cd "$TMP/tpl" && timeout 20 ./setup.sh --to "$dir" 2>&1)"; RC=$?
if [ $RC -ne 0 ] && grep -q "清单文件不存在" <<<"$OUT"; then ok "--to 传目录：明确报错（不再支持项目根写法）"; else bad "--to 传目录：未按预期报错"; fi

# --- 12. 省略 --to：用模板自带 example/ 自测，不报错 ---
OUT="$(cd "$TMP/tpl" && timeout 30 ./setup.sh --self-test 2>&1)"; RC=$?
if [ $RC -eq 0 ]; then ok "--self-test：组装到 example/ 正常"; else bad "--self-test：失败"; fi

echo
echo "  通过 $pass / 失败 $fail"
[ "$fail" -eq 0 ] || exit 1
