#!/usr/bin/env bash
# ============================================================
# setup 子脚本：--pull [--write]（素材回流）
# 拆自 setup.sh（2026-09-28），逻辑零改动；由总入口 setup.sh 分发调用，
# 也可独立执行：bash scripts/setup-pull.sh --to <项目清单> [--write]
# ============================================================
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup-lib.sh"
setup_parse_args "$@"

# ---------- 素材回流（--pull）----------
# 两个方向共用同一份清单与同一套解析：
#   --pull（回流）  项目 → 模板：把项目侧改过的**素材**改动写回模板仓库对应位置
#
# 为什么合并进 setup.sh：早先 scripts/sync-to-project.sh 声称复用本脚本的
# _setup_copy_manifest，实际另写了 rsync/cp 一套落盘逻辑，两套实现对「目录条目」
# 「后写覆盖」的解读不一致，是漏搬与误报的长期根源。现在只有一处实现、一个入口。
#
# 素材 vs 产出：清单里 src==dst 的条目是素材（templates/ 风格层、framework/ 框架、
# project/blueprint/ 蓝图），要双向同步；src!=dst 的是组装产出（→ server/public/），
# 由组装生成、不参与双向同步（回流产物无意义，下发也由 --to 组装负责）。
if [ -z "$TARGET" ]; then
  err "❌ 找不到清单: $TARGET"
  err "   回流以清单为唯一真相——它声明「这个项目从模板取哪些素材」。"
  exit 1
fi
if [ ! -f "$TARGET" ]; then
  err "❌ 找不到清单: $TARGET"
  err "   回流以清单为唯一真相——它声明「这个项目从模板取哪些素材」。"
  exit 1
fi
echo "══ 回流改动 $PROJECT_ROOT → 模板 ══"
echo "  -- 清单: $TARGET"
# 缺省只预演（列出差异）；--write 才真写回，且写前备份模板原文件
"$NODE_BIN" "$MANIFEST_TOOL" pull "$TARGET" "$PROJECT_ROOT" "$ROOT" \
  $( [ "$PULL_WRITE" = "1" ] && echo --write )
exit $?