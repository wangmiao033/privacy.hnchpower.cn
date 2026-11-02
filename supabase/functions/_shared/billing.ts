import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function billingEnabled(): boolean {
  return Deno.env.get("ALIPAY_BILLING_ENABLED") === "true";
}

export function getAdmin() {
  const url = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("APP_SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("Billing database credentials not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireUser(request: Request, admin: ReturnType<typeof getAdmin>) {
  const header = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(header)) return null;
  const token = header.replace(/^Bearer\s+/i, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.id || data.user.is_anonymous) return null;
  return data.user;
}

export function alipayAppId(): string {
  return Deno.env.get("ALIPAY_APP_ID") || "2021007114643065";
}

export function getPemDer(key: string): Uint8Array {
  const cleaned = key
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) throw new Error("Invalid RSA key format");
  return Uint8Array.from(atob(cleaned), (character) => character.charCodeAt(0));
}

export function canonical(params: Record<string, string>, exclude: string[] = ["sign"]): string {
  return Object.keys(params)
    .filter((key) => !exclude.includes(key) && params[key] !== "")
    .sort()
    .map((key) => key + "=" + params[key])
    .join("&");
}

export async function signAlipay(params: Record<string, string>): Promise<string> {
  const privateKeyText = Deno.env.get("ALIPAY_APP_PRIVATE_KEY") || "";
  if (!privateKeyText) throw new Error("Alipay app private key not configured");
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    getPemDer(privateKeyText),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(canonical(params)),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function verifyAlipayNotification(params: Record<string, string>): Promise<boolean> {
  const publicKeyText = Deno.env.get("ALIPAY_PUBLIC_KEY") || "";
  if (!publicKeyText || !params.sign || params.sign_type !== "RSA2") return false;
  try {
    const publicKey = await crypto.subtle.importKey(
      "spki",
      getPemDer(publicKeyText),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      getPemDer(params.sign),
      new TextEncoder().encode(canonical(params, ["sign", "sign_type"])),
    );
  } catch (_error) {
    return false;
  }
}

export function shanghaiTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  parts.forEach((part) => { map[part.type] = part.value; });
  return map.year + "-" + map.month + "-" + map.day + " " +
    map.hour + ":" + map.minute + ":" + map.second;
}
