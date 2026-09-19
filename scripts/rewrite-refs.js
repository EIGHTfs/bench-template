#!/usr/bin/env node
// ============================================================
// 相对引用自动改写：按清单的「源 → 目标」映射推导
//
// 要解决的问题：
//   模板素材在模板里的相对位置，搬到项目后往往变了（如
//   server/framework/cjs-bootstrap.cjs → server/lib/cjs-bootstrap.cjs）。
//   素材内部若用相对 require("./x")，搬完就可能指不到人。
//   同理前端 html 里的 <script src="./x.js"> 也有同样问题。
//
// 思路（不用手抄路径）：
//   清单每条 源 → 目标 本身就是一份路径映射表。对素材里的每个相对引用：
//     ① 按「源侧」把引用解析成一个【源路径】（模板内的绝对逻辑位置）
//     ② 查映射表把该源路径翻成【目标路径】
//     ③ 按「目标侧」重新算出相对引用（从引用所在文件的目标位置出发）
//   于是引用自动跟着落点走，改目录结构也不用逐个手改。
//
// 用法：
//   node scripts/rewrite-refs.js <清单> [--dst-root <项目根>] [--dry-run]
//
//   默认只报告（dry-run 语义）：列出「源侧引用 → 目标侧引用」的差异与
//   无法解析的引用，不改文件。加 --apply 才把改写写回【模板源文件】。
//
// 注意：本工具改的是**模板里的素材文件**，让它搬到哪里都能正确引用；
//       不是改项目里的产出（产出每次组装重新生成）。
// ============================================================
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const manifestArg = args.find((a) => !a.startsWith("--"));
const DRY = !args.includes("--apply");

if (!manifestArg) {
  console.error("用法: node scripts/rewrite-refs.js <清单> [--apply]");
  process.exit(1);
}

const { loadManifest } = require("./assemble-manifest.js");

// ---------------------------------------------------------------- 映射表

/**
 * 由清单构建「源路径 → 目标路径」映射（都相对各自根，正斜杠）。
 * 目录型条目按其内部文件逐条展开——目录搬运时内部结构保持不变，
 * 故可等价为「目录前缀替换」。
 */
function buildMap(files) {
  const exact = new Map();   // 源文件 → 目标文件
  const dirMap = [];         // { srcDir, dstDir } 目录前缀替换（长前缀优先）

  for (const [src, dst] of files) {
    if (src.endsWith("/") || dst.endsWith("/")) {
      dirMap.push({ srcDir: src.replace(/\/+$/, ""), dstDir: dst.replace(/\/+$/, "") });
    } else {
      exact.set(src, dst);
    }
  }
  // 长前缀优先，避免短前缀先命中
  dirMap.sort((a, b) => b.srcDir.length - a.srcDir.length);
  return { exact, dirMap };
}

/**
 * 按**文件名**在映射里找目标（回退手段）。
 *
 * 为什么需要：文件被物理移动后（如 framework/auth.js → framework/auth/auth.js），
 * 引用还写着移动前的同目录路径（./auth），按「源侧拼路径」根本拼不出正确位置。
 * 此时唯一可靠的线索是文件名——它不会变。多个同名文件时返回 null（有歧义不猜）。
 */
function mapByBasename(map, basename) {
  const hits = [];
  for (const [src, dst] of map.exact) {
    if (path.posix.basename(src) === basename) hits.push(dst);
  }
  return hits.length === 1 ? hits[0] : null;
}

/** 把「源相对路径」翻成「目标相对路径」；查不到返回 null */
function mapPath(map, srcRel) {
  if (map.exact.has(srcRel)) return map.exact.get(srcRel);
  // JS 的 require 常省略 .js/.cjs 后缀（require("./http-utils")），
  // 而清单键是完整文件名——补后缀再查，否则全部匹配不上（实测踩坑）。
  for (const ext of [".js", ".cjs", ".mjs"]) {
    if (map.exact.has(srcRel + ext)) return map.exact.get(srcRel + ext);
  }
  // 目录内的 index.js（require("./route") 指向 route/index.js）
  for (const ext of [".js", ".cjs"]) {
    const idx = srcRel + "/index" + ext;
    if (map.exact.has(idx)) return map.exact.get(idx);
  }
  for (const { srcDir, dstDir } of map.dirMap) {
    if (srcRel === srcDir) return dstDir;
    if (srcRel.startsWith(srcDir + "/")) {
      return dstDir + srcRel.slice(srcDir.length);
    }
  }
  return null;
}

// ---------------------------------------------------------------- 引用改写

/**
 * 计算 from → to 的相对路径（都相对项目根，POSIX 风格，带 ./ 前缀）。
 * 关键：**尽量保持原有写法风格**——Node 能解析无后缀的 require("./x")，
 * 而多数素材就是这么写的。若新位置与旧位置指向同一文件，就原样保留引用，
 * 不把 "./x" 改写成 "./x.js"（无意义的 diff 噪音，实测踩过）。
 */
function relRef(fromRel, toRel, originalRef) {
  let r = path.posix.relative(path.posix.dirname(fromRel), toRel);
  if (!r.startsWith(".")) r = "./" + r;
  // 原引用没带后缀、而算出来的是加了个后缀的同名路径 → 保留原样
  if (originalRef && !path.posix.extname(originalRef) && path.posix.extname(r)) {
    const withoutExt = r.slice(0, -path.posix.extname(r).length);
    if (withoutExt === originalRef) return originalRef;
  }
  return r;
}

/**
 * 改写 JS 里的相对 require。
 * 只动 require("...") 且在注释之外、以 . 开头的路径；外部包与绝对路径跳过。
 */
function rewriteJs(text, srcRel, map) {
  const changes = [];
  const unresolved = [];
  const out = text.replace(
    /(require\(\s*["'])(\.\.?\/[^"']+)(["']\s*\))/g,
    (full, pre, ref, post, offset) => {
      // 跳过注释行里的示例（简单判定：本行 // 出现在 require 之前）
      const lineStart = text.lastIndexOf("\n", offset) + 1;
      const head = text.slice(lineStart, offset);
      if (head.includes("//") || head.includes("*")) return full;

      const refFile = ref.replace(/^\.\//, "");
      const srcTarget = path.posix.normalize(path.posix.join(path.posix.dirname(srcRel), refFile));
      // 先按源侧拼路径查；查不到再按「文件名」回退（文件已物理移动的情形）
      let dstTarget = mapPath(map, srcTarget);
      if (!dstTarget) {
        const base = path.posix.basename(refFile);
        const cand = base.endsWith(".js") || base.endsWith(".cjs") ? base : base + ".js";
        dstTarget = mapByBasename(map, cand) || mapByBasename(map, base);
      }
      if (!dstTarget) { unresolved.push({ ref, srcTarget }); return full; }

      const dstSelf = mapPath(map, srcRel);
      if (!dstSelf) { unresolved.push({ ref, srcTarget, why: "自身无映射" }); return full; }

      const newRef = relRef(dstSelf, dstTarget, ref);
      if (newRef !== ref) changes.push({ from: ref, to: newRef });
      return pre + newRef + post;
    }
  );
  return { text: out, changes, unresolved };
}

/** 改写 HTML 里的 <script src="..."> 与 <link href="...">（相对引用） */
function rewriteHtml(text, srcRel, map) {
  const changes = [];
  const unresolved = [];
  const handle = (attr) => (full, pre, ref, post) => {
    if (!ref.startsWith(".")) return full;
    // 剥掉缓存查询串（./app.js?v=48）：它是缓存对抗手段，不是路径的一部分。
    // 比对与改写都只看路径，最后把查询串原样接回去（实测踩坑：不剥会报「无法解析」）。
    const qIdx = ref.search(/[?#]/);
    const query = qIdx >= 0 ? ref.slice(qIdx) : "";
    const refPath = qIdx >= 0 ? ref.slice(0, qIdx) : ref;

    const refFile = refPath.replace(/^\.\//, "");
    const srcTarget = path.posix.normalize(path.posix.join(path.posix.dirname(srcRel), refFile));
    // 同 JS 分支：拼路径查不到时按文件名回退
    let dstTarget = mapPath(map, srcTarget);
    if (!dstTarget) dstTarget = mapByBasename(map, path.posix.basename(refFile));
    if (!dstTarget) { unresolved.push({ ref, srcTarget }); return full; }
    const dstSelf = mapPath(map, srcRel);
    if (!dstSelf) { unresolved.push({ ref, srcTarget, why: "自身无映射" }); return full; }
    const newRef = relRef(dstSelf, dstTarget, refPath) + query;
    if (newRef !== ref) changes.push({ attr, from: ref, to: newRef });
    return pre + newRef + post;
  };
  let out = text.replace(/(<script[^>]+src=["'])(\.\.?\/[^"']+)(["'])/g, handle("script"));
  out = out.replace(/(<link[^>]+href=["'])(\.\.?\/[^"']+)(["'])/g, handle("link"));
  return { text: out, changes, unresolved };
}

// ---------------------------------------------------------------- 主流程

function main() {
  const manifestPath = path.resolve(manifestArg);
  if (!fs.existsSync(manifestPath)) {
    console.error("❌ 清单不存在: " + manifestPath);
    process.exit(1);
  }
  const { files } = loadManifest(manifestPath);
  const map = buildMap(files);
  const SRC_ROOT = ROOT;                     // 模板仓库根 = 清单键的基准

  const report = [];
  let nChanged = 0, nFiles = 0;

  for (const [src, dst] of files) {
    if (src.endsWith("/")) continue;         // 目录条目单独遍历
    if (!/\.(js|cjs|html)$/.test(src)) continue;
    const abs = path.join(SRC_ROOT, src);
    if (!fs.existsSync(abs)) continue;

    const text = fs.readFileSync(abs, "utf8");
    const isHtml = src.endsWith(".html");
    const r = isHtml ? rewriteHtml(text, src, map) : rewriteJs(text, src, map);

    if (!r.changes.length && !r.unresolved.length) continue;
    nFiles++;
    report.push({ src, dst, changes: r.changes, unresolved: r.unresolved });
    if (r.changes.length) {
      nChanged += r.changes.length;
      if (!DRY) fs.writeFileSync(abs, r.text, "utf8");
    }
  }

  const L = [];
  L.push(DRY ? "相对引用改写预演（未写入）" : "相对引用改写（已写入模板源文件）");
  L.push("  清单: " + manifestPath);
  L.push("  映射: " + map.exact.size + " 条单文件 / " + map.dirMap.length + " 条目录");
  L.push("");
  if (!nFiles) {
    L.push("  ✅ 无需改写的相对引用（素材内引用与落点一致）");
  } else {
    for (const f of report) {
      L.push("  " + f.src);
      if (f.dst !== f.src) L.push("      → " + f.dst);
      for (const c of f.changes) L.push(`      ${c.attr ? c.attr + ": " : ""}${c.from}  ⇒  ${c.to}`);
      for (const u of f.unresolved) {
        L.push(`      ⚠️ 无法解析: ${u.ref}（源侧 ${u.srcTarget}${u.why ? "，" + u.why : ""}）`);
      }
    }
    L.push("");
    L.push(`  合计: ${nChanged} 处引用${DRY ? "待改写" : "已改写"}，涉及 ${nFiles} 个文件`);
  }
  process.stdout.write(L.join("\n") + "\n");
  return 0;
}

process.exit(main());
