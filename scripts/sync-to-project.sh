#!/usr/bin/env bash
# ============================================================
# 素材同步脚本：把模板的 framework + templates 同步到旧项目/新项目
#
# 旧项目「组装式」工作流（素材副本方案）：
#   1. 本脚本按项目自己的 assemble.json 清单，把「清单引用到的素材」
#      复制到目标项目 server/ 下（项目从此自带素材副本，不依赖模板仓库路径）
#   2. 目标项目里跑 ./setup.sh <风格> --to . 组装前端到自己的 public/
#   3. 改模板素材 → 重跑本脚本 + setup.sh 即同步生效
#
# 用法：
#   ./scripts/sync-to-project.sh /path/to/project/server
#   ./scripts/sync-to-project.sh /path/to/project/server --all   # 不带清单时整份同步
#
# 为什么按清单而不是整目录搬（2026-09-18 改）：
#   原实现无差别复制 framework/ + templates/ + project/blueprint/ 三个整目录。
#   但「要哪些素材」本来就已经由 assemble.json 精确声明了，两套逻辑并存
#   导致整目录那份把用不到的东西也搬进项目：
#     - _iwara-style/          另一个风格（gbmd 项目 320K）
#     - .trash-*/  *.bak/      模板自己的重构留档（约 1.1M）
#   实测同步体积 1.5M，其中绝大部分是垃圾。改为清单驱动后只搬被引用的素材，
#   且清单本身也复制过去（否则项目里没有它、下次组装无从下手）。
#
# 说明：
#   - 清单引用的素材直接覆盖（模板是权威）
#   - 清单没有引用到的目录不复制；目标里已存在的同名旧素材会被清掉，
#     避免「模板已删、项目还留着」的陈旧副本
#   - 目标项目的 app.js / config.schema.json / public / routes / lib 不动
#     （那些是组装产物或业务代码，不在本脚本范围）
#   - 找不到清单时：提示并退回整份同步（--all 可显式指定），不静默少搬
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_FRAMEWORK="$ROOT/server/framework"
SRC_TEMPLATES="$ROOT/server/templates"
SRC_SETUP="$ROOT/setup.sh"
MANIFEST_TOOL="$ROOT/scripts/assemble-manifest.js"   # 清单解析唯一实现
# Node 定位：与 start.sh 同款候选顺序（NAS/Homebrew/nvm/官方包都在列），
# 不裸用 `node`——某些环境（如 NAS 的应用容器）PATH 里没有 node，
# 裸调用会让清单解析静默失败。
find_node() {
  local c nvm
  for c in \
    "$ROOT/tool/node/bin/node" \
    /usr/local/bin/node \
    /opt/homebrew/bin/node \
    /opt/node/bin/node \
    /var/packages/Node.js_v24/target/usr/local/bin/node \
    /var/packages/Node.js_v22/target/usr/local/bin/node \
    /var/packages/Node.js_v20/target/usr/local/bin/node \
    /var/packages/DeepSeekHarness-NAS/target/bin/node \
    node; do
    if [ -x "$c" ]; then NODE_BIN="$c"; return 0; fi
    if command -v "$c" >/dev/null 2>&1; then NODE_BIN="$(command -v "$c")"; return 0; fi
  done
  for nvm in "$HOME"/.nvm/versions/node/*/bin/node; do
    if [ -x "$nvm" ]; then NODE_BIN="$nvm"; return 0; fi
  done
  return 1
}
NODE_BIN=""

if [ $# -lt 1 ]; then
  echo "用法: $0 <目标server目录>"
  echo "示例: $0 /path/to/gamebanana-mods-downloader/server"
  exit 1
fi
TARGET="$1"

[ -d "$SRC_FRAMEWORK" ] || { echo "❌ 模板 framework/ 缺失: $SRC_FRAMEWORK"; exit 1; }
[ -d "$SRC_TEMPLATES" ] || { echo "❌ 模板 templates/ 缺失: $SRC_TEMPLATES"; exit 1; }

# 自毁防护：TARGET 与模板素材同处一个目录时（在项目自身里跑本脚本），
# rm -rf 会先删源再复制导致素材丢失。
TARGET_ABS="$(cd "$TARGET" 2>/dev/null && pwd || echo "$TARGET")"
if [ "$TARGET_ABS" = "$ROOT/server" ] || [ "$TARGET_ABS" = "$ROOT" ]; then
  echo "❌ 目标与模板素材目录重合（$TARGET_ABS）——本脚本要把模板素材复制到项目，请在模板仓库里执行："
  echo "     cd <模板仓库> && ./scripts/sync-to-project.sh <项目>/server"
  exit 1
fi

# 排掉模板仓库自己的历史归档：.trash-*/ 是重构留档，*.bak 是旧副本。
# 这两类对项目没有价值（实测约 1.1M）。
RSYNC_EXCLUDES=(--exclude=.trash-* --exclude=*.bak --exclude=*.bak-*)

# 目录同步：优先 rsync（能表达"不复制什么"，并用 --delete-excluded 清掉目标里
# 已存在的旧归档）；rsync 不可用或失败（权限、特殊字符路径等）时回落 cp -r，
# 再事后清一遍归档。回落是为了不因一个优化点让整个同步中断。
sync_dir() {
  local src="$1" dst="$2"
  mkdir -p "$dst"
  if command -v rsync >/dev/null 2>&1; then
    if rsync -a --delete-excluded "${RSYNC_EXCLUDES[@]}" "$src/" "$dst/" 2>/dev/null; then
      return 0
    fi
    echo "  ⚠️ rsync 失败，回落 cp -r（归档将在复制后清理）" >&2
  fi
  cp -r "$src/." "$dst/" || return 1
  find "$dst" -name '.trash-*' -prune -exec rm -rf {} + 2>/dev/null
  find "$dst" \( -name '*.bak' -o -name '*.bak-*' \) -delete 2>/dev/null
  return 0
}

# ---------- 定位项目清单 ----------
# 清单是「项目要哪些素材」的唯一真相。项目根的 locate 顺序与 setup.sh 保持一致：
#   <项目根>/assemble.json（--to 指向 server/ 时项目根是其上一级）
PROJ_ROOT="$(cd "$TARGET/.." 2>/dev/null && pwd || echo "$TARGET/..")"
MANIFEST=""
for cand in "$PROJ_ROOT/assemble.json" "$TARGET/assemble.json"; do
  [ -f "$cand" ] && MANIFEST="$cand" && break
done

MODE="manifest"
if [ "${2:-}" = "--all" ]; then
  MODE="all"
elif [ -z "$MANIFEST" ]; then
  MODE="all"
  echo "  ⚠️ 未找到 assemble.json（找过 $PROJ_ROOT/ 与 $TARGET/）"
  echo "     退回整份同步；若项目还不需要清单，可忽略本提示。"
fi

echo "══ 同步素材 → $TARGET ══"
if [ "$MODE" = "manifest" ]; then
  echo "  依据清单: $MANIFEST"
else
  echo "  模式: 整份同步（framework + templates + project/blueprint）"
fi
mkdir -p "$TARGET"

# ---------- 复制清单本身（清单驱动的前提：项目里得有它） ----------
if [ "$MODE" = "manifest" ]; then
  # 按清单引用逐项同步：键形如 server/templates/_gbmd-style/... ，
  # 取「素材根」作为要搬的目录，避免把整个 templates/ 搬过来。
  #
  # 解析统一走 scripts/assemble-manifest.js（清单解析的唯一实现）。
  # 此前这里有一份自己的 asset_root() 实现，与 setup.sh 的内嵌 python 各写一遍，
  # 口径已出现过偏差（不过滤 `_` 注释键、基准假设不一致）。收敛后不再重演。
  if ! find_node; then
    echo "  ❌ 找不到 node（清单解析需要）。请安装 Node.js，或把官方二进制解压到 $ROOT/tool/node/" >&2
    echo "     如需不依赖清单的整份同步，请加 --all。" >&2
    exit 1
  fi
  PROJ_ROOT_FOR_PLAN="$(cd "$TARGET/.." 2>/dev/null && pwd || echo "$TARGET/..")"

  # 源基准：由共享模块按「BASE/server/ 下确有素材」判定，两种布局通用。
  SRC_BASE="$("$NODE_BIN" "$MANIFEST_TOOL" resolve-base "$ROOT")"

  # 清单自检（路径安全 / 同名覆盖）——只警告，不阻断同步。
  "$NODE_BIN" "$MANIFEST_TOOL" validate "$MANIFEST" "$SRC_BASE" 2>&1 | sed 's/^/  /' || true

  PLAN="$TARGET/.sync-plan"
  ROOTS="$TARGET/.sync-roots"
  if ! "$NODE_BIN" "$MANIFEST_TOOL" asset-roots "$MANIFEST" > "$ROOTS" 2>/dev/null; then
    echo "  ❌ 清单解析失败: $MANIFEST" >&2
    rm -f "$ROOTS"
    exit 1
  fi

  : > "$PLAN"
  n=0
  while IFS= read -r rel; do
    [ -z "$rel" ] && continue
    if [ ! -d "$SRC_BASE/$rel" ]; then
      echo "  ⚠️ 清单引用的素材不存在: $rel（跳过）" >&2
      continue
    fi
    printf '%s\n' "$rel" >> "$PLAN"
    echo "  ✓ $rel/  （清单引用）"
    n=$((n + 1))
  done < "$ROOTS"
  rm -f "$ROOTS"

  # 组装还需要的固定件（清单通常不直接引用，但 setup.sh 会读）：
  #   1. server/framework               → boot.cjs 引导依赖
  #   2. server/project/blueprint 骨架  → init 时初始化 app.js/config.schema.json
  # 只在项目确实用到、且清单没引用时才补，避免把无关素材搬进来。
  add_extra() {
    _rel="$1"
    grep -qxF "$_rel" "$PLAN" 2>/dev/null && return 0
    [ -d "$SRC_BASE/$_rel" ] || return 0
    printf '%s\n' "$_rel" >> "$PLAN"
    echo "  ✓ $_rel/  （组装依赖）"
    n=$((n + 1))
  }
  grep -qxF "server/framework" "$PLAN" 2>/dev/null || add_extra "server/framework"
  if ! grep -qxF "server/project/blueprint" "$PLAN" 2>/dev/null; then
    _init="$("$NODE_BIN" "$MANIFEST_TOOL" init-flag "$MANIFEST" 2>/dev/null || echo 1)"
    [ "$_init" = "1" ] && add_extra "server/project/blueprint"
  fi

  echo "  -- 素材根 $n 个"


  # 消费 .sync-plan：plan 写在 $PLAN，读也用 $PLAN。
  # （此前写在 $TARGET/.sync-plan 却从 $PROJ_ROOT_FOR_PLAN/.sync-plan 读，
  #   路径不一致导致「报成功但一个素材都没复制」——这类 bug 的共因就是
  #   同一个落点被拼了两次、两次拼法还不一样。）
  if [ -s "$PLAN" ]; then
    while IFS= read -r rel; do
      [ -n "$rel" ] || continue
      # rel 形如 server/templates/_gbmd-style（模板根相对，取自清单键）；
      # 落点 = 项目根 + rel（TARGET 已是 <项目根>/server，不能再用它拼）
      sync_dir "$SRC_BASE/$rel" "$PROJ_ROOT_FOR_PLAN/$rel" || { echo "  ❌ $rel 复制失败" >&2; exit 1; }
    done < "$PLAN"
  else
    echo "  ⚠️ 清单没有可同步的素材（plan 为空）" >&2
  fi
  rm -f "$PLAN"

else
  # 整份同步（无清单 / --all）
  for pair in "server/framework:framework" \
              "server/templates:templates" \
              "server/project/blueprint:project/blueprint"; do
    src="$ROOT/${pair%%:*}"; dst="$TARGET/${pair##*:}"
    [ -d "$src" ] || continue
    mkdir -p "$(dirname "$dst")"
    sync_dir "$src" "$dst" || { echo "❌ $dst 复制失败"; exit 1; }
    echo "  ✓ ${pair%%:*}/ → $dst/"
  done
fi

# setup.sh（目标项目从此自带组装脚本）
if [ -f "$SRC_SETUP" ]; then
  cp "$SRC_SETUP" "$TARGET/setup.sh"
  chmod +x "$TARGET/setup.sh" 2>/dev/null
  echo "  ✓ setup.sh → $TARGET/setup.sh"
  # 清单解析工具随 setup.sh 一起进项目（setup.sh 依赖它解析 assemble.json）。
  # 放同级而非 scripts/：项目可能已有自己的 scripts/ 目录。
  if [ -f "$MANIFEST_TOOL" ]; then
    cp "$MANIFEST_TOOL" "$TARGET/assemble-manifest.js"
    echo "  ✓ assemble-manifest.js → $TARGET/assemble-manifest.js"
  else
    echo "  ⚠️ 未找到 $MANIFEST_TOOL，项目内 setup.sh 将无法解析清单" >&2
  fi
fi

echo ""
ok() { printf '\033[32m%s\033[0m\n' "$*"; }
ok "✅ 素材同步完成"
echo "下一步（在目标项目 server/ 下）:"
echo "  ./setup.sh gbmd --to .        # 组装 gbmd 风格前端到 public/"
echo "  ./setup.sh iwara --to .        # 组装 iwara 风格前端"
echo "  ./setup.sh --list              # 查看风格与组件"