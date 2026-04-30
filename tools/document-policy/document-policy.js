(function () {
  var titleEl = document.getElementById("policy-title");
  var fileEl = document.getElementById("policy-file");
  var sourceEl = document.getElementById("policy-source");
  var previewEl = document.getElementById("doc-preview");
  var btnPublish = document.getElementById("btn-publish-doc");
  var btnCopy = document.getElementById("btn-copy-doc-link");
  var btnClear = document.getElementById("btn-clear-doc");
  var urlEl = document.getElementById("published-doc-url");
  var timeEl = document.getElementById("publish-doc-time");
  var toastEl = document.getElementById("doc-toast");
  var hintTitle = document.getElementById("hint-title");
  var hintFile = document.getElementById("hint-file");
  var hintSource = document.getElementById("hint-source");
  var SB_CFG = window.SupabaseConfig || {};
  var currentHtml = "";
  var currentText = "";

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toastEl.hidden = true;
    }, 3600);
  }

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

  function textToHtml(text) {
    return String(text || "")
      .split(/\n{2,}/)
      .map(function (block) {
        var lines = block.split(/\n/).map(escapeHtml).join("<br>");
        return lines.trim() ? "<p>" + lines + "</p>" : "";
      })
      .join("");
  }

  function inferTitleFromText(text) {
    var lines = String(text || "").split(/\n+/).map(function (line) {
      return line.trim();
    }).filter(Boolean);
    if (!lines.length) return "";
    return lines[0].slice(0, 80);
  }

  function setPreview(html) {
    currentHtml = sanitizeHtml(html);
    previewEl.innerHTML = currentHtml || '<p class="doc-empty">上传文档或粘贴正文后，这里会显示正式链接中的内容。</p>';
    currentText = (previewEl.innerText || previewEl.textContent || "").trim();
  }

  function setHint(el, message, isError) {
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-error", !!isError);
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(reader.error || new Error("文件读取失败")); };
      reader.readAsText(file, "utf-8");
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error("文件读取失败")); };
      reader.readAsArrayBuffer(file);
    });
  }

  async function handleFile(file) {
    if (!file) return;
    setHint(hintFile, "正在读取文档...", false);
    try {
      var lowerName = String(file.name || "").toLowerCase();
      var html = "";
      if (/\.docx$/.test(lowerName)) {
        if (!window.mammoth || !window.mammoth.convertToHtml) {
          throw new Error("Word 解析组件加载失败，请刷新页面重试");
        }
        var buffer = await readFileAsArrayBuffer(file);
        var result = await window.mammoth.convertToHtml({ arrayBuffer: buffer });
        html = result && result.value ? result.value : "";
      } else if (/\.html?$/.test(lowerName) || /^text\/html/i.test(file.type || "")) {
        html = await readFileAsText(file);
      } else {
        html = textToHtml(await readFileAsText(file));
      }
      setPreview(html);
      sourceEl.value = currentText;
      if (!titleEl.value.trim()) {
        titleEl.value = inferTitleFromText(currentText) || String(file.name || "").replace(/\.[^.]+$/, "");
      }
      setHint(hintFile, "文档已读取，请核对右侧预览。", false);
    } catch (e) {
      setHint(hintFile, (e && e.message) || "文档读取失败", true);
      showToast("文档读取失败，请确认文件格式");
    }
  }

  function getFunctionsBaseUrl() {
    if (!SB_CFG.SUPABASE_URL) return "";
    return String(SB_CFG.SUPABASE_URL).replace(/\/+$/, "") + "/functions/v1";
  }

  async function getCurrentAccessToken() {
    try {
      var client = window.AppSupabaseClient;
      if (!client || !client.auth || !client.auth.getSession) return "";
      var res = await client.auth.getSession();
      var session = res && res.data && res.data.session;
      return session && session.access_token || "";
    } catch (_e) {
      return "";
    }
  }

  async function createDocumentPolicyLink(values, accessToken) {
    var base = getFunctionsBaseUrl();
    if (!base || !SB_CFG.SUPABASE_ANON_KEY) throw new Error("Supabase 配置缺失");
    var res = await fetch(base + "/create-document-policy-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SB_CFG.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + accessToken,
      },
      body: JSON.stringify(values),
    });
    var raw = await res.text();
    var json = {};
    try { json = raw ? JSON.parse(raw) : {}; } catch (_e) {}
    if (!res.ok) throw new Error((json && json.error) || raw || ("HTTP " + res.status));
    if (!json.short_code) throw new Error("返回格式错误：short_code 为空");
    return String(json.short_code);
  }

  function getSiteRootPrefix() {
    var path = window.location.pathname || "/";
    var key = "/tools/document-policy";
    var i = path.indexOf(key);
    if (i !== -1) {
      var prefix = path.slice(0, i);
      return (prefix ? prefix.replace(/\/?$/, "") : "") + "/";
    }
    return "/";
  }

  function buildUrl(shortCode) {
    var root = window.location.origin + getSiteRootPrefix();
    if (!root.endsWith("/")) root += "/";
    var url = new URL("document-policy.html", root);
    url.searchParams.set("id", shortCode);
    return url.href;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); resolve(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  function validate() {
    setHint(hintTitle, "", false);
    setHint(hintSource, "", false);
    var ok = true;
    if (!titleEl.value.trim()) {
      setHint(hintTitle, "请填写链接标题", true);
      ok = false;
    }
    if (!currentHtml || !currentText) {
      setHint(hintSource, "请上传文档或粘贴正文", true);
      ok = false;
    }
    if (currentHtml.length > 400000) {
      setHint(hintSource, "文档内容过大，请拆分或压缩后再发布", true);
      ok = false;
    }
    return ok;
  }

  fileEl.addEventListener("change", function () {
    var file = fileEl.files && fileEl.files[0];
    if (file) handleFile(file);
  });

  sourceEl.addEventListener("input", function () {
    var raw = sourceEl.value || "";
    var html = /<\/?[a-z][\s\S]*>/i.test(raw) ? raw : textToHtml(raw);
    setPreview(html);
    if (!titleEl.value.trim()) titleEl.value = inferTitleFromText(currentText);
  });

  btnClear.addEventListener("click", function () {
    fileEl.value = "";
    sourceEl.value = "";
    setPreview("");
    setHint(hintFile, "选择文档后会自动生成右侧预览；也可以直接粘贴正文。", false);
    setHint(hintSource, "", false);
  });

  btnPublish.addEventListener("click", async function () {
    if (!validate()) return;
    btnPublish.disabled = true;
    try {
      var token = await getCurrentAccessToken();
      if (!token) {
        showToast("请先登录后再发布");
        btnPublish.disabled = false;
        return;
      }
      var code = await createDocumentPolicyLink({
        title: titleEl.value.trim(),
        content_html: currentHtml,
        content_text: currentText.slice(0, 20000),
      }, token);
      var url = buildUrl(code);
      urlEl.value = url;
      timeEl.textContent = "最近一次生成：" + new Date().toLocaleTimeString("zh-CN", { hour12: false });
      window.open(url, "_blank", "noopener,noreferrer");
      copyText(url).then(
        function () { showToast("发布成功，正式链接已复制"); },
        function () { showToast("发布成功，请手动复制正式链接"); }
      );
    } catch (e) {
      console.error("[document-policy] publish failed", e);
      showToast("发布失败：" + ((e && e.message) || "请稍后重试"));
    } finally {
      btnPublish.disabled = false;
    }
  });

  btnCopy.addEventListener("click", function () {
    var link = urlEl.value.trim();
    if (!link) return showToast("请先生成正式链接");
    copyText(link).then(
      function () { showToast("正式链接已复制"); },
      function () { showToast("复制失败，请手动选择复制"); }
    );
  });
})();
