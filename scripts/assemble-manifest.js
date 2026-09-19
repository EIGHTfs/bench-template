#!/usr/bin/env node
/**
 * ============================================================
 * assemble-manifest —— 清单（assemble.json）解析的唯一实现
 *
 * 为什么要有这个文件：
 *   此前「清单怎么解析」散在三个地方各写一遍——
 *     setup.sh 内嵌 python（展开 files 并复制）
 *     setup.sh 内嵌 python（brand 段）
 *     scripts/sync-to-project.sh 内嵌 python（反推素材根）
 *   于是同一个约定被实现成不同口径，实测已产生过这些真实故障：
 *     · 基准目录不一致 → 拼出 <项目>/server/server/templates（幽灵目录）
 *     · synced 布局下清单找到却全部报缺失（基准写死 $ROOT）
 *     · sync 不过滤 `_` 开头的注释键，把注释当成素材引用（计数虚增）
 *   把解析收敛到这里之后，「基准/口径」只有一处定义，上述问题从结构上消失。
 *
 * 对外约定（bash 侧只依赖这些输出）：
 *   resolve-base <探测目录>            → 打印清单「键」的源基准目录
 *   list <清单> [--check-base=DIR]     → 展开为 TSV: 源<TAB>目标
 *   asset-roots <清单>                 → 打印被引用的素材根（去重、保序）
 *   brand <清单> <输出路径>            → 导出 brand 段（无 brand 段时退出码 3）
 *   init-flag <清单>                   → 打印 1/0（init 段，缺省 1）
 *   generate <输出路径>                → 生成空白清单骨架（不覆盖已存在文件）
 *   validate <清单>                    → 自检：结构、注释键、路径安全
 *
 * 键的约定（两种布局通用，这是设计核心）：
 *   清单键统一写成 server/... 形式（如 server/templates/_gbmd-style/public/app.js），
 *   搭配「源基准」使用：
 *     模板仓库布局：素材在 <模板根>/server/  → 基准 = 模板根
 *     synced 布局  ：素材在 <项目>/server/   → 基准 = 项目根
 *   两种布局下「基准 + 键」都指向同一批素材，因此同一份 assemble.json 两边通用。
 * ============================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

/** 注释键前缀：JSON 不支持注释，清单用 `_` 开头的键承载说明，必须跳过。 */
const COMMENT_PREFIX = "_";

// ---------------------------------------------------------------- 基础工具

function die(msg, code = 1) {
  process.stderr.write(msg + "\n");
  process.exit(code);
}

function isCommentKey(key) {
  return String(key).startsWith(COMMENT_PREFIX);
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

// ---------------------------------------------------------------- 清单加载

/**
 * 读清单并归一化。
 * @returns {{manifest:object, files:Array<[string,string]>, hasBrand:boolean, init:boolean}}
 */
function loadManifest(manifestPath) {
  if (!isFile(manifestPath)) die(`❌ 清单不存在: ${manifestPath}`);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    die(`  ❌ 清单解析失败 ${manifestPath}: ${e.message}`);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    die("  ❌ 清单格式错误：顶层应为对象，且 files 应为对象");
  }

  const rawFiles = raw.files;
  // files 段缺省视为空（合法的空清单，用于纯骨架初始化）。
  const files = [];
  if (rawFiles !== undefined && rawFiles !== null) {
    if (typeof rawFiles !== "object" || Array.isArray(rawFiles)) {
      die("  ❌ 清单格式错误：顶层应为对象，且 files 应为对象");
    }
    for (const [src, dst] of Object.entries(rawFiles)) {
      if (isCommentKey(src)) continue;              // 跳过注释键（关键：sync 曾漏做）
      if (isCommentKey(dst)) continue;
      if (typeof dst !== "string") {
        die(`  ❌ 清单格式错误：files 的值必须是字符串（键 ${src} 的值不是字符串）`);
      }
      if (typeof src !== "string" || src.length === 0) {
        die(`❌ 清单 files 出现非法源键: ${JSON.stringify(src)}`);
      }
      files.push([src, dst]);
    }
  }

  const brand = raw.brand;
  const hasBrand = brand !== undefined && brand !== null;

  return {
    manifest: raw,
    files,
    hasBrand,
    // init 缺省 true（与既有 setup.sh 行为一致：非 false 即初始化）。
    init: raw.init !== false,
  };
}

// ---------------------------------------------------------------- 基准解析

/**
 * 由「探测目录」判定清单键的源基准。
 *
 * 核心不变式：清单键一律以 `server/` 开头，因此基准 BASE 必须满足
 * 「BASE/server/<素材>」真实存在。判定顺序（先精确后宽松）：
 *
 *   1) probe/server/ 下已有素材（templates、project/blueprint、framework）
 *        → 基准 = probe                       （模板仓库布局 / 项目根布局）
 *   2) probe/ 自身就是那个 server/ 目录（即 probe/server/ 不存在，但 probe 下有素材）
 *        → 基准 = probe 的父级                （调用方直接把 server/ 传进来）
 *   3) 都不命中 → 回落到 probe
 *        （保持与旧行为一致：让调用侧按「缺失」如实报错，而不是猜一个路径）
 *
 * 历史故障背景：固定用 probe 曾拼出 <项目>/server/server/templates（幽灵目录），
 * 且 synced 布局下清单找到却全部报缺失——根因就是基准与「server/ 前缀」错配。
 */
function resolveBase(probeDir) {
  const p = path.resolve(probeDir);

  // 判定素材存在性的三类标志位（任一命中即认为该目录是「server/」层）
  const hasMaterial = (dir) =>
    isDir(path.join(dir, "templates")) ||
    isDir(path.join(dir, "project", "blueprint")) ||
    isDir(path.join(dir, "framework"));

  // 1) probe 就是基准：probe/server/ 下有素材
  if (hasMaterial(path.join(p, "server"))) return p;

  // 2) probe 本身是 server/ 层：其父级即为基准
  if (hasMaterial(p)) return path.dirname(p);

  // 3) 无法判定：回落 probe，交由调用侧报缺失
  return p;
}

// ---------------------------------------------------------------- 素材根

/**
 * 从清单键提取「素材根」——即为了满足清单，最少要搬哪些目录。
 *   server/framework/...              → server/framework
 *   server/templates/_gbmd-style/...  → server/templates/_gbmd-style（只当前风格）
 *   server/project/blueprint/...      → server/project/blueprint
 * 这样同步就不会把整个 templates/（含其他风格与归档）搬进项目。
 */
function assetRootOf(key) {
  const parts = key.replace(/\/+$/, "").split("/");
  if (parts.length >= 3 && parts[0] === "server" &&
      (parts[1] === "templates" || parts[1] === "project")) {
    return parts.slice(0, 3).join("/");     // 精确到风格目录 / blueprint
  }
  return parts.slice(0, 2).join("/");       // server/framework 等
}

function assetRoots(manifestPath) {
  const { files } = loadManifest(manifestPath);
  const seen = new Set();
  const out = [];
  for (const [src] of files) {
    const root = assetRootOf(src);
    if (!seen.has(root)) { seen.add(root); out.push(root); }
  }
  return out;
}

// ---------------------------------------------------------------- 子命令

function cmdList(manifestPath, opts) {
  const { files } = loadManifest(manifestPath);
  if (opts.checkBase) {
    let missing = 0;
    for (const [src] of files) {
      if (!fs.existsSync(path.join(opts.checkBase, src))) missing++;
    }
    if (missing > 0) {
      process.stderr.write(`  ⚠️ ${missing} 个键在基准下不存在\n`);
    }
  }
  // TSV 供 bash 直接 while read 消费
  for (const [src, dst] of files) {
    process.stdout.write(`${src}\t${dst}\n`);
  }
  return 0;
}

function cmdBrand(manifestPath, outPath) {
  const { manifest, hasBrand } = loadManifest(manifestPath);
  if (!hasBrand) return 3;                       // 未声明 brand：非错误，静默跳过
  const brand = manifest.brand;
  if (typeof brand !== "object" || Array.isArray(brand) || Object.keys(brand).length === 0) {
    die("  ❌ 清单格式错误：brand 段必须是非空对象");
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(brand, null, 2) + "\n", "utf8");
  return 0;
}

/**
 * 清单一致性检查（check）——按清单两端比对，回答两个问题：
 *   1. 不一致：清单某条 src→dst，两侧文件内容 md5 不同（需重新同步/组装）
 *   2. 缺失  ：清单某条的某一侧不存在
 * （原先的「孤儿/清单外文件」已独立为 untracked 命令：那需要扫整棵目录树并
 *   套 .gitignore，与「两端是否同步」是两件事，混在一起 check 会长期报噪声。）
 *
 * 参数：
 *   manifestPath  清单 json（项目根下的 assemble.json）
 *   projectRoot   json 文件所在项目根——dst 相对它解析
 *   base          模板素材基准——src 相对它解析（resolve-base 的结果）
 *
 * 目录型条目（以 / 结尾）递归展开为文件逐个比对。
 * 退出码：0 = 全部一致且无孤儿；1 = 有问题（供 CI / 脚本判据）
 */
// ---- check 的公共小工具（供 cmdCheck 及其拆分出的辅助函数共用）----

// md5：文件不存在或读不了返回 null，由调用方区分「缺失」与「不一致」
function _checkMd5(p) {
  try { return require("crypto").createHash("md5").update(fs.readFileSync(p)).digest("hex"); }
  catch { return null; }
}

// 递归列出目录下所有文件（返回相对该目录的路径）
function _checkWalk(dir, prefix = "") {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(..._checkWalk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

// 收集「目标目录 → 写入它的源目录列表（保持清单顺序）」。
// 清单允许「多个源写同一目标目录」：blueprint 提供共用底座、风格目录提供该风格专属，
// 组装时按清单顺序复制，**靠后的源覆盖靠前的同名文件**（如 iwara 风格层覆盖 blueprint 的 row-thumb.css）。
// 因此判断某目标文件是否「与源一致」时采「或」逻辑：只要任一提供该文件的源与产出
// 一致即算通过，否则会把「风格层有意覆盖」误报成不一致。
function _checkDirSources(files) {
  const map = new Map();
  for (const [s, d] of files) {
    if (!s.endsWith("/") || !d.endsWith("/")) continue;
    const k = d.replace(/\/+$/, "");
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(s.replace(/\/+$/, ""));
  }
  return map;
}

// 收集「目标文件 → 写入它的单文件源列表（保持清单顺序）」。
// 同一 dst 可能被多个单文件清单项写入，与目录条目的多源情形同理，
// 比对时采「或」逻辑（任一源一致即通过）。
function _checkFileSources(files) {
  const map = new Map();
  for (const [s, d] of files) {
    if (s.endsWith("/") || d.endsWith("/")) continue;   // 目录条目归 _checkDirSources
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(s);
  }
  return map;
}

// 比对一条「目录型」清单项：递归展开源目录，逐文件比 md5；
// 目标目录里多出的文件（无任何源提供）也报为不一致。
function _checkDirEntry(src, dst, ctx) {
  const { baseAbs, projAbs, dirSources, fileSources, matched, mismatch, missing } = ctx;
  const srcPath = path.join(baseAbs, src);
  const dstPath = path.join(projAbs, dst);
  if (!fs.existsSync(srcPath)) { missing.push({ src, dst, side: "模板源" }); return; }

  // 该目标目录的所有源目录聚成一组（blueprint 提供共用底座、风格层覆盖同名）。
  // 比对采「或」逻辑：遍历组内每个源，命中任一即算一致，全不命中才报。
  const dirProviders = (dirSources.get(dst.replace(/\/+$/, "")) || [])
    .map((s) => path.join(baseAbs, s));
  // 目录条目与单文件条目可写同一目录：清单既可用整目录取件、也可逐文件显式列出。
  // 故「本目录内某文件由谁提供」还要算上写它的单文件条目，否则逐文件列出的件
  // 会被判成「无任何源提供」（反向检查）或与目录源比不中（正向检查）而误报。
  const fileProvidersOf = (rel) => {
    const key = (dst + rel).replace(/\/+$/, "");
    return (fileSources.get(key) || []).map((s) => path.join(baseAbs, s));
  };
  const providers = dirProviders.concat(fileProvidersOf(""));

  for (const rel of _checkWalk(srcPath)) {
    const dp = path.join(dstPath, rel);
    matched.add(path.relative(projAbs, dp));
    if (!fs.existsSync(dp)) { missing.push({ src: src + rel, dst: dst + rel, side: "项目目标" }); continue; }

    // 候选 = 组内各源目录下与产出同名的**文件**（必须拼 rel，不能拿目录比）
    //      + 显式写该文件的单文件条目源（逐文件清单项优先于整目录）
    const candidates = dirProviders
      .map((pd) => path.join(pd, rel))
      .concat(fileProvidersOf(rel))
      .filter((f) => fs.existsSync(f));
    if (candidates.length === 0) candidates.push(path.join(srcPath, rel));

    const dpMd5 = _checkMd5(dp);
    if (!candidates.some((c) => _checkMd5(c) === dpMd5)) {
      mismatch.push({ src: src + rel, dst: dst + rel });
    }
  }

  // 反向：目标目录里有、但没有任何源目录提供该文件 → 才报。
  // 注意：多个源目录合并进同一目标目录是设计允许的（见 _checkDirSources），
  // 因此必须查「所有映射到该 dst 的源」，而不是只看当前这一个源——否则全是误报。
  if (!fs.existsSync(dstPath)) return;
  for (const rel of _checkWalk(dstPath)) {
    const dp = path.join(dstPath, rel);
    matched.add(path.relative(projAbs, dp));
    const provided = dirProviders.some((sd) => fs.existsSync(path.join(sd, rel)))
      || fileProvidersOf(rel).some((f) => fs.existsSync(f));
    if (!provided) mismatch.push({ src: "（无任何源提供）", dst: dst + rel });
  }
}

// 比对一条「单文件型」清单项。
// 与目录条目同一套「或」逻辑：同一 dst 可能被多个清单项写入，
// 产出等于其中任一源即算一致，避免把有意覆盖误报为不一致。
function _checkFileEntry(src, dst, ctx) {
  const { baseAbs, projAbs, matched, mismatch, missing, fileSources } = ctx;
  const srcPath = path.join(baseAbs, src);
  const dstPath = path.join(projAbs, dst);
  matched.add(path.relative(projAbs, dstPath));
  if (!fs.existsSync(srcPath)) { missing.push({ src, dst, side: "模板源" }); return; }
  if (!fs.existsSync(dstPath)) { missing.push({ src, dst, side: "项目目标" }); return; }

  // 所有写入该 dst 的单文件源；取不到就退化为本条目自身的源。
  const candidates = (fileSources && fileSources.get(dst)) || [src];
  const dpMd5 = _checkMd5(dstPath);
  if (!candidates.some((c) => _checkMd5(path.join(baseAbs, c)) === dpMd5)) {
    mismatch.push({ src, dst });
  }
}

/**
 * 清单一致性检查（check）——按清单两端比对，回答两个问题：
 *   1. 不一致：清单某条 src→dst，两侧文件内容 md5 不同（需重新同步/组装）
 *   2. 缺失  ：清单某条的某一侧不存在
 * （原先的「孤儿/清单外文件」已独立为 untracked 命令：那需要扫整棵目录树并
 *   套 .gitignore，与「两端是否同步」是两件事，混在一起 check 会长期报噪声。）
 *
 * 参数：
 *   manifestPath  清单 json（项目根下的 assemble.json）
 *   projectRoot   json 文件所在项目根——dst 相对它解析
 *   base          模板素材基准——src 相对它解析（resolve-base 的结果）
 *
 * 退出码：0 = 全部一致且无孤儿；1 = 有真问题（供 CI / 脚本判据）
 */
// ---- 无引用检查：清单里的**组装产出**是否真的被项目用到 ----
//
// 动机：模板下发的是通用件，但**不是每个项目都用得上**。搬模板时把清单整份复制过来，
// 就会搬进一批本项目根本不引用、也没有对应功能入口的文件（真实案例：gallery 搬进了
// search-date-range.cjs，而 gallery 既没有按时间搜索的路由、前端也没引它）。
// 这种文件平时不报错、只是静静躺在项目里，直到某天有人照着它改代码或排查问题时被带偏。
//
// 判据：**从项目自有入口出发的 require 传递可达性**——不能只看「有没有人 require 这个名字」。
// 框架件是靠 core/index.js 聚合、由项目 app.js 引一个入口带进来的，
// 逐文件做字符串匹配会把整套框架全报成无引用（误报会让人直接无视这条告警）。
//
//   1) 起点 = 项目自有源码（server/ 下、非组装产物区、非前端 public/）。
//   2) 从起点解析 require("…") 的相对路径，逐层展开，得到「可达文件」集合。
//      解析不出的（node 内置模块、npm 包）直接跳过。
//   3) 清单里落在产物区的服务端模块，若不在可达集合里 → 报「无引用」。
//   4) 前端产物（public/ 下）不判：它们由 HTML 的 <script src> 引用，规则不同。
//   5) 目录条目、非 JS 产物不判。
//
// 返回 [{ dst, src }]；调用方决定是告警还是失败。
function _checkUnreferenced(files, ctx) {
  const projAbs = ctx.projAbs;
  // 组装产物区：清单目标里出现过的目录名（server/app.js 这类单文件产物另处理）
  const productDirs = new Set();
  const productFiles = new Set();
  for (const [, d] of files) {
    if (d.endsWith("/")) {
      const seg = d.replace(/\/+$/, "").split("/").pop();
      if (seg) productDirs.add(seg);
    } else {
      productFiles.add(d);
    }
  }
  // 起点：项目自有源码（跳过产物区与前端）
  const ownSources = [];
  const walk = (dir, rel) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git" || e.name.startsWith(".trash")) continue;
        if (productDirs.has(e.name)) continue;
        if (e.name === "public") continue;              // 前端产物不参与可达性
        walk(path.join(dir, e.name), r);
      } else if (/\.(js|cjs)$/.test(e.name)) {
        ownSources.push(path.join(dir, e.name));
      }
    }
  };
  walk(projAbs, "");

  // 从起点做 require 可达性展开。
  // 关键：不能只在项目目录里走——框架件之间是相对 require（../http/xxx.js），
  // 它们在**模板仓库**里，项目侧是组装出来的副本。两侧都解析，才能把
  // 「项目 app.js → core/index.js → ../http/fs-async.js」这条链走通。
  const seen = new Set();
  const queue = ownSources.slice();
  const roots = [projAbs, ctx.baseAbs];
  const resolveReq = (fromAbs, spec) => {
    if (!spec.startsWith(".")) return null;
    for (const root of roots) {
      // 以 fromAbs 所在目录为基准；若该文件属于另一侧，改用它自己的侧为基准
      const candidate = path.resolve(path.dirname(fromAbs), spec);
      try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* 继续 */ }
      for (const ext of [".js", ".cjs", "/index.js"]) {
        try { if (fs.statSync(candidate + ext).isFile()) return candidate + ext; } catch { /* 继续 */ }
      }
      void root;
    }
    return null;
  };
  const reqRe = /require\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  while (queue.length) {
    const cur = queue.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    let txt;
    try { txt = fs.readFileSync(cur, "utf8"); } catch { continue; }
    reqRe.lastIndex = 0;
    let m;
    while ((m = reqRe.exec(txt))) {
      const target = resolveReq(cur, m[1]);
      if (target && !seen.has(target)) queue.push(target);
    }
  }

  // 把可达集合折算成「相对项目根的产物路径」，便于与清单 dst 比较
  const reachable = new Set();
  for (const abs of seen) {
    // 项目侧文件：直接用相对路径
    if (abs.startsWith(projAbs + path.sep)) {
      reachable.add(path.relative(projAbs, abs).split(path.sep).join("/"));
    }
  }

  const out = [];
  for (const [src, dst] of files) {
    if (dst.endsWith("/") || src.endsWith("/")) continue;
    if (!/\.(js|cjs)$/.test(dst)) continue;
    if (dst.startsWith("public/") || dst.includes("/public/")) continue;   // 前端不判
    if (reachable.has(dst)) continue;
    // 项目自有同名文件接管了该职责（如 lib/auto-update.js 薄壳转发框架实现）→ 不报
    const base = path.basename(dst);
    const stem = base.replace(/\.(js|cjs)$/, "");
    let ownSame = false;
    for (const s of ownSources) {
      if (path.basename(s) === base) { ownSame = true; break; }
    }
    if (ownSame) continue;
    out.push({ src, dst, stem });
  }
  return out;
}

function cmdCheck(manifestPath, projectRoot, base) {
  const { files } = loadManifest(manifestPath);
  const ctx = {
    baseAbs: path.resolve(base),
    projAbs: path.resolve(projectRoot),
    dirSources: _checkDirSources(files),
    fileSources: _checkFileSources(files),
    matched: new Set(),     // 项目侧已由清单认领的相对路径（用于算孤儿）
    mismatch: [],           // { src, dst }
    missing: [],            // { src, dst, side }
  };

  for (const [src, dst] of files) {
    if (src.endsWith("/") || dst.endsWith("/")) _checkDirEntry(src, dst, ctx);
    else _checkFileEntry(src, dst, ctx);
  }

  // check 不再扫孤儿（见 untracked 命令）；这里只保留清单两端的比对结果
  // 外加「无引用」告警：搬模板常整份复制清单，会搬进本项目用不上的文件（见 _checkUnreferenced）
  process.stdout.write(_renderCheckReport({
    manifestPath, baseAbs: ctx.baseAbs, projAbs: ctx.projAbs,
    entryCount: files.length, mismatch: ctx.mismatch, missing: ctx.missing,
    unreferenced: _checkUnreferenced(files, ctx),
  }) + "\n");

  return (ctx.mismatch.length || ctx.missing.length) ? 1 : 0;
}

// ---- pull：把项目侧改过的**素材**回流到模板仓库 ----
//
// 方向与 sync 相反：sync 是模板→项目（下发素材树），pull 是项目→模板（沉淀改动）。
//
// 只处理素材条目（src==dst 且落在 templates/ framework/ project/ 下）：
//   清单里 src!=dst 的是组装产出（→ server/public/ 等），由组装生成，回流无意义。
//
// 归属判定复用 check 的同名规则：目标目录可能由多个源提供（blueprint 底座 +
// 风格层覆盖），按清单顺序**靠后的源为准**——组装就是按这个语义覆盖写入的，
// 故回流也必须写回「实际生效的那个源」，否则会改到被覆盖的底座上、白改。
//
// 冲突（项目侧与模板侧都改过）本脚本不替人做决定：只列出差异与建议，
// 实际是否回流由调用方（人或 AI）判断——这是设计选择，不是尚未实现。
function cmdPull(manifestPath, projectRoot, base, write = false) {
  const { files } = loadManifest(manifestPath);
  const baseAbs = path.resolve(base);
  const projAbs = path.resolve(projectRoot);

  // 素材条目 = src==dst（落到与源同构的位置），且不属于组装产出目录
  const isAsset = (s, d) => {
    if (s.endsWith("/") !== d.endsWith("/")) return false;
    if (s.replace(/\/+$/, "") !== d.replace(/\/+$/, "")) return false;
    return /^(server\/)?(templates|framework|project)\//.test(s.replace(/^\.\//, ""));
  };

  const diffs = [];   // { rel, srcAbs, changed }  项目侧与模板不同的素材
  const same = [];
  const missing = [];

  for (const [src, dst] of files) {
    if (!isAsset(src, dst)) continue;                  // 产出跳过
    const rel = src.replace(/\/+$/, "");
    const srcAbs = path.join(baseAbs, rel);
    const projPath = path.join(projAbs, rel);

    if (!fs.existsSync(projPath)) { missing.push(rel); continue; }

    if (src.endsWith("/")) {
      const srcFiles = _checkWalk(srcAbs);
      for (const f of srcFiles) {
        const a = _checkMd5(path.join(srcAbs, f));
        const b = _checkMd5(path.join(projPath, f));
        if (b === null) continue;                      // 项目侧没有：不是「改动」
        if (a !== b) diffs.push({ rel: `${rel}/${f}`, changed: true });
        else same.push(`${rel}/${f}`);
      }
    } else {
      const a = _checkMd5(srcAbs);
      const b = _checkMd5(projPath);
      if (a !== b) diffs.push({ rel, changed: true });
      else same.push(rel);
    }
  }

  const out = [];
  out.push("素材回流检查（项目 → 模板）");
  out.push("  清单: " + manifestPath);
  out.push("  项目根: " + projAbs);
  out.push("  模板基准: " + baseAbs);
  out.push("");
  if (!diffs.length) {
    out.push("  ✅ 素材全部一致，无需回流");
    if (missing.length) {
      out.push("");
      out.push("── 项目侧缺少 " + missing.length + " 项（未下发，非改动）──");
      for (const m of missing) out.push("  ? " + m);
    }
    process.stdout.write(out.join("\n") + "\n");
    return 0;
  }

  out.push("── 待回流 " + diffs.length + " 项（项目侧与模板不同，以项目侧为准写回模板）──");
  for (const d of diffs) out.push("  → " + d.rel);
  out.push("");

  if (!write) {
    out.push("这是预演（未写入）。确认无误后加 --write 执行回流；");
    out.push("写回前会先备份模板原文件（*.bak-pull），可用同名 .bak-pull 还原。");
    out.push("两边都改过时本脚本不判断取值——请先 diff 确认再回流。");
  } else {
    let n = 0, failed = 0;
    for (const d of diffs) {
      const srcAbs = path.join(baseAbs, d.rel);          // 模板侧（写回目标）
      const projPath = path.join(projAbs, d.rel);        // 项目侧（内容来源）
      try {
        // 删除可恢复：先备份模板原文件，再覆盖；.bak-pull 不被清单引用，可随时还原
        if (fs.existsSync(srcAbs)) fs.copyFileSync(srcAbs, srcAbs + ".bak-pull");
        fs.mkdirSync(path.dirname(srcAbs), { recursive: true });
        fs.copyFileSync(projPath, srcAbs);
        n++;
      } catch (e) {
        out.push("  ✗ 回流失败: " + d.rel + " (" + e.message + ")");
        failed++;
      }
    }
    out.push("");
    out.push("  ✅ 已回流 " + n + " 个文件到模板仓库"
      + (failed ? "，失败 " + failed + " 个" : ""));
    out.push("  备份后缀: *.bak-pull（模板侧原文件）");
  }

  if (missing.length) {
    out.push("");
    out.push("── 项目侧缺少 " + missing.length + " 项（未下发，非改动）──");
    for (const m of missing) out.push("  ? " + m);
  }
  process.stdout.write(out.join("\n") + "\n");
  return 0;
}


function _renderCheckReport(r) {
  const out = [];
  out.push("清单一致性检查");
  out.push("  清单: " + r.manifestPath);
  out.push("  项目根: " + r.projAbs);
  out.push("  素材基准: " + r.baseAbs);
  out.push("  条目: " + r.entryCount + " 条");
  out.push("");
  if (r.mismatch.length) {
    out.push("── 不一致 " + r.mismatch.length + " 项（两侧内容不同，需重新同步/组装）──");
    for (const m of r.mismatch) out.push("  ✗ " + m.src + "  →  " + m.dst);
    out.push("");
  }
  if (r.missing.length) {
    out.push("── 缺失 " + r.missing.length + " 项 ──");
    for (const m of r.missing) out.push("  ✗ [" + m.side + "缺失] " + m.src + "  →  " + m.dst);
    out.push("");
  }
  if (!r.mismatch.length && !r.missing.length) {
    out.push("  ✅ 清单两端一致");
  }
  // 无引用 = 告警而非失败：有些通用件确实「先备着」，是否移除由项目判断。
  // 但值得每次 check 都提醒一句，因为这类文件搬进来后不会自己报错。
  if (r.unreferenced && r.unreferenced.length) {
    out.push("");
    out.push("── 无引用 " + r.unreferenced.length + " 项（组装下发，但项目自有代码没有 require 它）──");
    for (const m of r.unreferenced) out.push("  ⚠ " + m.dst);
    out.push("    可能是搬模板时整份复制清单带进来的、本项目用不上的文件。");
    out.push("    确认不需要就删掉对应清单条目（项目侧产物下次组装即消失）；");
    out.push("    确实要预置就先留着，但别照它改代码。");
  }
  // 清单外文件已独立为 untracked 命令：check 只回答「清单与素材是否同步」，
  // 那需要扫整棵目录树并套 .gitignore（本项目/文档/截图等自有文件本就该在清单外），
  // 与「同步性」是两件事，混在一起会让 check 永远报一堆噪声。
  out.push("");
  out.push("  提示：查「目录里还有什么没进清单」请用 --untracked（扫全目录 + 按 .gitignore 排除）");
  return out.join("\n");
}

function cmdValidate(manifestPath, base) {
  const { files, manifest } = loadManifest(manifestPath);
  const problems = [];
  const notices = [];      // 提示：不影响返回码，不阻断组装
  const rawFiles = (manifest.files && typeof manifest.files === "object") ? manifest.files : {};
  const commentKeys = Object.keys(rawFiles).filter(isCommentKey);
  // 路径安全：不得逃出基准 / 目标根
  for (const [src, dst] of files) {
    if (path.isAbsolute(dst)) problems.push(`目标为绝对路径（应相对项目根）: ${dst}`);
    if (dst.split("/").includes("..")) problems.push(`目标含 ..（可能逃出项目根）: ${dst}`);
    if (src.split("/").includes("..")) problems.push(`源含 ..（可能逃出基准）: ${src}`);
  }
  // 目标「目录」重复是设计允许的：blueprint/ 提供共享底座，风格目录提供该风格
  // 专属片段，二者合并进同一目标目录（实测两边的文件名互不重叠）。
  // 因此只报「目录重复且内部存在同名文件」的真冲突——那才会互相覆盖。
  const dirTargets = new Map();          // 归一化目标目录 → 源列表
  for (const [src, dst] of files) {
    if (!dst.endsWith("/")) continue;    // 只看目录型目标
    const k = dst.replace(/\/+$/, "");
    if (!dirTargets.has(k)) dirTargets.set(k, []);
    dirTargets.get(k).push(src.replace(/\/+$/, ""));
  }
  // 递归收集相对文件路径（目录同名但内部文件不同不算冲突，只有真实文件同名才是）
  const walk = (dir, prefix = "") => {
    const out = new Set();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return out; }
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) for (const f of walk(path.join(dir, e.name), rel)) out.add(f);
      else out.add(rel);
    }
    return out;
  };
  const overlaps = (a, b) => {
    const sa = walk(a);
    return [...walk(b)].filter((n) => sa.has(n));
  };
  for (const [dst, srcs] of dirTargets) {
    if (srcs.length < 2) continue;
    for (let i = 0; i < srcs.length; i++) {
      for (let j = i + 1; j < srcs.length; j++) {
        const clash = overlaps(path.join(base, srcs[i]), path.join(base, srcs[j]));
        if (clash.length) {
          // 提示而非问题：多源写同一目标目录是**设计允许**的覆盖机制——
          // blueprint 提供共用底座、风格目录提供该风格专属，清单里靠后的源覆盖靠前的同名文件
          // （例：iwara 风格层的 row-thumb.css 覆盖 blueprint 的灯箱版）。
          // 早期当成 problem 会让 setup.sh 的清单自检 exit 1，组装直接中断在自检之后。
          notices.push(
            `目标 ${dst} 被多个源写入，同名文件以后者为准: ` +
            `${srcs[i]} ∩ ${srcs[j]} = ${clash.join(", ")}`
          );
        }
      }
    }
  }
  process.stdout.write(
    `  清单自检: 条目 ${files.length} 个，注释键 ${commentKeys.length} 个，` +
    `brand ${manifest.brand ? "有" : "无"}，init ${manifest.init !== false ? "1" : "0"}\n`
  );
  if (notices.length) {
    for (const n of notices) process.stdout.write(`  ℹ️  ${n}\n`);
  }
  if (problems.length) {
    for (const p of problems) process.stderr.write(`  ⚠️ ${p}\n`);
    return 1;
  }
  process.stdout.write("  ✅ 清单结构正常\n");
  return 0;
}

// ---------------------------------------------------------------- 入口

// ---- 各子命令的参数解析 ----
//
// 抽出来的理由：这些块原本内联在 main 的 switch 里，把 main 撑到 100+ 行。
// 参数解析（哪个开关对应哪个选项）与命令分发是两件事：前者规则琐碎、逐个命令不同，
// 后者只是「名字 → 实现」的对照表。混在一起时，加一个命令要在 11 个 case 之间翻找。
// 抽开后 main 只做分发，读的人一眼能看全有哪些命令。

function cmdGenerate(outArg) {
  // 生成空白清单骨架。放在这里而不是 setup.sh 内嵌 python：
  // 清单结构（有哪些字段、缺省值是什么）属于工具的知识，
  // 散到脚本里会与 validate/loadManifest 的口径各写一份、逐渐漂移。
  if (!outArg) die("用法: assemble-manifest generate <输出路径>");
  const out = path.resolve(outArg);
  if (fs.existsSync(out)) die(`已存在，不覆盖: ${out}`);
  const skeleton = {
    files: {},
    init: false,
  };
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(skeleton, null, 2) + "\n", "utf8");
    JSON.parse(fs.readFileSync(out, "utf8"));     // 回读校验：写出的必须是合法 JSON
  } catch (e) {
    die(`生成失败（目录不可写？）: ${out} — ${e.message}`);
  }
  process.stdout.write(`已生成空白清单: ${out}\n`);
  return 0;
}

function cmdMigrateCli(rest) {
  if (!rest[0] || !rest[1]) {
    die("用法: assemble-manifest migrate <旧清单> <新清单> [--dry-run] [--old-base D] [--new-base D]");
  }
  // 缺省预演（安全侧），--write 才真动盘。
  // 注意：调用方（setup.sh）默认传 --write（迁移是常规操作），
  // 只有显式 --dry-run 才预演——两层默认值方向相反，此处以传参为准。
  const opts = { dry: true };
  const flags = rest.slice(2);
  if (flags.includes("--write")) opts.dry = false;
  if (flags.includes("--dry-run")) opts.dry = true;
  for (const a of flags) {
    if (a.startsWith("--proj-root=")) opts.projRoot = a.slice("--proj-root=".length);
  }
  return cmdMigrate(rest[0], rest[1], opts);
}

function cmdPullCli(rest) {
  if (!rest[0] || !rest[1] || !rest[2]) {
    die("用法: assemble-manifest pull <清单> <项目根> <模板基准> [--write]");
  }
  return cmdPull(rest[0], rest[1], rest[2], rest.slice(3).includes("--write"));
}

function cmdUntrackedCli(rest) {
  if (!rest[0]) die("用法: assemble-manifest untracked <清单> [项目根] [--json]");
  const opts = { json: rest.slice(1).includes("--json") };
  const pos = rest.slice(1).filter((a) => !a.startsWith("--"));
  return cmdUntracked(rest[0], pos[0], opts);
}

function cmdListCli(rest) {
  if (!rest[0]) die("用法: assemble-manifest list <清单> [--check-base=DIR]");
  const opts = {};
  for (const a of rest.slice(1)) {
    if (a.startsWith("--check-base=")) opts.checkBase = a.slice("--check-base=".length);
  }
  return cmdList(rest[0], opts);
}

const USAGE =
  "assemble-manifest —— 清单解析唯一实现\n" +
  "用法: assemble-manifest <命令> [参数]\n" +
  "命令: resolve-base | asset-roots | list | brand | init-flag | generate | validate | check" +
  " | untracked | migrate | pull";

function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "resolve-base":
      return cmdResolveBase(rest);
    case "asset-roots":
      return cmdAssetRoots(rest);
    case "list":
      return cmdListCli(rest);
    case "brand":
      return cmdBrandCli(rest);
    case "init-flag":
      return cmdInitFlag(rest);
    case "generate":
      return cmdGenerate(rest[0]);
    case "validate":
      return cmdValidateCli(rest);
    case "check":
      return cmdCheckCli(rest);
    case "untracked":
      return cmdUntrackedCli(rest);
    case "migrate":
      return cmdMigrateCli(rest);
    case "pull":
      return cmdPullCli(rest);
    default:
      die(USAGE);
  }
}

// 简单子命令（单行转发 + 用法校验），与 main 分开以保持 main 是纯对照表
function cmdResolveBase(rest) {
  if (!rest[0]) die("用法: assemble-manifest resolve-base <探测目录>");
  process.stdout.write(resolveBase(rest[0]) + "\n");
  return 0;
}

function cmdAssetRoots(rest) {
  if (!rest[0]) die("用法: assemble-manifest asset-roots <清单>");
  for (const r of assetRoots(rest[0])) process.stdout.write(r + "\n");
  return 0;
}

function cmdBrandCli(rest) {
  if (!rest[0] || !rest[1]) die("用法: assemble-manifest brand <清单> <输出路径>");
  return cmdBrand(rest[0], rest[1]);
}

function cmdInitFlag(rest) {
  if (!rest[0]) die("用法: assemble-manifest init-flag <清单>");
  try {
    process.stdout.write(loadManifest(rest[0]).init ? "1\n" : "0\n");
  } catch {
    process.stdout.write("1\n");               // 读不了时按既有行为回落为 1
  }
  return 0;
}

function cmdValidateCli(rest) {
  if (!rest[0]) die("用法: assemble-manifest validate <清单> [<基准>]");
  return cmdValidate(rest[0], rest[1] || ".");
}

function cmdCheckCli(rest) {
  const usage = "用法: assemble-manifest check <清单> <项目根> [<素材基准>]";
  if (!rest[0] || !rest[1]) die(usage);
  return cmdCheck(rest[0], rest[1], rest[2] || resolveBase(path.dirname(rest[0])));
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}


// ---- migrate：按新清单整理磁盘上的文件（迁移结构 + 改引用）----
//
// 语义：./setup.sh --migrate <旧清单> --to <新清单>
//   旧清单提供「文件现在在哪」（按它的 src 去找实际文件），
//   新清单提供「该搬到哪」（按新结构的目标路径整理），
//   然后改写被搬文件内部的相对引用，让它们在新位置仍指得到人。
//
// 为什么要两个清单：一次结构重排会同时改变「源位置」与「落点」，
//   单靠任一份清单都推不出另一份的信息。两份对照才知道谁该去哪。
//
// 按【文件名】配对：这是唯一在结构重排后仍然稳定的标识。
//   同名文件多个时按顺序配对，并在报告里标出（有歧义提醒人工核对）。
//
// 只移动两边都提到的文件；旧有新无 = 文件被废弃（只报告，不删）。
function cmdMigrate(oldManifestPath, newManifestPath, opts = {}) {
  const dry = opts.dry !== false;                     // 缺省预演
  const { files: oldFiles } = loadManifest(oldManifestPath);
  const { files: newFiles } = loadManifest(newManifestPath);
  const projRoot = path.resolve(opts.projRoot || path.dirname(oldManifestPath));

  // ---- 展开成「项目内落点(dst) 列表」，精确到文件 ----
  //
  // 配对依据 = **dst 的文件名(basename)**。
  //   为什么不用整个 dst 配对：本次场景正是「落点变了」（framework/auth.js
  //   → framework/auth/auth.js），dst 相等的才能配对就一个也配不上。
  //   为什么不用 src 配对：src 是「模板里源文件的位置」，与项目无关。
  //   文件名是结构重排中唯一稳定的标识（重排通常只改目录层级，不改文件名）。
  //   若将来连文件名也要改，需在清单里显式给出对照（暂不支持）。
  const expandDst = (files) => {
    const out = new Map();                            // basename → [dst]
    for (const [src, dst] of files) {
      if (!src.endsWith("/")) {
        const b = path.posix.basename(dst);
        if (!out.has(b)) out.set(b, []);
        out.get(b).push(dst);
      } else {
        // 目录条目：列模板侧实际文件，推出各自的落点
        const sdir = path.join(projRoot, src);
        const walk = (d, rel) => {
          let ents;
          try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
          for (const e of ents) {
            if (e.name.startsWith(".trash")) continue;
            const r = rel ? rel + "/" + e.name : e.name;
            if (e.isDirectory()) walk(path.join(d, e.name), r);
            else {
              const b = path.posix.basename(e.name);
              const t = path.posix.join(dst.replace(/\/+$/, ""), r);
              if (!out.has(b)) out.set(b, []);
              out.get(b).push(t);
            }
          }
        };
        walk(sdir, "");
      }
    }
    return out;
  };

  const oldMap = expandDst(oldFiles);
  const newMap = expandDst(newFiles);

  const moves = [];     // { name, from, to }
  const keep = [];      // 位置已对
  const missing = [];   // 旧落点在磁盘上不存在
  const ambiguous = []; // 同名多个，配对存疑
  const gone = [];      // 旧有新无
  const added = [];     // 新有旧无

  for (const [name, olds] of oldMap) {
    const news = newMap.get(name);
    if (!news) { gone.push(...olds); continue; }

    if (olds.length === 1 && news.length === 1) {
      // 唯一匹配：直接配（最常见情形，结构重排只改目录层级）
      const from = olds[0], to = news[0];
      const absFrom = path.join(projRoot, from);
      if (!fs.existsSync(absFrom)) { missing.push(from); continue; }
      if (from === to) keep.push(from);
      else moves.push({ name, from, to });
      continue;
    }

    // 同名多个：先按「父目录也相同」精确配，配不上的才按顺序兜底。
    // 实测风险：app.js 同时存在于 framework/core、public/、项目根，
    // 纯按顺序配可能把 framework 的 app.js 搬到 public/ 去（性质完全不同）。
    const usedNew = new Set();
    const leftOld = [];
    for (const from of olds) {
      const pi = news.findIndex((t, idx) => !usedNew.has(idx) && path.posix.dirname(t) === path.posix.dirname(from));
      if (pi >= 0) {
        usedNew.add(pi);
        const to = news[pi];
        const absFrom = path.join(projRoot, from);
        if (!fs.existsSync(absFrom)) { missing.push(from); continue; }
        if (from === to) keep.push(from); else moves.push({ name, from, to });
      } else {
        leftOld.push(from);
      }
    }
    const leftNew = news.filter((_, idx) => !usedNew.has(idx));
    // 精确配对后「各剩一个」→ 只能是彼此，直接配上（不该报歧义）。
    // 实测：app.js 三处中 public/ 与根目录靠父目录配上，framework/app.js 与
    // framework/core/app.js 是剩余唯一一对——它就是要搬的那个，报歧义是误报。
    if (leftOld.length === 1 && leftNew.length === 1) {
      const from = leftOld[0], to = leftNew[0];
      const absFrom = path.join(projRoot, from);
      if (!fs.existsSync(absFrom)) missing.push(from);
      else if (from === to) keep.push(from);
      else moves.push({ name, from, to });
    } else if (leftOld.length || leftNew.length) {
      // 剩下的仍不能一一对应 → 确实拿不准，报歧义让人工核对，绝不瞎搬
      ambiguous.push({ name, olds: leftOld, news: leftNew });
    }
  }
  for (const [name, news] of newMap) {
    if (!oldMap.has(name)) added.push(...news);
  }

  const L = [];
  L.push(dry ? "结构迁移预演（未改动磁盘）" : "结构迁移（已改动磁盘）");
  L.push("  旧清单: " + oldManifestPath);
  L.push("  新清单: " + newManifestPath);
  L.push("  项目根: " + projRoot);
  L.push("  配对依据: 落点的文件名（结构重排不改文件名）");
  L.push("");

  if (moves.length) {
    L.push(`── 需移动 ${moves.length} 个 ──`);
    for (const m of moves) L.push(`  ${m.from}\n      ⇒ ${m.to}`);
    L.push("");
  }
  if (keep.length) L.push(`── 位置已正确 ${keep.length} 个 ──`);
  if (ambiguous.length) {
    L.push("");
    L.push(`── ⚠️ 同名多个，配对顺序存疑 ${ambiguous.length} 组（请人工核对）──`);
    for (const a of ambiguous) L.push(`  ${a.name}: 旧 ${a.olds.length} 个 / 新 ${a.news.length} 个`);
  }
  if (missing.length) {
    L.push("");
    L.push(`── ⚠️ 旧落点在磁盘上不存在 ${missing.length} 个（跳过）──`);
    for (const m of missing) L.push("  ? " + m);
  }
  if (gone.length) {
    L.push("");
    L.push(`── 旧有新无 ${gone.length} 个（新清单里没有它）──`);
    for (const g of gone) L.push("  - " + g);
  }
  if (added.length) {
    L.push("");
    L.push(`── 新有旧无 ${added.length} 个（新增，需 --sync 下发）──`);
    for (const a of added) L.push("  + " + a);
  }

  L.push("");
  if (!moves.length) {
    L.push("  ✅ 无需移动（落点已与新清单一致）");
  } else if (dry) {
    // 预演也要报「引用会被改写成什么样」：迁移的真实影响面 = 移动的文件
    // + 引用被改写的文件，只看前一半会低估改动（实测 gbmd 有 16 处引用
    // 分布在 14 个「不搬家」的业务文件里）。这里跑同一份改写逻辑的只读模式，
    // 保证预演与实际执行结果一致——不会出现「预演说没事、执行却改了」。
    const preview = rewriteRefsAfterMove(projRoot, newFiles, moves, true);
    if (preview.changed) {
      const byFile = new Map();
      for (const c of preview.detail) {
        if (!byFile.has(c.file)) byFile.set(c.file, []);
        byFile.get(c.file).push(c);
      }
      L.push("");
      L.push(`── 引用将被改写 ${preview.changed} 处（涉及 ${byFile.size} 个文件）──`);
      for (const [file, cs] of byFile) {
        // detail.file 记的是【改写当时】的路径（旧落点）——工作列表按迁移前
        // 的状态构建，故这里要与 m.from 比，不是 m.to（比错过一次：标记恒为 0）。
        const mv = moves.find((m) => m.from === file);
        const moved = Boolean(mv);
        L.push(`  ${file}${moved ? `（本文件也会移动 → ${mv.to}）` : ""}`);
        for (const c of cs) L.push(`      ${c.from} ⇒ ${c.to}`);
      }
    } else {
      L.push("  相对引用无需改写（都不受影响）");
    }
    if (preview.broken.length) {
      L.push("");
      L.push(`  ⚠️ 仍有 ${preview.broken.length} 处引用无法解析，需人工检查：`);
      for (const b of preview.broken) L.push(`    ${b.file}  →  ${b.ref}`);
    }
    L.push("");
    L.push(`预演结束，共 ${moves.length} 个待移动。确认无误后加 --write 执行。`);
  } else {
    let ok = 0, fail = 0;
    for (const m of moves) {
      const absFrom = path.join(projRoot, m.from);
      const absTo = path.join(projRoot, m.to);
      try {
        fs.mkdirSync(path.dirname(absTo), { recursive: true });
        fs.renameSync(absFrom, absTo);
        ok++;
      } catch (e) {
        L.push(`  ✗ 移动失败: ${m.from} (${e.message})`);
        fail++;
      }
    }
    L.push(`  已移动 ${ok} 个${fail ? "，失败 " + fail + " 个" : ""}`);

    // ---- 移动后立即改写相对引用 ----
    // 移动会把同目录的兄弟模块拆散（framework/auth.js 搬到 framework/auth/auth.js
    // 后，它原来的 require("./x") 就指不到人了）。所以「移动」与「改引用」是一件事，
    // 分两步做只会留下断链中间态。
    //
    // 两类都要改：
    //   ① 被搬文件【内部】的引用（它自己换了位置）
    //   ② 其它文件【指向】被搬文件的引用（被指的人换了位置）
    // 只做 ① 会漏掉 ②：项目 app.js 的 require("./framework") 指向已搬到
    // framework/core/ 的入口，而 app.js 自己没被搬动，于是启动时报
    // "Cannot find module './framework'"，但迁移报告一切正常（实测踩坑）。
    const refStats = rewriteRefsAfterMove(projRoot, newFiles, moves);
    if (refStats.changed) {
      L.push("");
      L.push(`  已改写相对引用 ${refStats.changed} 处（涉及 ${refStats.files} 个文件）`);
      for (const c of refStats.detail) L.push(`    ${c.file}: ${c.from} ⇒ ${c.to}`);
    } else {
      L.push("  相对引用无需改写（都不受影响）");
    }
    if (refStats.broken.length) {
      L.push("");
      L.push(`  ⚠️ 仍有 ${refStats.broken.length} 处引用无法解析，请人工检查：`);
      for (const b of refStats.broken) L.push(`    ${b.file}  →  ${b.ref}`);
    }
  }

  process.stdout.write(L.join("\n") + "\n");
  return 0;
}




/**
 * 移动后按【新落点】改写被搬文件的相对引用。
 *
 * 做法：先建立「文件名 → 项目内新落点」索引（文件名在结构重排中是稳定标识），
 * 然后对每个已落位的素材文件，解析其相对引用、按文件名找到目标新位置、
 * 重算相对路径。解析不到目标的一律不动并记入 broken，交人工判断——
 * 宁可少改，不可把引用改到错误的文件上。
 *
 * @param {string} projRoot 项目根
 * @param {Array<[string,string]>} files 新清单的 [src, dst] 列表
 * @param {Set<string>} movedPaths 本次**实际发生移动**的落点集合。
 *   关键：只改这些文件内部的引用。曾经遍历清单里所有 js，结果把不在迁移
 *   范围内的业务文件也改了——server/app.js 的 require("./routes/auth") 指向
 *   业务路由，却因文件名匹配被误改成 framework/auth/auth.js（实测事故，
 *   靠 git checkout 才还原）。清单包含素材 ≠ 素材内部引用都该按框架结构重算。
 */
/**
 * 收集「可能引用到被搬文件」的 js/cjs 清单。
 *
 * 为什么不能只按迁移清单枚举：
 *   ① 清单常用【整目录条目】（如 "server/templates/_gallery-style/server/routes/":
 *      "server/routes/"），这些目录下的文件同样会 require("../framework")，
 *      但逐文件展开不到——实测漏了它们导致启动报 "Cannot find module '../framework'"。
 *   ② 项目自己的业务代码（server/app.js、server/routes/*.js、server/lib/*.js）
 *      根本不在清单里，却同样 require 框架模块——实测 gbmd 漏了 12 个 routes 文件。
 * 故：清单逐文件 + 整目录展开 + 项目内全部 js/cjs。
 *
 * 收进来只是给它们一次机会——最终改不改由调用方的「旧落点→新落点」映射决定，
 * 引用解析不到旧落点的一律不动，不会误伤。
 */
function collectRewriteCandidates(projRoot, files) {
  const seen = new Set();
  const work = [];
  const push = (rel) => { if (!seen.has(rel)) { seen.add(rel); work.push(rel); } };

  // ① 项目内全部 js/cjs
  const walkAll = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".trash") || e.name === "node_modules" || e.name === ".git") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkAll(full);
      else if (/\.(js|cjs)$/.test(e.name)) push(path.relative(projRoot, full).split(path.sep).join("/"));
    }
  };
  walkAll(projRoot);

  // ② 清单里的整目录条目（递归展开）与逐文件条目（存在才收）
  for (const [, dst] of files) {
    if (dst.endsWith("/")) {
      const walkDir = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (e.name.startsWith(".trash") || e.name === "node_modules") continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walkDir(full);
          else if (/\.(js|cjs)$/.test(e.name)) push(path.relative(projRoot, full).split(path.sep).join("/"));
        }
      };
      walkDir(path.join(projRoot, dst.replace(/\/+$/, "")));
    } else if (/\.(js|cjs)$/.test(dst) && fs.existsSync(path.join(projRoot, dst))) {
      push(dst);
    }
  }
  return work;
}

/**
 * 决定一条相对引用该改成什么（不改则返回 newRef=null）。
 *
 * 两种改法，都不靠硬编码路径规则，而是从「旧落点 → 新落点」映射推出来：
 *   ① 引用指向的东西被搬走了（映射里查得到）→ 改指新落点。
 *      引用可能是文件，也可能是个目录（require("./framework") 指向
 *      framework/index.js）——目录情形必须补 /index.js 再查映射，
 *      否则入口引用漏改，项目启动直接 "Cannot find module './framework'"。
 *   ② 文件自身被搬动、且原引用已失效（兄弟模块被拆散）→ 同名文件唯一时改指它。
 *
 * 返回 { newRef, broken }：newRef=null 表示不改；broken=true 表示原引用
 * 已解析不了且没找到落点，交给调用方记为待人工检查。
 */
function decideNewRef(ref, ctx) {
  const { projRoot, fromFile, oldToNew, byName, movedTo } = ctx;
  const dir = path.posix.dirname(fromFile);
  const asIs = path.posix.normalize(path.posix.join(dir, ref.replace(/^\.\//, "")));
  const candidates = [asIs, asIs + ".js", asIs + ".cjs", asIs + "/index.js"];
  const resolves = () => candidates.some((c) => fs.existsSync(path.join(projRoot, c)));

  let newRef = null;
  const hitKey = [...candidates, asIs + "/index.cjs"].find((k) => oldToNew.has(k));
  if (hitKey) {
    newRef = relBetween(dir, oldToNew.get(hitKey));
  } else if (movedTo.has(fromFile)) {
    const base = path.posix.basename(ref);
    const cand = base.endsWith(".js") || base.endsWith(".cjs") ? base : base + ".js";
    const targets = byName.get(cand) || byName.get(base);
    if (targets && targets.length === 1 && !resolves()) newRef = relBetween(dir, targets[0]);
  }

  // 等价写法（只差 .js 后缀）不算改动，避免无意义 diff
  if (newRef && !path.posix.extname(ref) && path.posix.extname(newRef)) {
    const noExt = newRef.slice(0, -path.posix.extname(newRef).length);
    if (noExt === ref) newRef = null;
  }
  // 改不动时：若原引用本就解析不了，记为待人工检查
  const broken = (!newRef || newRef === ref) && movedTo.has(fromFile) && !resolves();
  return { newRef, broken };
}

/**
 * 把注释替换成等长空白，保留偏移量。
 *
 * 为什么按「等长空白」而不是直接删掉：下面要靠 m.index 定位并做切片替换，
 * 长度一变偏移就全错位了。剥注释是为了避免把注释里的示例 require
 * 当成真依赖去改（实测踩过：注释里写着 require("./framework") 的用法示例）。
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, (m0, p1) => (
      " ".repeat(m0.length - p1.length) === "" ? m0 : p1 + " ".repeat(m0.length - p1.length)
    ));
}

/**
 * 建迁移索引，供引用改写判断用：
 *   byName    文件名 → 新落点列表（结构重排不改文件名，故按名配；同名的会有多个，
 *             调用方只在唯一时才敢按名改）
 *   oldToNew  旧落点 → 新落点（判断「引用指向的东西是否被搬走」）
 *   movedTo   新落点集合（判断「这个文件自身是否搬过」）
 */
function buildMoveIndex(files, moves) {
  const byName = new Map();
  for (const [, dst] of files) {
    if (dst.endsWith("/")) continue;
    const base = path.posix.basename(dst);
    if (!byName.has(base)) byName.set(base, []);
    byName.get(base).push(dst);
  }
  const oldToNew = new Map();
  for (const mv of moves) oldToNew.set(mv.from, mv.to);
  const movedTo = new Set(moves.map((mv) => mv.to));
  return { byName, oldToNew, movedTo };
}

function rewriteRefsAfterMove(projRoot, files, moves, dry = false) {
  const { byName, oldToNew, movedTo } = buildMoveIndex(files, moves);
  const work = collectRewriteCandidates(projRoot, files);

  const detail = [];
  const broken = [];
  let changed = 0, filesTouched = 0;

  for (const dst of work) {
    const abs = path.join(projRoot, dst);
    const text = fs.readFileSync(abs, "utf8");
    const stripped = stripComments(text);

    const re = /(require\(\s*["'])(\.[^"']+)(["']\s*\))/g;
    let m;
    const edits = [];
    while ((m = re.exec(stripped)) !== null) {
      const ref = m[2];
      const decision = decideNewRef(ref, {
        projRoot, fromFile: dst, oldToNew, byName, movedTo,
      });
      if (decision.broken) broken.push({ file: dst, ref });
      if (!decision.newRef || decision.newRef === ref) continue;
      edits.push({ from: ref, to: decision.newRef, start: m.index + m[1].length, len: ref.length });
    }

    if (!edits.length) continue;
    let newText = text;
    edits.sort((a, b) => b.start - a.start);
    for (const e of edits) {
      newText = newText.slice(0, e.start) + e.to + newText.slice(e.start + e.len);
      detail.push({ file: dst, from: e.from, to: e.to });
      changed++;
    }
    if (!dry) fs.writeFileSync(abs, newText, "utf8");
    filesTouched++;
  }
  return { changed, files: filesTouched, detail, broken };
}

/** 从目录 dirRel 到文件 toRel 的相对引用（带 ./ 前缀） */
function relBetween(dirRel, toRel) {
  let r = path.posix.relative(dirRel, toRel);
  if (!r.startsWith(".")) r = "./" + r;
  return r;
}

// ---- untracked：找出「清单目录下存在、但清单没提到」的文件 ----
//
// 与 check 的「孤儿」区别（故本条独立、check 不再重复报）：
//   check 只扫【清单目标涉及的顶层目录】，且只比对两端的 md5/存在性；
//   本命令扫【清单所在目录的整棵树】，靠 .gitignore 排除无关文件
//  （.git/、node_modules/、构建产物、截图、本地配置……）。
//   前者用于「清单与素材是否同步」，后者用于「项目里还有什么没进清单」。
//
// 忽略规则复用 .gitignore：不自己实现匹配（gitignore 语义有几十个边角，
// 自实现必然漂移），直接调 `git check-ignore` 让 git 自己判定。
//   无 git、非仓库、或无 .gitignore 时优雅降级为「不忽略任何文件」并提示。
//
// 用法：assemble-manifest untracked <清单> [项目根] [--json]
function cmdUntracked(manifestPath, projectRootArg, opts = {}) {
  const { files } = loadManifest(manifestPath);
  const projAbs = path.resolve(projectRootArg || path.dirname(path.resolve(manifestPath)));

  // 清单认领的相对路径集合
  //   - 单文件条目：记其 dst
  //   - 目录条目：按该目录展开项目侧实际文件（整目录下发时，目录下都算已认领）
  const claimed = new Set();
  const claimedDirs = [];
  for (const [src, dst] of files) {
    const d = dst.replace(/^\/+/, "");
    if (src.endsWith("/")) claimedDirs.push(d.replace(/\/+$/, ""));
    else claimed.add(d);
  }
  const isClaimed = (rel) => {
    if (claimed.has(rel)) return true;
    for (const cd of claimedDirs) if (rel === cd || rel.startsWith(cd + "/")) return true;
    return false;
  };

  // .gitignore 判定：把候选批量交给 git check-ignore 一次问完
  //   --stdin 逐行喂相对路径，被忽略的会原样回显
  function gitIgnored(relPaths) {
    const { execFileSync } = require("child_process");
    const ignored = new Set();
    if (!relPaths.length) return { ignored, ok: true, reason: "" };
    for (const bin of ["git"]) {
      try {
        const out = execFileSync(bin, ["-C", projAbs, "check-ignore", "--stdin"], {
          input: relPaths.join("\n") + "\n",
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        });
        for (const line of String(out).split("\n")) {
          const t = line.trim();
          if (t) ignored.add(t);
        }
        return { ignored, ok: true, reason: "" };
      } catch (e) {
        // check-ignore 的退出码语义：0 = 至少有一个被忽略；1 = 全都没被忽略。
        // **1 是正常结果，不是失败**——早期这里把它当成 git 不可用，
        // 于是「一个都没忽略」的项目反而报「未能应用 .gitignore」（实测踩坑）。
        // 只有 128（git 自身出错）或非 git 仓库才真的降级。
        const code = e && typeof e.status === "number" ? e.status : null;
        if (code === 0 || code === 1) {
          for (const line of String((e && e.stdout) || "").split("\n")) {
            const t = line.trim();
            if (t) ignored.add(t);
          }
          return { ignored, ok: true, reason: "" };
        }
        return { ignored, ok: false, reason: (e && e.message) || String(e) };
      }
    }
    return { ignored, ok: false, reason: "git 不可用" };
  }

  // 扫描整棵树（跳过 .git 自身，它是版本库元数据不是项目文件）
  const all = [];
  const walk = (dir, prefix) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === ".git") continue;
      const rel = prefix ? prefix + "/" + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), rel);
      else all.push(rel);
    }
  };
  walk(projAbs, "");

  const notInManifest = all.filter((rel) => !isClaimed(rel));
  const gi = gitIgnored(notInManifest);
  let untracked = gi.ok ? notInManifest.filter((rel) => !gi.ignored.has(rel)) : notInManifest;
  const ignoredCount = gi.ok ? notInManifest.length - untracked.length : 0;

  // 仅排除 3 个项目自有元文件——它们的「不在清单」是必然的，报出来只会淹没信号。
  // 不识别 setup.sh 生成物（brand.json / app.js / config.schema.json）：
  // 这些文件通不通用取决于各项目自己的清单（实测三个项目 init 均为 false，
  // 该分支从未生效），按固定名单排除等于替项目做假设，换个项目就不对。
  // 也不做「模板是否有同名文件」对照：同名不同物是常态，且用 diff 一行就能得到确定答案。
  const ALWAYS_SKIP = new Set([".gitignore", "README.md", "assemble.json"]);
  const excluded = [];
  untracked = untracked.filter((rel) => {
    if (ALWAYS_SKIP.has(rel)) { excluded.push(rel); return false; }
    return true;
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      manifest: manifestPath,
      root: projAbs,
      scanned: all.length,
      claimed: all.length - notInManifest.length,
      ignoredByGitignore: ignoredCount,
      gitignoreApplied: gi.ok,
      excludedByRule: excluded,
      untracked,
    }, null, 2) + "\n");
    return 0;
  }

  const L = [];
  L.push("清单外文件扫描");
  L.push("  清单: " + manifestPath);
  L.push("  目录: " + projAbs);
  L.push("  扫描: " + all.length + " 个文件（含子目录）");
  L.push("  清单内: " + (all.length - notInManifest.length) + " 个");
  L.push("");
  if (!gi.ok) {
    L.push("  ⚠️ 未能应用 .gitignore（" + gi.reason + "），以下结果未排除被忽略的文件");
    L.push("");
  } else {
    L.push("  按 .gitignore 忽略: " + ignoredCount + " 个（不计入清单外）");
    L.push("");
  }
  if (excluded.length) {
    L.push(`  已排除 ${excluded.length} 个项目自有元文件：${excluded.join(", ")}`);
    L.push("");
  }
  if (untracked.length) {
    L.push(`── 清单外文件 ${untracked.length} 个 ──`);
    for (const u of untracked) L.push("  ? " + u);
  } else {
    L.push("  ✅ 没有清单外文件（目录下所有文件都已被清单覆盖）");
  }
  process.stdout.write(L.join("\n") + "\n");
  return untracked.length ? 1 : 0;
}


module.exports = { loadManifest, resolveBase, assetRoots, assetRootOf, isCommentKey, cmdCheck, cmdMigrate, cmdUntracked };
