/**
 * HN Tools payment gate. It never decides pricing or grants access:
 * the Supabase publication RPC is the source of truth.
 * Prices are intentionally absent from the main page, and shown only
 * after selecting a product in this payment confirmation dialog.
 */
(function () {
  "use strict";
  var CONFIG = window.SupabaseConfig || {};
  var BASE = String(CONFIG.SUPABASE_URL || "").replace(/\/+$/, "") + "/functions/v1";
  var MODAL = null;
  var TOKEN = "";
  var PLAN = "";
  var EXPECTED_AMOUNTS = { single: 100, lifetime: 9900 };

  function headers(token) {
    return {
      "Content-Type": "application/json",
      "apikey": CONFIG.SUPABASE_ANON_KEY || "",
      "Authorization": "Bearer " + token,
    };
  }
  async function api(path, token, body) {
    var response = await fetch(BASE + "/" + path, {
      method: body ? "POST" : "GET",
      headers: headers(token),
      body: body ? JSON.stringify(body) : undefined,
    });
    var result = {};
    try { result = await response.json(); } catch (_) {}
    if (!response.ok) {
      var error = new Error(result.error || "请求失败，请稍后重试");
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function safeSession(action, key, value) {
    try {
      if (action === "get") return sessionStorage.getItem(key);
      if (action === "set") sessionStorage.setItem(key, value);
      if (action === "remove") sessionStorage.removeItem(key);
    } catch (_) {}
    return null;
  }
  function notice(message) {
    var node = document.getElementById("hn-billing-notice");
    if (!node) {
      node = document.createElement("div");
      node.id = "hn-billing-notice";
      node.setAttribute("role", "status");
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.hidden = false;
    clearTimeout(notice._timeout);
    notice._timeout = setTimeout(function () { node.hidden = true; }, 5000);
  }
  function ensureModal() {
    if (MODAL) return MODAL;
    MODAL = document.createElement("div");
    MODAL.className = "hn-billing-overlay";
    MODAL.hidden = true;
    MODAL.innerHTML =
      '<div class="hn-billing-dialog" role="dialog" aria-modal="true" aria-labelledby="hn-billing-title">' +
        '<button type="button" class="hn-billing-close" aria-label="关闭">×</button>' +
        '<div class="hn-billing-symbol">🔐</div>' +
        '<h2 id="hn-billing-title">发布权益</h2>' +
        '<p class="hn-billing-desc">选择适合你的发布服务，付款成功后即可获得对应权限。</p>' +
        '<div class="hn-billing-choices">' +
          '<button type="button" data-plan="single"><strong>单次发布</strong><small>发布一份正式协议链接</small></button>' +
          '<button type="button" data-plan="lifetime"><strong>永久权益</strong><small>不限次数发布隐私协议</small></button>' +
        '</div>' +
        '<div class="hn-billing-checkout" hidden>' +
          '<p class="hn-billing-amount-label">请确认本次支付金额</p>' +
          '<div class="hn-billing-amount"></div>' +
          '<p class="hn-billing-subtitle">付款完成并由服务器核验后自动开通权益</p>' +
          '<button type="button" class="hn-billing-buy">确认金额并创建支付宝订单</button>' +
          '<a class="hn-billing-pay-link" href="#" target="_blank" rel="noopener noreferrer" hidden>前往支付宝付款</a>' +
          '<button type="button" class="hn-billing-verify" hidden>我已付款，检查到账</button>' +
          '<button type="button" class="hn-billing-back">返回选择</button>' +
        '</div>' +
        '<p class="hn-billing-msg" role="status" aria-live="polite"></p>' +
      '</div>';
    document.body.appendChild(MODAL);
    MODAL.querySelector(".hn-billing-close").addEventListener("click", close);
    MODAL.querySelector(".hn-billing-back").addEventListener("click", function () { showChoices(); });
    MODAL.querySelectorAll("[data-plan]").forEach(function (btn) {
      btn.addEventListener("click", function () { showPlan(btn.getAttribute("data-plan")); });
    });
    MODAL.querySelector(".hn-billing-buy").addEventListener("click", createOrder);
    MODAL.querySelector(".hn-billing-verify").addEventListener("click", checkPaid);
    MODAL.addEventListener("click", function (e) { if (e.target === MODAL) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && MODAL && !MODAL.hidden) close();
    });
    return MODAL;
  }
  function setMessage(text) {
    ensureModal().querySelector(".hn-billing-msg").textContent = text || "";
  }
  function showChoices() {
    var m = ensureModal();
    PLAN = "";
    m.querySelector(".hn-billing-choices").hidden = false;
    m.querySelector(".hn-billing-checkout").hidden = true;
    setMessage("");
  }
  function showPlan(plan) {
    if (!Object.prototype.hasOwnProperty.call(EXPECTED_AMOUNTS, plan)) return;
    var m = ensureModal();
    PLAN = plan;
    m.querySelector(".hn-billing-choices").hidden = true;
    m.querySelector(".hn-billing-checkout").hidden = false;
    m.querySelector(".hn-billing-amount").textContent =
      "¥" + (EXPECTED_AMOUNTS[plan] / 100).toFixed(2);
    m.querySelector(".hn-billing-buy").hidden = false;
    m.querySelector(".hn-billing-pay-link").hidden = true;
    m.querySelector(".hn-billing-verify").hidden = true;
    setMessage("");
  }
  function open(token) {
    TOKEN = token || TOKEN;
    ensureModal().hidden = false;
    showChoices();
    ensureModal().querySelector(".hn-billing-close").focus();
  }
  function close() {
    if (MODAL) MODAL.hidden = true;
  }
  async function createOrder() {
    if (!TOKEN || !PLAN) return setMessage("请先登录并选择服务");
    var m = ensureModal();
    var buy = m.querySelector(".hn-billing-buy");
    buy.disabled = true;
    setMessage("正在安全创建订单…");
    try {
      var order = await api("create-alipay-order", TOKEN, { plan: PLAN });
      if (order.amount_fen !== EXPECTED_AMOUNTS[PLAN] ||
          !/^https:\/\/openapi\.alipay\.com\/gateway\.do\?/.test(order.pay_url || "")) {
        throw new Error("支付信息校验失败，请联系管理员");
      }
      var link = m.querySelector(".hn-billing-pay-link");
      link.href = order.pay_url;
      link.hidden = false;
      m.querySelector(".hn-billing-verify").hidden = false;
      buy.hidden = true;
      setMessage("订单已创建。点击「前往支付宝付款」，付款后返回本页核验。");
    } catch (e) {
      setMessage(e && e.message ? e.message : "创建订单失败");
    } finally {
      buy.disabled = false;
    }
  }
  async function checkPaid() {
    var m = ensureModal();
    var button = m.querySelector(".hn-billing-verify");
    button.disabled = true;
    setMessage("正在核验服务器到账状态…");
    try {
      var status = await api("get-billing-status", TOKEN);
      if (status.can_publish) {
        close();
        notice("已确认支付权益，请重新点击「发布」生成正式链接。");
      } else {
        setMessage("尚未确认付款成功。请确保已在支付宝完成付款，稍后再检查。");
      }
    } catch (e) {
      setMessage("暂时无法查询到账状态，请稍后重试。");
    } finally {
      button.disabled = false;
    }
  }

  var apiPublic = {
    async ensureCanPublish(token) {
      try {
        var status = await api("get-billing-status", token);
        if (!status.enabled || status.can_publish) return true;
        open(token);
        return false;
      } catch (error) {
        // Compatibility while server migration is not deployed. The publish
        // endpoint always enforces entitlements after billing is activated.
        if (error.status === 404 || error.status === 500 || error.status === 503) return true;
        notice("发布权益校验失败，请重新登录后再试。");
        return false;
      }
    },
    showPayment: open,
    requestId(kind, values) {
      var key = "hn-publish-attempt-" + kind;
      var fingerprint = JSON.stringify(values);
      var previous = safeSession("get", key);
      if (previous) {
        try {
          var parsed = JSON.parse(previous);
          if (parsed.fingerprint === fingerprint && parsed.id) return parsed.id;
        } catch (_) {}
      }
      var id = window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID() : "";
      if (!id) throw new Error("当前浏览器不支持安全生成发布编号");
      safeSession("set", key, JSON.stringify({ fingerprint: fingerprint, id: id }));
      return id;
    },
    published(kind) {
      safeSession("remove", "hn-publish-attempt-" + kind);
    },
  };
  window.HNPayGate = apiPublic;
})();
