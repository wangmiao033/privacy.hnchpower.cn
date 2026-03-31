/**
 * 页面访问写入 public.page_visit_logs（匿名/登录均可；失败不影响页面）。
 * 依赖：全局 window.AppSupabaseClient（由 auth.js 在引入本脚本前初始化）。
 * 节流：同一路径 + 同一会话内 THROTTLE_MS 内只上报一次。
 */
(function () {
  var THROTTLE_MS = 45000;
  var STORAGE_VID = "pvl_visitor_key";
  var SS_THROTTLE_PREFIX = "pvl_throttle:";

  /** 短键，避免 path 过长撑爆 sessionStorage key */
  function pathThrottleKey(path) {
    var h = 5381;
    for (var i = 0; i < path.length; i++) {
      h = (h * 33) ^ path.charCodeAt(i);
    }
    return SS_THROTTLE_PREFIX + (h >>> 0).toString(36) + "_" + String(path.length);
  }

  function randomId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "pvl_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 12);
  }

  function getVisitorKey() {
    try {
      var v = localStorage.getItem(STORAGE_VID);
      if (v && String(v).length >= 8) return String(v);
      v = randomId();
      localStorage.setItem(STORAGE_VID, v);
      return v;
    } catch (_e) {
      return randomId();
    }
  }

  function normalizePath() {
    var p = (window.location.pathname || "/") + (window.location.search || "");
    if (p.length > 2048) return p.slice(0, 2048);
    return p;
  }

  function throttleAllows(pathKey) {
    try {
      var key = pathThrottleKey(pathKey);
      var now = Date.now();
      var last = sessionStorage.getItem(key);
      if (last) {
        var t = parseInt(last, 10);
        if (!isNaN(t) && now - t < THROTTLE_MS) return false;
      }
      sessionStorage.setItem(key, String(now));
      return true;
    } catch (_e) {
      return true;
    }
  }

  async function resolveUser(client) {
    var res = await client.auth.getUser();
    var user = res && res.data && res.data.user;
    if (!user || !user.id) {
      var sres = await client.auth.getSession();
      var session = sres && sres.data && sres.data.session;
      user = session && session.user;
    }
    return user;
  }

  function run() {
    var client = window.AppSupabaseClient;
    if (!client || !client.from) return;

    var path = normalizePath();
    if (!throttleAllows(path)) return;

    void (async function () {
      try {
        var user = await resolveUser(client);
        var loggedIn = !!(user && user.id);
        var ref = "";
        try {
          ref = document.referrer || "";
        } catch (_e) {}
        if (ref.length > 2048) ref = ref.slice(0, 2048);

        var ua = "";
        try {
          ua = navigator.userAgent || "";
        } catch (_e2) {}
        if (ua.length > 4096) ua = ua.slice(0, 4096);

        var row = {
          path: path,
          visitor_key: getVisitorKey(),
          user_id: loggedIn ? user.id : null,
          email: loggedIn && user.email ? user.email : null,
          is_logged_in: loggedIn,
          ua: ua || null,
          referrer: ref || null,
          created_at: new Date().toISOString(),
        };

        var ins = await client.from("page_visit_logs").insert(row);
        if (ins.error) {
          console.error(
            "[page_visit_logs] insert failed:",
            ins.error.message || String(ins.error)
          );
        }
      } catch (err) {
        console.error("[page_visit_logs] insert exception:", err);
      }
    })();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
