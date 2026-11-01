// test/brand.test.cjs —— 品牌配置四级兜底单测
//
// 用法：node --test test/brand.test.cjs   或   node test/brand.test.cjs
// 零依赖、不联网；项目根全部建在系统临时目录里，不碰仓库内的真实清单与真实 .env。
//
// 为什么要单测：旧实现读不到清单就返回 null，而渲染层（fragment-assembler）
// 只在拿到对象时才替换 @brand:key，不替换就把占位符原样吐到页面上。这类缺陷
// 静态检查看不出来、API 也探测不到，只有「拿页面渲染结果比对」才发现得了，
// 因此这里把取值链的四种来源和兜底结果逐条钉死。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SUT = path.join(__dirname, "..", "templates", "js", "config", "brand.js");
const { readBrand } = require(SUT);
const BRAND_ENV_KEYS = ["BRAND_TITLE", "BRAND_LOGO", "BRAND_ICON", "BRAND_DISPLAY_TITLE"];

// 建一个临时项目根：<tmp>/<name>/server（readBrand 的入参是 server/，项目根是上一级）
function mkProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "brand-chain-"));
  const serverDir = path.join(root, "server");
  fs.mkdirSync(serverDir, { recursive: true });
  return { root, serverDir };
}

// 在受控环境变量下跑一段断言：先清空 BRAND_*，再按需注入，结束时恢复原值。
// 不这样做的话，开发机或 CI 上已有的 BRAND_* 会把「默认值」用例顶掉，
// 测试结果就变成「取决于跑测机器」，而不是取决于被测代码。
function withEnv(vars, fn) {
  const saved = {};
  for (const k of BRAND_ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    Object.assign(process.env, vars || {});
    return fn();
  } finally {
    for (const k of BRAND_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("第四级：无清单、无 .env 时返回内置默认对象（不是 null）", () => {
  const { serverDir } = mkProject();
  withEnv({}, () => {
    const brand = readBrand(serverDir);
    assert.ok(brand && typeof brand === "object", "必须返回对象，不能是 null");
    assert.equal(brand.title, "Downloader");
    assert.equal(brand.logo, "favicon.png");
    assert.equal(brand.icon, "favicon.png");
    assert.equal(brand.displayTitle, "Downloader", "displayTitle 缺失时回退 title");
  });
});

test("第三级：清单 brand 段生效，且额外键原样保留（兼容旧清单）", () => {
  const { root, serverDir } = mkProject();
  fs.writeFileSync(
    path.join(root, "assemble.json"),
    JSON.stringify({ files: {}, brand: { name: "示例下载器", title: "清单标题", logo: "logo.png", icon: "icon.ico", displayTitle: "清<br>单" } })
  );
  withEnv({}, () => {
    const brand = readBrand(serverDir);
    assert.equal(brand.title, "清单标题");
    assert.equal(brand.logo, "logo.png");
    assert.equal(brand.icon, "icon.ico");
    assert.equal(brand.displayTitle, "清<br>单", "允许内联 HTML，原样透传不转义");
    assert.equal(brand.name, "示例下载器", "清单里的额外键不能被裁掉");
  });
});

test("第二级：项目根 .env 覆盖清单 brand 段", () => {
  const { root, serverDir } = mkProject();
  fs.writeFileSync(path.join(root, "assemble.json"), JSON.stringify({ brand: { title: "清单标题", logo: "logo.png" } }));
  fs.writeFileSync(
    path.join(root, ".env"),
    [
      "# 注释行不生效",
      "BRAND_TITLE=环境文件标题",
      'BRAND_LOGO="带 空格.png"',
      "BRAND_ICON=环境文件.ico",
    ].join("\n")
  );
  withEnv({}, () => {
    const brand = readBrand(serverDir);
    assert.equal(brand.title, "环境文件标题", ".env 高于清单");
    assert.equal(brand.logo, "带 空格.png", "双引号内的空格要保留");
    assert.equal(brand.icon, "环境文件.ico");
    assert.equal(brand.displayTitle, "环境文件标题", "清单没给 displayTitle 时回退到最终生效的 title");
  });
});

test("第一级：进程环境变量覆盖 .env 与清单", () => {
  const { root, serverDir } = mkProject();
  fs.writeFileSync(path.join(root, "assemble.json"), JSON.stringify({ brand: { title: "清单标题" } }));
  fs.writeFileSync(path.join(root, ".env"), "BRAND_TITLE=环境文件标题\nBRAND_LOGO=环境文件.png\n");
  withEnv({ BRAND_TITLE: "进程变量标题", BRAND_DISPLAY_TITLE: "进程<br>变量" }, () => {
    const brand = readBrand(serverDir);
    assert.equal(brand.title, "进程变量标题", "环境变量高于 .env");
    assert.equal(brand.logo, "环境文件.png", "环境变量没给 logo 时仍取 .env");
    assert.equal(brand.displayTitle, "进程<br>变量");
  });
});

test("空值等于没配：空的 .env 值不顶掉清单值，空字段由默认值补齐", () => {
  const { root, serverDir } = mkProject();
  fs.writeFileSync(path.join(root, "assemble.json"), JSON.stringify({ brand: { logo: "清单-logo.png" } }));
  fs.writeFileSync(path.join(root, ".env"), "BRAND_LOGO=\nBRAND_ICON=   \nBRAND_TITLE=  含空白  \n");
  withEnv({}, () => {
    const brand = readBrand(serverDir);
    assert.equal(brand.logo, "清单-logo.png", "空串不能覆盖下一级已取到的值");
    assert.equal(brand.icon, "favicon.png", "纯空白等于没配，用内置默认值");
    assert.equal(brand.title, "含空白", "值两端空白要去掉");
  });
});

test(".env 只解析一次：删除 .env 后同一项目根仍走缓存（不重复读盘）", () => {
  const { root, serverDir } = mkProject();
  fs.writeFileSync(path.join(root, ".env"), "BRAND_TITLE=第一次\n");
  withEnv({}, () => {
    assert.equal(readBrand(serverDir).title, "第一次");
    fs.unlinkSync(path.join(root, ".env"));
    assert.equal(readBrand(serverDir).title, "第一次", "缓存命中：不会再读已经删掉的文件");
  });
});

test("异常兜底：没传 serverDir 也不返回 null", () => {
  withEnv({}, () => {
    const brand = readBrand();
    assert.ok(brand && typeof brand === "object");
    assert.equal(brand.title, "Downloader");
    assert.equal(brand.displayTitle, "Downloader");
  });
});
