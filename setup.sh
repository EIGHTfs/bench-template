#!/usr/bin/env bash
# ============================================================
# 模板组装脚本：按风格生成 server/project/，支持组件混搭
#
# 用法：
#   ./setup.sh                              # 查看可用风格与组件
#   ./setup.sh gbmd                         # 组装 gbmd 风格 → server/project/
#   ./setup.sh iwara                        # 组装 iwara 风格 → server/project/
#   ./setup.sh gbmd --with play             # gbmd 风格 + iwara 播放组件（混搭）
#   ./setup.sh iwara --with setup,search    # iwara 风格 + gbmd 设置向导等组件
#   ./setup.sh reset                        # 清空 server/project/ 恢复纯净骨架
#
# 组件（从另一风格叠加，前端即插即用；后端路由/lib 为参考素材，
#   同名文件以主风格为准不覆盖，需按框架接口改造后挂载）：
#   play   = iwara 播放页（play.html + vendor/artplayer.js + 播放/视频路由素材）
#   setup  = gbmd 设置向导（setup.html + path-picker.js + 配套路由素材）
#   video  = iwara 视频功能（videos/play 路由 + video-index/thumb-cache/profile-index）
#   merge  = gbmd 整理合并（games/merge 路由 + mapping/hash-index/merge-dirs）
#   search = 从另一风格叠加搜索（iwara search-cache / gbmd search+gb-api）
#
# 原理：
#   server/templates/             ← 变体素材（只读，不改）
#     _shared/                    ← 两端共用的前端文件
#     _gbmd-style/                ← gbmd 完整前端 + 路由 + lib + config.schema
#     _iwara-style/               ← iwara 完整前端 + 路由 + lib + config.schema
#   server/project/               ← 组装目标（生成物，可反复重装）
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

# 组件定义：每个组件 = 来源风格 + 前端文件 + 路由素材 + lib 素材
# 键名即组件名，值格式: 来源风格|前端文件列表|路由文件列表|lib文件列表
declare -A COMPONENTS
COMPONENTS[play]="iwara|play.html,vendor/artplayer.js,vendor/NOTICE.md,iwara-logo.png|play.js,videos.js,index.js|iwara-api.js,video-index.js,thumb-cache.cjs,profile-index.js"
COMPONENTS[setup]="gbmd|setup.html,path-picker.js,logo.png|games.js,merge.js,cred.js|gb-api.js,mapping.js,merge-dirs.js"
COMPONENTS[video]="iwara||play.js,videos.js,rename.js,account.js|video-index.js,thumb-cache.cjs,profile-index.js,rename-files.js,search-cache.js,device-check.js"
COMPONENTS[merge]="gbmd||games.js,merge.js,hashindex.js,browse.js|mapping.js,hash-index.js,merge-dirs.js,organize.js,incomplete-scan.js"
COMPONENTS[search]="iwara|search-date-range.js|search.js|search-cache.js,iwara-api.js"

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
      play)  echo "  play   = iwara 播放页（播放/视频路由素材）";;
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
  rm -rf "$PROJECT_DIR/public" "$PROJECT_DIR/routes" "$PROJECT_DIR/lib"
  [ -f "$PROJECT_DIR/config.schema.json" ] && rm -f "$PROJECT_DIR/config.schema.json"
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
rm -rf "$PROJECT_DIR/public" "$PROJECT_DIR/routes" "$PROJECT_DIR/lib"
[ -f "$PROJECT_DIR/config.schema.json" ] && rm -f "$PROJECT_DIR/config.schema.json"

# 2. 复制共用前端
mkdir -p "$PROJECT_DIR/public"
cp -f "$TEMPLATES_DIR/_shared/"* "$PROJECT_DIR/public/" 2>/dev/null || true
echo "  ✓ _shared/ → public/"

# 3. 复制风格前端（覆盖共用文件；-r 支持 vendor/ 子目录）
cp -rf "$STYLE_DIR/public/." "$PROJECT_DIR/public/"
echo "  ✓ _${STYLE}-style/public/ → public/"

# 4. 复制路由
if [ -d "$STYLE_DIR/routes" ]; then
  mkdir -p "$PROJECT_DIR/routes"
  cp -f "$STYLE_DIR/routes/"* "$PROJECT_DIR/routes/"
  echo "  ✓ routes/ ($(ls "$STYLE_DIR/routes" | wc -l) 个文件)"
fi

# 5. 复制 lib
if [ -d "$STYLE_DIR/lib" ]; then
  mkdir -p "$PROJECT_DIR/lib"
  cp -f "$STYLE_DIR/lib/"* "$PROJECT_DIR/lib/"
  echo "  ✓ lib/ ($(ls "$STYLE_DIR/lib" | wc -l) 个文件)"
fi

# 6. 复制 config schema
if [ -f "$STYLE_DIR/config.schema.json" ]; then
  cp -f "$STYLE_DIR/config.schema.json" "$PROJECT_DIR/config.schema.json"
  echo "  ✓ config.schema.json"
fi

# 7. 混搭组件叠加（同名不覆盖，以主风格为准）
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
    IFS='|' read -r src_style pub_files route_files lib_files <<< "${COMPONENTS[$comp]}"
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
    # 路由素材（同名不覆盖）
    if [ -n "$route_files" ]; then
      mkdir -p "$PROJECT_DIR/routes"
      IFS=','; for f in $route_files; do
        if [ -f "$SRC_DIR/routes/$f" ] && [ ! -f "$PROJECT_DIR/routes/$f" ]; then
          cp -f "$SRC_DIR/routes/$f" "$PROJECT_DIR/routes/$f"
          echo "      routes/$f"
        fi
      done; IFS='|'
    fi
    # lib 素材（同名不覆盖）
    if [ -n "$lib_files" ]; then
      mkdir -p "$PROJECT_DIR/lib"
      IFS=','; for f in $lib_files; do
        if [ -f "$SRC_DIR/lib/$f" ] && [ ! -f "$PROJECT_DIR/lib/$f" ]; then
          cp -f "$SRC_DIR/lib/$f" "$PROJECT_DIR/lib/$f"
          echo "      lib/$f"
        fi
      done; IFS='|'
    fi
    IFS="$OLD_IFS"
  done
  IFS="$OLD_IFS"
fi

echo ""
ok "✅ $STYLE 风格组装完成${WITH:+（混搭: $WITH）}"
echo "   public/ : $(find "$PROJECT_DIR/public" -type f | wc -l) 个文件"
echo "   routes/ : $(ls "$PROJECT_DIR/routes" 2>/dev/null | wc -l) 个文件"
echo "   lib/    : $(ls "$PROJECT_DIR/lib" 2>/dev/null | wc -l) 个文件"
echo ""
warn "注意："
echo "  1. 前端 public/ 即插即用（静态文件直接 serve）"
echo "  2. routes/ lib/ 是参考素材：原项目用 register(api) 依赖注入，"
echo "     模板用 createRoute 接口，需按 server/project/app.js 骨架改造后挂载"
echo "  3. ./start.sh start 启动验证"