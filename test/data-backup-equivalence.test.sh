#!/usr/bin/env bash
# ============================================================
# data-backup 迁移等价性验证
#
# 用途：迁移 data-backup 到框架层工厂版（createBackup）时，证明
#       新旧实现产出的用户数据备份完全等价。
#
# 验证内容：
#   1. manifest 逐字段一致（files / dirs / app / schema）
#   2. 导出 zip 内逐文件 sha256 一致
#   3. 解包后的文件清单一致
#
# 用法：bash test/data-backup-equivalence.test.sh <项目目录>
#   例：bash test/data-backup-equivalence.test.sh ../../iwara-downloader
#
# 说明：全程读写临时目录，不触碰项目真实 json/ 数据。
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJ="${1:-}"
if [ -z "$PROJ" ]; then
  echo "用法: bash test/data-backup-equivalence.test.sh <项目目录>" >&2
  exit 2
fi
PROJ="$(cd "$PROJ" && pwd)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0; fail=0
ok()  { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

echo "══ data-backup 迁移等价性验证 ══"
echo "  项目: $PROJ"
echo

# ---- 构造对比脚本：用指定模块导出 zip 并输出 manifest ----
cat > "$TMP/run.cjs" <<'CJS'
require(process.argv[2] + "/server/framework/cjs-bootstrap.cjs");
const fs = require("fs");
const path = require("path");
const [proj, mode, outDir] = process.argv.slice(2);

let backup;
if (mode === "lib") {
  backup = require(path.join(proj, "server/lib/data-backup.js"));
} else {
  const { createBackup } = require(path.join(proj, "server/framework/data-backup.js"));
  backup = createBackup({
    appName: path.basename(proj) === "iwara-downloader" ? "iwara-downloader-server" : "gamebanana-mods-downloader",
    appRoot: proj,
    toolDir: path.join(proj, "tool", "bin"),
  });
}

(async () => {
  const m = backup.buildManifest();
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(m, null, 2));
  const buf = await backup.exportZip();
  fs.writeFileSync(path.join(outDir, "export.zip"), buf);
  console.log("OK " + buf.length);
})().catch((e) => { console.error("ERR " + e.message); process.exit(1); });
CJS

HAS_LIB=0
[ -f "$PROJ/server/lib/data-backup.js" ] && HAS_LIB=1
[ -f "$PROJ/server/framework/data-backup.js" ] || { echo "  ✗ 项目缺少 framework/data-backup.js，无法对比" >&2; exit 2; }

mkdir -p "$TMP/new"
NEW_OUT="$(node "$TMP/run.cjs" "$PROJ" fw "$TMP/new" 2>&1)"
if ! grep -q "^OK" <<<"$NEW_OUT"; then
  bad "新版导出失败: $NEW_OUT"; echo; echo "  通过 $pass / 失败 $fail"; exit 1
fi
NEW_SIZE="$(grep -o '[0-9]*$' <<<"$NEW_OUT")"
ok "新版导出成功（$NEW_SIZE 字节）"

if [ "$HAS_LIB" = "1" ]; then
  mkdir -p "$TMP/old"
  OLD_OUT="$(node "$TMP/run.cjs" "$PROJ" lib "$TMP/old" 2>&1)"
  if ! grep -q "^OK" <<<"$OLD_OUT"; then
    bad "旧版导出失败: $OLD_OUT"; echo; echo "  通过 $pass / 失败 $fail"; exit 1
  fi
  OLD_SIZE="$(grep -o '[0-9]*$' <<<"$OLD_OUT")"
  ok "旧版导出成功（$OLD_SIZE 字节）"

  # ---- 1. manifest 逐字段比较 ----
  # 分两级判定：
  #   结构性差异（rel / suffix / 条目数 / schema / app 不同）→ 失败
  #   desc 文本差异 → 单独报告。新版跳过了 framework/ 目录，不再被
  #     marker-manifest.js 的文档示例行污染，desc 会取到真实注释，
  #     这类差异是预期的修复效果，不算回归。
  if python3 - "$TMP/old/manifest.json" "$TMP/new/manifest.json" <<'PY'
import json, sys
a=json.load(open(sys.argv[1],encoding="utf-8"))
b=json.load(open(sys.argv[2],encoding="utf-8"))
hard=[]   # 结构性差异
soft=[]   # 仅 desc 文本差异

for key in ("schema","app"):
    if a.get(key)!=b.get(key): hard.append(f"{key}: 旧={a.get(key)!r} 新={b.get(key)!r}")

for key in ("files","dirs"):
    def idx(m):
        out={}
        for x in (m.get(key) or []):
            k = str(x.get("rel")) + "|" + str(x.get("suffix") or "")
            out[k]=x
        return out
    ia, ib = idx(a), idx(b)
    for k in sorted(set(ia) | set(ib)):
        if k not in ia: hard.append(f"{key} 新版多出条目: {k}")
        elif k not in ib: hard.append(f"{key} 新版缺少条目: {k}")
        elif ia[k].get("desc") != ib[k].get("desc"):
            soft.append(f"{key} {k}\n        旧 desc={ia[k].get('desc')!r}\n        新 desc={ib[k].get('desc')!r}")
        # 其余字段（除 desc 外）必须完全一致
        for f in set(ia[k]) | set(ib[k]):
            if f == "desc": continue
            if ia[k].get(f) != ib[k].get(f):
                hard.append(f"{key} {k} 字段 {f}: 旧={ia[k].get(f)!r} 新={ib[k].get(f)!r}")

if hard:
    print("      ❌ 结构性差异:")
    for d in hard: print("        "+d)
    sys.exit(1)
if soft:
    print("      ℹ️ desc 文本差异（新版不再被 framework/ 下的文档示例污染，属预期修复）:")
    for d in soft: print("        "+d)
print(f"      files={len(a.get('files') or [])} dirs={len(a.get('dirs') or [])} 结构完全一致")
PY
  then
    ok "manifest 结构逐字段一致"
  else
    bad "manifest 存在结构性差异（见上）"
  fi

  # ---- 2. 解包后逐文件 sha256 比较 ----
  # userdata-manifest.json 含 generatedAt 时间戳，两次导出必然不同，
  # 故排除它做逐字节比对，其语义由下面的字段级校验覆盖。
  mkdir -p "$TMP/old/x" "$TMP/new/x"
  (cd "$TMP/old/x" && unzip -qqo ../export.zip >/dev/null 2>&1)
  (cd "$TMP/new/x" && unzip -qqo ../export.zip >/dev/null 2>&1)
  (cd "$TMP/old/x" && find . -type f ! -name "userdata-manifest.json" \
      -exec sha256sum {} \; | sed 's|  \./|  |' | sort) > "$TMP/old.sha" 2>/dev/null
  (cd "$TMP/new/x" && find . -type f ! -name "userdata-manifest.json" \
      -exec sha256sum {} \; | sed 's|  \./|  |' | sort) > "$TMP/new.sha" 2>/dev/null

  if [ -s "$TMP/old.sha" ] && diff -q "$TMP/old.sha" "$TMP/new.sha" >/dev/null 2>&1; then
    ok "导出 zip 逐文件 sha256 一致（$(wc -l < "$TMP/old.sha") 个文件，已排除含时间戳的清单）"
  else
    bad "导出 zip 内容不一致:"
    diff "$TMP/old.sha" "$TMP/new.sha" 2>&1 | head -12 | sed 's/^/      /'
  fi

  # ---- 3. 包内清单：忽略 generatedAt 与 desc 文本后比较 ----
  # desc 差异同上属预期修复，这里只校验结构与其它字段一致。
  if [ -f "$TMP/old/x/userdata-manifest.json" ] && [ -f "$TMP/new/x/userdata-manifest.json" ]; then
    if python3 - "$TMP/old/x/userdata-manifest.json" "$TMP/new/x/userdata-manifest.json" <<'PY'
import json, sys

def norm(m):
    m = dict(m)
    m.pop("generatedAt", None)
    # note 是纯说明文字，两版措辞不同（新版统一为 marker-manifest 的写法），
    # 不影响任何逻辑，故一并忽略。
    m.pop("note", None)
    for key in ("files", "dirs"):
        items = []
        for x in (m.get(key) or []):
            y = dict(x)
            y.pop("desc", None)     # desc 文本差异属预期修复
            items.append(y)
        m[key] = sorted(items, key=lambda d: json.dumps(d, sort_keys=True, ensure_ascii=False))
    return m

a = norm(json.load(open(sys.argv[1], encoding="utf-8")))
b = norm(json.load(open(sys.argv[2], encoding="utf-8")))
if a != b:
    print("      包内清单结构不一致")
    for k in sorted(set(a) | set(b)):
        if a.get(k) != b.get(k):
            print(f"      {k}:\n        旧={a.get(k)!r}\n        新={b.get(k)!r}")
    sys.exit(1)
PY
    then
      ok "包内清单结构与字段一致（忽略 generatedAt 与 desc 文本）"
    else
      bad "包内清单结构不一致"
    fi
  else
    bad "包内缺少 userdata-manifest.json"
  fi
else
  ok "无 lib 版可对比（迁移已完成），仅验证新版可正常导出"
fi

echo
echo "  通过 $pass / 失败 $fail"
[ "$fail" -eq 0 ] || exit 1
