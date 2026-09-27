#!/usr/bin/env bash
# ============================================================
# setup 子脚本：--untracked（清单外文件扫描）
# 拆自 setup.sh（2026-09-28），逻辑零改动；由总入口 setup.sh 分发调用，
# 也可独立执行：bash scripts/setup-untracked.sh --to <项目清单>
# ============================================================
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup-lib.sh"
setup_parse_args "$@"

# ---------- 清单外文件扫描（--untracked <清单>）----------
# 扫清单所在目录的整棵树（含子目录），列出不在清单里的文件；
# 被 .gitignore 忽略的（.git/、node_modules/、构建产物、本地配置等）不计入。
# 与 --check 的分工：check 只比对清单两端是否同步，本命令回答「目录里还有什么没进清单」。
if [ -z "$MANIFEST_FILE" ]; then
  err "❌ --untracked 需要配合 --to <清单> 指定要扫描的清单"
  exit 1
fi
[ -f "$MANIFEST_FILE" ] || { err "❌ 清单不存在: $MANIFEST_FILE"; exit 1; }
echo "══ 清单外文件扫描 ══"
"$NODE_BIN" "$MANIFEST_TOOL" untracked "$MANIFEST_FILE" "$(cd "$(dirname "$MANIFEST_FILE")" && pwd)"
exit $?