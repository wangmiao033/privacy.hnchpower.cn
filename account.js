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

  function buildShortLink(code) {
    var url = new URL("agreement.html", window.location.href);
    url.searchParams.set("id", code);
    return url.href;
  }

  function renderRows(rows) {
    if (!rows || !rows.length) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      listEl.innerHTML = "";
      return;
    }
    emptyEl.hidden = true;
    listEl.hidden = false;

    listEl.innerHTML = rows.map(function (row) {
      var link = buildShortLink(row.short_code);
      return (
        '<article class="link-item">' +
          '<div class="link-item-top">' +
            '<h3 class="link-item-title">' + escapeHtml(row.game || "未命名应用") + "</h3>" +
            '<span class="link-item-time">' + escapeHtml(formatCreatedAt(row.created_at)) + "</span>" +
          "</div>" +
          '<p class="link-item-company">公司：' + escapeHtml(row.company || "-") + "</p>" +
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
      return;
    }
    var sessionRes = await client.auth.getSession();
    var session = sessionRes && sessionRes.data && sessionRes.data.session;
    var token = session && session.access_token || "";
    if (!token) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      emptyEl.textContent = "请先登录后查看短链记录。";
      return;
    }

    var base = getFunctionsBaseUrl();
    var res = await fetch(base + "/get-my-policy-links", {
      method: "GET",
      headers: {
        apikey: SB_CFG.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + token,
      },
    });
    var json = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      emptyEl.textContent = "记录读取失败，请稍后重试。";
      return;
    }
    renderRows((json && json.data) || []);
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
