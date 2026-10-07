#!/usr/bin/env bash
# ============================================================
# setup 子脚本：--fix-perm（一键修复执行位）
#
# 背景：仓库跨文件系统搬迁（如 NFS/CIFS 挂载、整目录拷贝、zip 解包）时，
#   git 里标记为 100755（可执行）的文件在工作区会丢成 100644——git status
#   于是显示一堆「mode change 100755 => 100644」噪音，且真正需要执行的脚本
#   （setup.sh / start.sh / tool/ffmpeg 等）无法 `./` 运行。
#   本命令按 git 索引里记录的执行位逐个恢复，一次修完。
#
# 用法：
#   bash scripts/setup-fixperm.sh [<仓库路径>]      # 缺省当前仓库（$ROOT）
#   bash setup.sh --fix-perm [<仓库路径>]           # 经总入口调用
#
# 说明：
#   · 只动**执行位**，不改文件内容、不碰 git 索引（修完 git status 应干净）
#   · 若目标落在 noexec 挂载点（NFS 带 noexec 等），执行位恢复后 `./x.sh`
#     仍会被内核拒绝——脚本会检测并提示改用 `bash x.sh`
# ============================================================

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup-lib.sh"

TARGET_REPO=""
for a in "$@"; do
  case "$a" in
    --fix-perm) ;;
    -*) ;;
    *) TARGET_REPO="$a" ;;
  esac
done
TARGET_REPO="${TARGET_REPO:-$ROOT}"

if [ ! -d "$TARGET_REPO/.git" ]; then
  err "❌ 不是 git 仓库: $TARGET_REPO"
  exit 1
fi

echo "══ 修复执行位 → $TARGET_REPO ══"

# git 索引里记录为 100755 的文件（-s 输出：模式 <空格> 对象 <空格> 阶段 <Tab> 路径）
# 注意用 -z 的话路径以 NUL 分隔、中文安全；这里路径无换行风险，用普通输出即可。
fixed=0; missing=0; already=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  mode="$(printf '%s' "$line" | awk '{print $1}')"
  rel="$(printf '%s' "$line" | awk '{print $4}' | tr -d '\r')"
  [ -n "$rel" ] || continue
  fp="$TARGET_REPO/$rel"
  [ -f "$fp" ] || { missing=$((missing + 1)); continue; }
  # 判断是否带执行位：**必须看文件模式**（stat '%A'），不能用 `[ -x ]`——
  # `[ -x ]` 走 access(2)，在 noexec 挂载点上恒为假（即使模式有 x 位），
  # 会导致每次都误判「需修复」而反复 chmod（实测踩坑）。
  if stat -c '%A' "$fp" 2>/dev/null | grep -q 'x'; then
    already=$((already + 1))
  else
    if chmod +x "$fp" 2>/dev/null; then
      echo "  +x $rel"
      fixed=$((fixed + 1))
    else
      err "  ❌ 无法 chmod: $rel"
    fi
  fi
done < <(git -C "$TARGET_REPO" ls-files -s | awk '$1=="100755"')

echo ""
echo "  -- 已恢复 $fixed 个 / 本就正常 $already 个 / 工作区缺失 $missing 个"

# noexec 检测：执行位恢复了，但挂载点不允许执行 —— 提示正确用法
if [ "$fixed" -gt 0 ]; then
  probe="$TARGET_REPO/.setup-exec-probe"
  printf '#!/bin/sh\nexit 0\n' > "$probe" 2>/dev/null && chmod +x "$probe" 2>/dev/null
  if [ -f "$probe" ]; then
    if "$probe" >/dev/null 2>&1; then
      : # 可执行
    else
      warn "  ⚠️ 该路径所在挂载点可能带 noexec（执行位恢复了，但 ./x.sh 仍会被拒）"
      warn "     请改用 bash 调用： bash setup.sh --to <清单> / bash start.sh restart"
    fi
    rm -f "$probe"
  fi
fi

# 汇总 git 视角的结果（mode change 是否清零）
left="$(git -C "$TARGET_REPO" status --porcelain 2>/dev/null | grep -c '^ M\|^M ' || true)"
if [ "$fixed" = "0" ]; then
  ok "  ✓ 无需修复（执行位均已就位）"
else
  ok "  ✓ 已修复 $fixed 个执行位"
fi
exit 0
