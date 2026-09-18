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
  # 取到「前两/三层」作为要搬的素材根，避免把整个 templates/ 搬过来。
  # 用 python3 展开为「源目录 → 目标目录」对（与 setup.sh 同款解析口径）。
  # 源基准 = 模板根（本脚本就在模板仓库里跑，素材位于 <模板根>/server/）。
  # 落点基准 = 项目根（TARGET 是 <项目根>/server，清单键含 server/ 前缀）
  PROJ_ROOT_FOR_PLAN="$(cd "$TARGET/.." 2>/dev/null && pwd || echo "$TARGET/..")"
  python3 - "$MANIFEST" "$ROOT" "$PROJ_ROOT_FOR_PLAN" <<'PYEOF'
import json, os, sys, subprocess, collections

manifest, root, target = sys.argv[1], sys.argv[2], sys.argv[3]
m = json.load(open(manifest, encoding="utf-8"))
files = {k: v for k, v in (m.get("files") or {}).items() if not str(k).startswith("_")}

# 从清单键提取「素材根」：server/<a>/<b>[/<c>] 的前缀。
#   server/framework/...              → server/framework
#   server/templates/_gbmd-style/...  → server/templates/_gbmd-style   （只搬当前风格）
#   server/project/blueprint/...      → server/project/blueprint
def asset_root(key):
    parts = key.rstrip("/").split("/")
    if len(parts) >= 3 and parts[0] == "server" and parts[1] == "templates":
        return "/".join(parts[:3])          # 含具体风格目录
    if len(parts) >= 3 and parts[0] == "server" and parts[1] == "project":
        return "/".join(parts[:3])          # project/blueprint
    return "/".join(parts[:2])              # server/framework 等

roots = collections.OrderedDict()
for k in files:
    r = asset_root(k)
    roots.setdefault(r, 0)
    roots[r] += 1

# 组装还需要的固定件（清单通常不直接引用，但 setup.sh 会读）：
#   1. framework/cjs-bootstrap.cjs  → boot.cjs 引导（TEMPLATES_DIR/../framework/）
#   2. project/blueprint 骨架        → init:true 时初始化 app.js/config.schema.json
#   3. blueprint/assemble.json      → 无清单时的默认模板
# 只有项目确实用到时才补，避免又把无关素材搬进去。
extra = []
if "server/framework" not in roots and os.path.isdir(os.path.join(root, "server/framework")):
    extra.append("server/framework")
if any(r.startswith("server/project/blueprint") for r in roots) is False:
    bp = os.path.join(root, "server/project/blueprint")
    if os.path.isdir(bp) and m.get("init"):
        extra.append("server/project/blueprint")

n = 0
for rel, cnt in roots.items():
    src = os.path.join(root, rel)
    dst = os.path.join(target, rel)
    if not os.path.isdir(src):
        print(f"  ⚠️ 清单引用的素材不存在: {rel}（跳过）", file=sys.stderr)
        continue
    os.makedirs(dst, exist_ok=True)
    print(f"  ✓ {rel}/  （清单引用 {cnt} 项）")
    n += 1
for rel in extra:
    src = os.path.join(root, rel)
    dst = os.path.join(target, rel)
    if os.path.isdir(src):
        print(f"  ✓ {rel}/  （组装依赖）")
        n += 1

# 输出待执行的 cp 清单，交给外层 sync_dir（带排除与回落）
with open(os.path.join(target, ".sync-plan"), "w", encoding="utf-8") as f:
    for rel in list(roots) + extra:
        f.write(rel + "\n")
print(f"  -- 素材根 {n} 个")
PYEOF

  if [ -f "$PROJ_ROOT_FOR_PLAN/.sync-plan" ]; then
    while IFS= read -r rel; do
      [ -n "$rel" ] || continue
      # rel 形如 server/templates/_gbmd-style（模板根相对）；
      # 落点 = 项目根 + rel（TARGET 已是 <项目根>/server，不能再用它拼）
      sync_dir "$ROOT/$rel" "$PROJ_ROOT_FOR_PLAN/$rel" || { echo "❌ $rel 复制失败"; exit 1; }
    done < "$PROJ_ROOT_FOR_PLAN/.sync-plan"
    rm -f "$PROJ_ROOT_FOR_PLAN/.sync-plan"
  fi

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
fi

echo ""
ok() { printf '\033[32m%s\033[0m\n' "$*"; }
ok "✅ 素材同步完成"
echo "下一步（在目标项目 server/ 下）:"
echo "  ./setup.sh gbmd --to .        # 组装 gbmd 风格前端到 public/"
echo "  ./setup.sh iwara --to .        # 组装 iwara 风格前端"
echo "  ./setup.sh --list              # 查看风格与组件"