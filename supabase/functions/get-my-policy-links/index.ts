import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("APP_SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("APP_SUPABASE_SECRET_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Function env not configured" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(authHeader)) return json({ error: "Missing authorization header" }, 401);
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const admin = createClient(supabaseUrl, serviceKey);
  const userRes = await admin.auth.getUser(jwt);
  const userId = userRes.data.user?.id;
  if (userRes.error || !userId) return json({ error: "Invalid user token" }, 401);

  const result = await admin
    .from("policy_links")
    .select("short_code, company, game, created_at, created_by")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (result.error) return json({ error: result.error.message || "Query failed" }, 500);
  return json({ data: result.data || [] });
});
