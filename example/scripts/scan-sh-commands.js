#!/usr/bin/env node
// ============================================================
// 扫描 sh 脚本里的「命令」，输出命令清单 JSON
//
// 背景：
//   setup.sh / start.sh 这类脚本的用法散在注释里——「常用命令」段落写几条、
//   正文里再零散写几条，想知道「这堆脚本一共有哪些命令可用、各自干什么」，
//   只能人肉通读。脚本一多（本仓 test/ 下就有 7 个 .test.sh）就没人看得全。
//
//   本脚本把命令提成一份 JSON：**命令原文当 key，脚本里那句注释当 value**，
//   注释直接复用脚本自己写的（不另起炉灶措辞），所以清单与脚本永远同源。
//
// 用法：
//   node scripts/scan-sh-commands.js [目录...] [选项]
//   目录缺省 = 仓库根（脚本自己按 __dirname 上推，与调用位置无关）。
//
// 选项：
//   --out=<文件>   写进文件（缺省打印到 stdout）
//   --json         纯 JSON 输出（缺省带一层人读摘要）
//   --quiet        只输出结论行
//
// ── 提取哪两类命令 ──────────────────────────────────────
//   1) 用法命令（usage）：注释里写的调用形态，如
//        #   ./setup.sh --to <项目清单> --check    检查：清单两端是否同步
//      key = ./setup.sh --to <项目清单> --check（归一化：开头的 ./ 忽略，
//            即 `./setup.sh --to ...` 与 `setup.sh --to ...` 视为同一条命令）
//      val = 检查：清单两端是否同步
//      这类是「脚本对外承诺的命令」，最有用。
//   2) 外部命令（tool）：脚本正文实际调用的外部程序（node/curl/git/cp/...），
//      key = 程序名，val = 该行上方或行尾的注释（没有则留空）。
//      这类回答「跑这些脚本，环境里得有什么」。
//
// ── 值（注释）怎么取 ────────────────────────────────────
//   一律复用脚本自己的注释，不生成新措辞：
//     · 用法命令：取同行注释里**命令之后**的描述（冒号/多个空格分隔）
//     · 外部命令：优先取紧邻上方连续注释块的最后一行，其次取行尾注释
//   取不到就留空字符串——宁可空，也不编。
//
// 退出码：恒 0（这是信息性工具，不是门禁；发现什么由调用方判断）
// ============================================================
"use strict";

const fs = require("fs");
const path = require("path");

// 脚本里可能调用的外部程序。列为白名单而非「所有单词」，
// 是为了避免把变量名、函数名、参数当成命令（噪声极大，实测不可用）。
const TOOL_WHITELIST = [
  "node", "npm", "npx", "pnpm",
  "python", "python3", "pip", "pip3",
  "curl", "wget", "git", "rsync", "ssh", "scp", "sftp",
  "cp", "mv", "rm", "mkdir", "rmdir", "ln", "touch", "chmod", "chown",
  "find", "grep", "sed", "awk", "sort", "uniq", "head", "tail", "wc",
  "cat", "tee", "cut", "tr", "xargs", "basename", "dirname", "realpath", "readlink",
  "tar", "zip", "unzip", "7z", "gzip", "gunzip", "gzip",
  "kill", "pkill", "ps", "nohup", "setsid", "timeout", "sleep", "seq", "date",
  "command", "which", "type", "readlink", "diff", "md5sum", "shasum", "cmp",
  "docker", "systemctl", "launchctl", "brew", "apt", "apt-get", "yum", "apk",
  "sqlite3", "jq", "openssl", "ssh-keygen", "lsof", "netstat", "ss",
  "node_modules", "env", "export", "source", "sh", "bash", "zsh",
];
// 去重（上面为可读性分组，允许重复项）
const TOOLS = new Set(TOOL_WHITELIST);

// 不是「外部命令」的 shell 内建/关键字，避免误报
const SHELL_BUILTINS = new Set([
  "export", "source", "env", "sh", "bash", "zsh", "node_modules",
]);

const COMMENT_PREFIX = "#";

/** 读一个文件的行数组；读不到返回 null */
function readLines(file) {
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/);
  } catch (_) {
    return null;
  }
}

/** 该行是否注释行（# 开头，允许前导空白；排除 shebang） */
function isComment(line) {
  const t = line.trim();
  return t.startsWith(COMMENT_PREFIX) && !t.startsWith("#!");
}

/** 去掉注释前缀，返回注释正文 */
function commentBody(line) {
  return line.trim().replace(/^#+\s?/, "").trim();
}

/**
 * 从一行注释里抽「用法命令」。
 * 形态：`./setup.sh --to <项目清单> --check    检查：清单两端是否同步`
 *   → { cmd: "./setup.sh --to <项目清单> --check", desc: "检查：清单两端是否同步" }
 *
 * 必须是**真的调用形态**，不能只是提到了某个 .sh 文件名——否则散文句会被
 * 当成命令吸进来（实测：「setup.sh 参数契约」「lib-node.sh —— Node 可执行
 * 文件定位」都被当成命令，还会顶掉真正的说明）。判据（满足其一即可）：
 *   · 以 ./ 开头（仓库里的惯例写法）
 *   · 以 bash / sh 开头
 *   · 纯脚本名开头且后面跟参数（`setup.sh --to ...`）——即脚本名后紧跟空白+参数
 * 「脚本名 + 中文/空格 + 散文」不算。
 */
function parseUsageFromComment(body) {
  // 先切出「命令部分」：到第一个 2+ 空格或全角空格为止
  const m = body.match(/^(.+?)(?:\s{2,}|\u3000+)(.*)$/);
  const rawCmd = (m ? m[1] : body).trim();
  let desc = (m ? m[2] : "").trim().replace(/^#+\s*/, "").trim();

  const cmd = rawCmd;
  // ── 判据：必须像一次真的调用 ──
  // ① ./ 开头（仓库惯例）
  const isDot = /^\.\//.test(cmd);
  // ② bash | sh | zsh 开头
  const isInterp = /^(?:bash|sh|zsh)\s+\S/.test(cmd);
  // ③ 裸脚本名 + 参数：`setup.sh --to ...` / `start.sh restart`
  //    关键：脚本名之后必须紧跟「以 - 开头的选项」或「单独的子命令词」，
  //    不能是中文散文。参数里允许出现 <占位符> 这类中文（如 <项目清单>）。
  const mBare = cmd.match(/^([\w.-]+\.(?:sh|cjs|js|py|mjs))(\s+.*)?$/);
  let isBare = false;
  if (mBare) {
    const rest = (mBare[2] || "").trim();
    if (rest) {
      // 首个 token 必须像选项或子命令：--xx / -x / 纯小写单词
      const first = rest.split(/\s+/)[0];
      isBare = /^-{1,2}[\w-]+/.test(first) || /^[a-z][a-z0-9-]*$/.test(first);
    }
  }
  if (!isDot && !isInterp && !isBare) return null;

  // ④ 排除「文件名出现在句中」的散文（如 `setup.sh 参数契约`）：
  //    条件是脚本名后直接跟中文，且不是参数形态 —— isBare 的 first-token
  //    判据已挡掉大部分；这里再挡「脚本名 + 空格 + 中文」且无选项的情况。
  const mNameThenCjk = cmd.match(/^[\w.-]+\.(?:sh|cjs|js|py|mjs)\s+[\u4e00-\u9fa5]/);
  if (mNameThenCjk && !/^-{1,2}|--/.test(cmd)) return null;

  if (!cmd) return null;
  desc = desc.replace(/^[,，]\s*/, "");
  // 归一化：`./a.sh --x` 与 `a.sh --x` 是同一条命令（./ 有无不影响命令身份）。
  // 否则同一命令因写法不同会变成两个 key，文档比对时也会因 ./ 有无而误报不一致。
  return { cmd: cmd.replace(/^\.\//, ""), desc };
}

/**
 * 抽一行里实际调用的外部命令名。
 * 只看行首或管道/&&/;/| 之后的第一个词，避免把 `echo node` 里的 node 当调用。
 */
function parseToolFromLine(line) {
  const code = stripStringLiterals(line);
  const found = [];
  // 命令位置：行首、或 ; && || | ( ` $( { 之后
  const re = /(?:^|[;&|(`]|\$\()\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*([A-Za-z_][\w.-]*)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const name = m[1];
    if (TOOLS.has(name) && !SHELL_BUILTINS.has(name)) found.push(name);
  }
  return found;
}

/** 去掉字符串字面量与注释，避免把文本里的词当命令 */
function stripStringLiterals(line) {
  return line
    .replace(/(^|[^\\])#.*$/, "$1")        // 行尾注释
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""');
}

/**
 * 取「紧邻上方」的注释——只认**上一行**就是注释的情况。
 *
 * 为什么不像整块回溯：实测会把无关的段落标题当成命令说明
 * （`find` 的值取到了「判据③：模板仓库的内容摘要索引」、`cut` 取到了 netstat
 * 解析说明），产出看着像注释、实则驴唇不对马嘴——这种错误值比空值更坏，
 * 因为看的人会信。宁可留空。
 *
 * 只认紧邻一行仍有残余噪声：长注释段的**末行**常常是段落的收尾句
 * （单独看不知所云，如「否则…会再次造成假阳性。」）。这类收尾句有一些
 * 共同特征（以「否则/因此/所以/即/也就是」等连接词起头、或以句号结尾且很短），
 * 命中就不取——同样是「宁可空，不可错」。
 */
const CONTINUATION_HEAD = /^(?:否则|反之|因此|所以|即|也就是|也就是说|换言之|这样|这样一来|于是|另外|同时|此外|注[:：]|例如|比如|实测|结果|原因|说明[:：])/;

function inlinePrecedingComment(lines, idx) {
  const prev = idx - 1;
  if (prev < 0) return "";
  const l = lines[prev];
  if (!isComment(l)) return "";
  const b = commentBody(l);
  if (!b || /^[=\-─★\s]+$/.test(b)) return "";
  if (CONTINUATION_HEAD.test(b)) return "";
  return b;
}

/** 取行尾注释正文 */
function trailingComment(line) {
  // 找注释起始位置（跳过字符串里的 #），再取其后的正文。
  // 注意：不能用「先剥掉注释再正则找 #」——剥完就没有 # 了，永远匹配不到
  // （曾因此让所有行尾注释都取成空，属于静默失效）。
  const idx = commentStart(line);
  if (idx < 0) return "";
  return line.slice(idx).replace(/^#+\s*/, "").trim();
}

/** 返回行尾注释的起始下标（# 的位置），没有则 -1。跳过字符串内的 # */
function commentStart(line) {
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === "#" && !inS && !inD) {
      // # 前是空白或行首才算注释（排除 ${#var} 之类的参数展开）
      if (i === 0 || /\s/.test(line[i - 1])) return i;
      return -1;
    }
  }
  return -1;
}

/** 行尾注释：需排除 # 出现在字符串里的情况 */
function stripTrailingAware(line) {
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === "#" && !inS && !inD) {
      // # 前是空白或行首才算注释
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i);
      return line;
    }
  }
  return line;
}

/**
 * 扫一个 sh 文件，提取命令清单。
 * @returns {{usage: Object, tools: Object}} usage/tools 均为 {命令: 注释}
 */
function scanFile(file) {
  const lines = readLines(file);
  if (!lines) return { usage: {}, tools: {} };

  const usage = {};
  const tools = {};

  lines.forEach((line, idx) => {
    // ---- 1) 用法命令 ----
    if (isComment(line)) {
      const body = commentBody(line);
      const u = parseUsageFromComment(body);
      if (u && u.cmd) {
        // 同 key 出现多次时保留第一条（先写的通常是权威说明）
        if (!(u.cmd in usage)) usage[u.cmd] = u.desc;
      }
      return;
    }
    // ---- 2) 外部命令 ----
    if (line.trim() === "") return;
    for (const name of parseToolFromLine(line)) {
      if (name in tools) continue;
      const desc = inlinePrecedingComment(lines, idx) || trailingComment(line);
      tools[name] = desc;
    }
  });

  return { usage, tools };
}

/** 收集要扫的 .sh 文件，排除 .trash/（回收站）与 node_modules */
function collectShFiles(root) {
  const out = [];
  const SKIP = new Set([".git", "node_modules", ".trash", "vendor"]);
  (function walk(dir) {
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP.has(e.name)) continue;
        walk(p);
      } else if (e.isFile() && e.name.endsWith(".sh")) {
        out.push(p);
      }
    }
  })(root);
  return out.sort();
}

function parseArgs(argv) {
  const opts = { dirs: [], out: "", json: false, quiet: false };
  for (const a of argv) {
    if (a === "--json") opts.json = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a.startsWith("--out=")) opts.out = a.slice("--out=".length);
    else if (a.startsWith("-")) {
      console.error(`未知参数: ${a}`);
      process.exit(2);
    } else opts.dirs.push(a);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, "..");
  const dirs = opts.dirs.length ? opts.dirs.map((d) => path.resolve(d)) : [root];

  const files = [];
  for (const d of dirs) {
    if (!fs.existsSync(d)) {
      console.error(`❌ 路径不存在: ${d}`);
      process.exit(2);
    }
    const st = fs.statSync(d);
    if (st.isFile()) files.push(d);
    else files.push(...collectShFiles(d));
  }

  // 汇总：命令 → 注释；同时记录命令出自哪些脚本（同 key 取首次出现的注释）
  const usage = {};
  const tools = {};
  const where = {};
  for (const f of files) {
    const rel = path.relative(root, f) || path.basename(f);
    const r = scanFile(f);
    for (const [k, v] of Object.entries(r.usage)) {
      if (!(k in usage)) { usage[k] = v; where[k] = rel; }
    }
    for (const [k, v] of Object.entries(r.tools)) {
      if (!(k in tools)) { tools[k] = v; where[k] = rel; }
    }
  }

  // 输出结构：key = 命令，value = 注释（输出形态由调用参数指定）
  const usageOut = {};
  for (const k of Object.keys(usage).sort()) usageOut[k] = usage[k];

  const toolsOut = {};
  for (const k of Object.keys(tools).sort()) {
    // 外部命令的值：有注释用注释，没有则留空（不编造）
    toolsOut[k] = tools[k] || "";
  }

  const payload = {
    _comment: [
      "sh 脚本命令清单（由 scripts/scan-sh-commands.js 生成）",
      "键 = 命令，值 = 脚本里那句注释（原样复用，不另起措辞）",
      "usage = 脚本对外承诺的用法命令；tools = 实际调用的外部程序",
      "注释为空 = 脚本里没写说明，不是漏扫",
    ],
    scannedAt: new Date().toISOString().slice(0, 10),
    files: files.map((f) => path.relative(root, f) || path.basename(f)).sort(),
    usage: usageOut,
    tools: toolsOut,
  };

  const text = JSON.stringify(payload, null, 2);
  if (opts.out) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true }); // --out 目录不存在时先建
    fs.writeFileSync(opts.out, text + "\n", "utf8");
    if (!opts.quiet) {
      console.log(`✅ 已写出 ${opts.out}`);
      console.log(`   脚本 ${files.length} 个 / 用法命令 ${Object.keys(usageOut).length} 条 / 外部命令 ${Object.keys(toolsOut).length} 条`);
    }
    return;
  }
  if (opts.json || opts.quiet) {
    console.log(text);
    return;
  }
  console.log(text);
}

main();
