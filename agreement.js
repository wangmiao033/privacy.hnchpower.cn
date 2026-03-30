(function () {
  var PT = window.PolicyTemplate;
  var root = document.getElementById("agreement-root");
  var loading = document.getElementById("agreement-loading");
  var SB_CFG = window.SupabaseConfig || {};
  var DEFAULT_COMPANY = "广州熊动科技有限公司";
  var DEFAULT_EMAIL = "pingce@dxyx6888.com";
  var GAME_NAME_BY_CODE = {
    xmb: "仙魔变",
    xdsb: "仙帝神兵",
    cs: "测试",
  };

  /** 使用 URLSearchParams 读取查询串（浏览器已对百分号编码做 decodeURIComponent） */
  function getParams() {
    var sp = new URLSearchParams(window.location.search);
    function pick(key) {
      var v = sp.get(key);
      return v == null ? "" : String(v).trim();
    }
    function pickPrefer(shortKey, legacyKey) {
      var shortVal = pick(shortKey);
      if (shortVal) return shortVal;
      return pick(legacyKey);
    }
    var company = pickPrefer("c", "company");
    var email = pickPrefer("e", "email");
    return {
      id: pickPrefer("id", "code"),
      company: company || DEFAULT_COMPANY,
      game: pickPrefer("g", "game"),
      email: email || DEFAULT_EMAIL,
      date: pickPrefer("d", "date"),
    };
  }

  function getFunctionsBaseUrl() {
    if (!SB_CFG.SUPABASE_URL) return "";
    return String(SB_CFG.SUPABASE_URL).replace(/\/+$/, "") + "/functions/v1";
  }

  async function fetchPolicyByShortCode(shortCode) {
    var base = getFunctionsBaseUrl();
    if (!base || !SB_CFG.SUPABASE_ANON_KEY) {
      throw new Error("Supabase 配置缺失");
    }
    var url = base + "/get-policy-link?id=" + encodeURIComponent(shortCode);
    var res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SB_CFG.SUPABASE_ANON_KEY,
      },
    });
    var json = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !json || !json.data) {
      throw new Error((json && json.error) || "短链内容读取失败");
    }
    return json.data;
  }

  function simpleEmailOk(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function isoDateOk(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var t = Date.parse(s + "T12:00:00");
    return !isNaN(t);
  }

  function normalizeDateParam(rawDate) {
    if (!rawDate) return "";
    if (/^\d{8}$/.test(rawDate)) {
      var y = rawDate.slice(0, 4);
      var m = rawDate.slice(4, 6);
      var d = rawDate.slice(6, 8);
      var iso = y + "-" + m + "-" + d;
      return isoDateOk(iso) ? iso : "";
    }
    if (isoDateOk(rawDate)) return rawDate;
    return "";
  }

  function renderError(message, detail) {
    if (loading) loading.remove();
    root.innerHTML =
      '<div class="agreement-error" role="alert">' +
      "<h1>无法展示隐私政策</h1>" +
      "<p>" +
      PT.escapeHtml(message) +
      "</p>" +
      (detail
        ? "<p>" + PT.escapeHtml(detail) + "</p>"
        : "") +
      "<p>请从生成页填写完整信息后，点击「一键发布」获取有效链接。</p>" +
      "</div>";
    document.title = "隐私政策 - 参数不完整";
  }

  async function run() {
    if (!PT || !root) return;

    var p = getParams();
    if (p.id) {
      try {
        var row = await fetchPolicyByShortCode(p.id);
        var dateFromDb = normalizeDateParam(row.date);
        if (!dateFromDb) {
          renderError("短链数据中的日期无效。", "请重新生成短链后再访问。");
          return;
        }
        if (!simpleEmailOk(row.email || "")) {
          renderError("短链数据中的邮箱无效。", "请重新生成短链后再访问。");
          return;
        }
        var dateDisplayFromDb = PT.formatDateParam(dateFromDb);
        var htmlFromDb = PT.buildPolicyHtml(
          String(row.company || DEFAULT_COMPANY),
          String(row.game || ""),
          String(row.email || DEFAULT_EMAIL),
          dateDisplayFromDb
        );
        if (loading) loading.remove();
        root.innerHTML = htmlFromDb;
        var dbTitleSafe = String(row.game || "隐私政策").replace(/[<>&]/g, "");
        document.title = "隐私政策 - " + dbTitleSafe;
        return;
      } catch (e) {
        renderError(
          "短链无效或已失效。",
          (e && e.message) || "请确认链接正确，或重新在首页发布。"
        );
        return;
      }
    }

    var normalizedDate = normalizeDateParam(p.date);
    var gameName = GAME_NAME_BY_CODE[p.game] || p.game;
    var missing = [];
    if (!p.date) missing.push("d/date（更新日期）");
    if (!p.game) missing.push("g/game（游戏/应用名称）");

    if (missing.length) {
      renderError(
        "链接中缺少必要参数：" + missing.join("、") + "。",
        "请确认网址是否完整，或重新在首页生成链接。"
      );
      return;
    }

    if (!normalizedDate) {
      renderError("参数 d/date 格式无效。", "应为 YYYYMMDD 或 YYYY-MM-DD，例如 20260330 或 2026-03-30。");
      return;
    }

    if (!simpleEmailOk(p.email)) {
      renderError("参数 email 格式无效。", "请使用有效的联系邮箱。");
      return;
    }

    var dateDisplay = PT.formatDateParam(normalizedDate);
    var html = PT.buildPolicyHtml(p.company, gameName, p.email, dateDisplay);

    if (loading) loading.remove();
    root.innerHTML = html;
    var titleSafe = String(gameName).replace(/[<>&]/g, "");
    document.title = "隐私政策 - " + titleSafe;
  }

  run();
})();
