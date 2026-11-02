import {
  CORS_HEADERS, alipayAppId, billingEnabled, getAdmin,
  verifyAlipayNotification,
} from "../_shared/billing.ts";

const TEXT_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "text/plain; charset=utf-8",
};

function reply(body: string, status = 200) {
  return new Response(body, { status, headers: TEXT_HEADERS });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return reply("ok");
  if (request.method !== "POST") return reply("fail", 405);
  if (!billingEnabled()) return reply("fail", 503);

  try {
    const type = request.headers.get("Content-Type") || "";
    if (!/application\/x-www-form-urlencoded/i.test(type)) return reply("fail", 400);
    const raw = await request.text();
    if (raw.length > 30_000) return reply("fail", 413);
    const form = new URLSearchParams(raw);
    const params: Record<string, string> = {};
    form.forEach((value, key) => { params[key] = value; });

    if (params.app_id !== alipayAppId()) return reply("fail", 400);
    const sellerId = Deno.env.get("ALIPAY_SELLER_ID") || "";
    if (!sellerId || params.seller_id !== sellerId) return reply("fail", 400);
    if (!await verifyAlipayNotification(params)) return reply("fail", 400);

    // A signed notification is not enough: validate amount and our order number in SQL.
    const tradeStatus = params.trade_status;
    if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
      return reply("success");
    }
    const amountText = params.total_amount || "";
    if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(amountText)) return reply("fail", 400);
    const amountFen = Math.round(Number(amountText) * 100);
    const orderNo = params.out_trade_no || "";
    const tradeNo = params.trade_no || "";
    if (!/^HN[A-Z0-9]{24}$/.test(orderNo) ||
        !/^\d{10,64}$/.test(tradeNo) ||
        !Number.isSafeInteger(amountFen)) {
      return reply("fail", 400);
    }

    const admin = getAdmin();
    // The RPC locks the order and atomically grants exactly one entitlement.
    const { data, error } = await admin.rpc("billing_mark_paid", {
      p_order_no: orderNo, p_trade_no: tradeNo, p_amount_fen: amountFen,
    });
    if (error || data !== true) {
      console.error("[alipay-notify] order mismatch or processing failed", error?.message || "");
      return reply("fail", 500);
    }
    return reply("success");
  } catch (error) {
    console.error("[alipay-notify] processing failed", error instanceof Error ? error.message : "unknown");
    return reply("fail", 500);
  }
});
