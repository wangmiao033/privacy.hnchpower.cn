(function () {
  var PT = window.PolicyTemplate;
  var root = document.getElementById("agreement-root");
  var loading = document.getElementById("agreement-loading");
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
      company: company || DEFAULT_COMPANY,
      game: pickPrefer("g", "game"),
      email: email || DEFAULT_EMAIL,
      date: pickPrefer("d", "date"),
    };
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

  function run() {
    if (!PT || !root) return;

    var p = getParams();
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
