#!/usr/bin/env bash
# ============================================================
# setup 子脚本：--list / -h / --help / 无参数（帮助与素材目录）
# 由总入口 setup.sh 分发调用，
# 也可独立执行：bash scripts/setup-list.sh [--list|-h|--help]
# ============================================================
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup-lib.sh"

usage
echo ""
echo "模板自带的素材目录（templates/，按通用程度分：最通用层 / 系级 / 项目独有）:"
for s in $STYLES; do echo "  templates/_${s}/"; done
echo "  （系级下还有项目独有层，如 templates/_downloader/_iwara/、templates/_downloader/_gamebanana-mods/）"
echo ""
echo "注意：素材目录只是存放处——用哪套由清单声明，本脚本没有风格参数。"
exit 0