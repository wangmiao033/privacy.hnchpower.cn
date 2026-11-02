import {
  CORS_HEADERS, alipayAppId, billingEnabled, getAdmin, json,
  requireUser, shanghaiTimestamp, signAlipay,
} from "../_shared/billing.ts";

const PLANS: Record<string, { amount: number; subject: string }> = {
  single: { amount: 100, subject: "HN Tools 单次隐私协议发布" },
  lifetime: { amount: 9900, subject: "HN Tools 永久发布服务" },
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!billingEnabled()) return json({ error: "Payments are not enabled" }, 503);
  if (!Deno.env.get("ALIPAY_APP_PRIVATE_KEY") ||
      !Deno.env.get("ALIPAY_PUBLIC_KEY") ||
      !Deno.env.get("ALIPAY_SELLER_ID")) {
    return json({ error: "Payment merchant configuration incomplete" }, 503);
  }
  try {
    const admin = getAdmin();
    const user = await requireUser(request, admin);
    if (!user) return json({ error: "Please sign in" }, 401);

    const body = await request.json();
    const planName = typeof body.plan === "string" ? body.plan : "";
    const plan = PLANS[planName];
    if (!plan) return json({ error: "Unknown plan" }, 400);

    if (planName === "lifetime") {
      const { data: ent, error: entError } = await admin
        .from("billing_entitlements").select("is_lifetime")
        .eq("user_id", user.id).maybeSingle();
      if (entError) throw entError;
      if (ent?.is_lifetime) return json({ error: "Lifetime access already active" }, 409);
    }

    // Prevent accidental repeated clicks and unlimited pending orders.
    const since = new Date(Date.now() - 30_000).toISOString();
    const { data: recent, error: recentError } = await admin
      .from("billing_orders").select("order_no")
      .eq("user_id", user.id).eq("status", "pending")
      .gte("created_at", since).limit(1);
    if (recentError) throw recentError;
    if (recent?.length) return json({ error: "Please wait before creating another order" }, 429);

    const orderNo = "HN" + crypto.randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase();
    const { error: insertError } = await admin.from("billing_orders").insert({
      order_no: orderNo, user_id: user.id,
      plan: planName, amount_fen: plan.amount,
      payment_provider: "alipay", status: "pending",
    });
    if (insertError) throw insertError;

    const baseUrl = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
    const params: Record<string, string> = {
      app_id: alipayAppId(),
      method: "alipay.trade.page.pay",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: shanghaiTimestamp(),
      version: "1.0",
      notify_url: baseUrl.replace(/\/+$/, "") + "/functions/v1/alipay-notify",
      return_url: "https://privacy.hnchpower.cn/account.html?payment_return=1",
      biz_content: JSON.stringify({
        out_trade_no: orderNo,
        total_amount: (plan.amount / 100).toFixed(2),
        subject: plan.subject,
        product_code: "FAST_INSTANT_TRADE_PAY",
        timeout_express: "15m",
      }),
    };
    params.sign = await signAlipay(params);
    const payUrl = "https://openapi.alipay.com/gateway.do?" + new URLSearchParams(params);
    return json({
      order_no: orderNo,
      plan: planName,
      amount_fen: plan.amount,
      pay_url: payUrl,
    });
  } catch (error) {
    console.error("[alipay-create-order] failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Unable to create payment order" }, 500);
  }
});
