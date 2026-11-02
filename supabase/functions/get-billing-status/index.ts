import {
  CORS_HEADERS, billingEnabled, getAdmin, json, requireUser,
} from "../_shared/billing.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = getAdmin();
    const user = await requireUser(request, admin);
    if (!user) return json({ error: "Please sign in" }, 401);

    const [entitlement, orders] = await Promise.all([
      admin.from("billing_entitlements")
        .select("publish_credits,is_lifetime")
        .eq("user_id", user.id).maybeSingle(),
      admin.from("billing_orders")
        .select("order_no,plan,amount_fen,status,created_at,paid_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);
    if (entitlement.error || orders.error) throw entitlement.error || orders.error;
    const credits = Math.max(0, entitlement.data?.publish_credits || 0);
    const isLifetime = entitlement.data?.is_lifetime === true;
    return json({
      enabled: billingEnabled(),
      is_lifetime: isLifetime,
      publish_credits: credits,
      can_publish: isLifetime || credits > 0,
      orders: orders.data || [],
    });
  } catch (error) {
    console.error("[billing-status] failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Unable to read billing status" }, 500);
  }
});
