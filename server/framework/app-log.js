// 日志工具：console 重定向加时间戳
"use strict";

function stamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate())
    + " " + pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());
}

function install() {
  if (console._appLogInstalled) return;
  console._appLogInstalled = true;
  function wrap(fn) {
    return function () {
      const args = Array.prototype.slice.call(arguments);
      if (args.length && typeof args[0] === "string") args[0] = "[" + stamp() + "] " + args[0];
      else args.unshift("[" + stamp() + "]");
      return fn.apply(console, args);
    };
  }
  console.log = wrap(console.log);
  console.warn = wrap(console.warn);
  console.error = wrap(console.error);
}

module.exports = { install, stamp };
