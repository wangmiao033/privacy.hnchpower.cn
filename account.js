(function () {
  var listEl = document.getElementById("my-links-list");
  var emptyEl = document.getElementById("my-links-empty");
  var toast = document.getElementById("toast");
  if (!listEl || !emptyEl || !toast) return;

  var SB_CFG = window.SupabaseConfig || {};

  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toast.hidden = true;
    }, 3000);
  }

  function getFunctionsBaseUrl() {
    if (!SB_CFG.SUPABASE_URL) return "";
    return String(SB_CFG.SUPABASE_URL).replace(/\/+$/, "") + "/functions/v1";
  }

  function formatCreatedAt(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    var hh = String(d.getHours()).padStart(2, "0");
    var mm = String(d.getMinutes()).padStart(2, "0");
    return y + "-" + m + "-" + day + " " + hh + ":" + mm;
  }

  function buildShortLink(row) {
    var page = row.kind === "document" ? "document-policy.html" : "agreement.html";
    var url = new URL(page, window.location.href);
    url.searchParams.set("id", row.short_code);
    return url.href;
  }

  function rowDisplayTitle(row) {
    if (row.kind === "document") return row.title || "未命名文档";
    return row.game || "未命名应用";
  }

  function rowMetaLine(row) {
    if (row.kind === "document") return "类型：文档隐私链接（document-policy）";
    return "公司：" + escapeHtml(row.company || "-");
  }

  function renderRows(rows) {
    if (!rows || !rows.length) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      listEl.innerHTML = "";
      emptyEl.textContent = "暂无短链记录，去首页生成第一条吧。";
      return;
    }
    emptyEl.hidden = true;
    listEl.hidden = false;

    listEl.innerHTML = rows.map(function (row) {
      var normalized = row.kind ? row : { kind: "agreement", short_code: row.short_code, company: row.company, game: row.game, created_at: row.created_at };
      var link = buildShortLink(normalized);
      return (
        '<article class="link-item">' +
          '<div class="link-item-top">' +
            '<h3 class="link-item-title">' + escapeHtml(rowDisplayTitle(normalized)) + "</h3>" +
            '<span class="link-item-time">' + escapeHtml(formatCreatedAt(row.created_at)) + "</span>" +
          "</div>" +
          '<p class="link-item-company">' + rowMetaLine(normalized) + "</p>" +
          '<div class="link-item-url">' +
            '<input class="link-item-input" type="text" readonly value="' + escapeAttr(link) + '" />' +
          "</div>" +
          '<div class="link-item-actions">' +
            '<button type="button" class="btn btn-secondary" data-copy="' + escapeAttr(link) + '">复制</button>' +
            '<a class="btn btn-primary" target="_blank" rel="noopener noreferrer" href="' + escapeAttr(link) + '">打开</a>' +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function bindListEvents() {
    listEl.addEventListener("click", function (e) {
      var target = e.target;
      if (!(target instanceof HTMLElement)) return;
      var copy = target.getAttribute("data-copy");
      if (!copy) return;
      navigator.clipboard.writeText(copy).then(
        function () {
          showToast("短链已复制");
        },
        function () {
          showToast("复制失败，请手动复制");
        }
      );
    });
  }

  async function loadMyLinks() {
    var client = window.AppSupabaseClient;
    if (!client || !client.auth) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      console.log("[account] session exists:", false);
      console.log("[account] user id:", "");
      return;
    }
    var sessionRes = await client.auth.getSession();
    var session = sessionRes && sessionRes.data && sessionRes.data.session;
    var userRes = await client.auth.getUser();
    var user = userRes && userRes.data && userRes.data.user;
    var token = session && session.access_token || "";
    console.log("[account] session exists:", !!session);
    console.log("[account] user id:", user && user.id ? user.id : "");

    if (!token && user && client.auth.refreshSession) {
      try {
        var refreshRes = await client.auth.refreshSession();
        var refreshed = refreshRes && refreshRes.data && refreshRes.data.session;
        token = refreshed && refreshed.access_token || "";
        console.log("[account] refreshed token exists:", !!token);
      } catch (_e) {
        token = "";
      }
    }
    if (!token) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      emptyEl.textContent = "请先登录后查看短链记录。";
      return;
    }

    var base = getFunctionsBaseUrl();
    var requestUrl = base + "/get-my-policy-links";
    console.log("[account] request url:", requestUrl);
    var res = await fetch(requestUrl, {
      method: "GET",
      headers: {
        apikey: SB_CFG.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + token,
      },
    });
    var raw = await res.text();
    console.log("[account] response status:", res.status);
    console.log("[account] response body:", raw ? String(raw).slice(0, 600) : "");
    var json = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch (_e) {
      json = {};
    }
    if (!res.ok) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      emptyEl.textContent = "记录读取失败，请稍后重试。";
      return;
    }
    var rows = (json && json.data) || [];
    console.log("[account] links count:", Array.isArray(rows) ? rows.length : 0);
    renderRows(rows);
  }

  bindListEvents();
  loadMyLinks();

  var client = window.AppSupabaseClient;
  if (client && client.auth && client.auth.onAuthStateChange) {
    client.auth.onAuthStateChange(function () {
      loadMyLinks();
    });
  }
})();
