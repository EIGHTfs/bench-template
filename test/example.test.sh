#!/usr/bin/env bash
# ============================================================
# 以 example 为测试对象的完整链路测试
#
# example/ 是模板自带的完整演示项目（整体入库）：组装清单、组装产物、
# 自研代码（server/routes/items.js）、假数据（json/items.json）、
# 自检脚本（example/self-test.sh）都在 example 文件夹里。
#
# 本测试只是把 self-test.sh 接进 test/ 统一出口：在模板副本上跑完整链路
# （组装 → 自研保留 → 混搭 → 启动 → API 探测），不重复实现细节。
#
# 用法：bash test/example.test.sh
# ============================================================
source "$(dirname "${BASH_SOURCE[0]}")/lib-test.sh"

echo "══ example 完整链路（以 example 为测试对象） ══"

OUT="$(bash "$TEST_ROOT/example/self-test.sh" "$TEST_ROOT" 2>&1)"; RC=$?
echo "$OUT"
if [ $RC -eq 0 ]; then
  ok "example 自检通过：组装/自研保留/混搭/启动/API 全绿"
else
  bad "example 自检有失败项（见上方 ✗）"
fi

finish