#!/usr/bin/env bash
# ============================================================
# 模板工具：组装 / 检查 / 同步 / 回流，四个动作一个入口
#
# ★ 核心：清单（assemble.json）是「要哪些素材」的唯一真相
#   清单每条写明 来源 → 落点，如：
#     "server/templates/_gbmd-style/public/app.js": "server/public/app.js"
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
# ── 素材布局 ───────────────────────────────────────────
#   server/framework/          ← 通用 JS（HTTP/鉴权/路由工厂/配置/备份/自动更新）
#   server/templates/          ← 风格素材（只读）：_<名>-style/，新增风格=建目录
#   server/project/blueprint/  ← 组装蓝图（共用分片/静态资源 + app.js 骨架，入库）
#   server/project/            ← 缺省组装目标（生成物，不入库）
#
# 后端业务 JS 不在模板：通用件在 framework/，业务实现由各项目自己维护
#   （_gallery-style 例外：它连同 server/app.js + lib/ + routes/ 一起带）。
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 素材路径自动探测（两种布局都能跑）：
#   - 模板仓库：<root>/server/templates + <root>/server/project/blueprint
#   - 已同步素材的项目（scripts/sync-to-project.sh）：<root>/templates + <root>/project/blueprint
detect_dir() {
  if [ -d "$1" ]; then echo "$1"; elif [ -d "$2" ]; then echo "$2"; else echo "$1"; fi
}
TEMPLATES_DIR="$(detect_dir "$ROOT/server/templates" "$ROOT/templates")"
BLUEPRINT_DIR="$(detect_dir "$ROOT/server/project/blueprint" "$ROOT/project/blueprint")"

# 清单解析唯一实现（scripts/assemble-manifest.js）——
# 此前 files 展开 / brand 导出 / init 判定各自内嵌一份 python，口径易漂移。
# 清单解析工具的定位：优先同级（项目里随 setup.sh 一起同步过来的副本），
# 回落到模板仓库的 scripts/。setup.sh 会被复制进项目独立运行，项目不一定
# 有 scripts/ 目录（也可能有自己的同名目录），所以工具必须跟着 setup.sh 走。
if [ -f "$ROOT/assemble-manifest.js" ]; then
  MANIFEST_TOOL="$ROOT/assemble-manifest.js"
elif [ -f "$ROOT/scripts/assemble-manifest.js" ]; then
  MANIFEST_TOOL="$ROOT/scripts/assemble-manifest.js"
else
  MANIFEST_TOOL="$ROOT/scripts/assemble-manifest.js"   # 交给下游报「找不到」
fi
# Node 定位统一走 lib-node.sh（唯一实现，start.sh/sync/测试 共用同一份）。
# setup.sh 会被复制进项目独立运行，项目不一定有 scripts/，故优先取同级副本，
# 回落到模板仓库的 scripts/（与 MANIFEST_TOOL 同一套定位策略）。
if [ -f "$ROOT/lib-node.sh" ]; then
  . "$ROOT/lib-node.sh"
elif [ -f "$ROOT/scripts/lib-node.sh" ]; then
  . "$ROOT/scripts/lib-node.sh"
else
  echo "  ⚠️ 缺少 lib-node.sh，无法定位 node" >&2
  find_node() { return 1; }
fi
NODE_BIN=""

# 清单「键」的源基准（键统一写成 server/... 形式）：
#   模板仓库布局：素材在 <模板根>/server/  → 源基准 = 模板根
#   synced 布局  ：素材在 <项目>/server/   → 源基准 = 项目根（即 $ROOT 的上一级）
# 两种布局下「基准 + 键」都指向同一批素材，因此同一份 assemble.json 两边通用。
# 判定统一交给 scripts/assemble-manifest.js（resolve-base），与 sync-to-project.sh
# 共用同一实现——此前这里是第三份「基准怎么算」的独立实现，正是幽灵目录的根因。
if find_node "$ROOT/tool/node/bin/node"; then
  SRC_BASE="$("$NODE_BIN" "$MANIFEST_TOOL" resolve-base "$ROOT")"
else
  # 没有 node 时回落旧判定（保持可用，不让组装整体失败）
  if [ -d "$ROOT/server/templates" ] || [ -d "$ROOT/server/project/blueprint" ]; then
    SRC_BASE="$ROOT"
  elif [ -d "$ROOT/templates" ] || [ -d "$ROOT/project/blueprint" ]; then
    SRC_BASE="$(cd "$ROOT/.." && pwd)"
  else
    SRC_BASE="$ROOT"
  fi
fi
# example/ 是模板自带的**示例项目**：它既是「组装效果长什么样」的参考，
# 也是 test/ 脚本的测试对象。组装方式与任何普通项目一致 ——
#   ./setup.sh --to example/assemble.json
# 产物落在 example/server/ 且不入库（见 .gitignore），可反复重装。

# ---------- 颜色 ----------
C_GREEN="" C_YELLOW="" C_RED="" C_DIM="" C_RESET=""
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != "dumb" ]; then
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
fi
ok()   { printf '%s%s%s\n' "$C_GREEN" "$*" "$C_RESET"; }
warn() { printf '%s%s%s\n' "$C_YELLOW" "$*" "$C_RESET"; }
err()  { printf '%s%s%s\n' "$C_RED" "$*" "$C_RESET"; }

# 可用风格 —— 遍历 server/templates/_<名>-style/ 目录自动发现，不硬编码列表。
# 【设计意图】风格列表由目录结构决定：新增/删除风格只动 server/templates/，脚本无需跟着改。
# 【思路】新增风格只需新建 _<名>-style/ 目录，setup.sh 无需改动；
#   排序固定（sort）保证 --list 与错误提示的输出稳定可复现。
#   目录名不符合 _*-style 规律的一律跳过（如备份目录 .trash-*、临时目录），
#   避免把无关目录当成风格。
_detect_styles() {
  local dir name out=""
  for dir in "$TEMPLATES_DIR"/*/; do
    [ -d "$dir" ] || continue
    name="$(basename "$dir")"
    case "$name" in
      _*-style) out="$out ${name#_}"; out="${out%-style}" ;;
    esac
  done
  # 去重 + 排序后输出（词间以空格分隔，与旧 STYLES 变量格式一致）
  echo "$out" | tr ' ' '\n' | sed '/^$/d' | sort -u | tr '\n' ' ' | sed 's/ $//'
}
STYLES="$(_detect_styles)"

# 组件定义：每个组件 = 来源风格 + 前端文件列表

usage() {
  echo "用法:（清单即唯一真相：--to 直接指向项目的 assemble.json）"
  echo ""
  echo "  ./setup.sh --to <项目清单>                    # 组装：按清单产出到 dst"
  echo "  ./setup.sh --to <项目清单> --check            # 检查：清单两端是否同步（不一致 / 缺失）"
  echo "  ./setup.sh --to <项目清单> --untracked        # 扫描：目录里有哪些文件不在清单"
  echo "  ./setup.sh --migrate <旧清单> --to <新清单>    # 迁移：按新结构搬文件并自动改引用"
  echo "  ./setup.sh --migrate <旧清单> --to <新清单> --dry-run   # 迁移预演（不改盘）"
  echo "  ./setup.sh --to <项目清单> --pull             # 回流预演：列出项目侧改过的素材"
  echo "  ./setup.sh --to <项目清单> --pull --write     # 回流：把改动写回模板（写前备份）"
  echo ""
  echo "  ./setup.sh --list                             # 列出可用风格素材目录"
  echo "  ./setup.sh, -h, --help                        # 输出本帮助"
  echo ""
  echo "说明："
  echo "  · 清单（assemble.json）每条写明「来源 → 落点」，故本脚本没有风格参数；"
  echo "  · 清单所在文件夹 = 项目根（拼装时所有相对路径的基准），故只需给清单路径；"
  echo "  · 素材（src==dst）参与 --pull；产出（src!=dst）由 --to 组装生成。"
  echo "  · --untracked 扫清单所在目录整棵树，被 .gitignore 忽略的文件不计入（与 git 同一套规则）；"
  echo "  · --migrate 用旧清单看「现状」、新清单看「目标」，按落点文件名配对后搬文件，"
  echo "    并自动改写受影响文件的相对引用（含指向被搬文件的那些）。"
  echo ""
  echo "示例:"
  echo "  ./setup.sh --to ../iwara-downloader/assemble.json"
  echo "  ./setup.sh --to ../iwara-downloader/assemble.json --check"
  echo "  ./setup.sh --to ../iwara-downloader/assemble.json --untracked"
  echo "  ./setup.sh --migrate /tmp/old.json --to ../gallery/assemble.json --dry-run"
}
# assemble.json 查找（按需取用清单）：
#   - --to 指定项目目标：必须用自己的 assemble.json（声明要取哪些模板文件），缺失报错
#   - 无 --to（模板自测到 example/）：用 example/assemble.json（缺省回落 blueprint 默认清单）
# 清单定位：TARGET 已是清单文件路径（参数区已解析 --to）。
# 未指定时回落到模板自带 example 实例，再回落 blueprint 默认清单（纯公共件）。
find_assemble() {
  # 只认 --to 给的清单。此前这里还会依次兜底 example/、blueprint/、project/ ——
  # 结果是「没给 --to」时静默组装某个内置清单，用户以为在操作自己的项目。
  # 现在没有 --to 就报错（见下方调用处），example 也只是一份普通清单。
  if [ -n "$TARGET" ] && [ -f "$TARGET" ]; then echo "$TARGET"; return 0; fi
  return 1
}

# 展开清单并复制：解析交给共享模块（list 输出 TSV: 源<TAB>目标），
# 本处只负责「按行复制 + 计数 + 报缺失」，不再自行解析 JSON。
# 目标以 / 结尾 = 目录整体拷贝（含点文件），否则单文件拷贝。
#
# 落点一律按清单 **dst**——清单是唯一真相，dst 声明了什么就落到哪里。
#
# 【已废除的 tree 模式】早先还有个 COPY_LAYOUT=tree：落点改用 src，
# 声称「把素材备进项目的素材树（server/templates/…）供之后组装」。这是设计错误：
#   · 清单里 templates/ 只作为 **src** 出现（取素材的来处），从不出现在 dst——
#     即清单从未声明过任何文件该落到 templates/。tree 模式却凭空往那里写文件，
#     于是项目里长出 server/templates/_<风格>-style/ 整个目录。实测 gbmd/iwara
#     都有这个目录，而 gallery 没有——三者清单写法一致，差异只是跑没跑过 --sync。
#   · 对 src==dst 的素材条目，tree 与 out 恰好同路，所以问题长期只显现在产出条目上：
#     `templates/_gbmd-style/public/app.js` 本该产出到 server/public/app.js，
#     tree 模式却写回它自己，产出位置反而没拿到文件。
#   · 落点改回 dst 后，tree 与组装完全等价——这条命令没有存在理由，故连同
#     setup.sh 的 --sync、scripts/sync-to-project.sh 一并废除。
# 判据：**清单 dst 没声明的地方，项目里就不该有文件。**
_setup_copy_manifest() {
  local src dst src_path dst_path n_dir=0 n_file=0 missing=0 line
  local copy_dst
  # DRY_RUN：只报告「会写哪些文件」，一个字都不落盘。
  # 动机：搬模板（组装）是覆盖式写盘，跑之前看不到会动到哪些文件；
  # 清单整份复制过来时会静默带进本项目用不上的条目（参见 gallery 的
  # search-date-range.cjs）——那次是先搬了才发现，只能事后清理。
  # 有了预演就能在写盘前先看一眼清单里的条目是否都是本项目要的。
  local dry="${DRY_RUN:-0}"
  [ "$dry" = "1" ] && echo "  ── 预演（--dry-run：不写盘，只列将写入的文件）──"
  while IFS=$'\t' read -r src dst; do
    [ -n "$src" ] || continue
    src_path="$SRC_BASE/$src"
    # 落点一律按清单 dst（见上方函数头注释：tree 模式已废除）
    copy_dst="$dst"
    dst_path="$PROJECT_ROOT/$copy_dst"
    case "$copy_dst" in
      */)
        # 目录：src 去掉尾部斜杠，目标去掉尾部 "/." 或 "/"
        src="${src%/}"
        dst_path="${dst_path%/}"
        dst_path="${dst_path%/.}"
        src_path="$SRC_BASE/$src"
        if [ -d "$src_path" ]; then
          if [ "$dry" = "1" ]; then
            # 预演：列出该目录会写入的文件数，并按需展开逐个文件
            local cnt
            cnt="$(cd "$src_path" && find . -type f | wc -l | tr -d ' ')"
            echo "  · $src/ → $copy_dst（$cnt 个文件）"
            if [ "${DRY_VERBOSE:-0}" = "1" ]; then
              (cd "$src_path" && find . -type f | sed 's|^\./|      |' | sort)
            fi
          else
            mkdir -p "$dst_path"
            # 逐文件强制覆盖：不能只靠 `cp -rf src/. dst/`——它在部分实现下不覆盖已存在的同名文件，
            # 而清单允许「多个源写入同一目标目录」（blueprint 提供共用底座、风格层提供该风格专属），
            # 靠后写入的源覆盖先写入的同名文件正是设计意图（如 iwara 风格层覆盖 blueprint 的 row-thumb.css）。
            # 用 find + 逐文件 mkdir/cp 保证「后写必覆盖」，与清单顺序语义一致。
            (cd "$src_path" && find . -type d -exec mkdir -p "$dst_path/{}" \; )
            (cd "$src_path" && find . -type f -exec sh -c 'mkdir -p "$2/$(dirname "$1")" && cp -f "$1" "$2/$1"' _ {} "$dst_path" \; )
            echo "  ✓ $src/ → $copy_dst"
          fi
          n_dir=$((n_dir + 1))
        else
          echo "  ⚠️ 目录不存在: $src/（跳过）" >&2
          missing=$((missing + 1))
        fi
        ;;
      *)
        if [ -f "$src_path" ]; then
          if [ "$dry" = "1" ]; then
            # 预演：标出「新增 / 覆盖 / 内容相同」——覆盖是最需要留意的
            local mark="新增"
            if [ -e "$dst_path" ]; then
              if cmp -s "$src_path" "$dst_path"; then mark="相同"; else mark="覆盖"; fi
            fi
            echo "  · $src → $copy_dst  [$mark]"
          else
            mkdir -p "$(dirname "$dst_path")"
            cp -f "$src_path" "$dst_path"
            echo "  ✓ $src → $copy_dst"
          fi
          n_file=$((n_file + 1))
        else
          echo "  ⚠️ 文件不存在: $src（跳过）" >&2
          missing=$((missing + 1))
        fi
        ;;
    esac
  done < <("$NODE_BIN" "$MANIFEST_TOOL" list "$ASSEMBLE_FILE")
  echo "  -- 目录 $n_dir 个 / 文件 $n_file 个 / 缺失 $missing 个"
  # 缺失只警告不阻断（与既有行为一致）；但目录全缺时提醒，避免静默产出空框架。
  if [ "$n_dir" = "0" ] && [ "$n_file" = "0" ] && [ "$missing" -gt 0 ]; then
    echo "  ⚠️ 清单所有素材都未找到——请确认清单键与源基准（基准: $SRC_BASE）" >&2
  fi
}

# ---------- 函数定义区（供 source 复用；直接执行时同样生效）----------

# ---------- 只加载模式 ----------
# 供 scripts/sync-to-project.sh 复用本脚本的组装逻辑（_setup_copy_manifest），
# 避免「模板→项目」与「素材→public」两套复制实现并存。
# 上面的函数与变量已全部定义完毕，此处 return 不跑主流程；
# 直接执行（未设 SETUP_LIB_ONLY）时完全不受影响。
if [ "${SETUP_LIB_ONLY:-0}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi

# 无参数 / --list / -h / --help：一律输出用法（无参数 = 帮助）
if [ $# -eq 0 ] || [ "$1" = "--list" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  usage
  echo ""
  echo "模板自带的风格素材目录（server/templates/）:"
  for s in $STYLES; do echo "  _${s}-style/"; done
  echo ""
  echo "注意：风格目录只是素材的存放处——用哪套由清单声明，本脚本没有风格参数。"
  exit 0
fi

# 解析参数
# 清单文件（--to）是唯一入口参数：项目根由它推出（清单在 <项目根>/assemble.json）。
MANIFEST_FILE=""    # --to <清单文件> 指定的 assemble.json
CHECK_ONLY=0
SYNC_MODE=""        # 空=组装 | template=回流改动到模板（下发/--sync 已废除，组装即下发）
PULL_WRITE=0        # --pull 缺省只预演；--write 才真写回模板（写前备份）
MIGRATE_FROM=""     # --migrate <旧清单>：按新清单整理文件（迁移结构 + 改引用）
UNTRACKED_ONLY=0    # --untracked：扫清单目录，列出不在清单里的文件（按 .gitignore 排除）
DRY_RUN=0           # --dry-run：迁移只预演不改盘
while [ $# -gt 0 ]; do
  case "$1" in
    --to) MANIFEST_FILE="${2:-}"; [ -n "$MANIFEST_FILE" ] || { err "❌ --to 需要清单文件路径"; exit 1; }; shift 2 ;;
    --untracked) UNTRACKED_ONLY=1; shift ;;
    --migrate) MIGRATE_FROM="${2:-}"; [ -n "$MIGRATE_FROM" ] || { err "❌ --migrate 需要旧清单路径"; exit 1; }; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --check) CHECK_ONLY=1; shift ;;
    --pull) SYNC_MODE="template"; shift ;;
    --write) PULL_WRITE=1; shift ;;
    # 未知选项必须报错。原先这里 `-*) shift` 静默吞掉：敲错一个参数（或用了已
    # 移除的 --self-test）不会报错，脚本照跑，还会因 find_assemble 的兜底
    # 组装到 example/ —— 表现为「命令打错了，却真把某个项目组了一遍」。
    -*) err "❌ 未知参数: $1（可用 --help 查看）"; exit 1 ;;
    *) err "❌ 多余的位置参数: $1（--to 直接收清单文件路径，不需要单独给项目根）"; exit 1 ;;
  esac
done

# ┌─ 核心约定：清单所在文件夹 = 项目根 ─────────────────────────┐
# │ 拼装（以及检查/同步/回流）一律以「清单所在目录」为项目根，   │
# │ 清单里的 dst 等相对路径全部相对这个根解析。                 │
# │                                                             │
# │ 也就是说：把 assemble.json 放哪，哪就是项目根 —— 不需要再   │
# │ 用另一个参数重复描述项目在哪（少一处可以说谎的地方），也    │
# │ 杜绝了「--to 传 server/ 导致落到 <项目>/server/server/」    │
# │ 那类幽灵路径（组装全报成功、真实文件一个没更新）。          │
# └─────────────────────────────────────────────────────────────┘
# 变量职责：
#   TARGET       = 清单文件路径（恒为 …/assemble.json）
#   PROJECT_ROOT = 项目根 = dirname(TARGET) = 清单所在目录
# 不传 --to 时无目标，直接输出帮助。
TARGET=""
PROJECT_ROOT=""
TO_SPECIFIED=0
if [ -n "$MANIFEST_FILE" ]; then
  [ -f "$MANIFEST_FILE" ] || { err "❌ 清单文件不存在: $MANIFEST_FILE"; exit 1; }
  [ "$(basename "$MANIFEST_FILE")" = "assemble.json" ] || {
    err "❌ --to 需要指向 assemble.json（收到: $(basename "$MANIFEST_FILE")）"; exit 1; }
  TARGET="$(cd "$(dirname "$MANIFEST_FILE")" && pwd)/assemble.json"
  TO_SPECIFIED=1
fi
if [ -n "$TARGET" ]; then
  PROJECT_ROOT="$(dirname "$TARGET")"
fi

# --check：只做清单一致性检查，不组装。
# 作用：①找出项目里存在、但 json 清单两端都没提到的文件（清单外文件）
#       ②按清单两端（模板源 → 项目目标）逐文件 md5 比对，报不一致
# 用法：./setup.sh --to <项目根>/assemble.json --check
if [ "$CHECK_ONLY" = "1" ]; then
  CHECK_MANIFEST="$TARGET"
  [ -n "$CHECK_MANIFEST" ] || { err "❌ --check 需要 --to <项目清单>"; exit 1; }
  [ -f "$CHECK_MANIFEST" ] || { err "❌ 找不到清单: $CHECK_MANIFEST"; exit 1; }
  # 素材基准：清单键固定写 server/...，按素材实际位置解析（synced/模板两种布局通用）
  CHECK_BASE="$("$NODE_BIN" "$MANIFEST_TOOL" resolve-base "$ROOT" 2>/dev/null || echo "$ROOT")"
  "$NODE_BIN" "$MANIFEST_TOOL" check "$CHECK_MANIFEST" "$PROJECT_ROOT" "$CHECK_BASE"
  exit $?
fi

# 目标 server 目录（TARGET 已在参数区由清单反推为项目根；清单值同样相对项目根）
SERVER_DIR="$PROJECT_ROOT/server"

# ---------- 清单外文件扫描（--untracked <清单>）----------
# 扫清单所在目录的整棵树（含子目录），列出不在清单里的文件；
# 被 .gitignore 忽略的（.git/、node_modules/、构建产物、本地配置等）不计入。
# 与 --check 的分工：check 只比对清单两端是否同步，本命令回答「目录里还有什么没进清单」。
if [ "$UNTRACKED_ONLY" = "1" ]; then
  if [ -z "$MANIFEST_FILE" ]; then
    err "❌ --untracked 需要配合 --to <清单> 指定要扫描的清单"
    exit 1
  fi
  [ -f "$MANIFEST_FILE" ] || { err "❌ 清单不存在: $MANIFEST_FILE"; exit 1; }
  echo "══ 清单外文件扫描 ══"
  "$NODE_BIN" "$MANIFEST_TOOL" untracked "$MANIFEST_FILE" "$(cd "$(dirname "$MANIFEST_FILE")" && pwd)"
  exit $?
fi

# ---------- 结构迁移（--migrate <旧清单> + --to <新清单>）----------
# 场景：项目里已有素材，但结构要重排（如 framework/ 平铺 → 分子目录）。
#   旧清单说明「文件现在在哪」（按其 dst），新清单说明「该搬到哪」（按其 dst）。
#   按落点的**文件名**配对（结构重排通常只改目录层级、不改文件名），
#   然后移动磁盘文件；移动后再改写被搬文件的相对引用。
if [ -n "$MIGRATE_FROM" ]; then
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
fi

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
if [ -n "$SYNC_MODE" ]; then
  SYNC_MANIFEST="$TARGET"
  if [ ! -f "$SYNC_MANIFEST" ]; then
    err "❌ 找不到清单: $SYNC_MANIFEST"
    err "   回流以清单为唯一真相——它声明「这个项目从模板取哪些素材」。"
    exit 1
  fi
  echo "══ 回流改动 $PROJECT_ROOT → 模板 ══"
  echo "  -- 清单: $SYNC_MANIFEST"
  # 缺省只预演（列出差异）；--write 才真写回，且写前备份模板原文件
  "$NODE_BIN" "$MANIFEST_TOOL" pull "$SYNC_MANIFEST" "$PROJECT_ROOT" "$ROOT" \
    $( [ "$PULL_WRITE" = "1" ] && echo --write )
  exit $?
fi

echo "══ 组装 → $PROJECT_ROOT ══"


ASSEMBLE_FILE="$(find_assemble || true)"
if [ -z "$ASSEMBLE_FILE" ]; then
  # 生成位置与 find_assemble 的首选查找位置保持一致：
    # 生成位置 = 项目根下的 assemble.json（与 find_assemble 首查位置一致）。
    # 历史缺陷：曾写成 "$TARGET/.." 多退一层，提示的 cp 目标落到幽灵位置。
  GEN_PATH="$PROJECT_ROOT/assemble.json"

  err "❌ 未找到 assemble.json"
  err "   目标项目根需要它声明：从模板取哪些文件到本项目"
  err "     键 = 模板内相对路径（以 / 结尾 = 整目录拷贝）"
  err "     值 = 本项目内相对路径（相对项目根）"
  err "   最小示例: {\"files\":{\"server/project/blueprint/login.html\":\"server/public/login.html\"}}"

  # 非交互（管道 / CI / 重定向）：不询问，打印提示后退出，避免 read 挂起
  if [ ! -t 0 ]; then
    err ""
    err "   非交互环境，跳过询问。可复制模板默认清单后按需修改："
    err "     cp $BLUEPRINT_DIR/assemble.json $GEN_PATH"
    exit 1
  fi

  if [ -e "$GEN_PATH" ]; then
    err ""
    err "   ⚠️ $GEN_PATH 已存在但无法解析为清单，请手工检查后重跑。"
    exit 1
  fi

  printf '\n是否生成空白清单骨架？[y/N] '
  read -r ans || ans=""
  case "$ans" in
    y|Y|yes|YES)
      if ! "$NODE_BIN" "$MANIFEST_TOOL" generate "$GEN_PATH"; then
        err "   ❌ 生成失败（目录不可写？）: $GEN_PATH"
        exit 1
      fi
      ok "   ✓ 已生成空模板: $GEN_PATH"
      echo "     files 目前为空，请编辑它声明要取哪些文件，然后重跑本命令。"
      exit 0
      ;;
    *)
      err "   已跳过生成。可手工创建，或复制模板默认清单后修改："
      err "     cp $BLUEPRINT_DIR/assemble.json $GEN_PATH"
      exit 1
      ;;
  esac
fi
if [ "$ASSEMBLE_FILE" = "$BLUEPRINT_DIR/assemble.json" ] && [ "$TO_SPECIFIED" = "0" ]; then
  warn "  ⚠️ 模板自测：使用 blueprint/assemble.json 默认（仅公共件）"
  warn "     自定义/混搭：在目标项目根建 assemble.json（键=模板内路径，值=项目内路径，按需取用）"
else
  ok "  ✓ 组装清单: $ASSEMBLE_FILE"
fi

# 立即校验清单可解析：JSON 语法错 / 结构不对时提前失败，避免在初始化蓝图、
# 生成 boot.cjs 之后才报错，从而留下半成品目录。
# 下划线开头的键是注释，值可以是任意类型，跳过校验——由共享模块统一处理。
if find_node "$ROOT/tool/node/bin/node"; then
  if ! "$NODE_BIN" "$MANIFEST_TOOL" validate "$ASSEMBLE_FILE" "$SRC_BASE"; then
    exit 1
  fi
else
  echo "  ⚠️ 未找到 node，跳过清单结构自检（仍会按清单复制）" >&2
fi

# 1. 目标初始化：目录 + 蓝图骨架复制（app.js / config.schema.json 不存在才复制）
#    已有自己 app.js/config 机制的项目，可在 assemble.json 设 "init": false 跳过本段
if [ -n "$NODE_BIN" ]; then
  INIT_FLAG="$("$NODE_BIN" "$MANIFEST_TOOL" init-flag "$ASSEMBLE_FILE" 2>/dev/null || echo 1)"
else
  INIT_FLAG=1
fi
# 本段自己建 $SERVER_DIR：骨架初始化发生在清单复制**之前**，此时 server/ 可能
# 还不存在（全新项目首跑必现）——曾因此 cp 失败却仍打印 ✓，结果是 app.js 根本没生成、
# 项目起不来，而日志一路「成功」（实测：example 首次组装）。谁写文件谁负责建目录。
if [ "$INIT_FLAG" = "1" ]; then
  for f in app.js config.schema.json; do
    if [ ! -f "$SERVER_DIR/$f" ] && [ -f "$BLUEPRINT_DIR/$f" ]; then
      if [ "${DRY_RUN:-0}" = "1" ]; then
        echo "  · blueprint/$f → 目标（初始化）[新增]"
      else
        mkdir -p "$SERVER_DIR"
        if cp "$BLUEPRINT_DIR/$f" "$SERVER_DIR/$f"; then
          echo "  ✓ blueprint/$f → 目标（初始化）"
        else
          err "  ❌ blueprint/$f 初始化失败（目标目录不可写？）: $SERVER_DIR"
          exit 1
        fi
      fi
    fi
  done
else
  echo "  ✓ 跳过蓝图骨架初始化（assemble.json init=false，项目自带 app.js/config）"
fi

# 1b. CJS 启动器（boot.cjs + cjs-bootstrap.cjs）改由清单下发，不在这里生成。
#     理由：脚本硬编码具体文件路径，会与「清单即唯一真相」冲突——
#     框架目录一改结构（如 framework/ 平铺 → 分子目录），这里的路径就静默失效，
#     表现为新项目 boot.cjs 根本不生成、而脚本没有任何提示。
#     现在这两条写在项目清单里：
#       "server/project/blueprint/boot.cjs":               "server/boot.cjs"
#       "server/lib/cjs-bootstrap.cjs":                    "server/lib/cjs-bootstrap.cjs"
#     路径对不上时，--check 会直接报「缺失」，而不是悄悄跳过。

# 2. 按 assemble.json 组装（清单由各项目自己维护）
#     assemble.json 放在目标项目根（--to 指向的 server/ 的上一级，或模板根缺省）。
#     格式：{ "files": { "模板内相对路径": "目标项目内相对路径" } }
#       值 = 相对目标项目根（如 "server/public/login.html"）；以 / 结尾 = 整目录拷贝（含子目录）。
#     示例：
#       { "files": {
#           "server/project/blueprint/login.html": "server/public/login.html",
#           "server/project/blueprint/fragments/": "server/public/fragments/",
#           "server/templates/_gbmd-style/public/logo.png": "server/public/brand.png"
#         } }



if [ -n "$NODE_BIN" ]; then
  _setup_copy_manifest
else
  echo "  ❌ 找不到 node，无法解析清单复制素材。请安装 Node.js。" >&2
  exit 1
fi
if [ $? -ne 0 ]; then exit 1; fi

# 3b. 品牌配置：清单里的 brand 段 → server/public/brand.json
#   @brand:key 注释指令在运行期由 framework/fragment-assembler 取值替换
#   （页面标题、logo、icon 等）。品牌参数属于项目自身，由项目在 assemble.json
#   声明，脚本不内置任何项目名。
#   仅在文件不存在时生成：brand.json 是运行期可变配置，项目改过就不该被组装覆盖。
BRAND_JSON="$SERVER_DIR/public/brand.json"
if [ -f "$BRAND_JSON" ]; then
  ok "  ✓ brand.json 已存在，保留（如需按清单重置请先删除该文件）"
elif [ "${DRY_RUN:-0}" = "1" ]; then
  # 预演：只提示会生成，不实际写文件（brand 导出依赖 node，预演时跳过调用）
  echo "  · brand.json 不存在 → 会按清单 brand 段生成 [新增]"
else
  # brand 导出：rc=0 生成成功；rc=3 表示清单未声明 brand 段（非错误，静默跳过）；
  # 其余 rc 才是真错误。必须直接在 if 上取 $?，否则会被后续命令覆盖。
  if [ -z "$NODE_BIN" ]; then
    :                                # 无 node：跳过（前面清单复制已会报错退出）
  else
    mkdir -p "$(dirname "$BRAND_JSON")"
    "$NODE_BIN" "$MANIFEST_TOOL" brand "$ASSEMBLE_FILE" "$BRAND_JSON"
    rc=$?
    if [ "$rc" = "0" ]; then
      ok "  ✓ 生成 brand.json（来自清单 brand 段）"
    elif [ "$rc" != "3" ]; then
      exit 1
    fi
  fi
fi

# （--with 混搭组件已移除：素材来源由清单声明，不再需要按风格名叠加）

echo ""
ok "✅ 前端组装完成"
echo "   目标: $PROJECT_ROOT"
echo "   public/ : $(find "$SERVER_DIR/public" -type f | wc -l) 个文件"
echo ""
warn "注意："
echo "  1. 前端 public/ 即插即用（静态文件直接 serve）"
echo "  2. 后端 JS 不在模板：通用 JS 在 server/framework/（createServer/createRoute 接口），"
echo "     业务后端 JS 由项目自己实现（可参照 blueprint/app.js 骨架）"
echo "  3. ./start.sh start 启动验证"