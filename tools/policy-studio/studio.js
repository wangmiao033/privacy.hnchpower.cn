/* HN Tools policy studio: two publishing modes, one UI, existing backend contracts. */
(function () {
  "use strict";
  var PT = window.PolicyTemplate;
  var CFG = window.SupabaseConfig || {};
  var root = document.getElementById("studio-main");
  if (!root || !PT) return;

  var nodes = {
    upload: document.getElementById("upload-fields"),
    template: document.getElementById("template-fields"),
    uploadButton: document.getElementById("select-upload"),
    templateButton: document.getElementById("select-template"),
    modeLabel: document.getElementById("selected-mode-label"),
    title: document.getElementById("doc-title"),
    file: document.getElementById("doc-file"),
    drop: document.getElementById("doc-drop"),
    fileStatus: document.getElementById("file-status"),
    source: document.getElementById("doc-source"),
    paste: document.getElementById("paste-details"),
    company: document.getElementById("field-company"),
    game: document.getElementById("field-game"),
    email: document.getElementById("field-email"),
    date: document.getElementById("field-date"),
    preview: document.getElementById("studio-preview-content"),
    formHint: document.getElementById("studio-form-hint"),
    publish: document.getElementById("btn-publish"),
    mobilePublish: document.getElementById("btn-mobile-publish"),
    copyPreview: document.getElementById("btn-copy-preview"),
    print: document.getElementById("btn-print"),
    result: document.getElementById("publish-result"),
    resultInput: document.getElementById("published-url"),
    copyLink: document.getElementById("btn-copy-link"),
    openLink: document.getElementById("btn-open-link"),
    publishedTime: document.getElementById("publish-time"),
    toast: document.getElementById("studio-toast"),
  };

  var currentMode = "upload";
  var docHtml = "";
  var docText = "";
  var attempt = null;
  var inFlight = false;
  var toastTimeout = null;
  var MAX_FILE_BYTES = 5 * 1024 * 1024;
  var MAX_HTML = 400000;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function textToHtml(value) {
    return String(value || "").trim().split(/\n{2,}/)
      .map(function (part) {
        return "<p>" + part.split("\n").map(escapeHtml).join("<br>") + "</p>";
      }).join("");
  }

  function sanitizeHtml(raw) {
    var template = document.createElement("template");
    template.innerHTML = String(raw || "");
    var tags = {
      A:1, B:1, BLOCKQUOTE:1, BR:1, CAPTION:1, CODE:1, COL:1, COLGROUP:1,
      DD:1, DIV:1, DL:1, DT:1, EM:1, H1:1, H2:1, H3:1, H4:1, H5:1, H6:1,
      HR:1, I:1, LI:1, OL:1, P:1, PRE:1, S:1, SPAN:1, STRONG:1, SUB:1, SUP:1,
      TABLE:1, TBODY:1, TD:1, TFOOT:1, TH:1, THEAD:1, TR:1, U:1, UL:1
    };
    var removeEntirely = {
      SCRIPT:1, STYLE:1, IFRAME:1, OBJECT:1, EMBED:1, FORM:1,
      SVG:1, MATH:1, LINK:1, META:1, BASE:1, INPUT:1, BUTTON:1
    };
    var attributes = { href:1, title:1, colspan:1, rowspan:1 };
    function clean(container) {
      Array.prototype.slice.call(container.childNodes).forEach(function (child) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (removeEntirely[child.tagName]) { child.remove(); return; }
          if (!tags[child.tagName]) {
            var fragment = document.createDocumentFragment();
            while (child.firstChild) fragment.appendChild(child.firstChild);
            child.replaceWith(fragment);
            clean(container);
            return;
          }
          Array.prototype.slice.call(child.attributes).forEach(function (attr) {
            var key = attr.name.toLowerCase();
            var value = String(attr.value || "").trim();
            if (!attributes[key] ||
                (key === "href" && !/^(https?:\/\/|mailto:|#|\/(?!\/))/i.test(value))) {
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

  function readableDate(value) {
    var parts = String(value || "").split("-");
    return parts.length === 3
      ? parts[0] + "年" + Number(parts[1]) + "月" + Number(parts[2]) + "日"
      : "";
  }

  function uploadTitleFromText(text) {
    return String(text || "").split(/\n+/).map(function (v) { return v.trim(); })
      .filter(Boolean)[0]?.slice(0, 80) || "";
  }

  function showToast(message) {
    nodes.toast.textContent = message;
    nodes.toast.hidden = false;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () { nodes.toast.hidden = true; }, 4200);
  }
  function setFormHint(message, error) {
    nodes.formHint.textContent = message;
    nodes.formHint.classList.toggle("is-error", !!error);
  }
  function hideResult() {
    nodes.result.hidden = true;
    nodes.resultInput.value = "";
    nodes.openLink.removeAttribute("href");
  }
  function emptyPreview(message) {
    nodes.preview.innerHTML =
      '<div class="paper-empty"><span aria-hidden="true">▤</span>' +
      '<h3>你的协议将在这里展示</h3><p>' + escapeHtml(message) + "</p></div>";
  }

  function currentTemplate() {
    return {
      company: nodes.company.value.trim(),
      game: nodes.game.value.trim(),
      email: nodes.email.value.trim(),
      date: nodes.date.value,
    };
  }

  function updatePreview() {
    if (currentMode === "upload") {
      if (!docHtml || !docText) {
        emptyPreview("选择一个文件，或直接粘贴协议正文。");
      } else {
        nodes.preview.innerHTML = docHtml;
        // Use only sanitized HTML generated by the upload editor.
      }
    } else {
      var v = currentTemplate();
      nodes.preview.innerHTML = PT.buildPolicyHtml(
        v.company || "（公司名称）",
        v.game || "（应用名称）",
        v.email || "（联系邮箱）",
        PT.formatDateParam(v.date) || "（更新日期）"
      );
    }
    hideResult();
  }

  function setMode(next, updateUrl) {
    if (next !== "upload" && next !== "template") next = "upload";
    currentMode = next;
    nodes.upload.hidden = next !== "upload";
    nodes.template.hidden = next !== "template";
    nodes.modeLabel.textContent = next === "upload" ? "上传文档" : "固定模板";
    [nodes.uploadButton, nodes.templateButton].forEach(function (button) {
      var active = button.getAttribute("data-mode") === next;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (updateUrl && window.history && window.history.replaceState) {
      var nextUrl = new URL(location.href);
      nextUrl.searchParams.set("mode", next);
      history.replaceState(null, "", nextUrl);
    }
    setFormHint(next === "upload"
      ? "上传 DOCX / HTML / TXT 或粘贴正文，自动生成预览。"
      : "填写四项信息，右侧同步展示固定模板。",
      false);
    updatePreview();
  }

  function publishBaseUrl() {
    return String(CFG.SUPABASE_URL || "").replace(/\/+$/, "") + "/functions/v1";
  }
  async function accessToken() {
    var client = window.AppSupabaseClient;
    if (!client || !client.auth || !client.auth.getSession) return "";
    var response = await client.auth.getSession();
    return response && response.data && response.data.session
      ? String(response.data.session.access_token || "")
      : "";
  }
  async function publishApi(name, values, token, requestId) {
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) throw new Error("发布服务配置缺失");
    var response = await fetch(publishBaseUrl() + "/" + name, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: CFG.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(Object.assign({}, values, { request_id: requestId })),
    });
    var raw = await response.text();
    var result = {};
    try { result = raw ? JSON.parse(raw) : {}; } catch (_) {}
    if (!response.ok) {
      var error = new Error(String(result.error || "发布失败，请稍后重试"));
      error.status = response.status;
      throw error;
    }
    if (typeof result.short_code !== "string" ||
        !/^[A-Za-z0-9]{4,16}$/.test(result.short_code)) {
      throw new Error("服务器返回的链接编号无效");
    }
    return result.short_code;
  }

  function buildUrl(kind, code) {
    var page = kind === "upload" ? "document-policy.html" : "agreement.html";
    return new URL("../../" + page + "?id=" + encodeURIComponent(code), location.href).href;
  }

  function checkForm() {
    if (currentMode === "template") {
      var v = currentTemplate();
      if (!v.company || !v.game || !v.email || !v.date) {
        throw new Error("请填写公司名称、产品名称、联系邮箱和日期");
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) {
        throw new Error("请填写正确的联系邮箱");
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) {
        throw new Error("请选择正确的更新日期");
      }
      return { functionName: "create-policy-link", payload: v };
    }
    var title = nodes.title.value.trim();
    if (!title) throw new Error("请填写协议名称");
    if (!docHtml || !docText) throw new Error("请先上传文档或粘贴协议正文");
    if (docHtml.length > MAX_HTML) throw new Error("协议文档过长，请拆分或压缩");
    return {
      functionName: "create-document-policy-link",
      payload: {
        title: title,
        content_html: docHtml,
        content_text: docText.slice(0, 20000),
      },
    };
  }

  function getAttemptId(kind, payload) {
    var fingerprint = JSON.stringify({ kind: kind, payload: payload });
    if (attempt && attempt.fingerprint === fingerprint) return attempt.id;
    if (!window.crypto || !window.crypto.randomUUID) {
      throw new Error("请使用较新版本的浏览器完成安全发布");
    }
    attempt = { fingerprint: fingerprint, id: window.crypto.randomUUID() };
    return attempt.id;
  }

  function setPublishing(busy) {
    inFlight = busy;
    nodes.publish.disabled = busy;
    nodes.mobilePublish.disabled = busy;
    nodes.publish.querySelector(".publish-label").textContent = busy ? "正在生成链接…" : "生成正式链接";
    nodes.mobilePublish.textContent = busy ? "发布中…" : "生成正式链接";
  }

  async function publish() {
    if (inFlight) return;
    // Preview deployments use the same Supabase project. Never let a design
    // preview accidentally create real customer documents or wrong-domain URLs.
    if (location.hostname !== "privacy.hnchpower.cn") {
      showToast("当前为界面预览，正式发布功能暂不开放。上线后可正常生成链接。");
      return;
    }
    var request;
    try {
      request = checkForm();
      setFormHint("内容已核对，可以发布。", false);
    } catch (error) {
      setFormHint(error.message || "请检查填写内容", true);
      showToast(error.message || "请检查填写内容");
      document.querySelector(".studio-form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    setPublishing(true);
    try {
      var token = await accessToken();
      if (!token) {
        showToast("请先登录账号，之后返回此页发布");
        setFormHint("发布需要登录。点击右上角「登录 / 注册」。", true);
        return;
      }
      // When billing is deployed, HNPayGate will check entitlement and
      // offer a checkout. The server always owns publication authorization.
      if (window.HNPayGate && !(await window.HNPayGate.ensureCanPublish(token))) return;

      var id = getAttemptId(currentMode, request.payload);
      var code = await publishApi(request.functionName, request.payload, token, id);
      attempt = null;
      var url = buildUrl(currentMode, code);
      nodes.resultInput.value = url;
      nodes.openLink.href = url;
      nodes.result.hidden = false;
      nodes.publishedTime.textContent = "最近发布时间：" + new Date().toLocaleString("zh-CN");
      setFormHint("发布成功，正式链接已生成。", false);
      showToast("发布成功，可以复制链接提交应用商店");
      document.getElementById("publish-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (typeof window.logPolicyPublishDirect === "function") {
        void window.logPolicyPublishDirect({
          publish_url: url,
          company_name: currentMode === "template" ? request.payload.company : null,
          app_name: currentMode === "template" ? request.payload.game : request.payload.title,
          publish_time: new Date().toISOString(),
        });
      }
    } catch (error) {
      if ((error.status === 402 || /PAYMENT_REQUIRED/.test(error.message)) && window.HNPayGate) {
        window.HNPayGate.showPayment(await accessToken());
        return;
      }
      var message = error.status === 401 ? "登录已失效，请重新登录"
        : error.status === 402 ? "当前账号还没有发布额度，请先开通发布权益"
        : error.status === 429 ? "操作太频繁，请稍后再试"
        : error.status >= 500 ? "发布服务暂不可用，请稍后重试"
        : (error.message || "发布失败，请稍后重试");
      showToast(message);
      setFormHint(message, true);
    } finally {
      setPublishing(false);
    }
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value);
    }
    var area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    var success = document.execCommand("copy");
    area.remove();
    return success ? Promise.resolve() : Promise.reject(new Error("copy failed"));
  }

  function onFileContent(html, display) {
    docHtml = sanitizeHtml(html);
    nodes.preview.innerHTML = docHtml;
    docText = (nodes.preview.innerText || nodes.preview.textContent || "").trim();
    if (!docHtml || !docText) throw new Error("文档中没有可以发布的文本");
    if (docHtml.length > MAX_HTML) throw new Error("文档内容过长，超出发布限制");
    if (!nodes.title.value.trim()) {
      nodes.title.value = display || uploadTitleFromText(docText) || "隐私政策";
    }
    updatePreview();
  }
  async function loadFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      docHtml = ""; docText = ""; updatePreview();
      setFormHint("文件超过 5MB，请压缩后再上传", true);
      return;
    }
    var lower = String(file.name || "").toLowerCase();
    if (!/\.(docx|html?|txt)$/.test(lower)) {
      docHtml = ""; docText = ""; updatePreview();
      setFormHint("仅支持 DOCX、HTML 或 TXT 文件", true);
      return;
    }
    nodes.fileStatus.textContent = "正在本地解析：" + file.name;
    try {
      var html;
      if (/\.docx$/.test(lower)) {
        if (!window.mammoth || !window.mammoth.convertToHtml) {
          throw new Error("Word 解析组件未加载，请刷新后重试");
        }
        var buffer = await file.arrayBuffer();
        var result = await window.mammoth.convertToHtml({ arrayBuffer: buffer });
        html = result.value || "";
      } else if (/\.html?$/.test(lower)) {
        html = await file.text();
      } else {
        html = textToHtml(await file.text());
      }
      nodes.source.value = "";
      onFileContent(html, file.name.replace(/\.[^.]+$/, ""));
      nodes.fileStatus.textContent = "✓ 已解析：" + file.name + " · 可核对右侧预览";
      setFormHint("文档已读取，发布前请仔细核对内容。", false);
    } catch (error) {
      docHtml = "";
      docText = "";
      updatePreview();
      nodes.fileStatus.textContent = "读取失败：" + String(error.message || "格式不正确");
      setFormHint(error.message || "文档读取失败", true);
    }
  }

  function setup() {
    var params = new URLSearchParams(location.search);
    var target = params.get("mode");
    var now = new Date();
    nodes.date.value = now.getFullYear() + "-" +
      String(now.getMonth() + 1).padStart(2, "0") + "-" +
      String(now.getDate()).padStart(2, "0");
    setMode(target === "template" ? "template" : "upload", false);

    nodes.uploadButton.addEventListener("click", function () { setMode("upload", true); });
    nodes.templateButton.addEventListener("click", function () { setMode("template", true); });
    nodes.file.addEventListener("change", function () {
      if (nodes.file.files && nodes.file.files[0]) loadFile(nodes.file.files[0]);
    });
    ["dragenter", "dragover"].forEach(function (eventName) {
      nodes.drop.addEventListener(eventName, function (event) {
        event.preventDefault();
        nodes.drop.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (eventName) {
      nodes.drop.addEventListener(eventName, function (event) {
        event.preventDefault();
        nodes.drop.classList.remove("is-dragover");
        if (eventName === "drop" && event.dataTransfer && event.dataTransfer.files[0]) {
          loadFile(event.dataTransfer.files[0]);
        }
      });
    });
    nodes.source.addEventListener("input", function () {
      var raw = nodes.source.value;
      if (raw.trim()) {
        try {
          onFileContent(/<\/?[a-z][\s\S]*>/i.test(raw) ? raw : textToHtml(raw), "");
        } catch (error) {
          docHtml = ""; docText = "";
          setFormHint(error.message || "内容不符合要求", true);
        }
      } else {
        // Never restore an old uploaded file automatically after clearing paste;
        // users can reselect the file if they want the original formatting.
        docHtml = ""; docText = "";
        updatePreview();
      }
    });
    nodes.title.addEventListener("input", hideResult);
    [nodes.company, nodes.game, nodes.email, nodes.date].forEach(function (field) {
      field.addEventListener("input", updatePreview);
      field.addEventListener("change", updatePreview);
    });
    nodes.publish.addEventListener("click", publish);
    nodes.mobilePublish.addEventListener("click", publish);
    nodes.copyPreview.addEventListener("click", function () {
      var raw = nodes.preview.innerText || nodes.preview.textContent || "";
      if (!raw.trim() || nodes.preview.querySelector(".paper-empty")) return showToast("请先准备协议正文");
      copyText(raw).then(function () { showToast("协议正文已复制"); })
        .catch(function () { showToast("无法自动复制，请手动选择"); });
    });
    nodes.print.addEventListener("click", function () {
      if (nodes.preview.querySelector(".paper-empty")) return showToast("请先准备协议正文");
      window.print();
    });
    nodes.copyLink.addEventListener("click", function () {
      var url = nodes.resultInput.value;
      if (!url) return;
      copyText(url).then(function () { showToast("正式链接已复制"); })
        .catch(function () { showToast("无法自动复制，请手动复制链接"); });
    });
  }
  setup();
})();