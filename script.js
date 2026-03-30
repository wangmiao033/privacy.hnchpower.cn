(function () {
  var PT = window.PolicyTemplate;
  if (!PT) return;

  var form = document.getElementById("gen-form");
  var fieldDate = document.getElementById("field-date");
  var fieldCompany = document.getElementById("field-company");
  var fieldGame = document.getElementById("field-game");
  var fieldEmail = document.getElementById("field-email");
  var previewBox = document.getElementById("preview-box");
  var btnPublish = document.getElementById("btn-publish");
  var btnCopyPreview = document.getElementById("btn-copy-preview");
  var btnPrint = document.getElementById("btn-print");
  var publishedUrlInput = document.getElementById("published-url");
  var btnCopyLink = document.getElementById("btn-copy-link");
  var publishTime = document.getElementById("publish-time");
  var toast = document.getElementById("toast");
  var SB_CFG = window.SupabaseConfig || {};
  var DEFAULT_COMPANY = "广州熊动科技有限公司";
  var DEFAULT_EMAIL = "pingce@dxyx6888.com";
  var GAME_CODE_MAP = {
    "仙魔变": "xmb",
    "仙帝神兵": "xdsb",
    "测试": "cs",
  };

  var hints = {
    date: document.getElementById("hint-date"),
    company: document.getElementById("hint-company"),
    game: document.getElementById("hint-game"),
    email: document.getElementById("hint-email"),
  };

  function todayISODate() {
    var n = new Date();
    var y = n.getFullYear();
    var m = String(n.getMonth() + 1).padStart(2, "0");
    var d = String(n.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  if (fieldDate && !fieldDate.value) {
    fieldDate.value = todayISODate();
  }
  if (fieldCompany && !fieldCompany.value) {
    fieldCompany.value = DEFAULT_COMPANY;
  }
  if (fieldEmail && !fieldEmail.value) {
    fieldEmail.value = DEFAULT_EMAIL;
  }

  function getValues() {
    return {
      date: (fieldDate && fieldDate.value) || "",
      company: (fieldCompany && fieldCompany.value.trim()) || "",
      game: (fieldGame && fieldGame.value.trim()) || "",
      email: (fieldEmail && fieldEmail.value.trim()) || "",
    };
  }

  function updatePreview() {
    var v = getValues();
    var dateDisplay = PT.formatDateParam(v.date);
    var html = PT.buildPolicyHtml(
      v.company || "（公司名称）",
      v.game || "（游戏 / 应用名称）",
      v.email || "（联系邮箱）",
      dateDisplay || "（更新日期）"
    );
    previewBox.innerHTML = html;
  }

  function clearHints() {
    Object.keys(hints).forEach(function (k) {
      if (hints[k]) hints[k].textContent = "";
    });
  }

  function simpleEmailOk(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function validate() {
    clearHints();
    var v = getValues();
    var ok = true;
    if (!v.date) {
      hints.date.textContent = "请选择更新日期";
      ok = false;
    }
    if (!v.company) {
      hints.company.textContent = "请填写公司名称";
      ok = false;
    }
    if (!v.game) {
      hints.game.textContent = "请填写游戏 / 应用名称";
      ok = false;
    }
    if (!v.email) {
      hints.email.textContent = "请填写联系邮箱";
      ok = false;
    } else if (!simpleEmailOk(v.email)) {
      hints.email.textContent = "邮箱格式不正确";
      ok = false;
    }
    return ok;
  }

  function getFunctionsBaseUrl() {
    if (!SB_CFG.SUPABASE_URL) return "";
    return String(SB_CFG.SUPABASE_URL).replace(/\/+$/, "") + "/functions/v1";
  }

  async function getCurrentAccessToken() {
    try {
      var appSupabase = window.AppSupabaseClient;
      if (appSupabase && appSupabase.auth && appSupabase.auth.getSession) {
        var sessionRes = await appSupabase.auth.getSession();
        var session = sessionRes && sessionRes.data && sessionRes.data.session;
        var token = session && session.access_token || "";
        console.log("[publish] session exists:", !!session);
        console.log("[publish] access token exists:", !!token);
        console.log("[publish] access token length:", token ? token.length : 0);
        if (token) {
          console.log("[publish] access token prefix:", String(token).slice(0, 10) + "...");
        }
        return token;
      }
      console.log("[publish] session exists:", false);
      console.log("[publish] access token exists:", false);
      return "";
    } catch (_e) {
      console.log("[publish] getSession error");
      return "";
    }
  }

  async function createShortPolicyLink(values, accessToken) {
    var base = getFunctionsBaseUrl();
    if (!base || !SB_CFG.SUPABASE_ANON_KEY) {
      throw new Error("Supabase 配置缺失，无法生成短链");
    }

    var headers = {
      "Content-Type": "application/json",
      apikey: SB_CFG.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + accessToken,
    };

    var res = await fetch(base + "/create-policy-link", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        company: values.company,
        game: values.game,
        email: values.email,
        date: values.date,
      }),
    });
    console.log("[publish] request url:", base + "/create-policy-link");
    console.log("[publish] response status:", res.status);

    var rawText = await res.text();
    console.log("[publish] response body:", rawText ? String(rawText).slice(0, 500) : "");
    var json = {};
    try {
      json = rawText ? JSON.parse(rawText) : {};
    } catch (_e) {
      json = {};
    }
    if (!res.ok) {
      var reason = (json && json.error) || (json && json.message) || rawText || ("HTTP " + res.status);
      throw new Error(reason);
    }
    if (!json || !json.short_code) {
      throw new Error("返回格式错误：short_code 为空");
    }
    if (typeof json.short_code !== "string") {
      throw new Error("返回格式错误：short_code 类型无效");
    }
    return json.short_code;
  }

  function readablePublishError(msg) {
    var s = String(msg || "");
    if (/Missing authorization header/i.test(s)) return "权限不足（缺少 Authorization）";
    if (/Invalid Token|Protected Header formatting/i.test(s)) return "Token 无效（函数可能开启了 JWT 校验）";
    if (/Function not found|404/i.test(s)) return "函数未找到（create-policy-link）";
    if (/Function env not configured/i.test(s)) return "函数环境变量未配置";
    if (/short_code/i.test(s)) return "返回格式错误（short_code）";
    if (/network|Failed to fetch|Load failed/i.test(s)) return "网络异常，请稍后重试";
    return s || "短链创建失败";
  }

  function buildPublishUrlByCode(shortCode) {
    var v = getValues();
    var url = new URL("agreement.html", window.location.href);
    url.searchParams.set("id", shortCode);
    return url.href;
  }

  function nowTimeText() {
    var n = new Date();
    var hh = String(n.getHours()).padStart(2, "0");
    var mm = String(n.getMinutes()).padStart(2, "0");
    var ss = String(n.getSeconds()).padStart(2, "0");
    return hh + ":" + mm + ":" + ss;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toast.hidden = true;
    }, 3500);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        resolve();
      } catch (e) {
        reject(e);
      }
      document.body.removeChild(ta);
    });
  }

  ["input", "change"].forEach(function (ev) {
    form.addEventListener(ev, updatePreview);
  });
  updatePreview();

  btnPublish.addEventListener("click", async function () {
    if (!validate()) return;
    btnPublish.disabled = true;
    var values = getValues();
    var url = "";
    try {
      var token = await getCurrentAccessToken();
      if (!token) {
        showToast("请先登录后再发布");
        btnPublish.disabled = false;
        return;
      }
      if (String(token).split(".").length !== 3) {
        console.error("[publish] invalid token shape");
        showToast("请先重新登录后再发布");
        btnPublish.disabled = false;
        return;
      }
      var shortCode = await createShortPolicyLink(values, token);
      url = buildPublishUrlByCode(shortCode);
    } catch (e) {
      var detail = e && e.message ? e.message : "短链创建失败";
      console.error("[publish] create-policy-link failed:", detail);
      showToast("发布失败：" + readablePublishError(detail));
      btnPublish.disabled = false;
      return;
    }

    if (publishedUrlInput) publishedUrlInput.value = url;
    if (publishTime) publishTime.textContent = "最近一次生成：" + nowTimeText();
    window.open(url, "_blank", "noopener,noreferrer");
    copyText(url).then(
      function () {
        showToast("发布成功，链接已复制");
      },
      function () {
        showToast("发布成功（请手动复制地址栏链接）");
      }
    );
    btnPublish.disabled = false;
  });

  btnCopyPreview.addEventListener("click", function () {
    var text = previewBox.innerText || previewBox.textContent || "";
    if (!text.trim()) return;
    copyText(text).then(
      function () {
        showToast("预览文字已复制");
      },
      function () {
        showToast("复制失败，请手动选择复制");
      }
    );
  });

  btnPrint.addEventListener("click", function () {
    window.print();
  });

  if (btnCopyLink) {
    btnCopyLink.addEventListener("click", function () {
      var link = (publishedUrlInput && publishedUrlInput.value.trim()) || "";
      if (!link) {
        showToast("请先点击一键发布生成正式链接");
        return;
      }
      copyText(link).then(
        function () {
          showToast("正式链接已复制");
        },
        function () {
          showToast("复制失败，请手动选择复制");
        }
      );
    });
  }
})();
