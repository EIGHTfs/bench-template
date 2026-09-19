#!/usr/bin/env bash
# ============================================================
# 跑全部测试：逐个执行 test/*.test.sh，汇总结果
#
# 每个测试文件是独立进程（各自临时目录、各自退出码），
# 互不影响——某个功能改坏了不会让别的测试一起挂。
#
# 用法：
#   bash test/run-all.sh              # 全部
#   bash test/run-all.sh manifest     # 只跑文件名含 manifest 的
# ============================================================
set -uo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILTER="${1:-}"

total_pass=0; total_fail=0; failed_files=()

for f in "$TEST_DIR"/*.test.sh; do
  [ -f "$f" ] || continue
  name="$(basename "$f")"
  [ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]] && continue

  echo "───────────────────────────────────────────"
  echo "▶ $name"
  out="$(bash "$f" 2>&1)"; rc=$?
  echo "$out"

  # 摘出该文件的「通过 N / 失败 M」
  line="$(grep -E "通过 [0-9]+ / 失败 [0-9]+" <<<"$out" | tail -1)"
  if [ -n "$line" ]; then
    p="$(sed -E 's/.*通过 ([0-9]+) \/ 失败 ([0-9]+).*/\1/' <<<"$line")"
    m="$(sed -E 's/.*通过 ([0-9]+) \/ 失败 ([0-9]+).*/\2/' <<<"$line")"
    total_pass=$((total_pass + p)); total_fail=$((total_fail + m))
  else
    # 文件自身崩了（连汇总都没打印）
    total_fail=$((total_fail + 1))
  fi
  [ $rc -ne 0 ] && failed_files+=("$name")
done

echo "───────────────────────────────────────────"
echo "总计：通过 $total_pass / 失败 $total_fail"
if [ ${#failed_files[@]} -gt 0 ]; then
  echo "失败文件："
  for n in "${failed_files[@]}"; do echo "  ✗ $n"; done
  exit 1
fi
echo "✅ 全部通过"
