#!/usr/bin/env bash
# ============================================================
# setup 子脚本：组装（--to <项目清单>，含 --dry-run 预演）
# 拆自 setup.sh（2026-09-28），逻辑零改动 + brand 从清单 json 直接获取
# （不再生成/读取独立 brand.json——品牌配置是清单 brand 段的直接来源）。
# 由总入口 setup.sh 分发调用，也可独立执行：
#   bash scripts/setup-assemble.sh --to <项目清单> [--dry-run]
# ============================================================
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup-lib.sh"
setup_parse_args "$@"

echo "══ 组装 → $PROJECT_ROOT ══"

ASSEMBLE_FILE="$(find_assemble || true)"
if [ -z "$ASSEMBLE_FILE" ]; then
  # 生成位置与 find_assemble 的首选查找位置保持一致：
    # 生成位置 = 项目根下的 assemble.json（与 find_assemble 首查位置一致）。
    # 历史缺陷：曾写成 "$TARGET/.." 多退一层，提示的 cp 目标落到幽灵位置。
  GEN_PATH="$PROJECT_ROOT/assemble.json"

  err "❌ 未找到 assemble.json"
  err "   目标项目根需要它声明：从模板取哪些文件到本项目"
  err "     键 = 模板内相对路径（以 / 结尾 = 整目录拷贝）"
  err "     值 = 本项目内相对路径（相对项目根）"
  err "   最小示例: {\"files\":{\"templates/_downloader/html/login.html\":\"server/public/login.html\"}}"

  # 非交互（管道 / CI / 重定向）：不询问，打印提示后退出，避免 read 挂起
  if [ ! -t 0 ]; then
    err ""
    err "   非交互环境，跳过询问。可复制模板默认清单后按需修改："
    err "     cp example/assemble.json $GEN_PATH"
    exit 1
  fi

  if [ -e "$GEN_PATH" ]; then
    err ""
    err "   ⚠️ $GEN_PATH 已存在但无法解析为清单，请手工检查后重跑。"
    exit 1
  fi

  printf '\n是否生成空白清单骨架？[y/N] '
  read -r ans || ans=""
  case "$ans" in
    y|Y|yes|YES)
      if ! "$NODE_BIN" "$MANIFEST_TOOL" generate "$GEN_PATH"; then
        err "   ❌ 生成失败（目录不可写？）: $GEN_PATH"
        exit 1
      fi
      ok "   ✓ 已生成空模板: $GEN_PATH"
      echo "     files 目前为空，请编辑它声明要取哪些文件，然后重跑本命令。"
      exit 0
      ;;
    *)
      err "   已跳过生成。可手工创建，或复制模板自带示例清单后修改："
      err "     cp example/assemble.json $GEN_PATH"
      exit 1
      ;;
  esac
fi
if [ "$ASSEMBLE_FILE" = "$ROOT/example/assemble.json" ] && [ "$TO_SPECIFIED" = "0" ]; then
  warn "  ⚠️ 模板自测：使用 example/assemble.json（示例项目清单）"
  warn "     自定义/混搭：在目标项目根建 assemble.json（键=模板内路径，值=项目内路径，按需取用）"
else
  ok "  ✓ 组装清单: $ASSEMBLE_FILE"
fi

# 立即校验清单可解析：JSON 语法错 / 结构不对时提前失败，避免留下半成品目录。
# 下划线开头的键是注释，值可以是任意类型，跳过校验——由共享模块统一处理。
if find_node "$ROOT/tool/node/bin/node"; then
  if ! "$NODE_BIN" "$MANIFEST_TOOL" validate "$ASSEMBLE_FILE" "$SRC_BASE"; then
    exit 1
  fi
else
  echo "  ⚠️ 未找到 node，跳过清单结构自检（仍会按清单复制）" >&2
fi

# 分发前预检：正式组装（非 --dry-run / --check）先跑一遍清单两端比对，
# 把「将被本次组装覆盖的项目改动」（不一致）与「将补下发的文件」（缺失）
# 亮出来，再直接分发覆盖——避免项目侧定制（如各项目自己的端口/脚本）
# 被无感覆盖。只看不阻断（与 --check 行为一致，差异照常覆盖）。
# 跳过：SETUP_SKIP_PRECHECK=1（脚本内部 / CI 批量组装时用）。
if [ "$DRY_RUN" = "0" ] && [ "${SETUP_SKIP_PRECHECK:-0}" != "1" ]; then
  echo "  ── 分发前预检（不一致 = 将被本次组装覆盖的项目改动；缺失 = 将补下发）──"
  "$NODE_BIN" "$MANIFEST_TOOL" check "$ASSEMBLE_FILE" "$PROJECT_ROOT" "$SRC_BASE" || true
  echo "  ── 预检结束，开始组装 ──"
fi

if [ -n "$NODE_BIN" ]; then
  _setup_copy_manifest
else
  echo "  ❌ 找不到 node，无法解析清单复制素材。请安装 Node.js。" >&2
  exit 1
fi
if [ $? -ne 0 ]; then exit 1; fi

# 品牌配置：清单 brand 段由运行期直接读取（fragment-assembler 装配时取值），
# 不再生成/读取 server/public/brand.json（2026-09-28 简化：brand 是清单的一部分，
# 与「清单即唯一真相」一致；也免去 setup 生成额外文件）。

echo ""
ok "✅ 前端组装完成"
echo "   目标: $PROJECT_ROOT"
echo "   public/ : $(find "$SERVER_DIR/public" -type f | wc -l) 个文件"
echo ""
warn "注意："
echo "  1. 前端 public/ 即插即用（静态文件直接 serve）"
echo "  2. 后端 JS 不在模板：通用 JS 在 templates/js/（createServer/createRoute 接口），"
echo "     业务后端 JS 由项目自己实现"
echo "  3. ./start.sh start 启动验证"