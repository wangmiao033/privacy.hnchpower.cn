import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CODE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MAX_HTML_LENGTH = 400_000;
const MAX_TEXT_LENGTH = 20_000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function genCode(length = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

function stripBlockedHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*("|')\s*javascript:[\s\S]*?\2/gi, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("APP_SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("APP_SUPABASE_SECRET_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Function env not configured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const title = String(body.title || "").trim().slice(0, 120);
  const contentHtmlRaw = String(body.content_html || "").trim();
  const contentText = String(body.content_text || "").trim().slice(0, MAX_TEXT_LENGTH);

  if (!title) return json({ error: "Missing title" }, 400);
  if (!contentHtmlRaw) return json({ error: "Missing content_html" }, 400);
  if (contentHtmlRaw.length > MAX_HTML_LENGTH) return json({ error: "Document content too large" }, 413);

  const authHeader = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+/i.test(authHeader)) {
    return json({ error: "Missing authorization header" }, 401);
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const userRes = await admin.auth.getUser(jwt);
  const createdBy = userRes.data.user?.id || null;
  if (userRes.error || !createdBy) {
    return json({ error: "Invalid user token" }, 401);
  }

  const contentHtml = stripBlockedHtml(contentHtmlRaw);
  if (!contentHtml) return json({ error: "Document content is empty after sanitizing" }, 400);

  for (let i = 0; i < 8; i++) {
    const shortCode = genCode(8);
    const insertRes = await admin.from("document_policy_links").insert({
      short_code: shortCode,
      title,
      content_html: contentHtml,
      content_text: contentText,
      created_by: createdBy,
    });
    if (!insertRes.error) return json({ short_code: shortCode });
    if (insertRes.error.code !== "23505") {
      return json({ error: insertRes.error.message || "Insert failed" }, 500);
    }
  }

  return json({ error: "Short code generation conflict, please retry" }, 500);
});
