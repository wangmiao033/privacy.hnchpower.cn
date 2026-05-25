const { readFileSync } = require("fs");
const { join } = require("path");

const SUPABASE_URL = (
  process.env.APP_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://bypekqxsnuvqbgvdosdl.supabase.co"
).replace(/\/+$/, "");

const SUPABASE_ANON_KEY =
  process.env.APP_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_TFfmF3_7t8ceSwP1B0iKxA_sfcb5kca";

const SUPABASE_SECRET_KEY =
  process.env.APP_SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMeta(createdAt) {
  if (!createdAt) return "正式展示页";
  try {
    return "生成时间：" + new Date(createdAt).toLocaleString("zh-CN");
  } catch (_e) {
    return "正式展示页";
  }
}

function renderErrorHtml(message, detail) {
  return readFileSync(join(process.cwd(), "document-policy.html"), "utf8")
    .replace(/<html lang="zh-CN">/, '<html lang="zh-CN" data-doc-rendered="ssr">')
    .replace(
      /<main class="doc-shell">[\s\S]*?<\/main>/,
      [
        '<main class="doc-shell is-ready">',
        '  <section class="doc-error">',
        "    <h1>无法展示文档</h1>",
        "    <p>" + escapeHtml(message) + "</p>",
        detail ? "    <p>" + escapeHtml(detail) + "</p>" : "",
        "  </section>",
        "</main>",
      ].join("\n")
    )
    .replace(/<title>[\s\S]*?<\/title>/, "<title>隐私协议文档 - 无法展示</title>");
}

async function fetchDocument(shortCode) {
  if (SUPABASE_SECRET_KEY) {
    const res = await fetch(
      SUPABASE_URL +
        "/rest/v1/document_policy_links?short_code=eq." +
        encodeURIComponent(shortCode) +
        "&select=short_code,title,content_html,created_at",
      {
        headers: {
          apikey: SUPABASE_SECRET_KEY,
          Authorization: "Bearer " + SUPABASE_SECRET_KEY,
        },
      }
    );
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows[0]) return rows[0];
    }
  }

  const res = await fetch(
    SUPABASE_URL + "/functions/v1/get-document-policy-link?id=" + encodeURIComponent(shortCode),
    {
      headers: { apikey: SUPABASE_ANON_KEY },
    }
  );
  const raw = await res.text();
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch (_e) {}
  if (!res.ok) {
    throw new Error((json && json.error) || raw || "HTTP " + res.status);
  }
  if (!json.data) throw new Error("返回格式错误：data 为空");
  return json.data;
}

function renderDocumentHtml(row) {
  const title = String(row.title || "隐私协议文档");
  const meta = formatMeta(row.created_at);
  const content = String(row.content_html || "");

  return readFileSync(join(process.cwd(), "document-policy.html"), "utf8")
    .replace(/<html lang="zh-CN">/, '<html lang="zh-CN" data-doc-rendered="ssr">')
    .replace(
      /<main class="doc-shell">[\s\S]*?<\/main>/,
      [
        '<main class="doc-shell is-ready">',
        '  <header class="doc-header">',
        '    <p class="doc-kicker">隐私协议文档</p>',
        '    <h1 id="doc-title" class="doc-title">' + escapeHtml(title) + "</h1>",
        '    <p id="doc-meta" class="doc-meta">' + escapeHtml(meta) + "</p>",
        "  </header>",
        '  <article id="doc-article" class="doc-article">',
        content,
        "  </article>",
        "</main>",
      ].join("\n")
    )
    .replace(/<title>[\s\S]*?<\/title>/, "<title>" + escapeHtml(title) + "</title>")
    .replace(/\s*<script src="document-policy\.js"><\/script>\s*/, "\n");
}

module.exports = async function handler(req, res) {
  const id = String((req.query && (req.query.id || req.query.code)) || "").trim();

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  if (!/^[A-Za-z0-9]{4,16}$/.test(id)) {
    res.statusCode = 400;
    res.end(
      renderErrorHtml("链接缺少有效的文档编号。", "请从文档隐私链接工具重新生成。")
    );
    return;
  }

  try {
    const row = await fetchDocument(id);
    res.statusCode = 200;
    res.end(renderDocumentHtml(row));
  } catch (e) {
    res.statusCode = 404;
    res.end(
      renderErrorHtml("短链无效或已失效。", (e && e.message) || "请确认链接正确，或重新生成。")
    );
  }
};
