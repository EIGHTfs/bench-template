#!/usr/bin/env bash
# ============================================================
# 通用状态文件存储层（templates/js/store/state-store.js）
#
# 覆盖：原子写（内容正确、无临时文件残留）/ 合并写（窗口内多次 save 只落一次盘）/
#       flush 立即落盘 / 无脏数据不写 / cancel 取消排空 / buildSnapshot 的 pruned 计数
#
# 为什么要有这个测试：这两个工具是「状态文件不再每次全量同步写」的公共底座，
# 一旦回归（比如忘了 unref、忘了 cancel、rename 前没清临时文件），下游项目会以
# 「状态文件损坏 / 进程退不出 / 任务复活」这类难查的形式暴露。
#
# 用法：bash test/state-store.test.sh
# ============================================================
source "$(dirname "${BASH_SOURCE[0]}")/lib-test.sh"

STORE="$TEST_ROOT/templates/js/store/state-store.js"
echo "══ 通用存储层 state-store ══"

if [ ! -f "$STORE" ]; then
  bad "缺少 $STORE"
  finish
fi

WORK="$TMP/state-store"; mkdir -p "$WORK"

cat > "$WORK/run.cjs" <<'JS'
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const store = require(process.argv[2]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "state-store-"));
  const fail = (m) => { throw new Error(m); };

  // ① 原子写：内容正确 + 不残留临时文件 + 覆盖写
  const f1 = path.join(dir, "a.json");
  store.writeFileAtomic(f1, '{"x":1}');
  if (fs.readFileSync(f1, "utf8") !== '{"x":1}') fail("原子写内容不对");
  store.writeFileAtomic(f1, '{"x":2,"y":3}');
  if (fs.readFileSync(f1, "utf8") !== '{"x":2,"y":3}') fail("覆盖写内容不对");
  const leftovers = fs.readdirSync(dir).filter((f) => f.includes(".tmp-"));
  if (leftovers.length) fail("残留临时文件：" + leftovers.join(","));

  // ② 合并写：窗口内 10 次 save → 1 次写盘
  const f2 = path.join(dir, "b.json");
  let state = { n: 1 };
  const w = store.createThrottledWriter({ filePath: f2, getState: () => state, throttleMs: 50 });
  for (let i = 0; i < 10; i++) w.save();
  if (fs.existsSync(f2)) fail("节流窗口内不应立刻写盘");
  await sleep(150);
  if (w.stats.writes !== 1) fail("10 次 save 应合并成 1 次写，实际 " + w.stats.writes);
  if (w.stats.saves !== 10) fail("saves 计数不对：" + w.stats.saves);
  if (w.stats.coalesced !== 9) fail("coalesced 计数不对：" + w.stats.coalesced);

  // ③ flush：无脏数据不写；有脏数据立即写
  if (w.flush() !== false) fail("无脏数据 flush 应返回 false");
  state = { n: 2 };
  w.save();
  if (w.flush() !== true) fail("有脏数据 flush 应返回 true");
  if (JSON.parse(fs.readFileSync(f2, "utf8")).n !== 2) fail("flush 落盘内容不对");

  // ④ cancel：取消未落盘排程（删文件场景，避免文件"复活"）
  state = { n: 3 };
  w.save();
  w.cancel();
  await sleep(80);
  if (JSON.parse(fs.readFileSync(f2, "utf8")).n !== 2) fail("cancel 后不应再写盘");
  if (w._hasPending() !== false) fail("cancel 后不应还有待写数据");

  // ⑤ buildSnapshot：可自定义快照并回传 pruned 计数
  const f3 = path.join(dir, "c.json");
  const w2 = store.createThrottledWriter({
    filePath: f3,
    getState: () => ({ a: 1 }),
    throttleMs: 10,
    buildSnapshot: (s) => ({ snapshot: Object.assign({}, s, { cleaned: true }), pruned: 3 })
  });
  w2.save();
  await sleep(60);
  if (w2.stats.prunedKeys !== 3) fail("pruned 计数不对：" + w2.stats.prunedKeys);
  if (JSON.parse(fs.readFileSync(f3, "utf8")).cleaned !== true) fail("自定义快照未生效");

  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error(String((e && e.message) || e)); process.exit(1); });
JS

if node "$WORK/run.cjs" "$STORE" > "$WORK/out.txt" 2>&1; then
  ok "原子写 / 合并写 / flush / cancel / pruned 计数 全部通过"
else
  bad "断言失败：$(head -3 "$WORK/out.txt" | tr '\n' ' ')"
fi

# ⑥ 语法自检（模板下发件必须能被项目 node 直接加载）
if node --check "$STORE" 2>/dev/null; then ok "语法检查通过"; else bad "语法检查失败"; fi

finish
