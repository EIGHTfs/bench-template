#!/usr/bin/env bash
# ============================================================
# lib-node.sh —— Node 可执行文件定位（唯一实现）
#
# 为什么要有这个文件：
#   `node` 未必在 PATH 里（NAS 的应用容器、Homebrew/Linux 混装环境、
#   只把官方二进制解压到 tool/node/ 的部署方式都会踩到）。裸调 `node`
#   会让依赖它的脚本静默失败——sync/setup 会「报成功但什么都没做」。
#
#   本文件此前在 start.sh / setup.sh 各有一份拷贝，
#   已出现的偏差是「候选路径列表不同」。收敛为一份，新增调用方直接 source。
#
# 用法：
#   . "$(dirname "$0")/scripts/lib-node.sh"    # 或按各自的 ROOT 拼路径
#   if find_node; then "$NODE_BIN" -v; fi
#
# 约定：
#   find_node 成功时把绝对路径写入全局 NODE_BIN 并返回 0；失败返回 1。
#   不打印、不退出——是否致命由调用方决定（同步给提示、组装给报错）。
# ============================================================

# find_node [额外的候选路径...]
#   $1..$n 可传调用方特有的候选（如 $ROOT/tool/node/bin/node），会优先尝试。
find_node() {
  local c nvm
  for c in "$@" \
    /usr/local/bin/node \
    /opt/homebrew/bin/node \
    /opt/node/bin/node \
    /var/packages/Node.js_v24/target/usr/local/bin/node \
    /var/packages/Node.js_v22/target/usr/local/bin/node \
    /var/packages/Node.js_v20/target/usr/local/bin/node \
    /var/packages/DeepSeekHarness-NAS/target/bin/node \
    node; do
    [ -n "$c" ] || continue
    if [ -x "$c" ]; then NODE_BIN="$c"; return 0; fi
    if command -v "$c" >/dev/null 2>&1; then NODE_BIN="$(command -v "$c")"; return 0; fi
  done
  # nvm 安装（非交互 shell 下通常不在 PATH）
  for nvm in "$HOME"/.nvm/versions/node/*/bin/node; do
    if [ -x "$nvm" ]; then NODE_BIN="$nvm"; return 0; fi
  done
  return 1
}

# find_node_or_die [提示语]
#   与 find_node 相同，但失败时打印提示并 exit 1。给「必须有 node」的场景用。
find_node_or_die() {
  if find_node "$@"; then return 0; fi
  echo "${1:-❌ 找不到 node。请安装 Node.js。}" >&2
  exit 1
}
