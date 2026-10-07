#!/usr/bin/env bash
# ============================================================
# setup.sh 系列共享库
#
# 职责：环境初始化 + 公共函数。被 scripts/setup-*.sh 子脚本 source。
# 本文件不执行任何命令（除变量初始化），可被反复 source。
#
# 提供：
#   · ROOT / TEMPLATES_DIR / SERVER_DIR 等路径常量
#   · MANIFEST_TOOL / NODE_BIN 定位（assemble-manifest.js / lib-node.sh）
#   · SRC_BASE 源基准解析（resolve-base）
#   · 颜色 + ok/warn/err 输出
#   · _detect_styles / STYLES（素材目录自动发现）
#   · usage / find_assemble / _setup_copy_manifest
# ============================================================

# ROOT = 仓库根（本文件在 scripts/ 下，上一级即仓库根；兼容 setup.sh 被复制进项目时
# 的 scripts/ 结构——ROOT 始终 = 含 scripts/ 的目录）
SETUP_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${SETUP_LIB_DIR%/scripts}"
[ -n "$ROOT" ] || ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 素材路径（模板仓库：<root>/templates + <root>/lib）
TEMPLATES_DIR="$ROOT/templates"

# 清单解析唯一实现（scripts/assemble-manifest.js）——
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

# Node 定位统一走 lib-node.sh（唯一实现，start.sh/测试共用同一份）。
if [ -f "$ROOT/lib-node.sh" ]; then
  . "$ROOT/lib-node.sh"
elif [ -f "$ROOT/scripts/lib-node.sh" ]; then
  . "$ROOT/scripts/lib-node.sh"
else
  :
fi
NODE_BIN=""

# 清单「键」的源基准（键统一写成 server/... 形式）：
#   判定统一交给 scripts/assemble-manifest.js（resolve-base）。
# 没有 node 时回落到根目录（保持可用，不让组装整体失败）。
if find_node "$ROOT/tool/node/bin/node"; then
  SRC_BASE="$("$NODE_BIN" "$MANIFEST_TOOL" resolve-base "$ROOT")"
else
  SRC_BASE="$ROOT"
fi

# ---------- 颜色 ----------
C_GREEN="" C_YELLOW="" C_RED="" C_DIM="" C_RESET=""
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != "dumb" ]; then
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
fi
ok()   { printf '%s%s%s\n' "$C_GREEN" "$*" "$C_RESET"; }
warn() { printf '%s%s%s\n' "$C_YELLOW" "$*" "$C_RESET"; }
err()  { printf '%s%s%s\n' "$C_RED" "$*" "$C_RESET"; }

# 可用风格 —— 遍历 templates/ 下的 `_<名>/` 目录自动发现（系级），
# 系级目录下的 `_<名>/` 是项目独有层（如 _downloader/_iwara）。不硬编码列表。
# 【设计意图】风格列表由目录结构决定：新增/删除风格只动 templates/，脚本无需跟着改。
# 【思路】新增系级只需新建 _<名>/ 目录（内含 styles/html/js 等类型子目录）；
#   排序固定（sort）保证 --list 与错误提示的输出稳定可复现。
#   目录名不符合 _* 规律的一律跳过（如 styles/html/js/json/assets 等类型目录、备份目录）。
_detect_styles() {
  local dir name sub out=""
  for dir in "$TEMPLATES_DIR"/*/; do
    [ -d "$dir" ] || continue
    name="$(basename "$dir")"
    case "$name" in
      _*) out="$out ${name#_}" ;;
    esac
  done
  # 去重 + 排序后输出（词间以空格分隔，供 --list 与提示复用）
  echo "$out" | tr ' ' '\n' | sed '/^$/d' | sort -u | tr '\n' ' ' | sed 's/ $//'
}
STYLES="$(_detect_styles)"

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
  echo "  ./setup.sh --fix-perm [<仓库路径>]            # 修复执行位：按版本库记录恢复丢失的可执行位"
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
# 清单定位：TARGET 已是清单文件路径（参数区已解析 --to）。
find_assemble() {
  # 只认 --to 给的清单；没给 --to 就报错（见调用处）
  if [ -n "$TARGET" ] && [ -f "$TARGET" ]; then echo "$TARGET"; return 0; fi
  return 1
}

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
#
# 解析参数（总入口与各子脚本共用，拆自原 setup.sh 参数区，逻辑零改动）。
# 副作用：设置 MANIFEST_FILE / CHECK_ONLY / SYNC_MODE / PULL_WRITE /
#         MIGRATE_FROM / UNTRACKED_ONLY / DRY_RUN / TARGET /
#         PROJECT_ROOT / TO_SPECIFIED / SERVER_DIR。
setup_parse_args() {
  MANIFEST_FILE=""    # --to <清单文件> 指定的 assemble.json
  CHECK_ONLY=0
  SYNC_MODE=""        # 空=组装 | template=回流改动到模板（--pull）
  PULL_WRITE=0        # --pull 缺省只预演；--write 才真写回模板（写前备份）
  MIGRATE_FROM=""     # --migrate <旧清单>：按新清单整理文件（迁移结构 + 改引用）
  UNTRACKED_ONLY=0    # --untracked：扫清单目录，列出不在清单里的文件（按 .gitignore 排除）
  DRY_RUN=0           # --dry-run：迁移只预演不改盘
  TARGET=""
  PROJECT_ROOT=""
  TO_SPECIFIED=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --to) MANIFEST_FILE="${2:-}"; [ -n "$MANIFEST_FILE" ] || { err "❌ --to 需要清单文件路径"; exit 1; }; shift 2 ;;
      --untracked) UNTRACKED_ONLY=1; shift ;;
      --migrate) MIGRATE_FROM="${2:-}"; [ -n "$MIGRATE_FROM" ] || { err "❌ --migrate 需要旧清单路径"; exit 1; }; shift 2 ;;
      --dry-run) DRY_RUN=1; shift ;;
      --check) CHECK_ONLY=1; shift ;;
      --pull) SYNC_MODE="template"; shift ;;
      --write) PULL_WRITE=1; shift ;;
      # 未知选项必须报错（不静默吞掉）
      -*) err "❌ 未知参数: $1（可用 --help 查看）"; exit 1 ;;
      *) err "❌ 多余的位置参数: $1（--to 直接收清单文件路径，不需要单独给项目根）"; exit 1 ;;
    esac
  done
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
  # 目标 server 目录（TARGET 已在参数区由清单反推为项目根；清单值同样相对项目根）
  SERVER_DIR="$PROJECT_ROOT/server"
}

# 展开清单并复制：解析交给共享模块（list 输出 TSV: 源<TAB>目标），
# 本处只负责「按行复制 + 计数 + 报缺失」，不再自行解析 JSON。
# 目标以 / 结尾 = 目录整体拷贝（含点文件），否则单文件拷贝。
#
# 落点一律按清单 **dst**——清单是唯一真相，dst 声明了什么就落到哪里。
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
    # 落点一律按清单 dst
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