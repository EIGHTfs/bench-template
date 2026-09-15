#!/usr/bin/env bash
# ============================================================
# 模板组装脚本：按风格生成 server/project/，只组装前端 public
#
# 用法：
#   ./setup.sh                              # 查看可用风格与组件
#   ./setup.sh gbmd                         # 组装 gbmd 风格 → server/project/
#   ./setup.sh iwara                        # 组装 iwara 风格 → server/project/
#   ./setup.sh gbmd --with play             # gbmd 风格 + iwara 播放组件（混搭）
#   ./setup.sh iwara --with setup,search    # iwara 风格 + gbmd 设置向导等组件
#   ./setup.sh reset                        # 清空 server/project/ 恢复纯净骨架
#
# 组件（从另一风格叠加前端，同名文件以主风格为准不覆盖）：
#   play   = iwara 播放页（play.html + play-app.js + vendor/artplayer.js）
#   setup  = gbmd 设置向导（setup.html + setup-init.js + path-picker.js）
#   video  = iwara 视频功能（video 相关前端）
#   merge  = gbmd 整理合并（merge 相关前端）
#   search = 从另一风格叠加搜索（search-date-range.js）
#
# 原理：
#   server/framework/            ← 通用 JS（共用，两个风格都引用）
#   server/templates/            ← 前端素材（只读，不改）
#     _shared/                   ← 两端共用的前端文件
#     _gbmd-style/public/        ← gbmd 前端（HTML 部件组装）
#     _iwara-style/public/       ← iwara 前端（HTML 部件组装）
#   server/project/              ← 组装目标（前端生成物，可反复重装）
#
# 后端 JS 不在模板：特有 JS 在各自旧项目（gamebanana-mods-downloader /
#   iwara-downloader），模板只负责前端组装。
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="$ROOT/server/templates"
PROJECT_DIR="$ROOT/server/project"

# ---------- 颜色 ----------
C_GREEN="" C_YELLOW="" C_RED="" C_DIM="" C_RESET=""
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != "dumb" ]; then
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
fi
ok()   { printf '%s%s%s\n' "$C_GREEN" "$*" "$C_RESET"; }
warn() { printf '%s%s%s\n' "$C_YELLOW" "$*" "$C_RESET"; }
err()  { printf '%s%s%s\n' "$C_RED" "$*" "$C_RESET"; }

# 可用风格
STYLES="gbmd iwara"

# 组件定义：每个组件 = 来源风格 + 前端文件列表
# 键名即组件名，值格式: 来源风格|前端文件列表
declare -A COMPONENTS
COMPONENTS[play]="iwara|play.html,play-app.js,vendor/artplayer.js,vendor/NOTICE.md,iwara-logo.png"
COMPONENTS[setup]="gbmd|setup.html,setup-init.js,path-picker.js,logo.png"
COMPONENTS[video]="iwara|"
COMPONENTS[merge]="gbmd|"
COMPONENTS[search]="iwara|search-date-range.js"

if [ $# -eq 0 ]; then
  echo "可用风格: $STYLES"
  echo "可用组件: ${!COMPONENTS[@]}"
  echo ""
  echo "用法:"
  echo "  ./setup.sh <风格>                    # 纯风格"
  echo "  ./setup.sh <风格> --with <组件,...>  # 风格 + 混搭组件"
  echo "  ./setup.sh reset                     # 清空恢复骨架"
  echo ""
  echo "组件说明:"
  for k in $(echo "${!COMPONENTS[@]}" | tr ' ' '\n' | sort); do
    case "$k" in
      play)  echo "  play   = iwara 播放页（play.html + artplayer）";;
      setup) echo "  setup  = gbmd 设置向导（目录选择器）";;
      video) echo "  video  = iwara 视频功能（索引/封面/改名）";;
      merge) echo "  merge  = gbmd 整理合并（映射/哈希/合并目录）";;
      search) echo "  search = 叠加对方搜索功能素材";;
    esac
  done
  exit 0
fi

STYLE="$1"
shift

# 解析 --with 组件
WITH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --with) WITH="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done

if [ "$STYLE" = "reset" ]; then
  rm -rf "$PROJECT_DIR/public"
  ok "✓ server/project/ 已清空（保留 app.js 骨架，重新 setup 即可）"
  exit 0
fi

# 校验风格
FOUND=0
for s in $STYLES; do
  [ "$s" = "$STYLE" ] && FOUND=1
done
if [ "$FOUND" != 1 ]; then
  err "❌ 未知风格: $STYLE （可用: $STYLES）"
  exit 1
fi

STYLE_DIR="$TEMPLATES_DIR/_${STYLE}-style"
[ -d "$STYLE_DIR" ] || { err "❌ 模板目录缺失: $STYLE_DIR"; exit 1; }

echo "══ 组装 $STYLE 风格 ══"

# 1. 清掉旧生成物（保留 app.js 骨架）
rm -rf "$PROJECT_DIR/public"

# 2. 复制共用前端
mkdir -p "$PROJECT_DIR/public"
cp -f "$TEMPLATES_DIR/_shared/"* "$PROJECT_DIR/public/" 2>/dev/null || true
echo "  ✓ _shared/ → public/"

# 3. 复制风格前端（覆盖共用文件；-r 支持 vendor/ 子目录）
cp -rf "$STYLE_DIR/public/." "$PROJECT_DIR/public/"
echo "  ✓ _${STYLE}-style/public/ → public/"

# 4. 混搭组件叠加（同名不覆盖，以主风格为准；只叠加前端）
if [ -n "$WITH" ]; then
  echo ""
  echo "── 混搭组件叠加 ──"
  OLD_IFS="$IFS"; IFS=','
  for comp in $WITH; do
    IFS="$OLD_IFS"
    comp="$(echo "$comp" | tr -d ' ')"
    [ -z "$comp" ] && continue
    if [ -z "${COMPONENTS[$comp]:-}" ]; then
      warn "  ⚠️  未知组件: $comp （跳过）"
      continue
    fi
    IFS='|' read -r src_style pub_files <<< "${COMPONENTS[$comp]}"
    SRC_DIR="$TEMPLATES_DIR/_${src_style}-style"
    echo "  ▶ $comp（来源 $_${src_style}-style）"
    # 前端文件
    if [ -n "$pub_files" ]; then
      IFS=','; for f in $pub_files; do
        if [ -f "$SRC_DIR/public/$f" ]; then
          mkdir -p "$PROJECT_DIR/public/$(dirname "$f")"
          cp -f "$SRC_DIR/public/$f" "$PROJECT_DIR/public/$f"
          echo "      public/$f"
        fi
      done; IFS='|'
    fi
    IFS="$OLD_IFS"
  done
  IFS="$OLD_IFS"
fi

echo ""
ok "✅ $STYLE 风格前端组装完成${WITH:+（混搭: $WITH）}"
echo "   public/ : $(find "$PROJECT_DIR/public" -type f | wc -l) 个文件"
echo ""
warn "注意："
echo "  1. 前端 public/ 即插即用（静态文件直接 serve）"
echo "  2. 后端 JS 不在模板：通用 JS 在 server/framework/（createServer/createRoute 接口），"
echo "     特有 JS 在各自旧项目（gamebanana-mods-downloader / iwara-downloader）"
echo "  3. ./start.sh start 启动验证"