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
TO_SPECIFIED=0
while [ $# -gt 0 ]; do
  case "$1" in
    --to) TARGET="${2:-}"; [ -n "$TARGET" ] || { err "❌ --to 需要路径参数"; exit 1; }; TO_SPECIFIED=1; shift 2 ;;
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

# 目标 server 目录（--to 传项目根，server 在其下；assemble.json 的值同样相对项目根）
SERVER_DIR="$TARGET/server"

# 品牌参数（login/setup/topbar 品牌区通用：logo 统一相对路径 brand.png + 标题占位符）
case "$STYLE" in
  gbmd)  STYLE_LOGO="logo.png";       STYLE_TITLE="GameBanana Mod Downloader" ;;
  iwara) STYLE_LOGO="iwara-logo.png"; STYLE_TITLE="iwara-downloader" ;;
  *)     STYLE_LOGO="logo.png";       STYLE_TITLE="app" ;;
esac

echo "══ 组装 $STYLE 风格 → $TARGET ══"

# 1. 目标初始化：目录 + 蓝图骨架复制（app.js / config.schema.json 不存在才复制）
#    已有自己 app.js/config 机制的项目，可在 assemble.json 设 "init": false 跳过本段
INIT_FLAG="$(python3 -c "
import json,sys
try:
    m=json.load(open(sys.argv[1],encoding='utf-8'))
    print('0' if m.get('init', True) is False else '1')
except Exception:
    print('1')
" "$ASSEMBLE_FILE" 2>/dev/null || echo 1)"
mkdir -p "$SERVER_DIR/public"
if [ "$INIT_FLAG" = "1" ]; then
  for f in app.js config.schema.json; do
    if [ ! -f "$SERVER_DIR/$f" ] && [ -f "$BLUEPRINT_DIR/$f" ]; then
      cp "$BLUEPRINT_DIR/$f" "$SERVER_DIR/$f"
      echo "  ✓ blueprint/$f → 目标（初始化）"
    fi
  done
else
  echo "  ✓ 跳过蓝图骨架初始化（assemble.json init=false，项目自带 app.js/config）"
fi

# 1b. CJS 启动器（父目录 "type":"module" 时必需；不写本地 package.json）
#     boot.cjs 加载 lib/cjs-bootstrap.cjs（只劫持本项目根内的 .js）
if [ ! -f "$SERVER_DIR/boot.cjs" ]; then
  BOOTSTRAP_SRC=""
  for c in "$SERVER_DIR/framework/cjs-bootstrap.cjs" "$TEMPLATES_DIR/../framework/cjs-bootstrap.cjs"; do
    [ -f "$c" ] && BOOTSTRAP_SRC="$c" && break
  done
  if [ -n "$BOOTSTRAP_SRC" ]; then
    mkdir -p "$SERVER_DIR/lib"
    cp "$BOOTSTRAP_SRC" "$SERVER_DIR/lib/cjs-bootstrap.cjs"
    cat > "$SERVER_DIR/boot.cjs" <<'BOOT'
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

# 2. 按 assemble.json 组装（清单由各项目自己维护）
#     assemble.json 放在目标项目根（--to 指向的 server/ 的上一级，或模板根缺省）。
#     格式：{ "files": { "模板内相对路径": "目标项目内相对路径" } }
#       值 = 相对目标项目根（如 "server/public/login.html"）；以 / 结尾 = 整目录拷贝（含子目录）。
#     示例：
#       { "files": {
#           "server/project/blueprint/login.html": "server/public/login.html",
#           "server/project/blueprint/fragments/": "server/public/fragments/",
#           "server/templates/_gbmd-style/public/logo.png": "server/public/brand.png"
#         } }
# assemble.json 查找（按需取用清单）：
#   - --to 指定项目目标：必须用自己的 assemble.json（声明要取哪些模板文件），缺失报错
#   - 无 --to（模板自测到 server/project/）：用 blueprint/assemble.json 默认（纯公共件）
find_assemble() {
  local d
  if [ "$TO_SPECIFIED" = "1" ]; then
    for d in "$TARGET" "$TARGET/.."; do
      if [ -f "$d/assemble.json" ]; then echo "$d/assemble.json"; return 0; fi
    done
  else
    for d in "$TARGET" "$BLUEPRINT_DIR" "$ROOT/server/project" "$ROOT/project"; do
      if [ -f "$d/assemble.json" ]; then echo "$d/assemble.json"; return 0; fi
    done
  fi
  return 1
}

ASSEMBLE_FILE="$(find_assemble || true)"
if [ -z "$ASSEMBLE_FILE" ]; then
  err "❌ 未找到 assemble.json"
  err "   目标项目根需要 assemble.json 声明要取哪些模板文件（键=模板内路径，值=项目内路径，按需取用）"
  err '   最小示例: {"files":{"server/project/blueprint/login.html":"server/public/login.html"}}'
  err "   模板默认清单: $BLUEPRINT_DIR/assemble.json（可复制过去按需改）"
  exit 1
fi
if [ "$ASSEMBLE_FILE" = "$BLUEPRINT_DIR/assemble.json" ] && [ "$TO_SPECIFIED" = "0" ]; then
  warn "  ⚠️ 模板自测：使用 blueprint/assemble.json 默认（仅公共件）"
  warn "     自定义/混搭：在目标项目根建 assemble.json（键=模板内路径，值=项目内路径，按需取用）"
else
  ok "  ✓ 组装清单: $ASSEMBLE_FILE"
fi

# 用 python3 把 assemble.json 展开为 cp 命令执行
#   键 = 源，相对模板根 ROOT；值 = 目标，相对目标项目根 TARGET（如 server/public/login.html）
python3 - "$ASSEMBLE_FILE" "$ROOT" "$TARGET" <<'PYEOF'
import json, os, sys, subprocess
manifest, root, target = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    with open(manifest, encoding="utf-8") as f:
        m = json.load(f)
except Exception as e:
    print(f"  ❌ assemble.json 解析失败: {e}", file=sys.stderr); sys.exit(1)

files = m.get("files") or {}
n_dir = n_file = missing = 0
for src, dst_rel in files.items():
    src_path = os.path.join(root, src)
    dst = os.path.join(target, dst_rel)
    if dst_rel.endswith("/") or dst_rel.endswith("/."):
        src_dir = os.path.join(root, src.rstrip("/"))
        dst_dir = dst.rstrip("/.")
        if os.path.isdir(src_dir):
            os.makedirs(dst_dir, exist_ok=True)
            subprocess.run(["cp", "-rf", src_dir + "/.", dst_dir], check=False)
            print(f"  ✓ {src}/ → {dst_rel}")
            n_dir += 1
        else:
            print(f"  ⚠️ 目录不存在: {src}/（跳过）", file=sys.stderr); missing += 1
    else:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if os.path.isfile(src_path):
            subprocess.run(["cp", "-f", src_path, dst], check=False)
            print(f"  ✓ {src} → {dst_rel}")
            n_file += 1
        else:
            print(f"  ⚠️ 文件不存在: {src}（跳过）", file=sys.stderr); missing += 1
print(f"  -- 目录 {n_dir} 个 / 文件 {n_file} 个 / 缺失 {missing} 个")
PYEOF
if [ $? -ne 0 ]; then exit 1; fi

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
          mkdir -p "$SERVER_DIR/public/$(dirname "$f")"
          cp -f "$SRC_DIR/public/$f" "$SERVER_DIR/public/$f"
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
echo "   public/ : $(find "$SERVER_DIR/public" -type f | wc -l) 个文件"
echo ""
warn "注意："
echo "  1. 前端 public/ 即插即用（静态文件直接 serve）"
echo "  2. 后端 JS 不在模板：通用 JS 在 server/framework/（createServer/createRoute 接口），"
echo "     业务后端 JS 由项目自己实现（可参照 blueprint/app.js 骨架）"
echo "  3. ./start.sh start 启动验证"