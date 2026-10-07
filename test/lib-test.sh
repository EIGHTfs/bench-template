#!/usr/bin/env bash
# ============================================================
# 测试共享库：被 test/*.test.sh 各自 source，不单独运行。
#
# 提供：
#   · ok / bad          —— 断言计数与输出
#   · new_tpl           —— 在临时目录准备一份模板副本
#   · run_case          —— 跑一次组装，清单内容由参数给出
#   · run_setup         —— 在模板副本里跑 setup.sh（自定义参数）
#   · finish            —— 打印汇总并按失败数决定退出码
#
# 约定（改 setup.sh 设计时请同步）：
#   --to 收的是【清单文件路径】<项目根>/assemble.json，
#   不是项目根目录，也没有风格参数（用哪套素材由清单决定）。
#   项目根 = dirname(清单)，清单内相对路径全部相对它解析。
# ============================================================
set -uo pipefail

TEST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0; fail=0
ok()  { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# 断言相等：$1=实际 $2=期望 $3=说明
eq()  { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3（实际: $1，期望: $2）"; fi; }

# 断言输出含某串：$1=文本 $2=子串 $3=说明
has() { if grep -q -- "$2" <<<"$1"; then ok "$3"; else bad "$3（未找到: $2）"; fi; }

# 断言输出不含某串
hasnt() { if ! grep -q -- "$2" <<<"$1"; then ok "$3"; else bad "$3（不应出现: $2）"; fi; }

# 在临时目录准备模板副本（避免污染仓库）
new_tpl() {
  cp -r "$TEST_ROOT" "$TMP/tpl" 2>/dev/null
  rm -rf "$TMP/tpl/.git"
}

# 跑一次组装：$1=清单内容。返回 stdout→$OUT，退出码→$RC，项目根→$CASE_DIR
# 清单写进 <dir>/assemble.json，--to 指向该文件（项目根即 <dir>）
run_case() {
  local manifest="$1"
  local dir="$TMP/case-$RANDOM$RANDOM"
  mkdir -p "$dir/server"
  [ -n "$manifest" ] && printf '%s' "$manifest" > "$dir/assemble.json"
  OUT="$(cd "$TMP/tpl" && timeout 30 bash setup.sh --to "$dir/assemble.json" 2>&1)"; RC=$?
  CASE_DIR="$dir"
}

# 在模板副本里按自定义参数跑 setup.sh：$@ 原样传给 setup.sh
# 返回 stdout→$OUT，退出码→$RC
run_setup() {
  OUT="$(cd "$TMP/tpl" && timeout 30 bash setup.sh "$@" 2>&1)"; RC=$?
}

# ── 从清单 JSON 读路径（结构变动时测试不失效）──────────────────
# 从清单 files 中找「src 或 dst 以某文件名结尾」的条目，输出其 src 或 dst。
# $1=清单文件  $2=文件名（basename）  $3=取哪个字段（src|dst）
manifest_lookup() {
  python3 - "$1" "$2" "$3" <<'PYEOF'
import json, sys, os
mani, name, field = sys.argv[1], sys.argv[2], sys.argv[3]
m = json.load(open(mani, encoding="utf-8"))
for k, v in m.get("files", {}).items():
    if k.startswith("_"): continue
    src, dst = k, v
    pick = src if field == "src" else dst
    if os.path.basename(pick.rstrip("/")) == name:
        print(pick); sys.exit(0)
sys.exit(1)
PYEOF
}

# 从清单 files 里按「src 子串」过滤（同名文件多个源时用，如 panel-download 的 iwara/gbmd 两版）
# $1=清单文件  $2=src 必须含的子串  $3=取哪个字段（src|dst）
manifest_lookup_src() {
  python3 - "$1" "$2" "$3" <<'PYEOF'
import json, sys
mani, needle, field = sys.argv[1], sys.argv[2], sys.argv[3]
m = json.load(open(mani, encoding="utf-8"))
for k, v in m.get("files", {}).items():
    if k.startswith("_"): continue
    if needle in k:
        print(v if field == "dst" else k); sys.exit(0)
sys.exit(1)
PYEOF
}

# 从清单 files 里按「src 子串 + 文件名」过滤（同名文件多个源时用，如 panel-download 的 iwara/gbmd 两版）
# $1=清单文件  $2=src 必须含的子串  $3=文件名（basename）  $4=取哪个字段（src|dst）
manifest_find() {
  python3 - "$1" "$2" "$3" "$4" <<'PYEOF'
import json, sys, os
mani, needle, name, field = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
m = json.load(open(mani, encoding="utf-8"))
for k, v in m.get("files", {}).items():
    if k.startswith("_"): continue
    if needle in k and os.path.basename(k.rstrip("/")) == name:
        print(v if field == "dst" else k); sys.exit(0)
sys.exit(1)
PYEOF
}

# 打印汇总；有失败则退出码 1
finish() {
  echo
  echo "  通过 $pass / 失败 $fail"
  [ "$fail" -eq 0 ] || exit 1
  exit 0
}
