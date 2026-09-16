#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
routes 模板化转换：register(api) 形态 → createRoute 表式导出

处理内容：
  1. 头部 require 改写：从 api 注入的业务依赖改为直接 require
  2. route("M","/p",handler) → createRoute({ "M /p": handler }) 的键
  3. routePublic("M","/p",handler) → 收集到 module.exports.public
  4. sendJson(res, STATUS, expr) → sendJson(res, expr, STATUS)
  5. (req, res, parsed) → (req, res, ctx)；parsed.query → ctx.query

用法：
  python3 to-create-route.py <文件> [--dry-run]

说明：转换后必须逐文件 node --check + 人工复核（脚本只做机械变换）。
"""
import re
import sys

# 业务依赖 → 直接 require 的映射（gbmd 专用）
DEPS_REQUIRE = {
    "cfg":          'const cfg = require("../config");',
    "auth":         'const auth = require("../auth");',
    "gbApi":        'const gbApi = require("../lib/gb-api");',
    "downloader":   'const downloader = require("../lib/downloader");',
    "search":       'const search = require("../lib/search");',
    "searchDateRange": 'const searchDateRange = require("../lib/search-date-range.cjs");',
    "mergeDirs":    'const mergeDirs = require("../lib/merge-dirs");',
    "dataBackup":   'const dataBackup = require("../lib/data-backup");',
    "hashIndex":    'const hashIndex = require("../lib/hash-index");',
    "incompleteScan": 'const incompleteScan = require("../lib/incomplete-scan");',
    "autoUpdate":   'const autoUpdate = require("../lib/auto-update");',
    "cleanCookie":  None,   # 来自 framework
    "isBrowsableDir": None, # 来自 utils/path-safe
    "isBlocked":    None,
    "sendJson":     None,
    "readBody":     None,
    "route":        None,
    "routePublic":  None,
    "fs":           None,
    "path":         None,
    "os":           None,
    "setSessionCookie": None,  # 项目侧 app.js 提供 → 改为本地实现或参数
}

SETS = {"sendJson", "readBody", "cleanCookie"}          # ← require("../framework")
UTILS = {"isBrowsableDir", "isBlocked"}                  # ← require("../utils/path-safe")

PAT_SENDJSON = re.compile(r'sendJson\(\s*res\s*,\s*(\d{3})\s*,\s*')


def balance(text, start):
    """从 start 起找到开括号并配平到对应闭合（支持嵌套/字符串）。
    注意：调用方应传 sendJson 的 '(' 位置；若传空白/对象位置会取到错误括号。"""
    # 只向前跳过空白，命中第一个括号（调用方保证该位置就是 sendJson 的 '('）
    i = start
    while i < len(text) and text[i] in " \t\r\n":
        i += 1
    if i >= len(text) or text[i] not in "({[":
        return -1
    start = i
    open_ch = text[start]
    close_ch = ")" if open_ch == "(" else "}"
    depth = 0
    i = start
    in_str = None
    while i < len(text):
        c = text[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == in_str:
                in_str = None
        else:
            if c in "\"'`":
                in_str = c
            elif c == open_ch:
                depth += 1
            elif c == close_ch:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1


def fix_sendjson(src):
    out, i, n = [], 0, 0
    while True:
        m = PAT_SENDJSON.search(src, i)
        if not m:
            out.append(src[i:])
            break
        out.append(src[i:m.start()])
        status = m.group(1)
        # sendJson 的 '(' 位于匹配起点 + len("sendJson")
        k = balance(src, m.start() + len("sendJson"))
        if k < 0:
            # 配平失败：原样保留，避免死循环（后续人工复核）
            out.append(src[m.start():m.end()])
            i = m.end()
            continue
        inner = src[m.end():k].strip()   # k 指向 sendJson 的闭合 ')'，不含它
        out.append("sendJson(res, %s, %s)" % (inner, status))
        n += 1
        i = k + 1
    return "".join(out), n


def convert(fp, dry=False):
    src = open(fp, encoding="utf-8").read()
    report = {"sendjson": 0, "routes": 0, "public": 0}

    # --- 1. 解析 deps ---
    m = re.search(r'module\.exports\s*=\s*function\s*(?:register)?\s*\(\s*api\s*\)\s*\{\s*\n\s*const\s*\{([^}]*)\}\s*=\s*api;', src)
    if not m:
        return None
    deps = [d.strip() for d in m.group(1).split(",") if d.strip()]
    api_block = m.group(0)

    # --- 2. 收集 route / routePublic 调用并改写为对象键 ---
    body = src[m.end():]

    # register 函数体结束于第一处顶格（2空格缩进的收尾）"};" —— 其后是模块级辅助函数，
    # 必须原样保留（工厂函数等）。用「顶层缩进为 0 的 }」定位 register 闭合。
    reg_end = None
    for mm in re.finditer(r'(?m)^\};[ \t]*$', body):
        reg_end = mm.start()
        break
    if reg_end is not None:
        register_body = body[:reg_end].rstrip()
        tail_code = body[reg_end + 2:].lstrip("\n")   # 去掉 "};" 及其后换行
    else:
        register_body = body.rstrip()
        if register_body.endswith("};"):
            register_body = register_body[:-2].rstrip()
        elif register_body.endswith("}"):
            register_body = register_body[:-1].rstrip()
        tail_code = ""

    body_stripped = register_body

    entries_routes, entries_public = [], []
    lines = body_stripped.split("\n")
    out_lines, i = [], 0
    while i < len(lines):
        line = lines[i]
        mm = re.match(r'^([ \t]*)route(Public)?\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(.*)$', line)
        if not mm:
            out_lines.append(line)
            i += 1
            continue
        indent, is_pub, method, path, rest = mm.group(1), bool(mm.group(2)), mm.group(3), mm.group(4), mm.group(5)
        # 收集 handler 直到语句结束（行尾出现 ");" 且花括号配平）
        chunk = [rest]
        joined = rest
        while True:
            br = joined.count("{") - joined.count("}")
            if joined.rstrip().endswith(");") and br <= 0:
                break
            i += 1
            if i >= len(lines):
                break
            chunk.append(lines[i])
            joined = "\n".join(chunk)
        joined = joined.rstrip()
        if joined.endswith(");"):
            joined = joined[:-2].rstrip()
        handler = joined
        key = '"%s %s": %s' % (method, path, handler)
        out_lines.append(indent + key + ",")
        (entries_public if is_pub else entries_routes).append(key)
        i += 1

    body_new = "\n".join(out_lines)
    report["routes"] = len(entries_routes)
    report["public"] = len(entries_public)

    # --- 3. sendJson 调序 + parsed→ctx（对整个文件做，含 register 体与尾部工厂函数）---
    body_new, n = fix_sendjson(body_new)
    tail_code, n2 = fix_sendjson(tail_code) if tail_code else ("", 0)
    tail_code = re.sub(r'\(req,\s*res,\s*parsed\)', '(req, res, ctx)', tail_code)
    tail_code = tail_code.replace('parsed.query', 'ctx.query').replace('parsed.pathname', 'ctx.pathname')
    report["sendjson"] = n + n2
    body_new = re.sub(r'\(req,\s*res,\s*parsed\)', '(req, res, ctx)', body_new)
    body_new = body_new.replace('parsed.query', 'ctx.query').replace('parsed.pathname', 'ctx.pathname')

    # --- 4. 拼装新文件 ---
    fw_names = sorted(SETS & set(deps))
    util_names = sorted(UTILS & set(deps))
    reqs = []
    if entries_routes or entries_public:
        # 只引入实际用到的 framework 符号（避免无用 require）
        used = [n for n in ("sendJson", "readBody", "cleanCookie") if n in set(deps)]
        syms = ["createRoute"] + used
        reqs.append('const { %s } = require("../framework");' % ", ".join(syms))
    elif fw_names:
        used = [n for n in ("sendJson", "readBody", "cleanCookie") if n in set(deps)]
        if used:
            reqs.append('const { %s } = require("../framework");' % ", ".join(used))
    for d in deps:
        line = DEPS_REQUIRE.get(d)
        if line and line not in reqs:
            reqs.append(line)
    if util_names:
        reqs.append('const { %s } = require("../utils/path-safe");' % ", ".join(util_names))
    if "fs" in deps:
        reqs.append('const fs = require("fs");')
    if "path" in deps:
        reqs.append('const path = require("path");')
    if "os" in deps:
        reqs.append('const os = require("os");')

    # 头部注释（保留原注释块）
    head_end = src.find('"use strict";')
    head = src[:head_end + len('"use strict";')] if head_end >= 0 else '"use strict";'

    out = head + "\n\n" + "\n".join(reqs) + "\n"
    if entries_routes or entries_public:
        out += "\nmodule.exports = createRoute({\n" + body_new + "\n});\n"
    else:
        out += "\n" + body_new + "\n"
    if entries_public:
        pub_pairs = []
        for k in entries_public:
            pub_pairs.append("  " + k + ",")
        out += "\n// 公开路由（未登录可访问）：app.js 组装到 publicRoutes 白名单\n"
        out += "module.exports.public = createRoute({\n" + "\n".join(pub_pairs) + "\n});\n"
    if tail_code:
        out += "\n" + tail_code.rstrip() + "\n"

    if not dry:
        open(fp, "w", encoding="utf-8").write(out)
    return report


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: %s <文件> [--dry-run]" % sys.argv[0]); sys.exit(1)
    r = convert(sys.argv[1], "--dry-run" in sys.argv)
    print(r if r else "未匹配 register(api) 结构")
