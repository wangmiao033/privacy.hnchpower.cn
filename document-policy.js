(function () {
  var titleEl = document.getElementById("doc-title");
  var metaEl = document.getElementById("doc-meta");
  var articleEl = document.getElementById("doc-article");
  var SB_CFG = window.SupabaseConfig || {};

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeHtml(html) {
    var template = document.createElement("template");
    template.innerHTML = String(html || "");
    var allowedTags = {
      A: true, B: true, BLOCKQUOTE: true, BR: true, CAPTION: true, CODE: true, COL: true, COLGROUP: true,
      DD: true, DIV: true, DL: true, DT: true, EM: true, H1: true, H2: true, H3: true, H4: true,
      H5: true, H6: true, HR: true, I: true, LI: true, OL: true, P: true, PRE: true, S: true,
      SPAN: true, STRONG: true, SUB: true, SUP: true, TABLE: true, TBODY: true, TD: true, TFOOT: true,
      TH: true, THEAD: true, TR: true, U: true, UL: true,
    };
    var allowedAttrs = { href: true, title: true, colspan: true, rowspan: true };
    function clean(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (!allowedTags[child.tagName]) {
            child.replaceWith(document.createTextNode(child.textContent || ""));
            return;
          }
          Array.prototype.slice.call(child.attributes).forEach(function (attr) {
            var name = attr.name.toLowerCase();
            var value = attr.value || "";
            if (!allowedAttrs[name]) {
              child.removeAttribute(attr.name);
              return;
            }
            if (name === "href" && !/^(https?:|mailto:|#|\/)/i.test(value)) {
              child.removeAttribute(attr.name);
            }
          });
          clean(child);
        } else if (child.nodeType !== Node.TEXT_NODE) {
          child.remove();
        }
      });
    }
    clean(template.content);
    return template.innerHTML.trim();
  }

  function renderError(message, detail) {
    titleEl.textContent = "无法展示文档";
    metaEl.textContent = "链接无效或服务暂不可用";
    articleEl.className = "doc-error";
    articleEl.innerHTML =
      "<h1>无法展示文档</h1>" +
      "<p>" + escapeHtml(message) + "</p>" +
      (detail ? "<p>" + escapeHtml(detail) + "</p>" : "");
    document.title = "隐私协议文档 - 无法展示";
  }

  function getFunctionsBaseUrl() {
    if (!SB_CFG.SUPABASE_URL) return "";
    return String(SB_CFG.SUPABASE_URL).replace(/\/+$/, "") + "/functions/v1";
  }

  async function fetchDocument(shortCode) {
    var base = getFunctionsBaseUrl();
    if (!base || !SB_CFG.SUPABASE_ANON_KEY) throw new Error("Supabase 配置缺失");
    var res = await fetch(base + "/get-document-policy-link?id=" + encodeURIComponent(shortCode), {
      method: "GET",
      headers: { apikey: SB_CFG.SUPABASE_ANON_KEY },
    });
    var raw = await res.text();
    var json = {};
    try { json = raw ? JSON.parse(raw) : {}; } catch (_e) {}
    if (!res.ok) throw new Error((json && json.error) || raw || ("HTTP " + res.status));
    if (!json.data) throw new Error("返回格式错误：data 为空");
    return json.data;
  }

  async function run() {
    var sp = new URLSearchParams(window.location.search);
    var id = (sp.get("id") || sp.get("code") || "").trim();
    if (!/^[A-Za-z0-9]{4,16}$/.test(id)) {
      renderError("链接缺少有效的文档编号。", "请从文档隐私链接工具重新生成。");
      return;
    }
    try {
      var row = await fetchDocument(id);
      var title = String(row.title || "隐私协议文档");
      titleEl.textContent = title;
      metaEl.textContent = row.created_at ? "生成时间：" + new Date(row.created_at).toLocaleString("zh-CN") : "正式展示页";
      articleEl.className = "doc-article";
      articleEl.innerHTML = sanitizeHtml(row.content_html || "");
      document.title = title;
    } catch (e) {
      renderError("短链无效或已失效。", (e && e.message) || "请确认链接正确，或重新生成。");
    }
  }

  run();
})();
