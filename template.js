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
      '<h1 class="policy-doc-title">用户隐私协议</h1>' +
      "<p class=\"policy-doc-meta\">更新日期：" +
      PLACEHOLDER_DATE +
      "</p>" +
      "</header>" +
      '<div class="policy-doc-body">' +
      "<p>" + PLACEHOLDER_COMPANY + "（以下简称“我们”）系移动应用程序“" + PLACEHOLDER_GAME + "”的运营者。我们非常重视保护用户（以下简称“您”）的个人信息和隐私。您在使用 " + PLACEHOLDER_GAME + " 时，我们会收集、使用、保存、共享您的相关个人信息。为呈现我们处理您个人信息的情况，我们特制定《" + PLACEHOLDER_GAME + "隐私政策》（以下简称“隐私政策”），我们承诺严格按照本隐私政策处理您的个人信息。</p>" +
      "<p>我们非常注重保护您的个人信息。为了以简洁、清晰、易懂的方式让您了解我们如何收集和使用您的个人信息，特拟定如下摘要，供您快速知悉了解。</p>" +

      "<h2>用户隐私协议摘要</h2>" +
      "<h3>一、我们如何收集和使用您的个人信息</h3>" +
      "<p>您在使用游戏功能时，我们可能收集基础信息、身份信息、设备信息、日志信息、角色与聊天信息等，具体以功能使用场景和法律法规要求为准。</p>" +
      "<p><strong>1）游戏注册、登录：</strong>为账号登录、防沉迷认证识别及账号安全保障，我们会处理第三方账号标识信息（uid、token）及设备网络环境信息（如 IP、IMEI/Android ID/OAID 等）。</p>" +
      "<p><strong>2）充值、消费：</strong>为完成支付及保障虚拟财产安全，我们会处理充值记录、消费记录等交易信息。</p>" +
      "<p><strong>3）异常日志：</strong>为保障服务稳定、投诉处理及安全分析，我们会处理登录日志、物品日志、游戏信息、交友记录等日志数据。</p>" +
      "<p><strong>4）角色与聊天信息：</strong>为过滤不当内容、维护健康环境，我们会处理您在互动过程中提交的文字、图片等内容。</p>" +

      "<h3>二、我们如何共享您的个人信息</h3>" +
      "<p>除法律法规规定或获得您明确同意外，我们不会与无关第三方共享您的个人信息。为实现必要功能，部分服务由授权合作伙伴提供，我们会要求其依法依规并在严格安全措施下处理信息。</p>" +

      "<h3>三、您如何管理个人信息</h3>" +
      "<p>您可通过产品内“设置”等功能管理您的个人信息，包括查询、更正、删除、改变授权范围、撤回授权及账号注销。若无法自行操作，可通过文末联系方式与我们联系，我们通常将在十五个工作日内答复。</p>" +

      "<h3>四、未成年人保护</h3>" +
      "<p>若您为未成年人，请在监护人陪同下阅读本政策并在监护人同意后使用服务。我们将依据国家法规持续完善未成年人保护机制。</p>" +

      "<h3>五、联系我们</h3>" +
      "<p>联系邮箱：" + PLACEHOLDER_EMAIL + "</p>" +
      "<p>特别提示：如您不同意本协议中的任何条款，请立即停止访问和使用本应用服务。</p>" +

      "<h2>隐私协议内容</h2>" +
      "<p>希望您仔细阅读本协议，详细了解我们对信息的收集、使用、存储和共享情况以及您所享有的相关权利。本隐私政策仅说明业务功能所需的必要个人信息，不代表您已同意非必要个人信息处理；针对非必要信息和敏感权限，我们会根据实际业务场景单独征得您的同意。</p>" +

      "<h2>第一章 收集的信息</h2>" +
      "<p>在您使用游戏服务过程中，我们遵循合法、正当、最小必要原则收集实现功能所需信息。我们会根据服务场景收集您主动提供的信息及使用服务过程中产生的信息，用于提供服务、优化体验和保障账号安全。</p>" +
      "<h3>1. 游戏注册、登录</h3>" +
      "<p>您需通过第三方 SDK 平台完成注册/登录。为满足网络安全及防沉迷要求，平台可能处理实名身份信息。我们不直接采集实名信息，相关信息由登录平台按其规则处理。</p>" +
      "<p>我们会处理与登录安全相关的设备和网络信息（如设备标识、IP、网络状态等）。若拒绝提供，可能导致无法登录或部分功能受限。</p>" +
      "<h3>2. 充值、消费</h3>" +
      "<p>当您使用消费功能时，我们会处理充值与消费记录，以支持交易查询并保护虚拟财产安全。</p>" +
      "<h3>3. 异常日志</h3>" +
      "<p>我们会处理必要日志信息用于故障排查、运营分析、投诉处理和安全分析。</p>" +
      "<h3>4. 角色信息、聊天信息</h3>" +
      "<p>在玩家互动中，我们会处理聊天和互动内容，用于不良信息识别和环境治理。</p>" +
      "<h3>5. 您的更正、删除权利</h3>" +
      "<p>如发现我们处理您的个人信息存在错误或违法情形，您可要求更正或删除，我们将在核验身份后处理。</p>" +
      "<h3>6. 无需授权同意的情形</h3>" +
      "<p>在与国家安全、公共安全、刑事侦查、依法公开信息、履行法定义务等相关情形下，我们可依法处理个人信息而无需另行征得同意。</p>" +
      "<h3>7. 新增功能说明</h3>" +
      "<p>若新增功能涉及新的信息处理，我们会通过页面提示、弹窗或公告等方式另行告知并征得同意。</p>" +

      "<h2>第二章 信息的存储</h2>" +
      "<p>我们通过本地缓存、数据库、日志等安全方式存储信息，并在实现目的所必需期限内或法律法规要求范围内保存。境内收集的信息通常存储于中国境内。产品或服务停止运营时，我们会依法进行公告并保障您的合法权益。</p>" +

      "<h2>第三章 信息安全</h2>" +
      "<p>我们采取多层防护措施保障个人信息安全，包括访问控制、数据加密、传输保护、去标识化处理、安全管理制度及审计机制等。若发生安全事件，我们将按应急预案处置并依法告知。</p>" +

      "<h2>第四章 我们如何使用信息</h2>" +
      "<p>我们仅在本协议及相关服务协议约定范围内使用信息，用于提供功能、改进产品、保障账号与服务安全。若超出原始目的使用，我们将再次告知并征得同意。</p>" +

      "<h2>第五章 对外提供</h2>" +
      "<p>除本协议约定及法律法规要求外，我们不会主动共享、转让或公开披露可识别您身份的信息。若业务发生合并、收购、资产转让等情形，我们将依法告知并持续保护您的信息权益。</p>" +

      "<h2>第六章 您的权利</h2>" +
      "<p>您可访问、更正、删除、复制个人信息，调整授权范围，注销账号等。为保障安全，我们可能要求您先完成身份验证。您可通过产品内功能路径或联系我们处理相关请求。</p>" +

      "<h2>第七章 变更</h2>" +
      "<p>我们可能适时修订本协议。条款更新后，我们会以弹窗、公告、邮件等方式向您提示。</p>" +

      "<h2>第八章 未成年人保护</h2>" +
      "<p>我们持续根据国家防沉迷要求开展未成年人保护工作，并通过系统能力限制不当游戏行为。未成年人应在监护人同意和指导下使用服务。</p>" +

      "<h2>第九章 我们如何处理未成年人的个人信息</h2>" +
      "<p>针对未满 14 周岁未成年人信息处理，我们将依法取得监护人同意；针对已满 14 周岁未满 18 周岁用户，依法依规落实相应保护义务。</p>" +

      "<h2>第十章 联系我们</h2>" +
      "<p>若您有投诉、建议或与个人信息相关的问题，请通过以下邮箱联系我们：<a href=\"mailto:" + PLACEHOLDER_EMAIL + "\">" + PLACEHOLDER_EMAIL + "</a>。我们将在核验身份后尽快处理，通常于十五个工作日内答复。</p>" +

      "<h2>第三方 SDK 信息表</h2>" +
      "<p>说明：以下为第三方 SDK 提供方说明的信息处理内容摘要，具体以各 SDK 官方隐私政策为准。若有不符，请及时与我们联系修正。</p>" +
      '<div class="sdk-grid">' +
      '<section class="sdk-item"><h3>华为游戏 SDK</h3><p><strong>所属机构：</strong>华为软件技术有限公司</p><p><strong>用途：</strong>登录及网络连接相关能力</p><p><strong>信息类型：</strong>个人信息、身份信息、设备信息</p><p><strong>权限：</strong>读取手机状态和身份</p></section>' +
      '<section class="sdk-item"><h3>支付宝 SDK</h3><p><strong>所属机构：</strong>支付宝（中国）网络技术有限公司</p><p><strong>用途：</strong>支付服务</p><p><strong>信息类型：</strong>设备信息、网络信息、日志信息</p><p><strong>权限：</strong>读取手机状态和身份</p></section>' +
      '<section class="sdk-item"><h3>阿里反外挂（设备风险 SDK）</h3><p><strong>所属机构：</strong>阿里云计算有限公司</p><p><strong>用途：</strong>异常设备识别、反作弊</p><p><strong>信息类型：</strong>设备基础/标识/网络/应用信息</p></section>' +
      '<section class="sdk-item"><h3>阿里云日志服务</h3><p><strong>所属机构：</strong>阿里云计算有限公司</p><p><strong>用途：</strong>崩溃日志与稳定性分析</p></section>' +
      '<section class="sdk-item"><h3>网易易盾 SDK</h3><p><strong>所属机构：</strong>杭州网易易盾科技有限公司</p><p><strong>用途：</strong>外挂检测与反作弊</p><p><strong>信息类型：</strong>设备信息、日志信息、应用信息</p></section>' +
      '<section class="sdk-item"><h3>腾讯 Bugly SDK</h3><p><strong>所属机构：</strong>深圳市腾讯计算机系统有限公司</p><p><strong>用途：</strong>崩溃排查与稳定性提升</p><p><strong>信息类型：</strong>设备与系统环境信息、日志信息</p></section>' +
      '<section class="sdk-item"><h3>OPPO Push / 欢太账号授权 / 游戏联运 SDK</h3><p><strong>所属机构：</strong>广东欢太科技有限公司</p><p><strong>用途：</strong>登录、联运与消息推送能力</p></section>' +
      '<section class="sdk-item"><h3>233 乐园 SDK</h3><p><strong>所属机构：</strong>北京龙威互动科技有限公司</p><p><strong>用途：</strong>登录与支付</p><p><strong>隐私链接：</strong>https://www.233leyuan.com/policy.html</p></section>' +
      '<section class="sdk-item"><h3>天翼账号认证 SDK</h3><p><strong>所属机构：</strong>天翼数字生活科技有限公司</p><p><strong>用途：</strong>登录认证</p><p><strong>隐私链接：</strong>https://id.189.cn/html/agreement_709.html</p></section>' +
      '<section class="sdk-item"><h3>腾讯 X5 网页引擎</h3><p><strong>所属机构：</strong>深圳市腾讯计算机系统有限公司</p><p><strong>用途：</strong>网页渲染能力</p><p><strong>隐私链接：</strong>https://rule.tencent.com/rule/preview/1c4e2b4b-d0f6-4a75-a5c6-1cfce00a390d</p></section>' +
      '<section class="sdk-item"><h3>小米游戏服务</h3><p><strong>运营方：</strong>北京瓦力网络科技有限公司</p><p><strong>用途：</strong>登录与支付订单</p><p><strong>隐私链接：</strong>https://privacy.mi.com/xiaomigame-sdk/zh_CN/</p></section>' +
      '<section class="sdk-item"><h3>Punk SDK</h3><p><strong>第三方主体：</strong>湖南芯动网络科技有限公司</p><p><strong>用途：</strong>账号登录、支付、防刷与风控</p><p><strong>隐私链接：</strong>https://www.punkyx.com/page/index?mu=u</p></section>' +
      "</div>" +

      "<p>如您对以上第三方 SDK 处理规则有疑问，可优先查阅其官方隐私政策，也可通过本协议联系方式与我们联系。</p>" +
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
