(function () {
  "use strict";
  var panel = document.getElementById("billing-account");
  if (!panel) return;
  var status = document.getElementById("billing-membership");
  var history = document.getElementById("billing-orders");
  var client = window.AppSupabaseClient;
  var cfg = window.SupabaseConfig || {};
  var base = String(cfg.SUPABASE_URL || "").replace(/\/+$/, "") + "/functions/v1";
  var lastRequest = 0;

  function setText(node, value) {
    if (node) node.textContent = value;
  }
  function fmtDate(date) {
    try { return new Date(date).toLocaleString("zh-CN", { hour12: false }); }
    catch (_) { return String(date || ""); }
  }
  function amountText(fen) {
    return "¥" + (Number(fen || 0) / 100).toFixed(2);
  }
  function statusLabel(state) {
    return ({ pending: "待支付", paid: "已支付", refunded: "已退款", closed: "已关闭" })[state] || state;
  }
  async function load() {
    var version = ++lastRequest;
    if (!client || !client.auth || !client.auth.getSession) return;
    try {
      var { data } = await client.auth.getSession();
      var token = data && data.session && data.session.access_token;
      if (!token) {
        panel.hidden = true;
        return;
      }
      panel.hidden = false;
      setText(status, "正在读取会员权益…");
      var resp = await fetch(base + "/get-billing-status", {
        headers: {
          apikey: cfg.SUPABASE_ANON_KEY,
          Authorization: "Bearer " + token,
        },
      });
      if (!resp.ok) throw new Error("not ready");
      var result = await resp.json();
      if (version !== lastRequest) return;
      var label = result.is_lifetime
        ? "永久权益 · 已开通"
        : result.publish_credits > 0
        ? "剩余 " + result.publish_credits + " 次发布额度"
        : result.enabled
        ? "尚无发布额度"
        : "支付服务准备中";
      setText(status, label);
      history.textContent = "";
      if (!Array.isArray(result.orders) || !result.orders.length) {
        history.textContent = "暂无支付订单";
        return;
      }
      result.orders.forEach(function (row) {
        var item = document.createElement("div");
        item.className = "billing-order-row";
        var left = document.createElement("div");
        var product = document.createElement("strong");
        product.textContent = row.plan === "lifetime" ? "永久权益" : "单次发布";
        var meta = document.createElement("small");
        meta.textContent = fmtDate(row.created_at) + " · " + row.order_no;
        left.appendChild(product);
        left.appendChild(meta);
        var right = document.createElement("div");
        right.className = "billing-order-right";
        var sum = document.createElement("strong");
        sum.textContent = amountText(row.amount_fen);
        var state = document.createElement("small");
        state.textContent = statusLabel(row.status);
        right.appendChild(sum);
        right.appendChild(state);
        item.appendChild(left);
        item.appendChild(right);
        history.appendChild(item);
      });
    } catch (_) {
      if (version === lastRequest) {
        panel.hidden = true; // avoid broken/incomplete billing widgets before rollout
      }
    }
  }
  if (client && client.auth && client.auth.onAuthStateChange) {
    client.auth.onAuthStateChange(function () { setTimeout(load, 0); });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
