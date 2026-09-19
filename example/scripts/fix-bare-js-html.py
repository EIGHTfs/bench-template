#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复 HTML 里 <script src> 引用后残留的裸 JS（2026-09-16 bug 修复）

背景：XSS 抽取（内联 script → 外部 .js）时只加了 <script src="x.js">
引用却没删原内联代码，浏览器把裸 JS 当页面文本渲染。

每个文件处理：
  1. 找到 <script src="xxx.js"></script> 引用行
  2. 删除其后紧跟的残留内联段（到 </head> 或 </body> 或空行边界）
  3. 保留引用行本身

修复清单（残留段内容均已确认在外部 js 中完整存在）：
  - index.html     : 删 theme-init 内联（try { const th = ... } catch）
  - login.html     : 删 login() 内联（addEventListener + async function login）
  - setup.html     : 删 setup-init 内联（addEventListener async 箭头函数）
  - play.html      : 删 theme-init 内联
"""
import os
import sys

TARGETS = [
    # gbmd 实际项目
    "/vol2/1000/DeepSeek Harness/dsh-v0.1.2-alpha.4/.dsh-home/工作区/gamebanana-mods-downloader/server/public/index.html",
    "/vol2/1000/DeepSeek Harness/dsh-v0.1.2-alpha.4/.dsh-home/工作区/gamebanana-mods-downloader/server/public/login.html",
    "/vol2/1000/DeepSeek Harness/dsh-v0.1.2-alpha.4/.dsh-home/工作区/gamebanana-mods-downloader/server/public/setup.html",
    # iwara 实际项目
    "/vol2/1000/DeepSeek Harness/dsh-v0.1.2-alpha.4/.dsh-home/工作区/iwara-downloader/server/public/index.html",
    "/vol2/1000/DeepSeek Harness/dsh-v0.1.2-alpha.4/.dsh-home/工作区/iwara-downloader/server/public/play.html",
    # 模板素材
    "/vol2/1000/DeepSeek Harness/dsh-v0.1.2-alpha.4/.dsh-home/工作区/dl-server-template/server/templates/_gbmd-style/public/index.html",
    "/vol2/1000/DeepSeek Harness/dsh-v0.1.2-alpha.4/.dsh-home/工作区/dl-server-template/server/templates/_gbmd-style/public/setup.html",
    "/vol2/1000/DeepSeek Harness/dsh-v0.1.2-alpha.4/.dsh-home/工作区/dl-server-template/server/templates/_iwara-style/public/index.html",
    "/vol2/1000/DeepSeek Harness/dsh-v0.1.2-alpha.4/.dsh-home/工作区/dl-server-template/server/templates/_iwara-style/public/play.html",
    "/vol2/1000/DeepSeek Harness/dsh-v0.1.2-alpha.4/.dsh-home/工作区/dl-server-template/server/project/blueprint/login.html",
]


def fix_file(fp):
    lines = open(fp, "r", encoding="utf-8").readlines()  # 保留 \n
    out = []
    removed = 0
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        # 找到 <script src="..."></script> 整行（含单行引用）
        if "<script src=" in line and "</script>" in line:
            out.append(line)
            i += 1
            # 删除后续残留裸 JS：直到 </head> / </body> / <script / 空行(仅当行不缩进时)
            while i < n:
                nxt = lines[i]
                nt = nxt.strip()
                if (
                    nt.startswith("</head>")
                    or nt.startswith("</body>")
                    or nt.startswith("<script")
                    or nt.startswith("<style")
                    or nt.startswith("<!--")
                    or (nt == "" and not out[-1].strip().startswith("<script"))
                ):
                    break
                # 残留 JS 特征：// 注释、try {、const/let/var、function、} catch、});
                if (
                    nt.startswith("//")
                    or nt.startswith("try {")
                    or nt.startswith("const ")
                    or nt.startswith("let ")
                    or nt.startswith("var ")
                    or nt.startswith("function")
                    or nt.startswith("async function")
                    or nt.startswith("document.")
                    or nt.startswith("}")
                    or nt.startswith("if (")
                    or nt.startswith("location.")
                    or nt.startswith("window.")
                    or nt.startswith("fetch(")
                    or nt.startswith("addEventListener")
                ):
                    removed += 1
                    i += 1
                    continue
                # 非 JS 文本（如空行或其它）也一并跳过直到边界
                removed += 1
                i += 1
            continue
        out.append(line)
        i += 1

    if removed:
        bak = fp + ".bak-bare-js"
        os.replace(fp, bak)  # 备份
        with open(fp, "w", encoding="utf-8") as f:
            f.writelines(out)
        return removed
    return 0


def main():
    total = 0
    for fp in TARGETS:
        if not os.path.exists(fp):
            print(f"  ✗ 不存在: {fp}")
            continue
        r = fix_file(fp)
        print(f"  {'✓' if r else '·'} {os.path.basename(fp)}: 删 {r} 行残留")
        total += r
    print(f"\n共删除 {total} 行裸 JS 残留")


if __name__ == "__main__":
    main()
