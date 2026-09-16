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

echo "══ 同步素材 → $TARGET ══"
mkdir -p "$TARGET"

# 1. framework/
if [ -d "$TARGET/framework" ]; then
  rm -rf "$TARGET/framework"
fi
cp -r "$SRC_FRAMEWORK" "$TARGET/framework" || { echo "❌ framework 复制失败"; exit 1; }
echo "  ✓ framework/ → $TARGET/framework/"

# 2. templates/
if [ -d "$TARGET/templates" ]; then
  rm -rf "$TARGET/templates"
fi
cp -r "$SRC_TEMPLATES" "$TARGET/templates" || { echo "❌ templates 复制失败"; exit 1; }
echo "  ✓ templates/ → $TARGET/templates/"

# 3. project/blueprint/（组装蓝图：app.js / config.schema.json 骨架）
SRC_BLUEPRINT="$ROOT/server/project/blueprint"
if [ -d "$SRC_BLUEPRINT" ]; then
  mkdir -p "$TARGET/project"
  rm -rf "$TARGET/project/blueprint"
  cp -r "$SRC_BLUEPRINT" "$TARGET/project/blueprint"
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