#!/usr/bin/env bash
# ============================================================
# setup 子脚本：--check（清单一致性检查）
# 由总入口 setup.sh 分发调用，
# 也可独立执行：bash scripts/setup-check.sh --to <项目清单>
# ============================================================
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup-lib.sh"
setup_parse_args "$@"

# --check：只做清单一致性检查，不组装。
# 作用：①找出项目里存在、但 json 清单两端都没提到的文件（清单外文件）
#       ②按清单两端（模板源 → 项目目标）逐文件 md5 比对，报不一致
# 用法：./setup.sh --to <项目根>/assemble.json --check
CHECK_MANIFEST="$TARGET"
[ -n "$CHECK_MANIFEST" ] || { err "❌ --check 需要 --to <项目清单>"; exit 1; }
[ -f "$CHECK_MANIFEST" ] || { err "❌ 找不到清单: $CHECK_MANIFEST"; exit 1; }
# 素材基准：清单键固定写 server/...，按素材实际位置解析（synced/模板两种布局通用）
CHECK_BASE="$("$NODE_BIN" "$MANIFEST_TOOL" resolve-base "$ROOT" 2>/dev/null || echo "$ROOT")"
"$NODE_BIN" "$MANIFEST_TOOL" check "$CHECK_MANIFEST" "$PROJECT_ROOT" "$CHECK_BASE"
exit $?