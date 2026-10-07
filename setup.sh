#!/usr/bin/env bash
# ============================================================
# 模板工具：组装 / 检查 / 同步 / 回流，四个动作一个入口
#
# ★ 核心：清单（assemble.json）是「要哪些素材」的唯一真相
#   清单每条写明 来源 → 落点，如：
#     "templates/_downloader/_gamebanana-mods/html/tab-panel/panel-download.html": "server/public/fragments/tab-panel/panel-download.html"
#   所以本脚本**没有风格参数** —— 用哪套素材完全由清单决定。
#   混搭（跨风格取素材）同样由清单决定：把想要的条目都写进同一份清单即可。
#
# ── 常用命令（先看这段）────────────────────────────
#   ./setup.sh --to <项目清单>                  组装：按清单产出到 server/public/
#   ./setup.sh --to <项目清单> --dry-run        组装预演：只列会写入/覆盖哪些文件，不写盘 ★
#   ./setup.sh --to <项目清单> --check          检查：清单两端是否同步（不一致 / 缺失 / 无引用）
#   ./setup.sh --to <项目清单> --untracked      扫描：目录里有哪些文件不在清单（按 .gitignore 排除）
#   ./setup.sh --migrate <旧清单> --to <新清单>  迁移：按新结构搬文件并自动改引用
#   ./setup.sh --to <项目清单> --pull           回流预演：列出项目侧改过的素材
#   ./setup.sh --to <项目清单> --pull --write   回流：把改动写回模板（写前备份）
#   ./setup.sh --fix-perm [<仓库路径>]          修复执行位：按版本库记录恢复丢失的可执行位
#   ./setup.sh --list                           列出可用风格素材目录
#   ./setup.sh                                  输出帮助（等同 --help）
#
#   <项目清单> = <项目根>/assemble.json
#   ★ 清单所在文件夹就是项目根 —— 清单里的相对路径全部相对它解析。
#     所以只需给清单路径一个参数，项目根自动得出，不必也不能另行指定。
#   ★ 搬模板（组装）是覆盖式写盘，建议先 --dry-run 看一眼，再正式跑。
#     清单整份复制过来时会静默带进本项目用不上的条目——建成当时看不出来，
#     要等有人照着它改代码才踩坑。--check 的「无引用」告警也是为这类问题加的。
#
# ── 参数 ──────────────────────────────────────────────
#   --to <项目清单>     目标项目的 assemble.json。清单所在目录即项目根，
#                       清单里的相对路径全部相对它解析——所以不另传项目根。
#   --check            只检查不产出。
#   --dry-run          预演不写盘（组装：列将写入的文件；迁移：列将搬动的文件）。
#                      组装预演会标出每个文件是「新增 / 覆盖 / 相同」，
#                      覆盖项最值得留意。配合 DRY_VERBOSE=1 可展开目录条目下的逐个文件。
#   --pull [--write]   回流（默认只预演，--write 才写）。
#
# ── 两个方向（别再混淆）──────────────────────────────
#   回流 --pull ：项目 → 模板。把项目侧改过的**素材**写回模板对应位置。
#   只处理素材条目（src==dst，位于 templates/ framework/ project/）；
#   产出条目（src!=dst，如 → server/public/）不参与双向同步 —— 产物由组装生成。
#
# ── 素材布局（2026-09-27 重构：templates 上提到根，按通用程度分目录）──
#   templates/styles|html|js|json|assets ← 最通用层（所有项目共用，可为空）
#   templates/_downloader/        ← 下载器系（_iwara/ _gamebanana-mods/ 为项目独有层）
#   templates/_gallery/           ← 画廊系
#   每层内部按类型子目录（styles/html/js/json/assets），js/css/html 保留内部层级
#   lib/                          ← 通用支撑件（cjs-bootstrap.cjs / start.sh / preview/）
#
# 后端业务 JS 不在模板：通用件在 templates/js/（core/route/http/...），
# 业务实现由各项目自己维护（_gallery 例外：连同 server/ 一起带，见 templates/_gallery/server/）。
#
# ── 结构（2026-09-28 拆分）────────────────────────────
#   本文件是纯总入口：共享库与各功能拆到 scripts/ 下独立脚本，行为不变。
#     scripts/setup-lib.sh      共享库（环境/函数/参数解析）
#     scripts/setup-list.sh     --list / -h / --help / 无参数
#     scripts/setup-check.sh    --check
#     scripts/setup-untracked.sh --untracked
#     scripts/setup-migrate.sh  --migrate
#     scripts/setup-pull.sh     --pull
#     scripts/setup-assemble.sh 组装（--to 缺省动作）
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$ROOT/scripts/setup-lib.sh"

# 无参数 / --list / -h / --help：一律输出用法（无参数 = 帮助）
if [ $# -eq 0 ] || [ "$1" = "--list" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  exec bash "$ROOT/scripts/setup-list.sh"
fi

# 命令分发：按动作参数决定调用哪个子脚本（参数原样透传，子脚本自行解析）。
# 优先级与旧 setup.sh 分支顺序一致：fix-perm → check → untracked → migrate → pull → 组装。
case " $* " in
  *" --fix-perm "*)   exec bash "$ROOT/scripts/setup-fixperm.sh" "$@" ;;
  *" --check "*)      exec bash "$ROOT/scripts/setup-check.sh" "$@" ;;
  *" --untracked "*)  exec bash "$ROOT/scripts/setup-untracked.sh" "$@" ;;
  *" --migrate "*)    exec bash "$ROOT/scripts/setup-migrate.sh" "$@" ;;
  *" --pull "*)       exec bash "$ROOT/scripts/setup-pull.sh" "$@" ;;
  *)                  exec bash "$ROOT/scripts/setup-assemble.sh" "$@" ;;
esac