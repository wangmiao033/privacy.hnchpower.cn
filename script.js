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
  var toast = document.getElementById("toast");

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

  function buildPublishUrl() {
    var v = getValues();
    var url = new URL("agreement.html", window.location.href);
    url.searchParams.set("company", v.company);
    url.searchParams.set("game", v.game);
    url.searchParams.set("email", v.email);
    url.searchParams.set("date", v.date);
    return url.href;
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

  btnPublish.addEventListener("click", function () {
    if (!validate()) return;
    var url = buildPublishUrl();
    window.open(url, "_blank", "noopener,noreferrer");
    copyText(url).then(
      function () {
        showToast("发布成功，链接已复制");
      },
      function () {
        showToast("发布成功（请手动复制地址栏链接）");
      }
    );
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
})();
