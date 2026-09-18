#!/usr/bin/env bash
# ============================================================
# 素材同步脚本：把模板的 framework + templates 同步到旧项目/新项目
#
# 旧项目「组装式」工作流（素材副本方案）：
#   1. 本脚本把 server/framework/ + server/templates/ 复制到目标项目
#      server/ 下（旧项目从此自带素材副本，不依赖模板仓库路径）
#   2. 目标项目里跑 ./setup.sh <风格> --to . 组装前端到自己的 public/
#      （setup.sh 也一并复制过去，或用模板仓库的 --to 直接组装）
#   3. 改模板素材 → 重跑本脚本 + setup.sh 即同步生效
#
# 用法：
#   ./scripts/sync-to-project.sh /path/to/project/server
#
# 说明：
#   - framework/ 直接覆盖（模板是权威）
#   - templates/ 直接覆盖（模板是权威）
#   - 历史归档（.trash-*/ 与 *.bak）不复制：那些是模板仓库自己的重构留档，
#     对项目毫无用处。整目录 cp 会把它们一并搬过去（.trash 约 1.1M），
#     既污染项目又制造无意义 diff。
#   - 目标项目的 app.js / config.schema.json / public / routes / lib 不动
#     （那些是组装产物或业务代码，不在本脚本范围）
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_FRAMEWORK="$ROOT/server/framework"
SRC_TEMPLATES="$ROOT/server/templates"
SRC_SETUP="$ROOT/setup.sh"

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
# 这两类对项目没有价值，整目录 cp 会把它们一并搬过去（实测约 1.1M）。
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

echo "══ 同步素材 → $TARGET ══"
mkdir -p "$TARGET"

# 1. framework/
if [ -d "$TARGET/framework" ]; then
  rm -rf "$TARGET/framework"
fi
# 排除规则：历史归档目录与 .bak（rsync 用 --exclude，比 cp -r 更好表达「不复制什么」）
#   --delete-excluded 让目标里已存在的旧归档也被清掉（否则改过规则后仍残留）
RSYNC_EXCLUDES=(--exclude='.trash-*' --exclude='*.bak' --exclude='*.bak-*')
sync_dir "$SRC_FRAMEWORK" "$TARGET/framework" || { echo "❌ framework 复制失败"; exit 1; }
echo "  ✓ framework/ → $TARGET/framework/"

# 2. templates/
if [ -d "$TARGET/templates" ]; then
  rm -rf "$TARGET/templates"
fi
sync_dir "$SRC_TEMPLATES" "$TARGET/templates" || { echo "❌ templates 复制失败"; exit 1; }
echo "  ✓ templates/ → $TARGET/templates/"

# 3. project/blueprint/（组装蓝图：app.js / config.schema.json 骨架）
SRC_BLUEPRINT="$ROOT/server/project/blueprint"
if [ -d "$SRC_BLUEPRINT" ]; then
  mkdir -p "$TARGET/project"
  rm -rf "$TARGET/project/blueprint"
  sync_dir "$SRC_BLUEPRINT" "$TARGET/project/blueprint"
  echo "  ✓ project/blueprint/ → $TARGET/project/blueprint/"
fi

# 4. setup.sh（目标项目从此自带组装脚本）
if [ -f "$SRC_SETUP" ]; then
  cp "$SRC_SETUP" "$TARGET/setup.sh"
  chmod +x "$TARGET/setup.sh"
  echo "  ✓ setup.sh → $TARGET/setup.sh"
fi

echo ""
ok() { printf '\033[32m%s\033[0m\n' "$*"; }
ok "✅ 素材同步完成"
echo "下一步（在目标项目 server/ 下）:"
echo "  ./setup.sh gbmd --to .        # 组装 gbmd 风格前端到 public/"
echo "  ./setup.sh iwara --to .        # 组装 iwara 风格前端"
echo "  ./setup.sh --list              # 查看风格与组件"