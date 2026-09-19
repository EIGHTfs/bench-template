#!/usr/bin/env bash
# ============================================================
# 清理「清单 dst 未声明、且被 .gitignore 忽略」的残留目录
#
# 背景：setup.sh 曾有 COPY_LAYOUT=tree 落点（按清单 src 而非 dst），
# 凭空往项目里写 server/templates/_<风格>-style/。该模式与 --sync 命令
# 已废除，但跑过 --sync 的项目里留下了这个目录。
#
# ── 判据（三条同时成立才算残留）──────────────────────────
#   ① 目录在项目里存在
#   ② 清单的任何 dst 都没覆盖它（清单没声明它该在）
#   ③ 它被 .gitignore 忽略（= 不是本项目源码，而是模板下发的产物/副本）
#
# 为什么复用 .gitignore 而不是比对模板内容：
#   本判据的语义正是「没入库、且没人要」——.gitignore 已经把
#   「哪些是模板下发的、不入库」表达得完整而权威（见各项目 .gitignore 的
#   「模板素材树」「框架下发件」段），脚本不必另造一套判据去猜。
#   试过并被否掉的两套：
#     · 「文件名与模板同名」——项目业务路由 server/routes/auth.js 与模板
#       风格层里同名，会直接把用户代码判成残留。
#     · 「内容与模板逐字相同」——项目 server/project/ 与模板
#       server/project/blueprint/ 本就同源、逐字相同，会被整目录卷入；
#       而它其实只是项目的素材副本，不是本次要清的东西。
#
# 为什么单看 ② 不够：server/routes/ 这类**项目自有业务代码**从来不在清单里
#   （清单只管「从模板取什么」），只看 ② 会把它当残留删掉——最贵的误判。
#   加上 ③ 就干净了：自有代码入库、不被忽略。
#
# ── 安全约束 ──────────────────────────────────────────────
#   · 缺省只预演；--write 才动盘
#   · 清理 = **移入 <项目>/.trash/<日期>-stray-<名>/**，不真删，可原样移回
#   · 已存在同名归档时加序号，不覆盖历史归档
#
# 用法：
#   ./scripts/clean-stray-dirs.sh <项目根>              # 预演（缺省）
#   ./scripts/clean-stray-dirs.sh <项目根> --write      # 真移入 .trash
#   ./scripts/clean-stray-dirs.sh <项目根> --path server/templates
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

err()  { printf '\033[31m%s\033[0m\n' "$*" >&2; }
ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }

usage() {
  cat <<'EOF'
用法:
  ./scripts/clean-stray-dirs.sh <项目根>                   # 预演（不写盘）
  ./scripts/clean-stray-dirs.sh <项目根> --write           # 真移入 .trash
  ./scripts/clean-stray-dirs.sh <项目根> --path <相对路径>   # 只处理指定路径

示例:
  ./scripts/clean-stray-dirs.sh ../gamebanana-mods-downloader
  ./scripts/clean-stray-dirs.sh ../gamebanana-mods-downloader --write
EOF
}

PROJ=""
WRITE=0
ONLY_PATH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --write) WRITE=1; shift ;;
    --path)  ONLY_PATH="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) err "❌ 未知参数: $1"; usage; exit 1 ;;
    *)  PROJ="$1"; shift ;;
  esac
done

if [ -z "$PROJ" ]; then err "❌ 需要项目根路径"; usage; exit 1; fi
PROJ="$(cd "$PROJ" 2>/dev/null && pwd)" || { err "❌ 项目根不存在"; exit 1; }
MANIFEST="$PROJ/assemble.json"
if [ ! -f "$MANIFEST" ]; then err "❌ 找不到清单: $MANIFEST"; exit 1; fi

GIT_BIN="$(command -v git 2>/dev/null || true)"
if [ -z "$GIT_BIN" ]; then err "❌ 需要 git 来查 .gitignore（判据③）"; exit 1; fi

echo "══ 清理「清单 dst 未声明 + 被 .gitignore 忽略」的残留目录 ══"
echo "  项目: $PROJ"
echo "  清单: $MANIFEST"
if [ "$WRITE" = "1" ]; then
  echo "  模式: 执行（移入 .trash）"
else
  echo "  模式: 预演（不写盘，加 --write 才执行）"
fi
echo ""

if [ -f "$ROOT/lib-node.sh" ]; then
  . "$ROOT/lib-node.sh"
elif [ -f "$ROOT/scripts/lib-node.sh" ]; then
  . "$ROOT/scripts/lib-node.sh"
else
  err "❌ 缺少 lib-node.sh"; exit 1
fi
find_node "$ROOT/tool/node/bin/node" || { err "❌ 找不到 node"; exit 1; }

MAP="$("$NODE_BIN" "$ROOT/scripts/assemble-manifest.js" list "$MANIFEST" "$PROJ" 2>/dev/null)" || {
  err "❌ 清单解析失败"; exit 1
}

declare -A DST_DIR=()
while IFS=$'\t' read -r src dst; do
  [ -n "$dst" ] || continue
  d="${dst%/}"
  DST_DIR["$d"]=1
  while :; do
    nd="$(dirname "$d")"
    if [ "$nd" = "." ] || [ "$nd" = "/" ] || [ "$nd" = "$d" ]; then break; fi
    d="$nd"
    DST_DIR["$d"]=1
  done
done <<< "$MAP"

ignored() { (cd "$PROJ" && "$GIT_BIN" check-ignore -q "$1" 2>/dev/null); }

declare -a STRAY=()
declare -a KEEP=()
if [ -n "$ONLY_PATH" ]; then
  if [ -d "$PROJ/$ONLY_PATH" ]; then STRAY+=("$ONLY_PATH"); fi
else
  for d in "$PROJ"/server/*/; do
    [ -d "$d" ] || continue
    rel="server/$(basename "$d")"
    if [ -n "${DST_DIR[$rel]:-}" ]; then continue; fi
    if ignored "$rel"; then
      STRAY+=("$rel")
    else
      KEEP+=("$rel")
    fi
  done
fi

if [ ${#KEEP[@]} -gt 0 ]; then
  echo "── 保留（入库 = 项目源码，清单外属正常）──"
  for rel in "${KEEP[@]}"; do
    n="$("$GIT_BIN" -C "$PROJ" ls-files "$rel" 2>/dev/null | wc -l)"
    echo "  = $rel（入库 $n 个文件）"
  done
  echo ""
fi

if [ ${#STRAY[@]} -eq 0 ]; then
  ok "✅ 没有「清单未声明 + 被忽略」的残留目录"
  exit 0
fi

echo "── 残留目录 ${#STRAY[@]} 个（清单未声明 + 被 .gitignore 忽略）──"
TODAY="$(date +%Y%m%d)"
TRASH="$PROJ/.trash"
moved=0
for rel in "${STRAY[@]}"; do
  src="$PROJ/$rel"
  n=$(find "$src" -type f 2>/dev/null | wc -l)
  size=$(du -sh "$src" 2>/dev/null | cut -f1)
  name="$(basename "$rel")"
  dest="$TRASH/${TODAY}-stray-${name}"
  i=1
  while [ -e "$dest" ]; do
    dest="$TRASH/${TODAY}-stray-${name}-$i"
    i=$((i+1))
  done

  echo "  · $rel（$n 个文件，$size）"
  rule="$( (cd "$PROJ" && "$GIT_BIN" check-ignore -v "$rel") 2>/dev/null | head -1 )"
  echo "      忽略规则: $rule"
  echo "      → ${dest#$PROJ/}"
  if [ "$WRITE" = "1" ]; then
    mkdir -p "$TRASH"
    if mv "$src" "$dest" 2>/dev/null; then
      ok "      已移入 .trash"
      moved=$((moved+1))
    else
      err "      移动失败"
    fi
  fi
done

echo ""
if [ "$WRITE" = "1" ]; then
  ok "✅ 已移入 .trash $moved 个目录（原件在 .trash/，可原样移回）"
  echo "  移回示例: mv \"$TRASH/${TODAY}-stray-templates\" \"$PROJ/server/templates\""
else
  echo "  预演结束——未写盘。确认无误后加 --write 执行。"
fi
