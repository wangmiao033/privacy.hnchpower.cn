/**
 * 工具导航首页：年份与无障碍增强（无业务逻辑）
 */
(function () {
  var y = document.getElementById("home-year");
  if (y) y.textContent = String(new Date().getFullYear());

  var path = window.location.pathname || "";
  var onHome =
    path === "/" ||
    path.endsWith("/index.html") ||
    path.endsWith("/") && path.split("/").filter(Boolean).length === 0;

  document.querySelectorAll(".home-nav-link").forEach(function (a) {
    var href = a.getAttribute("href") || "";
    if (href === "./" || href === "/" || href === "index.html") {
      if (onHome && !window.location.hash) {
        a.setAttribute("aria-current", "page");
      }
    }
  });
})();
