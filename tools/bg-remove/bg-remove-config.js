/**
 * 抠图 API 根地址（不含末尾斜杠），须与仓库 backend-bg-remove 部署后的公网一致。
 *
 * 上线步骤简述：
 * 1. 将 backend-bg-remove 部署到 Render / Railway / 自有服务器（HTTPS）。
 * 2. 把下方改为你的服务地址，例如：https://hn-bg-remove.onrender.com
 * 3. 重新部署本静态站点（或同步 bg-remove-config.js 到服务器）。
 *
 * 留空字符串：只在访问者为 localhost / 127.0.0.1 时默认使用 http://localhost:8000 做本地开发；
 * 公网域名下若仍为空，页面会提示「未配置 API」，不再误连 localhost。
 */
(function (global) {
  global.BG_REMOVE_API_BASE_URL = "";
})(typeof window !== "undefined" ? window : this);
