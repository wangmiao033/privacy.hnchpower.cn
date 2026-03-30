/**
 * 隐私政策固定模板，仅替换 4 处占位（内容已做 HTML 转义）
 */
(function (global) {
  function escapeHtml(str) {
    if (str == null) return "";
    var s = String(str);
    var map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return s.replace(/[&<>"']/g, function (ch) {
      return map[ch] || ch;
    });
  }

  var PLACEHOLDER_DATE = "【这里录入日期】";
  var PLACEHOLDER_COMPANY = "【这里写公司名称】";
  var PLACEHOLDER_GAME = "【这里写游戏名称】";
  var PLACEHOLDER_EMAIL = "【这里填写邮箱】";

  /** dateDisplay: YYYY年M月D日 */
  function buildPolicyHtml(company, game, email, dateDisplay) {
    var c = escapeHtml(company);
    var g = escapeHtml(game);
    var e = escapeHtml(email);
    var d = escapeHtml(dateDisplay);

    var raw =
      '<header class="policy-doc-header">' +
      '<h1 class="policy-doc-title">隐私政策</h1>' +
      "<p class=\"policy-doc-meta\">更新日期：" +
      PLACEHOLDER_DATE +
      "</p>" +
      "</header>" +
      '<div class="policy-doc-body">' +
      "<p>欢迎您使用本产品。本产品由" +
      PLACEHOLDER_COMPANY +
      "（以下简称「我们」）运营，产品名称为「" +
      PLACEHOLDER_GAME +
      "」。我们重视您的个人信息与隐私保护。请您在使用本产品前，仔细阅读本隐私政策。当您使用或继续使用我们的产品或服务，即表示您同意我们按照本政策处理您的相关信息。</p>" +
      "<h2>一、我们收集的信息</h2>" +
      "<p>在您使用本产品过程中，我们可能会根据功能需要，收集与使用服务相关的必要信息，例如设备信息、日志信息、以及您在使用特定功能时主动提供的信息等。具体以产品实际功能及系统权限提示为准。</p>" +
      "<h2>二、我们如何使用信息</h2>" +
      "<p>我们仅在实现产品功能、履行协议义务、遵守法律法规、经您授权同意或法律允许的目的范围内使用相关信息。</p>" +
      "<h2>三、信息的存储与安全</h2>" +
      "<p>我们将在法律法规要求的期限内保存信息，并采取合理可行的安全保护措施，防止信息遭到未经授权的访问、泄露、篡改或丢失。</p>" +
      "<h2>四、共享、转让与公开披露</h2>" +
      "<p>我们不会向无关第三方出售您的个人信息。仅在法律法规规定、获得您的同意、或为保护合法权益所必需时，我们才可能依法依规共享、转让或披露相关信息。</p>" +
      "<h2>五、您的权利</h2>" +
      "<p>在适用法律允许的范围内，您可依法查阅、复制、更正、补充或删除与您相关的个人信息，也可撤回授权。您可通过本政策末尾的联系方式向我们提出请求。</p>" +
      "<h2>六、未成年人保护</h2>" +
      "<p>若您为未成年人，请在监护人陪同下阅读本政策，并在监护人同意后使用本产品。</p>" +
      "<h2>七、政策更新</h2>" +
      "<p>我们可能适时更新本隐私政策。更新后，我们将通过适当方式向您提示。若您继续使用本产品，即视为接受更新后的政策。</p>" +
      "<h2>八、联系我们</h2>" +
      "<p>如您对本政策或个人信息处理有任何疑问、意见或投诉，可通过以下方式联系我们：</p>" +
      "<p><strong>公司名称：</strong>" +
      PLACEHOLDER_COMPANY +
      "</p>" +
      "<p><strong>游戏 / 应用名称：</strong>" +
      PLACEHOLDER_GAME +
      "</p>" +
      "<p><strong>联系邮箱：</strong>" +
      PLACEHOLDER_EMAIL +
      "</p>" +
      "</div>";

    return raw
      .split(PLACEHOLDER_DATE).join(d)
      .split(PLACEHOLDER_COMPANY).join(c)
      .split(PLACEHOLDER_GAME).join(g)
      .split(PLACEHOLDER_EMAIL).join(
        '<a href="mailto:' + e.replace(/"/g, "&quot;") + '">' + e + "</a>"
      );
  }

  function formatDateParam(yyyyMmDd) {
    if (!yyyyMmDd || typeof yyyyMmDd !== "string") return "";
    var parts = yyyyMmDd.split("-");
    if (parts.length !== 3) return "";
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var day = parseInt(parts[2], 10);
    if (!y || !m || !day) return "";
    return y + "年" + m + "月" + day + "日";
  }

  global.PolicyTemplate = {
    escapeHtml: escapeHtml,
    buildPolicyHtml: buildPolicyHtml,
    formatDateParam: formatDateParam,
  };
})(typeof window !== "undefined" ? window : this);
