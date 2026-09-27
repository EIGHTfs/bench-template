// 零依赖启动器：强制本项目 .js 按 CommonJS 加载。
// 父目录 package.json 为 "type":"module" 时，直接 node app.js 会被当 ESM 导致 require 失败。
// .cjs 永远是 CJS；只劫持本项目根内的 .js，项目外仍走 Node 原逻辑。
"use strict";
require("./lib/cjs-bootstrap.cjs");
require("./app.js");
