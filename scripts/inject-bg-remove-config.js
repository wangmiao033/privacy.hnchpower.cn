/**
 * Vercel / CI 构建时写入 tools/bg-remove/bg-remove-config.js。
 * 环境变量：BG_REMOVE_API_BASE_URL（例如 https://xxx.onrender.com，无末尾斜杠）
 */
const fs = require("fs");
const path = require("path");

const outPath = path.join(__dirname, "..", "tools", "bg-remove", "bg-remove-config.js");
const url = typeof process.env.BG_REMOVE_API_BASE_URL === "string"
  ? process.env.BG_REMOVE_API_BASE_URL.trim().replace(/\/+$/, "")
  : "";

const banner =
  "/**\n" +
  " * 构建时由 scripts/inject-bg-remove-config.js 生成（见环境变量 BG_REMOVE_API_BASE_URL）。\n" +
  " * 本地开发可直接编辑本文件；勿将含真实地址的生成结果提交到仓库。\n" +
  " */\n";

const body =
  "(function (global) {\n" +
  "  global.BG_REMOVE_API_BASE_URL = " +
  JSON.stringify(url) +
  ";\n" +
  '})(typeof window !== "undefined" ? window : this);\n';

fs.writeFileSync(outPath, banner + body, "utf8");
console.log("[inject-bg-remove-config] wrote", outPath, url ? "(URL set)" : "(empty)");
