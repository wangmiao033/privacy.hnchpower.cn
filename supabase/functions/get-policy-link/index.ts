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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Function env not configured" }, 500);

  const admin = createClient(supabaseUrl, serviceKey);
  const url = new URL(req.url);
  const shortCode = (url.searchParams.get("id") || url.searchParams.get("code") || "").trim();

  if (!shortCode) return json({ error: "Missing id/code" }, 400);
  if (!/^[A-Za-z0-9]{4,16}$/.test(shortCode)) return json({ error: "Invalid short code format" }, 400);

  const result = await admin
    .from("policy_links")
    .select("short_code, company, game, email, date, created_at")
    .eq("short_code", shortCode)
    .maybeSingle();

  if (result.error) return json({ error: result.error.message || "Query failed" }, 500);
  if (!result.data) return json({ error: "Short link not found" }, 404);

  return json({ data: result.data });
});
