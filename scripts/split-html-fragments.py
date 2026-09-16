#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
按行区间把整份 index.html 拆成功能片段。

用法：
  python3 split-html-fragments.py <index.html> <输出目录> <manifest.json>

manifest 格式（行区间为 1-based，含两端）：
  {
    "source": "index.html",
    "fragments": [
      { "file": "head.html",    "from": 1,   "to": 13,  "desc": "head 元信息" },
      ...
    ]
  }

拆分后可用 join-html-fragments.py 拼回，并与原文件逐字节比对验证。
"""

import json
import os
import sys


def split(src_file, out_dir, manifest_file):
    with open(manifest_file, encoding="utf-8") as f:
        manifest = json.load(f)

    with open(src_file, encoding="utf-8") as f:
        lines = f.read().split("\n")

    os.makedirs(out_dir, exist_ok=True)
    written = []
    last_idx = len(manifest["fragments"]) - 1
    for i, frag in enumerate(manifest["fragments"]):
        name = frag["file"]
        start, end = frag["from"], frag["to"]
        if start < 1 or end > len(lines) or start > end:
            print("  ❌ 区间越界: %s (%d-%d, 文件共 %d 行)" % (name, start, end, len(lines)))
            sys.exit(1)
        chunk = lines[start - 1:end]
        # 最后一个片段吸收文件末尾的额外空行，保证 join 后与原文件逐字节一致
        if i == last_idx and end < len(lines):
            chunk = chunk + lines[end:]
        with open(os.path.join(out_dir, name), "w", encoding="utf-8", newline="") as f:
            f.write("\n".join(chunk))
        written.append((name, len(chunk), frag.get("desc", "")))

    print("  源文件: %s（%d 行）" % (src_file, len(lines)))
    print("  输出目录: %s" % out_dir)
    total = 0
    for name, n, desc in written:
        print("    %-26s %4d 行  %s" % (name, n, desc))
        total += n
    covered = sum(f["to"] - f["from"] + 1 for f in manifest["fragments"])
    print("  片段合计 %d 行 / 覆盖 %d 行 / 源 %d 行%s"
          % (total, covered, len(lines), "  ✓" if covered == len(lines) else "  ⚠️ 有未覆盖行"))


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    split(sys.argv[1], sys.argv[2], sys.argv[3])
