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

  const policyResult = await admin
    .from("policy_links")
    .select("short_code, company, game, created_at, created_by")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (policyResult.error) return json({ error: policyResult.error.message || "Query failed" }, 500);

  const docResult = await admin
    .from("document_policy_links")
    .select("short_code, title, created_at, created_by")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (docResult.error) return json({ error: docResult.error.message || "Query failed" }, 500);

  type Row =
    | {
        kind: "agreement";
        short_code: string;
        company: string;
        game: string;
        created_at: string;
      }
    | {
        kind: "document";
        short_code: string;
        title: string;
        created_at: string;
      };

  const agreementRows: Row[] = (policyResult.data || []).map((r) => ({
    kind: "agreement" as const,
    short_code: r.short_code,
    company: r.company,
    game: r.game,
    created_at: r.created_at,
  }));

  const documentRows: Row[] = (docResult.data || []).map((r) => ({
    kind: "document" as const,
    short_code: r.short_code,
    title: r.title,
    created_at: r.created_at,
  }));

  const merged = [...agreementRows, ...documentRows].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return tb - ta;
  }).slice(0, 100);

  return json({ data: merged });
});
