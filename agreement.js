(function () {
  var PT = window.PolicyTemplate;
  var root = document.getElementById("agreement-root");
  var loading = document.getElementById("agreement-loading");

  /** 使用 URLSearchParams 读取查询串（浏览器已对百分号编码做 decodeURIComponent） */
  function getParams() {
    var sp = new URLSearchParams(window.location.search);
    function pick(key) {
      var v = sp.get(key);
      return v == null ? "" : String(v).trim();
    }
    return {
      company: pick("company"),
      game: pick("game"),
      email: pick("email"),
      date: pick("date"),
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
    var missing = [];
    if (!p.date) missing.push("date（更新日期）");
    if (!p.company) missing.push("company（公司名称）");
    if (!p.game) missing.push("game（游戏/应用名称）");
    if (!p.email) missing.push("email（联系邮箱）");

    if (missing.length) {
      renderError(
        "链接中缺少必要参数：" + missing.join("、") + "。",
        "请确认网址是否完整，或重新在首页生成链接。"
      );
      return;
    }

    if (!isoDateOk(p.date)) {
      renderError("参数 date 格式无效。", "应为 YYYY-MM-DD，例如 2026-03-30。");
      return;
    }

    if (!simpleEmailOk(p.email)) {
      renderError("参数 email 格式无效。", "请使用有效的联系邮箱。");
      return;
    }

    var dateDisplay = PT.formatDateParam(p.date);
    var html = PT.buildPolicyHtml(p.company, p.game, p.email, dateDisplay);

    if (loading) loading.remove();
    root.innerHTML = html;
    var titleSafe = String(p.game).replace(/[<>&]/g, "");
    document.title = "隐私政策 - " + titleSafe;
  }

  run();
})();
