/**
 * 工具导航首页：年份、无障碍增强与管理员后台入口。
 */
(function () {
  var ADMIN_EMAIL = "wangmiao@dxyx6888.com";
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
  var adminEntry = document.getElementById("home-admin-entry");

  if (!adminEntry && nav) {
    adminEntry = document.createElement("a");
    adminEntry.id = "home-admin-entry";
    adminEntry.className = "home-nav-primary";
    adminEntry.href = ADMIN_URL;
    adminEntry.textContent = "管理后台";
    adminEntry.title = "仅管理员可见";
    adminEntry.hidden = true;
    nav.appendChild(adminEntry);
  }

  function hideAdminEntry() {
    if (adminEntry) adminEntry.hidden = true;
  }

  async function refreshAdminEntry() {
    hideAdminEntry();

    var client = window.AppSupabaseClient;
    if (!client || !client.auth) return;

    try {
      var userResult = await client.auth.getUser();
      var user = userResult && userResult.data && userResult.data.user;
      var email = String(user && user.email || "").trim().toLowerCase();

      if (!user || email !== ADMIN_EMAIL) return;

      var profileResult = await client
        .from("profiles")
        .select("role,is_active")
        .eq("id", user.id)
        .maybeSingle();
      var profile = profileResult && profileResult.data;

      if (profile && profile.role === "admin" && profile.is_active === true && adminEntry) {
        adminEntry.hidden = false;
      }
    } catch (_e) {
      hideAdminEntry();
    }
  }

  refreshAdminEntry();

  var client = window.AppSupabaseClient;
  if (client && client.auth && client.auth.onAuthStateChange) {
    client.auth.onAuthStateChange(function () {
      refreshAdminEntry();
    });
  }
})();
