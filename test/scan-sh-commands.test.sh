#!/usr/bin/env bash
# ============================================================
# scan-sh-commands.js：从 sh 脚本里提「命令清单」
#
# 覆盖：
#   · 用法命令（usage）：注释里写的调用形态 → 命令作 key、注释作 value
#   · 外部命令（tools）：脚本实际调用的外部程序
#   · 误报防护：散文里提到 .sh 文件名，不该被当成命令
#
# 用法：bash test/scan-sh-commands.test.sh
# ============================================================
source "$(dirname "${BASH_SOURCE[0]}")/lib-test.sh"

echo "══ sh 命令清单扫描 ══"

# node 未必在 PATH（本仓 scripts/lib-node.sh 就是为此存在）
source "$TEST_ROOT/scripts/lib-node.sh"
if ! find_node "$TEST_ROOT/tool/node/bin/node"; then
  bad "找不到 node，无法测试（见 scripts/lib-node.sh）"
  finish
fi
SCAN="$TEST_ROOT/scripts/scan-sh-commands.js"

# 造一个临时小仓库，避免依赖真实脚本的具体措辞（改注释不该弄挂测试）
mk_fixture() {
  local d="$TMP/fx"
  mkdir -p "$d/scripts"
  cat > "$d/a.sh" <<'EOF'
#!/usr/bin/env bash
#   ./a.sh --to <项目清单>    组装：按清单产出
#   ./a.sh --check            检查一致性
#   a.sh --list               列出全部（裸脚本名，不带 ./）
#   a.sh 参数契约说明（这不是命令，是散文）
echo hi
curl -sf http://x >/dev/null   # 探活
node -e '1'                    # 跑点 js
EOF
}

mk_fixture
OUT="$("$NODE_BIN" "$SCAN" "$TMP/fx" --json 2>&1)"; RC=$?

if [ $RC -eq 0 ]; then ok "扫描正常退出"; else bad "扫描失败（rc=$RC）"; fi

# --- 用法命令：key 是命令、value 是同行注释 ---
# 归一化：./ 前缀忽略 —— ./a.sh --x 与 a.sh --x 视为同一条命令，key 都是 a.sh --x
has "$OUT" '"a\.sh --to <项目清单>"' "usage：./ 开头的命令被提取（归一化去 ./）"
has "$OUT" '组装：按清单产出' "usage：值取同行注释"
has "$OUT" '"a\.sh --check"' "usage：同脚本多条命令都提（归一化去 ./）"
has "$OUT" '检查一致性' "usage：第二条的注释也取到"

# --- 裸脚本名 + 参数也算命令 ---
has "$OUT" '"a\.sh --list"' "usage：裸脚本名（不带 ./）+ 参数也被提取"

# --- 误报防护：散文提到脚本名不该被当命令 ---
hasnt "$OUT" '参数契约' "误报防护：散文里的脚本名未被当成命令"

# --- 外部命令 ---
has "$OUT" '"curl"' "tools：检出 curl"
has "$OUT" '"node"' "tools：检出 node"
has "$OUT" '探活' "tools：取到 curl 的行尾注释"

# --- 注释为空 = 空字符串，不是漏键 ---
python3 - "$OUT" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
checks = [
    ("tools 里 node 存在", "node" in d.get("tools", {})),
    ("tools 值均为字符串", all(isinstance(v, str) for v in d.get("tools", {}).values())),
    ("usage 值均为字符串", all(isinstance(v, str) for v in d.get("usage", {}).values())),
    ("顶层含 _comment 说明", "_comment" in d),
    ("files 列出被扫脚本", any(f.endswith("a.sh") for f in d.get("files", []))),
]
for name, good in checks:
    print(("  ✓ " if good else "  ✗ ") + name)
sys.exit(0 if all(g for _, g in checks) else 1)
PYEOF
if [ $? -eq 0 ]; then pass=$((pass+1)); else fail=$((fail+1)); fi

# --- 真实仓库：setup.sh 的关键命令必须被提到（key 已归一化去 ./） ---
OUT="$("$NODE_BIN" "$SCAN" "$TEST_ROOT" --json 2>&1)"
for want in "setup.sh --to <项目清单>" "setup.sh --to <项目清单> --check" "setup.sh --to <项目清单> --dry-run"; do
  has "$OUT" "$want" "真实仓库：提到 $want"
done

finish
