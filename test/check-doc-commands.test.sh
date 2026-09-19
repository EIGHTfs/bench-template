#!/usr/bin/env bash
# ============================================================
# 文档命令一致性检查：用 scan-sh-commands.js 的命令 JSON，
# 检查 README.md 与 docs/命令参数总览.md 里写的命令调用——
# 「脚本名 + 选项」必须能在脚本注释承诺的用法命令（usage）里找到。
#
# 背景：
#   脚本改参数（废除/新加）时常忘了同步文档，文档里就留下脚本早已
#   不支持的命令（如 setup.sh 的 gbmd 风格参数、--sync、--self-test）。
#   本测试把文档命令行逐条与 JSON usage 比对，命名不一致即失败。
#
# 覆盖：
#   · fixture：文档命令全部在脚本里 → 通过
#   · fixture：文档写了脚本不支持的选项 → 报出且失败
#   · 真实仓库：README / 命令参数总览 与 setup.sh / start.sh 实际用法一致
#
# 规则：
#   · 文档命令行提取：./ 开头 或 bash|sh|zsh 开头的行
#   · 命令拆成「脚本名 + 选项 token 集」：选项 = -x/--xx 或小写裸词；
#     参数值（<清单>、路径、引号串）不算 token，占位符写法不影响判断
#   · ./ 前缀归一化（与 scan-sh-commands.js 同规则）：./a.sh 与 a.sh 同命令
#   · 只查 .sh 脚本——scan 只扫 sh，js 类命令（assemble-manifest.js 等）不在范围
#
# 用法：bash test/check-doc-commands.test.sh
# ============================================================
source "$(dirname "${BASH_SOURCE[0]}")/lib-test.sh"

echo "══ 文档命令一致性检查 ══"

# node 未必在 PATH（本仓 scripts/lib-node.sh 就是为此存在）
source "$TEST_ROOT/scripts/lib-node.sh"
if ! find_node "$TEST_ROOT/tool/node/bin/node"; then
  bad "找不到 node，无法测试（见 scripts/lib-node.sh）"
  finish
fi
SCAN="$TEST_ROOT/scripts/scan-sh-commands.js"

# ── 一致性检查器（内联 node）──────────────────────────────
# 用法：check_docs <scanJSON> <md文档…> → stdout 输出 JSON {"errors":[...]}
# 每个 error 带 文件:行号:命令 详情，便于直接去文档里改。
check_docs() {
  "$NODE_BIN" - "$1" "${@:2}" <<'NODEEOF'
const fs = require("fs");
const [jsonPath, ...docPaths] = process.argv.slice(2);
const usage = JSON.parse(fs.readFileSync(jsonPath, "utf8")).usage || {};

// ./ 前缀归一化（与 scan-sh-commands.js 相同的规则）
const norm = (s) => s.replace(/^\.\//, "").trim();

// 命令 → { script, tokens }：选项 = -x/--xx 或小写裸词（子命令，如 run-all）
function parseCmd(cmd) {
  let parts = norm(cmd).split(/\s+/);
  if (/^(bash|sh|zsh)$/.test(parts[0])) parts = parts.slice(1);
  const script = parts[0] || "";
  const tokens = parts.slice(1).filter(
    (t) => /^-{1,2}[\w-]+/.test(t) || /^[a-z][a-z0-9-]*$/.test(t)
  );
  return { script, tokens };
}

// JSON usage：按脚本名聚合选项 token 并集
const scriptTokens = {};
for (const cmd of Object.keys(usage)) {
  const { script, tokens } = parseCmd(cmd);
  if (!script) continue;
  if (!scriptTokens[script]) scriptTokens[script] = new Set();
  for (const t of tokens) scriptTokens[script].add(t);
}

const errors = [];
for (const p of docPaths) {
  const lines = fs.readFileSync(p, "utf8").split("\n");
  lines.forEach((line, i) => {
    const t = line.trim();
    // 只提取「调用形态」的行：./ 开头，或 bash|sh|zsh 开头
    if (!t.startsWith("./") && !/^(bash|sh|zsh)\s+\S/.test(t)) return;
    const { script, tokens } = parseCmd(t);
    if (!/\.sh$/.test(script)) return; // 只查 sh（scan 只覆盖 sh 脚本）
    if (!scriptTokens[script]) {
      errors.push(
        `${p}:${i + 1}: 命令「${t}」的脚本 ${script} 在脚本用法注释（JSON usage）中不存在`
      );
      return;
    }
    for (const tok of tokens) {
      if (!scriptTokens[script].has(tok)) {
        errors.push(
          `${p}:${i + 1}: 命令「${t}」的选项 ${tok} 在 ${script} 的用法注释中不存在`
        );
      }
    }
  });
}
console.log(JSON.stringify({ errors: [...new Set(errors)] }));
NODEEOF
}

# 取 errors 数组长度：$1=check_docs 输出
err_count() {
  python3 -c 'import json,sys; print(len(json.loads(sys.argv[1])["errors"]))' "$1"
}

# 打印全部 errors 详情：$1=check_docs 输出，$2=前缀说明
show_errors() {
  python3 - "$1" "$2" <<'PYEOF'
import json, sys
d = json.loads(sys.argv[1])["errors"]
for e in d:
    print(f"  ✗ {sys.argv[2]}: {e}")
PYEOF
}

# ── fixture：造迷你仓库验证检查逻辑 ────────────────────────
mk_fixture() {
  local d="$TMP/fx"
  mkdir -p "$d"
  cat > "$d/a.sh" <<'EOF'
#!/usr/bin/env bash
#   ./a.sh --to <清单>    组装
#   ./a.sh --check        检查
EOF
  cat > "$d/README.md" <<'EOF'
# 用法
./a.sh --to <清单>     # 组装
./a.sh --check         # 检查
EOF
  cat > "$d/DOCS.md" <<'EOF'
# 参数
./a.sh --purge         # 清理（脚本没有这个选项，故意写错）
EOF
}

mk_fixture
JSON_FX="$TMP/fx/scan.json"
"$NODE_BIN" "$SCAN" "$TMP/fx" --json > "$JSON_FX"

# fixture：文档命令全部在脚本里 → 0 error
R1="$(check_docs "$JSON_FX" "$TMP/fx/README.md")"
eq "$(err_count "$R1")" "0" "fixture：文档命令全在脚本里 → 无 error"

# fixture：文档写了脚本不支持的选项 → 报出该选项
R2="$(check_docs "$JSON_FX" "$TMP/fx/DOCS.md")"
N2="$(err_count "$R2")"
[ "$N2" -ge 1 ] && ok "fixture：文档写了脚本没有的选项 → 报出（$N2 条）" || bad "fixture：应报出 --purge 却通过"
if ! grep -q -- "--purge" <<<"$R2"; then bad "fixture：error 详情应包含 --purge"; else ok "fixture：error 详情含 --purge"; fi

# ── 真实仓库：README + 命令参数总览 与脚本实际用法一致 ──────
JSON_REAL="$TMP/real.json"
"$NODE_BIN" "$SCAN" "$TEST_ROOT" --json > "$JSON_REAL"
R3="$(check_docs "$JSON_REAL" "$TEST_ROOT/README.md" "$TEST_ROOT/docs/命令参数总览.md")"
N3="$(err_count "$R3")"
if [ "$N3" -eq 0 ]; then
  ok "真实仓库：README / 命令参数总览 的命令均能在脚本用法注释中找到"
else
  bad "真实仓库：发现 $N3 处文档命令与脚本不一致（修文档后重跑，见下方明细）"
  show_errors "$R3" "不一致"
fi

finish