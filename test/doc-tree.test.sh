#!/usr/bin/env bash
# ============================================================
# 自动维护文档：文件树（scripts/doc-tree.mjs）漂移检查
#
# 覆盖：
#   · 真实仓库：文件树文档与真实目录同步（check 通过）
#   · 新增文件未刷新 → check 必须报漂移（拦住「加了文件忘更新」）
#   · sync 自动清理 tree-doc.json 里已不存在的失效键
#
# 用法：bash test/doc-tree.test.sh
# ============================================================
source "$(dirname "${BASH_SOURCE[0]}")/lib-test.sh"

echo "══ 文件树漂移检查 ══"

source "$TEST_ROOT/scripts/lib-node.sh"
if ! find_node "$TEST_ROOT/tool/node/bin/node"; then
  bad "找不到 node，无法测试（见 scripts/lib-node.sh）"
  finish
fi

DOCTREE="$TEST_ROOT/scripts/doc-tree.mjs"
[ -f "$DOCTREE" ] || { bad "缺少 scripts/doc-tree.mjs"; finish; }

# ① 真实仓库：文件树与真实目录一致
if "$NODE_BIN" "$DOCTREE" check >/dev/null 2>&1; then
  ok "真实仓库：文件树与真实目录同步（check 通过）"
else
  bad "真实仓库：文件树漂移（跑 node scripts/doc-tree.mjs apply 刷新）"
fi

# ② 副本里新增一个文件但不刷新文档 → 必须报漂移
#    注意：doc-tree 的文件清单取自 `git ls-files`，且树根标签 = 目录名，
#    故副本必须是「带 git 的同名目录」，否则根标签对不上必然误报。
DT="$TMP/dt"
mkdir -p "$DT"
cp -r "$TEST_ROOT" "$DT/bench-template" 2>/dev/null
T="$DT/bench-template"
rm -rf "$T/.git"
(cd "$T" && git init -q && git add -A) >/dev/null 2>&1
if "$NODE_BIN" "$T/scripts/doc-tree.mjs" check >/dev/null 2>&1; then
  ok "副本基线：check 通过"
else
  bad "副本基线：check 就不通过（测试环境异常）"
fi
printf '#!/bin/sh\ntrue\n' > "$T/scripts/docTreeProbe.sh"
if "$NODE_BIN" "$T/scripts/doc-tree.mjs" check >/dev/null 2>&1; then
  bad "新增文件后 check 仍通过（漂移没被拦住）"
else
  ok "新增文件未刷新 → check 报漂移（拦截有效）"
fi

# ③ sync 清理 tree-doc.json 的失效键（映射了不存在的路径）
python3 - "$T/tree-doc.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p, encoding="utf-8"))
d["scripts/这个路径不存在-probe.js"] = "探测用失效键"
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
"$NODE_BIN" "$T/scripts/doc-tree.mjs" sync >/dev/null 2>&1
if python3 -c "
import json,sys
d=json.load(open('$T/tree-doc.json',encoding='utf-8'))
sys.exit(0 if 'scripts/这个路径不存在-probe.js' not in d else 1)
"; then
  ok "sync 清理了 tree-doc.json 的失效键"
else
  bad "sync 未清理失效键"
fi

finish
