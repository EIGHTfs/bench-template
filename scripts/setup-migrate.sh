#!/usr/bin/env bash
# ============================================================
# setup 子脚本：--migrate（结构迁移）+ --to <新清单>
# 拆自 setup.sh（2026-09-28），逻辑零改动；由总入口 setup.sh 分发调用，
# 也可独立执行：bash scripts/setup-migrate.sh --migrate <旧清单> --to <新清单>
# ============================================================
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup-lib.sh"
setup_parse_args "$@"

# ---------- 结构迁移（--migrate <旧清单> + --to <新清单>）----------
# 场景：项目里已有素材，但结构要重排（如 framework/ 平铺 → 分子目录）。
#   旧清单说明「文件现在在哪」（按其 dst），新清单说明「该搬到哪」（按其 dst）。
#   按落点的**文件名**配对（结构重排通常只改目录层级、不改文件名），
#   然后移动磁盘文件；移动后再改写被搬文件的相对引用。
if [ -z "$MANIFEST_FILE" ]; then
  err "❌ --migrate 需要配合 --to <新清单>（旧清单说现状，新清单说目标）"
  exit 1
fi
[ -f "$MIGRATE_FROM" ] || { err "❌ 旧清单不存在: $MIGRATE_FROM"; exit 1; }
echo "══ 结构迁移 ══"
echo "  旧清单: $MIGRATE_FROM"
echo "  新清单: $MANIFEST_FILE"
# 缺省就是真迁移（--dry-run 才预演）：迁移是常规操作，不该每次都要额外加参数。
# 注意用 if 而非 `[ ... ] && ...`：后者在条件为假时返回非零，配合 set -e 语义
# 或后续判断容易误判成失败（实测：导致 --write 一直没传上、只预演不执行）。
if [ "$DRY_RUN" = "1" ]; then
  "$NODE_BIN" "$MANIFEST_TOOL" migrate "$MIGRATE_FROM" "$MANIFEST_FILE" \
    --proj-root="$PROJECT_ROOT" --dry-run
else
  "$NODE_BIN" "$MANIFEST_TOOL" migrate "$MIGRATE_FROM" "$MANIFEST_FILE" \
    --proj-root="$PROJECT_ROOT" --write
fi
exit $?