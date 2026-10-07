#!/usr/bin/env bash
# ============================================================
# 风格混搭：同名目标由清单顺序决定谁胜出
#
# example 清单里 iwara 的 panel-download 在前、gbmd 的同名条目在后，
# 组装后应是 gbmd 版本。把顺序反过来应变成 iwara 版本 —— 两头都验，
# 才能确认「顺序决定胜出」而不是碰巧。
# （src/dst 一律从清单 JSON 动态取，结构变动时测试不失效）
#
# 用法：bash test/mix.test.sh
# ============================================================
source "$(dirname "${BASH_SOURCE[0]}")/lib-test.sh"
new_tpl

echo "══ 风格混搭 ══"

MANIFEST="$TMP/tpl/example/assemble.json"
# 从清单动态取两个 panel-download 源（iwara 在前、gbmd 在后）与共同 dst
IW_SRC="$(manifest_find "$MANIFEST" _iwara panel-download.html src)"
GB_SRC="$(manifest_find "$MANIFEST" _gamebanana-mods panel-download.html src)"
PANEL_DST="$(manifest_lookup "$MANIFEST" panel-download.html dst)"
if [ -z "$IW_SRC" ] || [ -z "$GB_SRC" ] || [ -z "$PANEL_DST" ]; then
  bad "混搭：清单里取不到 panel-download 的 iwara/gbmd src 或 dst"; finish
fi
PANEL="$TMP/tpl/example/$PANEL_DST"

# 先组装 example（混搭清单）
run_setup --to example/assemble.json
if [ $RC -ne 0 ]; then
  bad "混搭：example 组装失败，无法继续"
  finish
fi

# --- 正序：靠后的 gbmd 覆盖靠前的 iwara ---
if [ -f "$PANEL" ] && grep -q "下载 Mod" "$PANEL"; then
  ok "混搭：靠后的 gbmd 下载面板覆盖了 iwara（顺序生效）"
else
  bad "混搭：panel-download 不是 gbmd 版本"
fi

# --- 反序：应变回 iwara 胜出 ---
revdir="$TMP/rev"; mkdir -p "$revdir"
python3 - "$MANIFEST" "$revdir/assemble.json" "$IW_SRC" "$GB_SRC" <<'PYEOF'
import json, sys, collections
src, dst, iw, gb = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
d = json.load(open(src, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
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

OUT="$(cd "$TMP/tpl" && timeout 30 bash setup.sh --to "$revdir/assemble.json" 2>&1)"
REVPANEL="$revdir/$PANEL_DST"
if [ -f "$REVPANEL" ] && grep -q "下载视频" "$REVPANEL"; then
  ok "混搭反序：iwara 版本胜出（确认覆盖由清单顺序决定）"
else
  bad "混搭反序：未变回 iwara 版本"
fi

finish