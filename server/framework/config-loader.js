// ============================================================
// 配置加载器（schema 驱动）
// 项目只需传 schema（字段名/类型/默认值），框架负责加载/保存/校验。
// 来源：从 gbmd config.js（292行）和 iwara config.js（150行）提炼共用逻辑。
// ============================================================
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * 创建配置管理器。
 * @param {object} opts
 * @param {string} opts.configFile 配置文件路径（绝对路径）
 * @param {object} opts.schema 字段 schema { fieldName: { type, default, required, ... } }
 * @returns {object} 配置管理器
 */
function createConfig(opts) {
  const { configFile, schema } = opts;
  const configDir = path.dirname(configFile);

  // ---------- 内部：读原始配置（不合并默认值） ----------
  function readRaw() {
    try {
      return JSON.parse(fs.readFileSync(configFile, "utf-8"));
    } catch {
      return {};
    }
  }

  // ---------- 内部：写配置 ----------
  function writeRaw(obj) {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(obj, null, 2) + "\n", "utf-8");
  }

  // ---------- 内部：合并默认值 ----------
  function withDefaults(raw) {
    const out = {};
    for (const [key, def] of Object.entries(schema)) {
      if (raw[key] !== undefined) {
        out[key] = raw[key];
      } else if (def.default !== undefined) {
        out[key] = def.default;
      }
    }
    // 保留 schema 外的字段（项目可能有自定义字段）
    for (const [key, val] of Object.entries(raw)) {
      if (!(key in out)) out[key] = val;
    }
    return out;
  }

  // ---------- 导出接口 ----------
  return {
    /** 读配置（合并默认值） */
    readConfig() {
      return withDefaults(readRaw());
    },

    /** 写配置（合并到现有配置） */
    writeConfig(patch) {
      const raw = readRaw();
      Object.assign(raw, patch);
      writeRaw(raw);
    },

    /** 快捷读单字段 */
    get(field) {
      const cfg = withDefaults(readRaw());
      return cfg[field];
    },

    /** 设置密码（scrypt 哈希存储） */
    setPassword(pwd) {
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto.scryptSync(pwd, salt, 64).toString("hex");
      this.writeConfig({ passwordHash: hash, passwordSalt: salt });
    },

    /** 校验密码 */
    verifyPassword(pwd) {
      const raw = readRaw();
      if (!raw.passwordHash || !raw.passwordSalt) return false;
      const hash = crypto.scryptSync(pwd, raw.passwordSalt, 64).toString("hex");
      return hash === raw.passwordHash;
    },

    /** 配置文件路径 */
    configFile,

    /** schema */
    schema,
  };
}

module.exports = { createConfig };
