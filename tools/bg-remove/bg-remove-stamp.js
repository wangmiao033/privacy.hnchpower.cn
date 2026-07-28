(function () {
  "use strict";

  var STAMP_MODE = "stamp";
  var initialized = false;

  injectStampStyles();
  injectStampControls();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      window.setTimeout(initializeStampIntegration, 0);
    });
  } else {
    window.setTimeout(initializeStampIntegration, 0);
  }

  function injectStampControls() {
    var modeGroup = document.querySelector(".bgremove-mode-group");
    if (!modeGroup || document.querySelector("input[name='bgremoveMode'][value='stamp']")) {
      return;
    }

    var oldRecommended = modeGroup.querySelector(".bgremove-mode-option-recommended");
    if (oldRecommended) {
      oldRecommended.classList.remove("bgremove-mode-option-recommended");
    }

    var label = document.createElement("label");
    label.className = "bgremove-mode-option bgremove-mode-option-recommended bgremove-mode-option-stamp";
    label.innerHTML = [
      '<input type="radio" name="bgremoveMode" value="stamp" />',
      "<span>",
      "<strong>印章 / 印花</strong>",
      "<em>红章、蓝章、黑章，保留真实断墨纹理</em>",
      "</span>",
    ].join("");
    modeGroup.insertBefore(label, modeGroup.firstElementChild);

    var modeTip = document.querySelector(".bgremove-mode-tip");
    if (!modeTip || document.getElementById("bgremoveStampSettings")) {
      return;
    }

    var settings = document.createElement("div");
    settings.id = "bgremoveStampSettings";
    settings.className = "bgremove-stamp-settings";
    settings.hidden = true;
    settings.innerHTML = [
      '<div class="bgremove-stamp-settings-head">',
      "<strong>免费印章专用处理</strong>",
      "<span>本服务自研颜色分离，不调用收费 API</span>",
      "</div>",
      '<div class="bgremove-stamp-grid">',
      '<label class="bgremove-select-label" for="bgremoveStampColor">印章颜色</label>',
      '<select id="bgremoveStampColor" class="bgremove-select">',
      '<option value="auto">自动识别</option>',
      '<option value="red">红章</option>',
      '<option value="blue">蓝章</option>',
      '<option value="black">黑章</option>',
      "</select>",
      "</div>",
      '<div class="bgremove-control bgremove-stamp-strength">',
      '<label for="bgremoveStampStrength">断墨保留强度 <span id="bgremoveStampStrengthValue">58</span></label>',
      '<input id="bgremoveStampStrength" type="range" min="35" max="85" step="1" value="58" />',
      "</div>",
      '<p class="bgremove-stamp-help">默认会保留印泥颗粒、缺口和虚边。背景偏灰或光线不均时，可把强度调高；杂点过多时调低。</p>',
    ].join("");
    modeTip.insertAdjacentElement("afterend", settings);
  }

  function initializeStampIntegration() {
    if (initialized) {
      return;
    }

    if (typeof removeBackground !== "function" || typeof getSelectedMode !== "function") {
      window.setTimeout(initializeStampIntegration, 30);
      return;
    }

    initialized = true;
    var originalRemoveBackground = removeBackground;
    var originalGetSelectedMode = getSelectedMode;
    var originalGetSelectedModeLabel = typeof getSelectedModeLabel === "function" ? getSelectedModeLabel : null;
    var modeTip = document.querySelector(".bgremove-mode-tip");
    var originalModeTip = modeTip ? modeTip.textContent : "";
    var settings = document.getElementById("bgremoveStampSettings");
    var colorSelect = document.getElementById("bgremoveStampColor");
    var strengthInput = document.getElementById("bgremoveStampStrength");
    var strengthValue = document.getElementById("bgremoveStampStrengthValue");
    var processButton = document.getElementById("bgremoveProcessBtn");

    getSelectedMode = function () {
      var liveChecked = document.querySelector("input[name='bgremoveMode']:checked");
      return liveChecked ? liveChecked.value : originalGetSelectedMode();
    };

    if (originalGetSelectedModeLabel) {
      getSelectedModeLabel = function () {
        var liveChecked = document.querySelector("input[name='bgremoveMode']:checked");
        var label = liveChecked ? liveChecked.closest("label") : null;
        var title = label ? label.querySelector("strong") : null;
        return title ? title.textContent : originalGetSelectedModeLabel();
      };
    }

    removeBackground = function (file) {
      if (getSelectedMode() !== STAMP_MODE) {
        return originalRemoveBackground(file);
      }
      return removeStampBackgroundFree(file, colorSelect, strengthInput);
    };

    document.querySelectorAll("input[name='bgremoveMode']").forEach(function (input) {
      input.addEventListener("change", updateStampModeUi);
    });

    if (strengthInput && strengthValue) {
      strengthInput.addEventListener("input", function () {
        strengthValue.textContent = strengthInput.value;
      });
    }

    updateStampModeUi();

    function updateStampModeUi() {
      var isStamp = getSelectedMode() === STAMP_MODE;
      if (settings) {
        settings.hidden = !isStamp;
      }
      if (processButton) {
        processButton.textContent = isStamp ? "开始印章抠图" : "开始抠图";
      }
      if (modeTip) {
        modeTip.textContent = isStamp
          ? "印章模式不使用通用人物模型，而是针对纸张底色和印泥颜色做局部光照校正、软边透明度计算，更适合公章、合同章和印花。"
          : originalModeTip;
      }
    }
  }

  async function removeStampBackgroundFree(file, colorSelect, strengthInput) {
    if (!API_BASE_URL) {
      setStatus(
        "当前未配置自建抠图 API。请先部署 backend-bg-remove，并配置 BG_REMOVE_API_BASE_URL。",
        true
      );
      return;
    }

    processBtn.disabled = true;
    downloadBtn.disabled = true;
    resetResult();
    setStatus("正在进行印章专用抠图…免费实例首次唤醒可能稍慢，开始计算后通常很快。");

    var abortController = new AbortController();
    var abortTimer = window.setTimeout(function () {
      abortController.abort();
    }, BG_REMOVE_FETCH_TIMEOUT_MS);
    var waitHintTimer = window.setInterval(function () {
      setStatus("服务仍在唤醒或处理中；印章模式不下载 AI 大模型，服务启动后会快速完成。");
    }, BG_REMOVE_WAIT_HINT_INTERVAL_MS);

    try {
      var formData = new FormData();
      formData.append("file", file);
      formData.append("mode", STAMP_MODE);
      formData.append("stamp_color", colorSelect ? colorSelect.value : "auto");
      formData.append("stamp_strength", strengthInput ? strengthInput.value : "58");

      var response = await fetch(trimTrailingSlash(API_BASE_URL) + "/api/remove-background", {
        method: "POST",
        body: formData,
        signal: abortController.signal,
      });

      if (!response.ok) {
        var message = await readErrorMessage(response);
        throw new Error(message || "印章抠图失败，HTTP " + response.status);
      }

      resultBlob = await response.blob();
      if (!resultBlob || resultBlob.size === 0) {
        throw new Error("后端返回了空文件。");
      }

      if (resultObjectUrl) {
        URL.revokeObjectURL(resultObjectUrl);
      }
      resultObjectUrl = URL.createObjectURL(resultBlob);
      await setupEditableResult(resultBlob);
      resultPreview.removeAttribute("src");
      resultPreview.hidden = true;
      resultCanvas.hidden = false;
      resultPlaceholder.hidden = true;
      downloadBtn.disabled = false;
      setEditorEnabled(true);
      updateDownloadButtonText();
      setStatus("印章抠图完成。已保留断墨、颗粒和虚边，可切换黑白背景检查，或用画笔继续修补。");
    } catch (error) {
      resetResult();
      if (error && error.name === "AbortError") {
        setStatus("印章抠图请求超时，请稍后重试；通常是免费服务仍在冷启动。", true);
      } else {
        setStatus((error && error.message) || "印章抠图失败，请重试。", true);
      }
    } finally {
      window.clearTimeout(abortTimer);
      window.clearInterval(waitHintTimer);
      processBtn.disabled = !currentFile;
    }
  }

  function injectStampStyles() {
    if (document.getElementById("bgremoveStampStyles")) {
      return;
    }
    var style = document.createElement("style");
    style.id = "bgremoveStampStyles";
    style.textContent = [
      ".bgremove-mode-option-stamp{border-color:#d8c4b5;background:linear-gradient(180deg,#fffdfb,#fff7f3)}",
      ".bgremove-mode-option-stamp:has(input:checked){border-color:#b91c1c;background:#fff1f2}",
      ".bgremove-mode-option-stamp input{accent-color:#b91c1c}",
      ".bgremove-mode-option-stamp.bgremove-mode-option-recommended::after{content:'印章推荐';background:#b91c1c}",
      ".bgremove-stamp-settings{margin-top:12px;border:1px solid #fecaca;border-radius:12px;padding:13px;background:#fffafa}",
      ".bgremove-stamp-settings[hidden]{display:none}",
      ".bgremove-stamp-settings-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}",
      ".bgremove-stamp-settings-head strong{color:#991b1b;font-size:14px}",
      ".bgremove-stamp-settings-head span{color:#7f1d1d;font-size:11px;text-align:right}",
      ".bgremove-stamp-grid{display:grid;grid-template-columns:88px minmax(0,1fr);align-items:center;gap:10px}",
      ".bgremove-stamp-grid .bgremove-select-label{margin:0}",
      ".bgremove-stamp-strength{margin-top:12px}",
      ".bgremove-stamp-strength input{accent-color:#b91c1c}",
      ".bgremove-stamp-help{margin:10px 0 0;color:#7c5b5b;font-size:12px;line-height:1.5}",
    ].join("");
    document.head.appendChild(style);
  }
})();
