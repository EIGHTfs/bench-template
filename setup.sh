#!/usr/bin/env bash
# ============================================================
# 模板组装脚本：把前端部件组装到目标 server/ 目录
#
# 用法：
#   ./setup.sh <风格> [--to <项目根|项目根/server>] [--with <组件,...>] [--check]
#
# 风格（<风格>）：由 server/templates/_<名>-style/ 目录自动发现，新增风格只需建目录。
#   现有：gbmd / iwara（详见 ./setup.sh --list）
#
# 目标说明（--to）——一律基于「项目根」，两种写法等价：
#   - 省略 --to：组装到模板仓库自身 server/project/（测试/参考用）
#   - --to /path/to/project       ：项目根，最直接
#   - --to /path/to/project/server：同样基于项目根，脚本自动归一（少写一层）
#   目标项目没有 app.js / config.schema.json 时，从 blueprint/ 复制初始化
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

# 清单解析唯一实现（scripts/assemble-manifest.js）——
# 此前 files 展开 / brand 导出 / init 判定各自内嵌一份 python，口径易漂移。
# 清单解析工具的定位：优先同级（项目里随 setup.sh 一起同步过来的副本），
# 回落到模板仓库的 scripts/。setup.sh 会被复制进项目独立运行，项目不一定
# 有 scripts/ 目录（也可能有自己的同名目录），所以工具必须跟着 setup.sh 走。
if [ -f "$ROOT/assemble-manifest.js" ]; then
  MANIFEST_TOOL="$ROOT/assemble-manifest.js"
elif [ -f "$ROOT/scripts/assemble-manifest.js" ]; then
  MANIFEST_TOOL="$ROOT/scripts/assemble-manifest.js"
else
  MANIFEST_TOOL="$ROOT/scripts/assemble-manifest.js"   # 交给下游报「找不到」
fi
# Node 定位统一走 lib-node.sh（唯一实现，start.sh/sync/测试 共用同一份）。
# setup.sh 会被复制进项目独立运行，项目不一定有 scripts/，故优先取同级副本，
# 回落到模板仓库的 scripts/（与 MANIFEST_TOOL 同一套定位策略）。
if [ -f "$ROOT/lib-node.sh" ]; then
  . "$ROOT/lib-node.sh"
elif [ -f "$ROOT/scripts/lib-node.sh" ]; then
  . "$ROOT/scripts/lib-node.sh"
else
  echo "  ⚠️ 缺少 lib-node.sh，无法定位 node" >&2
  find_node() { return 1; }
fi
NODE_BIN=""

# 清单「键」的源基准（键统一写成 server/... 形式）：
#   模板仓库布局：素材在 <模板根>/server/  → 源基准 = 模板根
#   synced 布局  ：素材在 <项目>/server/   → 源基准 = 项目根（即 $ROOT 的上一级）
# 两种布局下「基准 + 键」都指向同一批素材，因此同一份 assemble.json 两边通用。
# 判定统一交给 scripts/assemble-manifest.js（resolve-base），与 sync-to-project.sh
# 共用同一实现——此前这里是第三份「基准怎么算」的独立实现，正是幽灵目录的根因。
if find_node "$ROOT/tool/node/bin/node"; then
  SRC_BASE="$("$NODE_BIN" "$MANIFEST_TOOL" resolve-base "$ROOT")"
else
  # 没有 node 时回落旧判定（保持可用，不让组装整体失败）
  if [ -d "$ROOT/server/templates" ] || [ -d "$ROOT/server/project/blueprint" ]; then
    SRC_BASE="$ROOT"
  elif [ -d "$ROOT/templates" ] || [ -d "$ROOT/project/blueprint" ]; then
    SRC_BASE="$(cd "$ROOT/.." && pwd)"
  else
    SRC_BASE="$ROOT"
  fi
fi
if [ -d "$ROOT/server" ]; then DEFAULT_TARGET="$ROOT/server/project"; else DEFAULT_TARGET="$ROOT/project"; fi

# ---------- 颜色 ----------
C_GREEN="" C_YELLOW="" C_RED="" C_DIM="" C_RESET=""
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != "dumb" ]; then
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
fi
ok()   { printf '%s%s%s\n' "$C_GREEN" "$*" "$C_RESET"; }
warn() { printf '%s%s%s\n' "$C_YELLOW" "$*" "$C_RESET"; }
err()  { printf '%s%s%s\n' "$C_RED" "$*" "$C_RESET"; }

# 可用风格 —— 遍历 server/templates/_<名>-style/ 目录自动发现，不硬编码列表。
# 【设计意图】风格列表由目录结构决定：新增/删除风格只动 server/templates/，脚本无需跟着改。
# 【思路】新增风格只需新建 _<名>-style/ 目录，setup.sh 无需改动；
#   排序固定（sort）保证 --list 与错误提示的输出稳定可复现。
#   目录名不符合 _*-style 规律的一律跳过（如备份目录 .trash-*、临时目录），
#   避免把无关目录当成风格。
_detect_styles() {
  local dir name out=""
  for dir in "$TEMPLATES_DIR"/*/; do
    [ -d "$dir" ] || continue
    name="$(basename "$dir")"
    case "$name" in
      _*-style) out="$out ${name#_}"; out="${out%-style}" ;;
    esac
  done
  # 去重 + 排序后输出（词间以空格分隔，与旧 STYLES 变量格式一致）
  echo "$out" | tr ' ' '\n' | sed '/^$/d' | sort -u | tr '\n' ' ' | sed 's/ $//'
}
STYLES="$(_detect_styles)"

# 组件定义：每个组件 = 来源风格 + 前端文件列表
declare -A COMPONENTS
COMPONENTS[play]="iwara|play.html,play-app.js,vendor/artplayer.js,vendor/NOTICE.md,iwara-logo.png"
COMPONENTS[setup]="gbmd|setup.html,setup-init.js,path-picker.js,logo.png"
COMPONENTS[video]="iwara|"
COMPONENTS[merge]="gbmd|"
COMPONENTS[search]="iwara|search-date-range.js"

usage() {
  echo "用法:"
  echo "  ./setup.sh <风格> [--to <项目根>] [--with <组件,...>]"
  echo "  ./setup.sh --list                          # 查看可用风格与组件（风格=扫 server/templates/_*-style/ 自动发现）"
  echo ""
  echo "示例:"
  echo "  ./setup.sh gbmd                            # 组装到 server/project/（缺省）"
  echo "  ./setup.sh gbmd --to /path/to/proj/server  # 组装到旧项目 server/"
  echo "  ./setup.sh iwara --to ../iwara-downloader/server --with play"
}

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

# 展开清单并复制：解析交给共享模块（list 输出 TSV: 源<TAB>目标），
# 本处只负责「按行复制 + 计数 + 报缺失」，不再自行解析 JSON。
# 目标以 / 结尾 = 目录整体拷贝（含点文件），否则单文件拷贝。
# 落点模式（COPY_LAYOUT）：
#   out （缺省）= 组装：落点按清单 dst（server/public/... 产出位置）
#   tree        = 同步：落点按清单 src（保持素材树结构 server/templates/...）
# 同一份清单的 dst 是「组装产出位置」，而同步要把素材备进项目的素材树供之后组装，
# 故落点必须按 src 还原。两个工具共用这一段复制实现，差异只在这一个变量。
_setup_copy_manifest() {
  local src dst src_path dst_path n_dir=0 n_file=0 missing=0 line
  local layout="${COPY_LAYOUT:-out}"
  local copy_dst
  while IFS=$'\t' read -r src dst; do
    [ -n "$src" ] || continue
    src_path="$SRC_BASE/$src"
    # tree 模式落点与源同构（src 本身），out 模式用清单声明的 dst
    if [ "$layout" = "tree" ]; then copy_dst="$src"; else copy_dst="$dst"; fi
    dst_path="$TARGET/$copy_dst"
    case "$copy_dst" in
      */)
        # 目录：src 去掉尾部斜杠，目标去掉尾部 "/." 或 "/"
        src="${src%/}"
        dst_path="${dst_path%/}"
        dst_path="${dst_path%/.}"
        src_path="$SRC_BASE/$src"
        if [ -d "$src_path" ]; then
          mkdir -p "$dst_path"
          # 逐文件强制覆盖：不能只靠 `cp -rf src/. dst/`——它在部分实现下不覆盖已存在的同名文件，
          # 而清单允许「多个源写入同一目标目录」（blueprint 提供共用底座、风格层提供该风格专属），
          # 靠后写入的源覆盖先写入的同名文件正是设计意图（如 iwara 风格层覆盖 blueprint 的 row-thumb.css）。
          # 用 find + 逐文件 mkdir/cp 保证「后写必覆盖」，与清单顺序语义一致。
          (cd "$src_path" && find . -type d -exec mkdir -p "$dst_path/{}" \; )
          (cd "$src_path" && find . -type f -exec sh -c 'mkdir -p "$2/$(dirname "$1")" && cp -f "$1" "$2/$1"' _ {} "$dst_path" \; )
          echo "  ✓ $src/ → $copy_dst"
          n_dir=$((n_dir + 1))
        else
          echo "  ⚠️ 目录不存在: $src/（跳过）" >&2
          missing=$((missing + 1))
        fi
        ;;
      *)
        if [ -f "$src_path" ]; then
          mkdir -p "$(dirname "$dst_path")"
          cp -f "$src_path" "$dst_path"
          echo "  ✓ $src → $copy_dst"
          n_file=$((n_file + 1))
        else
          echo "  ⚠️ 文件不存在: $src（跳过）" >&2
          missing=$((missing + 1))
        fi
        ;;
    esac
  done < <("$NODE_BIN" "$MANIFEST_TOOL" list "$ASSEMBLE_FILE")
  echo "  -- 目录 $n_dir 个 / 文件 $n_file 个 / 缺失 $missing 个"
  # 缺失只警告不阻断（与既有行为一致）；但目录全缺时提醒，避免静默产出空框架。
  if [ "$n_dir" = "0" ] && [ "$n_file" = "0" ] && [ "$missing" -gt 0 ]; then
    echo "  ⚠️ 清单所有素材都未找到——请确认清单键与源基准（基准: $SRC_BASE）" >&2
  fi
}

# ---------- 函数定义区（供 source 复用；直接执行时同样生效）----------

# ---------- 只加载模式 ----------
# 供 scripts/sync-to-project.sh 复用本脚本的组装逻辑（_setup_copy_manifest），
# 避免「模板→项目」与「素材→public」两套复制实现并存。
# 上面的函数与变量已全部定义完毕，此处 return 不跑主流程；
# 直接执行（未设 SETUP_LIB_ONLY）时完全不受影响。
if [ "${SETUP_LIB_ONLY:-0}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi

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
CHECK_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --to) TARGET="${2:-}"; [ -n "$TARGET" ] || { err "❌ --to 需要路径参数"; exit 1; }; TO_SPECIFIED=1; shift 2 ;;
    --with) WITH="${2:-}"; shift 2 ;;
    --check) CHECK_ONLY=1; shift ;;
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

# --check：只做清单一致性检查，不组装。
# 作用：①找出项目里存在、但 json 清单两端都没提到的文件（清单外文件）
#       ②按清单两端（模板源 → 项目目标）逐文件 md5 比对，报不一致
# 用法：./setup.sh <风格> --to <项目根> --check [--with 组件]
if [ "$CHECK_ONLY" = "1" ]; then
  # 清单取目标项目根下的 assemble.json（没有则用模板自测清单）
  if [ -f "$TARGET/assemble.json" ]; then
    CHECK_MANIFEST="$TARGET/assemble.json"
  elif [ -f "$ROOT/server/project/blueprint/assemble.json" ]; then
    CHECK_MANIFEST="$ROOT/server/project/blueprint/assemble.json"
  else
    err "❌ 找不到 assemble.json（项目根: $TARGET）"; exit 1
  fi
  # 素材基准：清单键固定写 server/...，按素材实际位置解析（synced/模板两种布局通用）
  CHECK_BASE="$("$NODE_BIN" "$MANIFEST_TOOL" resolve-base "$ROOT" 2>/dev/null || echo "$ROOT")"
  "$NODE_BIN" "$MANIFEST_TOOL" check "$CHECK_MANIFEST" "$TARGET" "$CHECK_BASE"
  exit $?
fi

# 目标 server 目录（--to 传项目根，server 在其下；assemble.json 的值同样相对项目根）
# --to 归一：文档写的是 `--to <项目>/server`，而下面按「项目根」推导 SERVER_DIR
# （SERVER_DIR=$TARGET/server）。两种写法都接受，避免传 server/ 时落到
# <项目>/server/server/（幽灵目录：组装全报成功，真实文件一个没更新）。
if [ "$TO_SPECIFIED" = "1" ] && [ "$(basename "$(cd "$TARGET" 2>/dev/null && pwd || echo "$TARGET")")" = "server" ]; then
  TARGET="$(cd "$TARGET/.." 2>/dev/null && pwd || echo "$TARGET/..")"
fi
SERVER_DIR="$TARGET/server"

echo "══ 组装 $STYLE 风格 → $TARGET ══"


ASSEMBLE_FILE="$(find_assemble || true)"
if [ -z "$ASSEMBLE_FILE" ]; then
  # 生成位置与 find_assemble 的首选查找位置保持一致：
    #   --to 时首查 $TARGET —— TARGET 在上方已归一为「项目根」（传 <项目>/server 也会被剥成项目根），
    #   故生成位置即 $TARGET/assemble.json。历史缺陷：曾写成 "$TARGET/.." 多退一层，
    #   导致提示的 cp 目标落到 <项目根>/../assemble.json（幽灵位置），生成后也找不到。
  if [ "$TO_SPECIFIED" = "1" ]; then GEN_PATH="$TARGET/assemble.json"; else GEN_PATH="$TARGET/assemble.json"; fi

  err "❌ 未找到 assemble.json"
  err "   目标项目根需要它声明：从模板取哪些文件到本项目"
  err "     键 = 模板内相对路径（以 / 结尾 = 整目录拷贝）"
  err "     值 = 本项目内相对路径（相对项目根）"
  err "   最小示例: {\"files\":{\"server/project/blueprint/login.html\":\"server/public/login.html\"}}"

  # 非交互（管道 / CI / 重定向）：不询问，打印提示后退出，避免 read 挂起
  if [ ! -t 0 ]; then
    err ""
    err "   非交互环境，跳过询问。可复制模板默认清单后按需修改："
    err "     cp $BLUEPRINT_DIR/assemble.json $GEN_PATH"
    exit 1
  fi

  if [ -e "$GEN_PATH" ]; then
    err ""
    err "   ⚠️ $GEN_PATH 已存在但无法解析为清单，请手工检查后重跑。"
    exit 1
  fi

  printf '\n是否生成带注释的空模板？[y/N] '
  read -r ans || ans=""
  case "$ans" in
    y|Y|yes|YES)
      if ! python3 - "$GEN_PATH" <<'PYGEN'
import json, sys
path = sys.argv[1]
# 清单不带注释段：字段含义与用法统一写在模板仓库 README 的
# 「assemble.json（按需取用）」章节，避免同一份说明在多处漂移。
m = {
    "files": {},
    "init": False,
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(m, f, ensure_ascii=False, indent=2)
    f.write("\n")
# 回读校验，确保写出的确实是合法 JSON
with open(path, encoding="utf-8") as f:
    json.load(f)
PYGEN
      then
        err "   ❌ 生成失败（目录不可写？）: $GEN_PATH"
        exit 1
      fi
      ok "   ✓ 已生成空模板: $GEN_PATH"
      echo "     files 目前为空，请编辑它声明要取哪些文件，然后重跑本命令。"
      exit 0
      ;;
    *)
      err "   已跳过生成。可手工创建，或复制模板默认清单后修改："
      err "     cp $BLUEPRINT_DIR/assemble.json $GEN_PATH"
      exit 1
      ;;
  esac
fi
if [ "$ASSEMBLE_FILE" = "$BLUEPRINT_DIR/assemble.json" ] && [ "$TO_SPECIFIED" = "0" ]; then
  warn "  ⚠️ 模板自测：使用 blueprint/assemble.json 默认（仅公共件）"
  warn "     自定义/混搭：在目标项目根建 assemble.json（键=模板内路径，值=项目内路径，按需取用）"
else
  ok "  ✓ 组装清单: $ASSEMBLE_FILE"
fi

# 立即校验清单可解析：JSON 语法错 / 结构不对时提前失败，避免在初始化蓝图、
# 生成 boot.cjs 之后才报错，从而留下半成品目录。
# 下划线开头的键是注释，值可以是任意类型，跳过校验——由共享模块统一处理。
if find_node "$ROOT/tool/node/bin/node"; then
  if ! "$NODE_BIN" "$MANIFEST_TOOL" validate "$ASSEMBLE_FILE" "$SRC_BASE"; then
    exit 1
  fi
else
  echo "  ⚠️ 未找到 node，跳过清单结构自检（仍会按清单复制）" >&2
fi

# 1. 目标初始化：目录 + 蓝图骨架复制（app.js / config.schema.json 不存在才复制）
#    已有自己 app.js/config 机制的项目，可在 assemble.json 设 "init": false 跳过本段
if [ -n "$NODE_BIN" ]; then
  INIT_FLAG="$("$NODE_BIN" "$MANIFEST_TOOL" init-flag "$ASSEMBLE_FILE" 2>/dev/null || echo 1)"
else
  INIT_FLAG=1
fi
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



if [ -n "$NODE_BIN" ]; then
  _setup_copy_manifest
else
  echo "  ❌ 找不到 node，无法解析清单复制素材。请安装 Node.js。" >&2
  exit 1
fi
if [ $? -ne 0 ]; then exit 1; fi

# 3b. 品牌配置：清单里的 brand 段 → server/public/brand.json
#   @brand:key 注释指令在运行期由 framework/fragment-assembler 取值替换
#   （页面标题、logo、icon 等）。品牌参数属于项目自身，由项目在 assemble.json
#   声明，脚本不内置任何项目名。
#   仅在文件不存在时生成：brand.json 是运行期可变配置，项目改过就不该被组装覆盖。
BRAND_JSON="$SERVER_DIR/public/brand.json"
if [ -f "$BRAND_JSON" ]; then
  ok "  ✓ brand.json 已存在，保留（如需按清单重置请先删除该文件）"
else
  # brand 导出：rc=0 生成成功；rc=3 表示清单未声明 brand 段（非错误，静默跳过）；
  # 其余 rc 才是真错误。必须直接在 if 上取 $?，否则会被后续命令覆盖。
  if [ -z "$NODE_BIN" ]; then
    :                                # 无 node：跳过（前面清单复制已会报错退出）
  else
    "$NODE_BIN" "$MANIFEST_TOOL" brand "$ASSEMBLE_FILE" "$BRAND_JSON"
    rc=$?
    if [ "$rc" = "0" ]; then
      ok "  ✓ 生成 brand.json（来自清单 brand 段）"
    elif [ "$rc" != "3" ]; then
      exit 1
    fi
  fi
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