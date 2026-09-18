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

function cmdValidate(manifestPath, base) {
  const { files, manifest } = loadManifest(manifestPath);
  const problems = [];
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
          problems.push(
            `目标 ${dst} 被多个源写入且存在同名文件（后写覆盖）: ` +
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
  if (problems.length) {
    for (const p of problems) process.stderr.write(`  ⚠️ ${p}\n`);
    return 1;
  }
  process.stdout.write("  ✅ 清单结构正常\n");
  return 0;
}

// ---------------------------------------------------------------- 入口

function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "resolve-base":
      if (!rest[0]) die("用法: assemble-manifest resolve-base <探测目录>");
      process.stdout.write(resolveBase(rest[0]) + "\n");
      return 0;

    case "asset-roots":
      if (!rest[0]) die("用法: assemble-manifest asset-roots <清单>");
      for (const r of assetRoots(rest[0])) process.stdout.write(r + "\n");
      return 0;

    case "list": {
      if (!rest[0]) die("用法: assemble-manifest list <清单> [--check-base=DIR]");
      const opts = {};
      for (const a of rest.slice(1)) {
        if (a.startsWith("--check-base=")) opts.checkBase = a.slice("--check-base=".length);
      }
      return cmdList(rest[0], opts);
    }

    case "brand":
      if (!rest[0] || !rest[1]) die("用法: assemble-manifest brand <清单> <输出路径>");
      return cmdBrand(rest[0], rest[1]);

    case "init-flag": {
      if (!rest[0]) die("用法: assemble-manifest init-flag <清单>");
      try {
        process.stdout.write(loadManifest(rest[0]).init ? "1\n" : "0\n");
      } catch {
        process.stdout.write("1\n");               // 读不了时按既有行为回落为 1
      }
      return 0;
    }

    case "validate":
      if (!rest[0]) die("用法: assemble-manifest validate <清单> [<基准>]");
      return cmdValidate(rest[0], rest[1] || ".");

    default:
      die(
        "assemble-manifest —— 清单解析唯一实现\n" +
        "用法: assemble-manifest <命令> [参数]\n" +
        "命令: resolve-base | asset-roots | list | brand | init-flag | validate"
      );
  }
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { loadManifest, resolveBase, assetRoots, assetRootOf, isCommentKey };
