/**
 * 构建时由 scripts/inject-bg-remove-config.js 生成（见环境变量 BG_REMOVE_API_BASE_URL）。
 * 本地开发可直接编辑本文件；勿将含真实地址的生成结果提交到仓库。
 */
(function (global) {
  global.BG_REMOVE_API_BASE_URL = "";
  if (typeof document !== "undefined" && !document.getElementById("bgremoveStampAddonScript")) {
    var script = document.createElement("script");
    script.id = "bgremoveStampAddonScript";
    script.src = "bg-remove-stamp.js";
    script.async = false;
    document.head.appendChild(script);
  }
})(typeof window !== "undefined" ? window : this);
