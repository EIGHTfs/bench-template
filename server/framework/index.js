// ============================================================
// 框架统一出口
// ============================================================
"use strict";

const { createConfig } = require("./config-loader");
const { createServer, MIME } = require("./app");
const { createRoute, groupRoutes } = require("./route-factory");
const { sendJson, readBody, parseCredentialText, cleanCookie } = require("./http-utils");
const { isBrowsableDir, isBlocked } = require("./path-safe");
const fsAsync = require("./fs-async");
const htmlUtils = require("./html-utils");
const appLog = require("./app-log");
const jsonDir = require("./json-dir");
const auth = require("./auth");
const dataBackup = require("./data-backup");

module.exports = {
  // 核心
  createConfig,
  createServer,
  createRoute,
  groupRoutes,
  MIME,

  // 工具
  sendJson,
  readBody,
  parseCredentialText,
  cleanCookie,
  isBrowsableDir,
  isBlocked,

  // 模块
  fsAsync,
  htmlUtils,
  appLog,
  jsonDir,
  auth,
  dataBackup,
};
