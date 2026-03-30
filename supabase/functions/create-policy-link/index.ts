import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CODE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function genCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Function env not configured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const anon = createClient(supabaseUrl, anonKey);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const company = String(body.company || "").trim();
  const game = String(body.game || "").trim();
  const email = String(body.email || "").trim();
  const date = String(body.date || "").trim();

  if (!company || !game || !email || !date) return json({ error: "Missing required fields" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email format" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Invalid date format, expected YYYY-MM-DD" }, 400);

  let createdBy: string | null = null;
  const authHeader = req.headers.get("Authorization") || "";
  if (/^Bearer\s+/i.test(authHeader)) {
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const userRes = await anon.auth.getUser(jwt);
    createdBy = userRes.data.user?.id || null;
  }

  for (let i = 0; i < 8; i++) {
    const shortCode = genCode(6);
    const insertRes = await admin.from("policy_links").insert({
      short_code: shortCode,
      company,
      game,
      email,
      date,
      created_by: createdBy,
    });
    if (!insertRes.error) return json({ short_code: shortCode });
    if (insertRes.error.code !== "23505") {
      return json({ error: insertRes.error.message || "Insert failed" }, 500);
    }
  }

  return json({ error: "Short code generation conflict, please retry" }, 500);
});
