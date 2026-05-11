const META_PREFIX = ".meta/";
const THUMB_PREFIX = ".thumbs/";

export default {
  async fetch(request, env) {
    const cors = getCorsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      const url = new URL(request.url);
      if (url.pathname === "/health") {
        return json({ ok: true, service: "asset-manager-worker" }, cors);
      }
      const publicAssetMatch = url.pathname.match(/^\/assets\/(.+)$/);
      if (publicAssetMatch && request.method === "GET") {
        return servePublicAsset(publicAssetMatch[1], env, cors);
      }
      if (url.pathname === "/api/assets" && request.method === "GET") {
        requireAuth(request, env);
        return listAssets(request, env, cors);
      }
      if (url.pathname === "/api/assets/stats" && request.method === "GET") {
        requireAuth(request, env);
        return assetStats(env, cors);
      }
      if (url.pathname === "/api/assets/upload" && request.method === "POST") {
        requireAuth(request, env);
        return uploadAsset(request, env, cors);
      }
      const assetMatch = url.pathname.match(/^\/api\/assets\/([^/]+)$/);
      if (assetMatch && request.method === "PATCH") {
        requireAuth(request, env);
        return updateAsset(assetMatch[1], request, env, cors);
      }
      if (assetMatch && request.method === "DELETE") {
        requireAuth(request, env);
        return deleteAsset(assetMatch[1], env, cors);
      }
      return json({ ok: false, error: "Not found" }, cors, 404);
    } catch (error) {
      return json({ ok: false, error: error.message || "Worker error" }, cors, error.status || 500);
    }
  },
};

async function uploadAsset(request, env, cors) {
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") throw httpError("Missing file", 400);

  const now = new Date();
  const extension = getExtension(file.name);
  const category = sanitizePath(form.get("category") || "uncategorized");
  const gameSlug = slugify(form.get("gameName") || "unknown-game");
  const assetId = `asset_${crypto.randomUUID()}`;
  const key = `${gameSlug}/${category}/${now.getUTCFullYear()}/${formatKeyDate(now)}-${randomPart()}.${extension || "bin"}`;
  const publicBaseUrl = String(env.R2_PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/+$/, "");
  const publicUrl = `${publicBaseUrl}/assets/${key}`;

  await env.ASSETS_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  const metadata = {
    id: assetId,
    key,
    publicUrl,
    originalName: file.name,
    fileName: file.name,
    gameName: String(form.get("gameName") || ""),
    channelName: String(form.get("channelName") || ""),
    category: String(form.get("category") || "未分类"),
    tags: parseTags(form.get("tags")),
    note: String(form.get("note") || ""),
    width: nullableNumber(form.get("width")),
    height: nullableNumber(form.get("height")),
    orientation: String(form.get("orientation") || "未知"),
    detectedType: String(form.get("detectedType") || ""),
    isPublic: String(form.get("isPublic") || "true") !== "false",
    extension,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: now.toISOString(),
    thumbKey: `${THUMB_PREFIX}${key}.webp`,
  };
  await env.ASSETS_BUCKET.put(`${META_PREFIX}${assetId}.json`, JSON.stringify(metadata, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  return json({ ok: true, asset: metadata }, cors);
}

async function servePublicAsset(encodedKey, env, cors) {
  const key = decodeURIComponent(encodedKey);
  if (!key || key.startsWith(META_PREFIX) || key.startsWith(THUMB_PREFIX)) {
    throw httpError("Not found", 404);
  }
  const object = await env.ASSETS_BUCKET.get(key);
  if (!object) throw httpError("Asset not found", 404);
  const headers = new Headers(cors);
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

async function listAssets(request, env, cors) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 200), 500);
  const cursor = url.searchParams.get("cursor") || undefined;
  const listed = await env.ASSETS_BUCKET.list({ prefix: META_PREFIX, limit, cursor });
  const items = [];
  for (const object of listed.objects) {
    const value = await env.ASSETS_BUCKET.get(object.key);
    if (!value) continue;
    items.push(await value.json());
  }
  const filtered = filterItems(items, url.searchParams);
  return json({ ok: true, items: filtered, cursor: listed.truncated ? listed.cursor : null }, cors);
}

async function updateAsset(assetId, request, env, cors) {
  const metaKey = `${META_PREFIX}${assetId}.json`;
  const existing = await env.ASSETS_BUCKET.get(metaKey);
  if (!existing) throw httpError("Asset not found", 404);
  const metadata = await existing.json();
  const patch = await request.json();
  ["gameName", "channelName", "category", "note"].forEach((key) => {
    if (patch[key] !== undefined) metadata[key] = String(patch[key]);
  });
  if (patch.tags !== undefined) metadata.tags = Array.isArray(patch.tags) ? patch.tags : parseTags(patch.tags);
  metadata.updatedAt = new Date().toISOString();
  await env.ASSETS_BUCKET.put(metaKey, JSON.stringify(metadata, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return json({ ok: true, asset: metadata }, cors);
}

async function deleteAsset(assetId, env, cors) {
  const metaKey = `${META_PREFIX}${assetId}.json`;
  const existing = await env.ASSETS_BUCKET.get(metaKey);
  if (!existing) throw httpError("Asset not found", 404);
  const metadata = await existing.json();
  await Promise.all([
    env.ASSETS_BUCKET.delete(metadata.key),
    metadata.thumbKey ? env.ASSETS_BUCKET.delete(metadata.thumbKey) : Promise.resolve(),
    env.ASSETS_BUCKET.delete(metaKey),
  ]);
  return json({ ok: true }, cors);
}

async function assetStats(env, cors) {
  const listed = await env.ASSETS_BUCKET.list({ prefix: META_PREFIX, limit: 1000 });
  let total = 0;
  let images = 0;
  let videos = 0;
  let archives = 0;
  let totalSize = 0;
  for (const object of listed.objects) {
    const value = await env.ASSETS_BUCKET.get(object.key);
    if (!value) continue;
    const item = await value.json();
    total += 1;
    totalSize += Number(item.size) || 0;
    if (String(item.mimeType || "").startsWith("image/")) images += 1;
    else if (String(item.mimeType || "").startsWith("video/")) videos += 1;
    else if (["zip", "rar", "7z"].includes(item.extension)) archives += 1;
  }
  return json({ ok: true, total, images, videos, archives, others: total - images - videos - archives, totalSize }, cors);
}

function requireAuth(request, env) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!env.ASSET_MANAGER_TOKEN || token !== env.ASSET_MANAGER_TOKEN) {
    throw httpError("Unauthorized", 401);
  }
}

function filterItems(items, params) {
  const keyword = normalize(params.get("keyword"));
  return items.filter((item) => {
    const haystack = normalize([item.fileName, item.gameName, item.channelName, item.category, item.tags?.join(","), item.note, `${item.width}x${item.height}`].join(" "));
    return (!keyword || haystack.includes(keyword))
      && matchParam(params, "gameName", item.gameName)
      && matchParam(params, "channelName", item.channelName)
      && matchParam(params, "category", item.category)
      && matchParam(params, "orientation", item.orientation)
      && matchParam(params, "format", item.extension);
  });
}

function matchParam(params, key, value) {
  const expected = params.get(key);
  return !expected || expected === String(value || "");
}

function getCorsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function formatKeyDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function randomPart() {
  return crypto.randomUUID().slice(0, 4);
}

function slugify(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function sanitizePath(value) {
  return slugify(value) || "uncategorized";
}

function getExtension(filename) {
  const match = String(filename || "").toLowerCase().match(/\.([^.]+)$/);
  return match ? match[1] : "bin";
}

function parseTags(value) {
  if (Array.isArray(value)) return value;
  return String(value || "").split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
}

function nullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}
