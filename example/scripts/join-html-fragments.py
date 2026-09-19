#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
按 manifest 把片段拼回整份 HTML（split-html-fragments.py 的逆操作）。

用法：
  python3 join-html-fragments.py <片段目录> <manifest.json> [输出文件]

不传输出文件则打印到 stdout，便于与原文件 diff 验证：
  python3 join-html-fragments.py frags m.json out.html && diff index.html out.html
"""

import json
import os
import sys


def join(frag_dir, manifest_file, out_file=None, order_key="fragments"):
    with open(manifest_file, encoding="utf-8") as f:
        manifest = json.load(f)

    parts = []
    for frag in manifest[order_key]:
        path = os.path.join(frag_dir, frag["file"])
        if not os.path.isfile(path):
            print("  ❌ 片段缺失: %s" % path, file=sys.stderr)
            sys.exit(1)
        with open(path, encoding="utf-8", newline="") as f:
            parts.append(f.read())

    # 行尾处理：与 split 对称（片段内容按 "\n" 连接；源文件末尾空行由最后一个片段承载）
    text = "\n".join(parts)
    if out_file:
        with open(out_file, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        print("  已拼装: %s（%d 行）" % (out_file, text.count("\n") + 1))
    else:
        sys.stdout.write(text)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    join(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
