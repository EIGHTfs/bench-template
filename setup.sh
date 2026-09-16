#!/usr/bin/env bash
# ============================================================
# 模板组装脚本：把前端部件组装到目标 server/ 目录
#
# 用法：
#   ./setup.sh <gbmd|iwara> [--to <目标server目录>] [--with <组件,...>]
#
# 目标说明（--to）：
#   - 省略 --to：组装到模板仓库自身 server/project/（测试/参考用）
#   - --to /path/to/project/server：组装到旧项目（gamebanana-mods-downloader /
#     iwara-downloader 等），把前端部件写进对方的 server/public/
#   - 目标 server/ 没有 app.js / config.schema.json 时，从 blueprint/ 复制初始化
#
# 组件（--with，从另一风格叠加前端，同名以主风格为准）：
#   play   = iwara 播放页（play.html + play-app.js + vendor/artplayer.js）
#   setup  = gbmd 设置向导（setup.html + setup-init.js + path-picker.js）
#   video  = iwara 视频功能（video 相关前端）
#   merge  = gbmd 整理合并（merge 相关前端）
#   search = 从另一风格叠加搜索（search-date-range.js）
#
# 原理：
#   server/framework/            ← 通用 JS（两个风格共用，直接引用）
#   server/templates/            ← 前端素材（只读，不改）
#     _gbmd-style/public/        ← gbmd 前端（非分片部件）
#     _iwara-style/public/       ← iwara 前端（非分片部件）
#   server/project/blueprint/    ← 组装蓝图（共用框架/分片/静态资源 + app.js 骨架，入库）：
#                                  login.html/login.js、theme-init.js、search-date-range.js
#                                  等两风格共用文件也从这里拷（_shared/ 已并入 blueprint/）
#   server/project/              ← 缺省组装目标（生成物，不入库）
#
# 后端 JS 不在模板：通用 JS 在 framework/（createServer/createRoute 接口），
#   业务后端 JS 在旧项目/新项目自己实现。
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 素材路径自动探测（两种布局都能跑）：
#   - 模板仓库：<root>/server/templates + <root>/server/project/blueprint
#   - 已同步素材的项目（scripts/sync-to-project.sh）：<root>/templates + <root>/project/blueprint
detect_dir() {
  if [ -d "$1" ]; then echo "$1"; elif [ -d "$2" ]; then echo "$2"; else echo "$1"; fi
}
TEMPLATES_DIR="$(detect_dir "$ROOT/server/templates" "$ROOT/templates")"
BLUEPRINT_DIR="$(detect_dir "$ROOT/server/project/blueprint" "$ROOT/project/blueprint")"
if [ -d "$ROOT/server" ]; then DEFAULT_TARGET="$ROOT/server/project"; else DEFAULT_TARGET="$ROOT/project"; fi

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
declare -A COMPONENTS
COMPONENTS[play]="iwara|play.html,play-app.js,vendor/artplayer.js,vendor/NOTICE.md,iwara-logo.png"
COMPONENTS[setup]="gbmd|setup.html,setup-init.js,path-picker.js,logo.png"
COMPONENTS[video]="iwara|"
COMPONENTS[merge]="gbmd|"
COMPONENTS[search]="iwara|search-date-range.js"

usage() {
  echo "用法:"
  echo "  ./setup.sh <gbmd|iwara> [--to <目标server目录>] [--with <组件,...>]"
  echo "  ./setup.sh --list                          # 查看风格与组件"
  echo ""
  echo "示例:"
  echo "  ./setup.sh gbmd                            # 组装到 server/project/（缺省）"
  echo "  ./setup.sh gbmd --to /path/to/proj/server  # 组装到旧项目 server/"
  echo "  ./setup.sh iwara --to ../iwara-downloader/server --with play"
}

if [ $# -eq 0 ] || [ "$1" = "--list" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  usage
  echo ""
  echo "可用风格: $STYLES"
  echo "可用组件: ${!COMPONENTS[@]}"
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

# 解析参数
TARGET="$DEFAULT_TARGET"
WITH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --to) TARGET="${2:-}"; [ -n "$TARGET" ] || { err "❌ --to 需要路径参数"; exit 1; }; shift 2 ;;
    --with) WITH="${2:-}"; shift 2 ;;
    -*) shift ;;
    *) shift ;;
  esac
done

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

echo "══ 组装 $STYLE 风格 → $TARGET ══"

# 1. 目标初始化：目录 + 蓝图复制（app.js / config.schema.json 不存在才复制）
mkdir -p "$TARGET/public"
for f in app.js config.schema.json; do
  if [ ! -f "$TARGET/$f" ] && [ -f "$BLUEPRINT_DIR/$f" ]; then
    cp "$BLUEPRINT_DIR/$f" "$TARGET/$f"
    echo "  ✓ blueprint/$f → 目标（初始化）"
  fi
done

# 1b. CJS 启动器（父目录 "type":"module" 时必需；不写本地 package.json）
#     boot.cjs 加载 lib/cjs-bootstrap.cjs（只劫持本项目根内的 .js）
if [ ! -f "$TARGET/boot.cjs" ]; then
  BOOTSTRAP_SRC=""
  for c in "$TARGET/framework/cjs-bootstrap.cjs" "$TEMPLATES_DIR/../framework/cjs-bootstrap.cjs"; do
    [ -f "$c" ] && BOOTSTRAP_SRC="$c" && break
  done
  if [ -n "$BOOTSTRAP_SRC" ]; then
    mkdir -p "$TARGET/lib"
    cp "$BOOTSTRAP_SRC" "$TARGET/lib/cjs-bootstrap.cjs"
    cat > "$TARGET/boot.cjs" <<'BOOT'
// 零依赖启动器：强制本项目 .js 按 CommonJS 加载。
// 父目录 package.json 为 "type":"module" 时，直接 node app.js 会被当 ESM 导致 require 失败。
// .cjs 永远是 CJS；只劫持本项目根内的 .js，项目外仍走 Node 原逻辑。
"use strict";
require("./lib/cjs-bootstrap.cjs");
require("./app.js");
BOOT
    echo "  ✓ boot.cjs + lib/cjs-bootstrap.cjs → 目标（CJS 启动器）"
  fi
fi

# 2. 复制共用前端（源自蓝图：_shared/ 已并入 blueprint/，login/theme-init/search-date-range 等
#    两风格共用的静态文件统一由蓝图提供，不再有独立 _shared/ 目录）
mkdir -p "$TARGET/public"
cp -f "$BLUEPRINT_DIR/login.html" "$BLUEPRINT_DIR/login.js" \
      "$BLUEPRINT_DIR/search-date-range.js" "$BLUEPRINT_DIR/theme-init.js" \
      "$TARGET/public/" 2>/dev/null || true
echo "  ✓ blueprint/ 共用前端（login/theme-init/search-date-range）→ public/"

# 3. 复制风格前端（覆盖共用文件；-r 支持 vendor/ 子目录）
cp -rf "$STYLE_DIR/public/." "$TARGET/public/"
echo "  ✓ _${STYLE}-style/public/ → public/"

# 3b. 前端片段组装（蓝图框架 + 通用分片 + 风格特有分片）
#     HTML 框架含 <!-- @frag:名 --> 指令，CSS 框架含 /* @frag:名 */ 指令，
#     运行期由 framework 组装器按指令替换插入（片段在 public/fragments/ 下）
mkdir -p "$TARGET/public/fragments"
FRAMEWORK_SRC="$BLUEPRINT_DIR/index.html/downloader/index.html"
if [ -f "$FRAMEWORK_SRC" ]; then
  mkdir -p "$TARGET/public"
  cp -f "$FRAMEWORK_SRC" "$TARGET/public/index.html"
  echo "  ✓ 蓝图框架 → public/index.html（HTML 指令）"
fi
# CSS 框架（样式由 styles/ 下的分片拼装）
if [ -f "$BLUEPRINT_DIR/style.css" ]; then
  cp -f "$BLUEPRINT_DIR/style.css" "$TARGET/public/style.css"
  echo "  ✓ 蓝图框架 → public/style.css（CSS 指令）"
fi
# 通用分片（HTML + styles/ 下的 CSS；-r 保留子目录）
if [ -d "$BLUEPRINT_DIR/fragments" ]; then
  cp -rf "$BLUEPRINT_DIR/fragments/." "$TARGET/public/fragments/"
  echo "  ✓ blueprint/fragments/ → public/fragments/（通用分片，含 styles/）"
fi
# 风格特有分片（覆盖同名通用分片）
if [ -d "$STYLE_DIR/fragments" ]; then
  cp -rf "$STYLE_DIR/fragments/." "$TARGET/public/fragments/"
  echo "  ✓ _${STYLE}-style/fragments/ → public/fragments/（特有分片，含 styles/）"
fi

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
    if [ -n "$pub_files" ]; then
      IFS=','; for f in $pub_files; do
        if [ -f "$SRC_DIR/public/$f" ]; then
          mkdir -p "$TARGET/public/$(dirname "$f")"
          cp -f "$SRC_DIR/public/$f" "$TARGET/public/$f"
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
echo "   目标: $TARGET"
echo "   public/ : $(find "$TARGET/public" -type f | wc -l) 个文件"
echo ""
warn "注意："
echo "  1. 前端 public/ 即插即用（静态文件直接 serve）"
echo "  2. 后端 JS 不在模板：通用 JS 在 server/framework/（createServer/createRoute 接口），"
echo "     业务后端 JS 由项目自己实现（可参照 blueprint/app.js 骨架）"
echo "  3. ./start.sh start 启动验证"