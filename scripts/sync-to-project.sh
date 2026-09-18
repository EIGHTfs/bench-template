#!/usr/bin/env bash
# ============================================================
# 素材同步：把模板仓库的前端素材搬进目标项目，供项目内 ./setup.sh 组装
#
# 旧项目「组装式」工作流（素材副本方案）：
#   1. 本脚本按项目自己的 assemble.json 清单，把素材复制到目标项目 server/ 下
#      （项目从此自带素材副本，不依赖模板仓库路径）
#   2. 目标项目里跑 ./setup.sh <风格> --to . 组装前端到自己的 public/
#   3. 改模板素材 → 重跑本脚本 + setup.sh 即同步生效
#
# 用法：
#   ./scripts/sync-to-project.sh /path/to/project/server
#   ./scripts/sync-to-project.sh /path/to/project/server --all   # 不带清单时整份同步
#
# 复制实现不在本文件：**复用 setup.sh 的 _setup_copy_manifest**。
# 早期本脚本自带一套「按素材根整目录搬」的逻辑，与 setup.sh 的「按清单逐条搬」
# 并存，两套实现解读同一份清单的方式不同，是漏搬与误报的长期根源。
# 现在只有一套复制实现——本脚本只负责设好来源与落点，然后把活交给 setup.sh：
#
#   本脚本（同步）:   SRC_BASE=模板仓库根   TARGET=项目根
#   setup.sh（组装）: SRC_BASE=项目根       TARGET=项目根
#
# 依赖：node（解析清单）
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETUP_SH="$ROOT/setup.sh"

err()  { printf '\033[31m%s\033[0m\n' "$*" >&2; }
ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }

usage() {
  echo "用法:"
  echo "  ./scripts/sync-to-project.sh <目标项目/server 目录> [--all]"
  echo ""
  echo "示例:"
  echo "  ./scripts/sync-to-project.sh ../iwara-downloader/server"
  echo "  ./scripts/sync-to-project.sh ../gamebanana-mods-downloader/server --all"
}

TARGET="${1:-}"
ALL=0
[ "${2:-}" = "--all" ] && ALL=1

if [ -z "$TARGET" ] || [ "$TARGET" = "-h" ] || [ "$TARGET" = "--help" ]; then
  usage
  exit 0
fi

if [ ! -d "$TARGET" ]; then
  err "❌ 目标目录不存在: $TARGET"
  exit 1
fi
TARGET="$(cd "$TARGET" && pwd)"

# 项目根 = 目标 server/ 的上一级（清单键含 server/ 前缀，落点基准为项目根）
PROJ_ROOT="$(cd "$TARGET/.." && pwd)"

echo ""
echo "模板仓库: $ROOT"
echo "目标项目: $TARGET"
echo ""

# ---------- 复用 setup.sh 的组装逻辑 ----------
# SETUP_LIB_ONLY=1：setup.sh 只定义函数与变量，不执行它自己的主流程。
if [ ! -f "$SETUP_SH" ]; then
  err "❌ 找不到 $SETUP_SH（同步依赖它的复制实现）"
  exit 1
fi
# shellcheck disable=SC1090
SETUP_LIB_ONLY=1 source "$SETUP_SH"

if ! declare -f _setup_copy_manifest >/dev/null 2>&1; then
  err "❌ 未能从 setup.sh 加载 _setup_copy_manifest（复制实现缺失）"
  exit 1
fi

# ---------- 定位清单 ----------
# 清单是「项目要哪些素材」的唯一真相。项目根的查找顺序与 setup.sh 保持一致：
#   <项目根>/assemble.json（--to 指向 server/ 时项目根是其上一级）
MANIFEST=""
for cand in "$PROJ_ROOT/assemble.json" "$TARGET/assemble.json"; do
  [ -f "$cand" ] && MANIFEST="$cand" && break
done

if [ -z "$MANIFEST" ] && [ "$ALL" = "0" ]; then
  err "❌ 目标项目根没有 assemble.json: $PROJ_ROOT"
  err "   同步按清单执行——清单声明「从模板取哪些文件到本项目」。"
  err "   如需不依赖清单的整份同步，请加 --all。"
  exit 1
fi

# ---------- 设定 setup.sh 复制函数所需的环境 ----------
# _setup_copy_manifest 读这四个变量：源基准 / 目标根 / 清单 / node 与解析器
SRC_BASE="$ROOT"                 # 来源 = 模板仓库根（清单键 server/... 相对它）
ASSEMBLE_FILE="${MANIFEST:-}"    # --all 时为空，走下面的整份同步分支
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
MANIFEST_TOOL="$ROOT/scripts/assemble-manifest.js"
TARGET="$PROJ_ROOT"              # 落点 = 项目根（清单值相对项目根）

if [ "$ALL" = "1" ]; then
  # 整份同步：绕过清单，按固定目录整体搬运（保留旧 --all 行为）
  echo "  -- 整份同步（--all，忽略清单）"
  RSYNC_EXCLUDES=(--exclude=.trash-* --exclude=*.bak --exclude=*.bak-*)
  for pair in "server/framework:server/framework" \
              "server/templates:server/templates" \
              "server/project/blueprint:server/project/blueprint"; do
    src="$ROOT/${pair%%:*}"; dst="$PROJ_ROOT/${pair##*:}"
    [ -d "$src" ] || continue
    mkdir -p "$dst"
    if command -v rsync >/dev/null 2>&1 &&
       rsync -a --delete-excluded "${RSYNC_EXCLUDES[@]}" "$src/" "$dst/" 2>/dev/null; then
      :
    else
      cp -r "$src/." "$dst/" 2>/dev/null
      find "$dst" -name '.trash-*' -prune -exec rm -rf {} + 2>/dev/null
      find "$dst" \( -name '*.bak' -o -name '*.bak-*' \) -delete 2>/dev/null
    fi
    echo "  ✓ ${pair%%:*}/ → $dst/"
  done
else
  if [ -z "$NODE_BIN" ]; then
    err "❌ 找不到 node，无法解析清单"
    exit 1
  fi

  # 清单自检（路径安全 / 同名覆盖）——只警告，不阻断
  "$NODE_BIN" "$MANIFEST_TOOL" validate "$MANIFEST" "$SRC_BASE" 2>&1 | sed 's/^/  /' || true

  echo "  -- 清单: $MANIFEST"
  # 落点模式 tree：素材落进项目的**素材树**（按清单 src 还原结构，如
  # server/templates/_iwara-style/...），供项目内 setup.sh 之后组装到 public/。
  # 组装模式（out）按清单 dst 落点，那是产出位置——同步不能用它。
  COPY_LAYOUT=tree _setup_copy_manifest
fi

# ---------- setup.sh 等运行时文件随同步进项目 ----------
# 项目要能独立组装，必须自带 setup.sh（以及它依赖的清单解析器与 node 定位库）。
# 这是「同步」特有的动作：项目自己组装时不需要再复制这些。
if [ -f "$ROOT/setup.sh" ]; then
  cp -f "$ROOT/setup.sh" "$TARGET/setup.sh"
  chmod +x "$TARGET/setup.sh" 2>/dev/null
  echo "  ✓ setup.sh → $TARGET/setup.sh"

  if [ -f "$ROOT/scripts/assemble-manifest.js" ]; then
    cp -f "$ROOT/scripts/assemble-manifest.js" "$TARGET/assemble-manifest.js"
    echo "  ✓ assemble-manifest.js → $TARGET/assemble-manifest.js"
  fi
  if [ -f "$ROOT/scripts/lib-node.sh" ]; then
    cp -f "$ROOT/scripts/lib-node.sh" "$TARGET/lib-node.sh"
    echo "  ✓ lib-node.sh → $TARGET/lib-node.sh"
  fi
fi

echo ""
ok "✅ 素材同步完成"
echo "下一步（在目标项目里）:"
echo "  cd $PROJ_ROOT"
echo "  ./server/setup.sh iwara --to ./server   # 或 gbmd"
echo "  ./server/setup.sh --list                # 查看风格与组件"
