#!/usr/bin/env bash
# ============================================================
# 自动维护文档：函数列表（scripts/doc-func.mjs）漂移检查
#
# 覆盖：
#   · 真实仓库：函数列表与源码同步（check 通过）
#   · 改了函数没同步 → check 必须报漂移（拦住「加函数忘更新」）
#   · 宿主 md 缺标记块 → 报 no-block
#
# 用法：bash test/doc-func.test.sh
# ============================================================
source "$(dirname "${BASH_SOURCE[0]}")/lib-test.sh"

echo "══ 函数列表漂移检查 ══"

source "$TEST_ROOT/scripts/lib-node.sh"
if ! find_node "$TEST_ROOT/tool/node/bin/node"; then
  bad "找不到 node，无法测试（见 scripts/lib-node.sh）"
  finish
fi

DOCFUNC="$TEST_ROOT/scripts/doc-func.mjs"
[ -f "$DOCFUNC" ] || { bad "缺少 scripts/doc-func.mjs"; finish; }

# ① 真实仓库：函数列表与源码一致
if "$NODE_BIN" "$DOCFUNC" check --root "$TEST_ROOT" >/dev/null 2>&1; then
  ok "真实仓库：函数列表与源码同步（check 通过）"
else
  bad "真实仓库：函数列表漂移（跑 node scripts/doc-func.mjs apply --root . 刷新）"
fi

# ② 改了源码不同步 → 必须报漂移
new_tpl
T="$TMP/tpl"
if "$NODE_BIN" "$T/scripts/doc-func.mjs" check --root "$T" >/dev/null 2>&1; then
  ok "副本基线：check 通过"
else
  bad "副本基线：check 就不通过（测试环境异常）"
fi
# 往被扫描的源文件里追加一个函数（.js/.mjs 才在扫描范围；不改函数列表文档）
printf '\nfunction docFuncProbeFunction() { return 1; }\n' >> "$T/scripts/scan-sh-commands.js"
if "$NODE_BIN" "$T/scripts/doc-func.mjs" check --root "$T" >/dev/null 2>&1; then
  bad "改了源码后 check 仍通过（漂移没被拦住）"
else
  ok "改了源码未同步 → check 报漂移（拦截有效）"
fi

# ③ 宿主 md 缺标记块 → no-block（用一个只有源码、没有标记块的临时根）
T2="$TMP/noblock"
mkdir -p "$T2/scripts" "$T2/docs"
cp "$T/scripts/doc-func.mjs" "$T2/scripts/doc-func.mjs"
cp "$T/scripts/doc-tree.mjs" "$T2/scripts/doc-tree.mjs"   # doc-func 依赖它导出的 findMarkedHostMd
printf '// probe\nfunction onlyOne() {}\n' > "$T2/scripts/probe.js"
printf '# 无标记块的文档\n' > "$T2/docs/随便.md"
out="$("$NODE_BIN" "$T2/scripts/doc-func.mjs" check --root "$T2" 2>&1)"
if echo "$out" | grep -q "无函数列表标记块"; then
  ok "宿主 md 无标记块 → check 报错提示（no-block）"
else
  bad "宿主 md 无标记块却未提示（输出: $(echo "$out" | head -1)）"
fi

finish
