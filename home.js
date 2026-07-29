/**
 * 工具导航首页：年份、无障碍增强与管理员后台入口。
 */
(function () {
  var ADMIN_URL = "https://admin.hnchpower.cn/dashboard";

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

  var nav = document.querySelector(".home-nav-links");
  if (nav && !document.getElementById("home-admin-entry")) {
    var adminEntry = document.createElement("a");
    adminEntry.id = "home-admin-entry";
    adminEntry.className = "home-nav-primary";
    adminEntry.href = ADMIN_URL;
    adminEntry.textContent = "管理后台";
    adminEntry.title = "管理员专用入口";
    nav.appendChild(adminEntry);
  }
})();
