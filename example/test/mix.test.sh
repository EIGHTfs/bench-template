#!/usr/bin/env bash
# ============================================================
# 风格混搭：同名目标由清单顺序决定谁胜出
#
# example 清单里 iwara 的 panel-download 在前、gbmd 的同名条目在后，
# 组装后应是 gbmd 版本。把顺序反过来应变成 iwara 版本 —— 两头都验，
# 才能确认「顺序决定胜出」而不是碰巧。
#
# 用法：bash test/mix.test.sh
# ============================================================
source "$(dirname "${BASH_SOURCE[0]}")/lib-test.sh"
new_tpl

echo "══ 风格混搭 ══"

# 先组装 example（混搭清单）
run_setup --to example/assemble.json
if [ $RC -ne 0 ]; then
  bad "混搭：example 组装失败，无法继续"
  finish
fi

# --- 正序：靠后的 gbmd 覆盖靠前的 iwara ---
PANEL="$TMP/tpl/example/server/public/fragments/tab-panel/panel-download.html"
if [ -f "$PANEL" ] && grep -q "下载 Mod" "$PANEL"; then
  ok "混搭：靠后的 gbmd 下载面板覆盖了 iwara（顺序生效）"
else
  bad "混搭：panel-download 不是 gbmd 版本"
fi

# --- 反序：应变回 iwara 胜出 ---
revdir="$TMP/rev"; mkdir -p "$revdir"
python3 - "$TMP/tpl/example/assemble.json" "$revdir/assemble.json" <<'PYEOF'
import json, sys, collections
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
iw = "server/templates/_iwara-style/fragments/tab-panel/panel-download.html"
gb = "server/templates/_gbmd-style/fragments/tab-panel/panel-download.html"
new = collections.OrderedDict()
for k, v in d["files"].items():
    if k in (iw, gb):
        continue
    new[k] = v
new[gb] = d["files"][gb]   # 反序：gbmd 在前
new[iw] = d["files"][iw]   # iwara 在后 → 应变回 iwara 胜出
d["files"] = new
json.dump(d, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PYEOF

OUT="$(cd "$TMP/tpl" && timeout 30 ./setup.sh --to "$revdir/assemble.json" 2>&1)"
REVPANEL="$revdir/server/public/fragments/tab-panel/panel-download.html"
if [ -f "$REVPANEL" ] && grep -q "下载视频" "$REVPANEL"; then
  ok "混搭反序：iwara 版本胜出（确认覆盖由清单顺序决定）"
else
  bad "混搭反序：未变回 iwara 版本"
fi

finish
