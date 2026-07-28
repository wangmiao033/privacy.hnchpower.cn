(function () {
  "use strict";

  var MAX_SIZE = 10 * 1024 * 1024;
  var MAX_FILES = 30;
  var ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

  var fileInput = document.getElementById("docagingFileInput");
  var dropZone = document.getElementById("docagingDropZone");
  var presetButtons = document.querySelectorAll(".docaging-presets button");
  var effectButtons = document.querySelectorAll(".docaging-effects button");
  var microLevelWrap = document.getElementById("docagingMicroLevels");
  var microLevelButtons = document.querySelectorAll(".docaging-microlevels button");
  var intensityInput = document.getElementById("docagingIntensity");
  var contrastInput = document.getElementById("docagingContrast");
  var textureToggle = document.getElementById("docagingTextureToggle");
  var textureStrengthInput = document.getElementById("docagingTextureStrength");
  var intensityValue = document.getElementById("docagingIntensityValue");
  var contrastValue = document.getElementById("docagingContrastValue");
  var textureStrengthValue = document.getElementById("docagingTextureStrengthValue");
  var downloadBtn = document.getElementById("docagingDownloadBtn");
  var batchProcessBtn = document.getElementById("docagingBatchProcessBtn");
  var zipDownloadBtn = document.getElementById("docagingZipDownloadBtn");
  var resetBtn = document.getElementById("docagingResetBtn");

  var originalPreview = document.getElementById("docagingOriginalPreview");
  var originalPlaceholder = document.getElementById("docagingOriginalPlaceholder");
  var resultPreview = document.getElementById("docagingResultPreview");
  var resultPlaceholder = document.getElementById("docagingResultPlaceholder");
  var originalName = document.getElementById("docagingOriginalName");
  var resultName = document.getElementById("docagingResultName");

  var metaSize = document.getElementById("docagingMetaSize");
  var metaFile = document.getElementById("docagingMetaFile");
  var metaStatus = document.getElementById("docagingMetaStatus");

  var batchPanel = document.getElementById("docagingBatchPanel");
  var batchList = document.getElementById("docagingBatchList");
  var batchSummary = document.getElementById("docagingBatchSummary");
  var batchCount = document.getElementById("docagingBatchCount");
  var batchStats = document.getElementById("docagingBatchStats");
  var batchProgress = document.getElementById("docagingBatchProgress");
  var batchProgressText = document.getElementById("docagingBatchProgressText");

  var sourceCanvas = document.getElementById("docagingSourceCanvas");
  var outputCanvas = document.getElementById("docagingOutputCanvas");
  var sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  var outputCtx = outputCanvas.getContext("2d", { willReadFrequently: true });

  var currentPreset = "aged";
  var currentEffect = "lightScanAged";
  var currentMicroLevel = "standard";
  var batchItems = [];
  var activeItemId = null;
  var itemSequence = 0;
  var settingsVersion = 1;
  var previewTimer = null;
  var isBatchProcessing = false;
  var processingQueue = Promise.resolve();

  var EFFECTS = {
    lightScanAged: {
      preset: "aged",
      intensity: 20,
      contrast: -6,
      texture: true,
      textureStrength: 28,
      yellowTint: 0.055,
      noiseAmount: 0.022,
      paperTextureOpacity: 0.085,
      saturation: 0.92,
      contrastFactor: 0.95,
      vignetteStrength: 0.055
    },
    mildOld: { preset: "aged", intensity: 18, contrast: -8, texture: true, textureStrength: 22 },
    warmPaper: { preset: "aged", intensity: 32, contrast: -12, texture: true, textureStrength: 38 },
    copyDoc: { preset: "scan", intensity: 12, contrast: 6, texture: false, textureStrength: 0 },
    grayScan: { preset: "scan", intensity: 24, contrast: 18, texture: true, textureStrength: 30 },
    hardBW: { preset: "bw", intensity: 30, contrast: 26, texture: false, textureStrength: 0 }
  };

  var LIGHT_SCAN_LEVELS = {
    light: {
      yellowTint: 0.042,
      noiseAmount: 0.016,
      paperTextureOpacity: 0.06,
      saturation: 0.95,
      contrastFactor: 0.97,
      vignetteStrength: 0.04
    },
    standard: {
      yellowTint: 0.055,
      noiseAmount: 0.022,
      paperTextureOpacity: 0.085,
      saturation: 0.92,
      contrastFactor: 0.95,
      vignetteStrength: 0.055
    },
    heavy: {
      yellowTint: 0.072,
      noiseAmount: 0.031,
      paperTextureOpacity: 0.11,
      saturation: 0.89,
      contrastFactor: 0.93,
      vignetteStrength: 0.072
    }
  };

  function setStatus(text) {
    metaStatus.textContent = text;
  }

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        setTimeout(resolve, 0);
      });
    });
  }

  function queueTask(task) {
    var queued = processingQueue.then(task, task);
    processingQueue = queued.catch(function () {});
    return queued;
  }

  function getActiveItem() {
    return batchItems.find(function (item) {
      return item.id === activeItemId;
    }) || null;
  }

  function isItemCurrent(item) {
    return !!(item && item.outputBlob && item.settingsVersion === settingsVersion && item.status === "done");
  }

  function statusLabel(item) {
    if (item.status === "processing") return "处理中";
    if (item.status === "done" && item.settingsVersion === settingsVersion) return "已完成";
    if (item.status === "stale") return "待重新处理";
    if (item.status === "error") return "处理失败";
    return "待处理";
  }

  function statusClass(item) {
    if (item.status === "processing") return "is-processing";
    if (item.status === "done" && item.settingsVersion === settingsVersion) return "is-done";
    if (item.status === "stale") return "is-stale";
    if (item.status === "error") return "is-error";
    return "";
  }

  function updateSlidersText() {
    intensityValue.textContent = intensityInput.value;
    contrastValue.textContent = contrastInput.value;
    textureStrengthValue.textContent = textureStrengthInput.value;
    textureStrengthInput.disabled = isBatchProcessing || !textureToggle.checked;
  }

  function setMicroLevel(levelKey) {
    currentMicroLevel = levelKey;
    microLevelButtons.forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.level === levelKey);
    });
  }

  function syncMicroLevelVisibility() {
    if (!microLevelWrap) return;
    microLevelWrap.classList.toggle("is-hidden", currentEffect !== "lightScanAged");
  }

  function setPreset(preset) {
    currentPreset = preset;
    presetButtons.forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.preset === preset);
    });
  }

  function markActiveEffect(effectKey) {
    currentEffect = effectKey;
    effectButtons.forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.effect === effectKey);
    });
    syncMicroLevelVisibility();
  }

  function applyEffect(effectKey) {
    var cfg = EFFECTS[effectKey];
    if (!cfg) return false;
    setPreset(cfg.preset);
    intensityInput.value = String(cfg.intensity);
    contrastInput.value = String(cfg.contrast);
    textureToggle.checked = !!cfg.texture;
    textureStrengthInput.value = String(cfg.textureStrength);
    markActiveEffect(effectKey);
    if (effectKey === "lightScanAged") setMicroLevel("standard");
    updateSlidersText();
    return true;
  }

  function getSettingsSnapshot() {
    var effectConfig = EFFECTS[currentEffect] || EFFECTS.mildOld;
    if (currentEffect === "lightScanAged") {
      effectConfig = Object.assign({}, effectConfig, LIGHT_SCAN_LEVELS[currentMicroLevel] || LIGHT_SCAN_LEVELS.standard);
    }
    return {
      preset: currentPreset,
      effect: currentEffect,
      microLevel: currentMicroLevel,
      intensity: Number(intensityInput.value) / 100,
      contrast: Number(contrastInput.value),
      texture: textureToggle.checked,
      textureStrength: Number(textureStrengthInput.value) / 100,
      effectConfig: effectConfig
    };
  }

  function randomByIndex(x, y) {
    var n = x * 374761393 + y * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    n = n ^ (n >> 16);
    return (n >>> 0) / 4294967295;
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("图片读取失败，请更换文件重试。"));
      };
      img.src = url;
    });
  }

  function validateFile(file) {
    if (!file) return "未检测到文件。";
    if (file.size > MAX_SIZE) return "文件超过 10MB";
    var name = (file.name || "").toLowerCase();
    var extOk = /\.(png|jpg|jpeg|webp)$/.test(name);
    var typeOk = ACCEPTED_TYPES.has(file.type);
    if (!extOk && !typeOk) return "格式不支持";
    return "";
  }

  function applyContrast(value, contrast) {
    var factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    return Math.max(0, Math.min(255, factor * (value - 128) + 128));
  }

  function applyTextureTone(value, x, y, width, height, intensity, textureStrength) {
    var mix = Math.max(0, Math.min(1, textureStrength));
    var vCrease = 1 - Math.min(1, Math.abs(x - width * 0.52) / Math.max(8, width * 0.12));
    var hCrease = 1 - Math.min(1, Math.abs(y - height * 0.48) / Math.max(8, height * 0.1));
    var crease = Math.max(0, (vCrease * 0.55 + hCrease * 0.45 - 0.72) * 36 * intensity * mix);
    var blotchField = randomByIndex(Math.floor(x / 9), Math.floor(y / 9));
    var blotch = blotchField > 0.86 ? (blotchField - 0.86) * 120 * intensity * mix : 0;
    var fiber = (randomByIndex(x * 3, y * 5) - 0.5) * 8 * intensity * mix;
    return Math.max(0, Math.min(255, value - crease - blotch + fiber));
  }

  function applyLinearContrast(value, factor) {
    return Math.max(0, Math.min(255, (value - 128) * factor + 128));
  }

  function getColorDelta(r, g, b) {
    return Math.max(r, g, b) - Math.min(r, g, b);
  }

  function processImageToBlob(image, settings) {
    return new Promise(function (resolve, reject) {
      var width = image.naturalWidth || image.width;
      var height = image.naturalHeight || image.height;

      sourceCanvas.width = width;
      sourceCanvas.height = height;
      outputCanvas.width = width;
      outputCanvas.height = height;

      sourceCtx.clearRect(0, 0, width, height);
      sourceCtx.drawImage(image, 0, 0, width, height);
      var imageData = sourceCtx.getImageData(0, 0, width, height);
      var data = imageData.data;
      var intensity = settings.intensity;
      var contrast = settings.contrast;
      var textureStrength = settings.textureStrength;
      var effectConfig = settings.effectConfig;

      for (var i = 0; i < data.length; i += 4) {
        var p = i / 4;
        var x = p % width;
        var y = Math.floor(p / width);
        var r = data[i];
        var g = data[i + 1];
        var b = data[i + 2];
        var gray = 0.299 * r + 0.587 * g + 0.114 * b;
        var noise = (randomByIndex(x, y) - 0.5) * 34 * intensity;

        if (settings.preset === "aged") {
          if (settings.effect === "lightScanAged") {
            var colorDelta = getColorDelta(r, g, b);
            var isPaperLike = gray > 158 && colorDelta < 34;
            var sat = effectConfig.saturation || 0.92;
            var yellowTint = effectConfig.yellowTint || 0.055;
            var noiseAmount = effectConfig.noiseAmount || 0.022;
            var paperTextureOpacity = effectConfig.paperTextureOpacity || 0.085;
            var contrastFactor = effectConfig.contrastFactor || 0.95;
            var vignetteStrength = effectConfig.vignetteStrength || 0.055;

            var baseR = gray * (1 - sat) + r * sat;
            var baseG = gray * (1 - sat) + g * sat;
            var baseB = gray * (1 - sat) + b * sat;
            var paperMask = isPaperLike ? 1 : 0.28;
            var warmR = 246;
            var warmG = 242;
            var warmB = 233;

            baseR = baseR * (1 - yellowTint * paperMask) + warmR * yellowTint * paperMask;
            baseG = baseG * (1 - yellowTint * paperMask) + warmG * yellowTint * paperMask;
            baseB = baseB * (1 - yellowTint * paperMask) + warmB * yellowTint * paperMask;

            var noiseGauss = ((randomByIndex(x + 11, y + 17) + randomByIndex(x + 29, y + 37)) - 1) * 255 * noiseAmount;
            baseR += noiseGauss * (0.75 + paperMask * 0.25);
            baseG += noiseGauss * (0.75 + paperMask * 0.25);
            baseB += noiseGauss * (0.75 + paperMask * 0.25);

            if (settings.texture) {
              var texCell = randomByIndex(Math.floor(x / 5), Math.floor(y / 5)) - 0.5;
              var tex = texCell * 255 * paperTextureOpacity * (0.6 + textureStrength * 0.4) * paperMask;
              baseR += tex;
              baseG += tex;
              baseB += tex;
            }

            var cx = width * 0.5;
            var cy = height * 0.5;
            var dx = (x - cx) / Math.max(1, cx);
            var dy = (y - cy) / Math.max(1, cy);
            var dist = Math.min(1, Math.sqrt(dx * dx + dy * dy));
            var vignette = 1 - vignetteStrength * Math.pow(dist, 2.1);
            baseR *= vignette;
            baseG *= vignette;
            baseB *= vignette;

            if (gray < 92 && colorDelta < 35) {
              baseR = baseR * 0.965 + 4;
              baseG = baseG * 0.965 + 4;
              baseB = baseB * 0.965 + 4;
            }

            data[i] = applyLinearContrast(baseR, contrastFactor);
            data[i + 1] = applyLinearContrast(baseG, contrastFactor);
            data[i + 2] = applyLinearContrast(baseB, contrastFactor);
          } else {
            var colorDelta2 = getColorDelta(r, g, b);
            var isPaperLike2 = gray > 155 && colorDelta2 < 32;
            var warmTargetR = 247;
            var warmTargetG = 241;
            var warmTargetB = 227;
            var warmBlend = isPaperLike2 ? 0.05 + intensity * 0.22 : 0.02 + intensity * 0.08;
            var preserveMix = isPaperLike2 ? 1 : 0.55;
            var agedR = r * (1 - warmBlend) + warmTargetR * warmBlend + noise * 0.28 * preserveMix;
            var agedG = g * (1 - warmBlend) + warmTargetG * warmBlend + noise * 0.22 * preserveMix;
            var agedB = b * (1 - warmBlend) + warmTargetB * warmBlend + noise * 0.16 * preserveMix;
            agedR = applyContrast(agedR, contrast * 0.72);
            agedG = applyContrast(agedG, contrast * 0.68);
            agedB = applyContrast(agedB, contrast * 0.64);
            if (settings.texture) {
              agedR = applyTextureTone(agedR, x, y, width, height, intensity, textureStrength);
              agedG = applyTextureTone(agedG, x, y, width, height, intensity * 0.9, textureStrength);
              agedB = applyTextureTone(agedB, x, y, width, height, intensity * 0.85, textureStrength);
            }
            data[i] = agedR;
            data[i + 1] = agedG;
            data[i + 2] = agedB;
          }
        } else if (settings.preset === "scan") {
          var scanGray = Math.max(0, Math.min(255, gray + noise * 0.7));
          var scanTone = applyContrast(scanGray, contrast);
          if (settings.texture) {
            scanTone = applyTextureTone(scanTone, x, y, width, height, intensity * 0.75, textureStrength);
          }
          data[i] = scanTone;
          data[i + 1] = scanTone;
          data[i + 2] = scanTone;
        } else {
          var bwBase = applyContrast(gray + noise * 0.4, contrast + intensity * 30);
          var threshold = 165 - intensity * 45;
          var bw = bwBase >= threshold ? 255 : 28;
          data[i] = bw;
          data[i + 1] = bw;
          data[i + 2] = bw;
        }
      }

      outputCtx.putImageData(imageData, 0, 0);
      outputCanvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error("导出失败，请重试。"));
          return;
        }
        resolve({ blob: blob, width: width, height: height });
      }, "image/png");
    });
  }

  function revokeItemOutput(item) {
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    item.outputUrl = "";
    item.outputBlob = null;
    item.settingsVersion = 0;
  }

  function showResultForItem(item) {
    if (!isItemCurrent(item)) {
      resultPreview.hidden = true;
      resultPreview.removeAttribute("src");
      resultPlaceholder.hidden = false;
      resultPlaceholder.textContent = item && item.status === "processing" ? "当前图片处理中…" : "当前图片尚未按最新参数处理";
      resultName.textContent = item ? item.outputName : "";
      return;
    }
    resultPreview.src = item.outputUrl;
    resultPreview.hidden = false;
    resultPlaceholder.hidden = true;
    resultName.textContent = item.outputName;
  }

  function showEmptyPreview() {
    originalPreview.hidden = true;
    originalPreview.removeAttribute("src");
    resultPreview.hidden = true;
    resultPreview.removeAttribute("src");
    originalPlaceholder.hidden = false;
    originalPlaceholder.textContent = "上传后显示原图";
    resultPlaceholder.hidden = false;
    resultPlaceholder.textContent = "处理后显示做旧/扫描效果";
    originalName.textContent = "";
    resultName.textContent = "";
    metaSize.textContent = "-";
    metaFile.textContent = "-";
  }

  function selectItem(itemId, shouldProcess) {
    var item = batchItems.find(function (entry) {
      return entry.id === itemId;
    });
    if (!item) return;
    activeItemId = item.id;
    originalPreview.src = item.originalUrl;
    originalPreview.hidden = false;
    originalPlaceholder.hidden = true;
    originalName.textContent = item.file.name;
    metaFile.textContent = humanSize(item.file.size);
    metaSize.textContent = item.width && item.height ? item.width + " × " + item.height : "读取中…";
    showResultForItem(item);
    renderBatchList();
    updateActionButtons();
    if (shouldProcess && !isItemCurrent(item) && !isBatchProcessing) scheduleActivePreview(20);
  }

  function createOutputName(fileName) {
    var base = (fileName || "doc").replace(/\.[^.]+$/, "");
    var candidate = base + "-old-style.png";
    var existing = new Set(batchItems.map(function (item) { return item.outputName; }));
    var index = 2;
    while (existing.has(candidate)) {
      candidate = base + "-old-style-" + index + ".png";
      index += 1;
    }
    return candidate;
  }

  function processItem(item, version, settings, statusText) {
    return queueTask(async function () {
      if (!item || version !== settingsVersion) return false;
      item.status = "processing";
      item.error = "";
      if (activeItemId === item.id) showResultForItem(item);
      if (statusText) setStatus(statusText);
      renderBatchList();
      updateActionButtons();

      try {
        await nextFrame();
        var image = await loadImage(item.file);
        item.width = image.naturalWidth || image.width;
        item.height = image.naturalHeight || image.height;
        if (activeItemId === item.id) metaSize.textContent = item.width + " × " + item.height;

        var result = await processImageToBlob(image, settings);
        image.src = "";
        if (version !== settingsVersion) {
          item.status = "stale";
          return false;
        }

        revokeItemOutput(item);
        item.outputBlob = result.blob;
        item.outputUrl = URL.createObjectURL(result.blob);
        item.settingsVersion = version;
        item.status = "done";
        if (activeItemId === item.id) showResultForItem(item);
        renderBatchList();
        updateBatchSummary();
        updateActionButtons();
        return true;
      } catch (error) {
        item.status = "error";
        item.error = error && error.message ? error.message : "处理失败";
        if (activeItemId === item.id) showResultForItem(item);
        renderBatchList();
        updateBatchSummary();
        updateActionButtons();
        return false;
      }
    });
  }

  function scheduleActivePreview(delay) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      var item = getActiveItem();
      if (!item || isBatchProcessing || isItemCurrent(item)) return;
      var version = settingsVersion;
      var settings = getSettingsSnapshot();
      processItem(item, version, settings, "正在生成当前图片预览…").then(function (ok) {
        if (ok && version === settingsVersion && !isBatchProcessing) {
          setStatus(batchItems.length > 1 ? "当前预览完成；可继续批量处理全部图片" : "处理完成，可导出 PNG");
        } else if (!ok && item.status === "error") {
          setStatus(item.error || "当前图片处理失败");
        }
      });
    }, typeof delay === "number" ? delay : 220);
  }

  function invalidateOutputs(message) {
    settingsVersion += 1;
    batchItems.forEach(function (item) {
      if (item.outputBlob || item.status === "done" || item.status === "processing") {
        revokeItemOutput(item);
        item.status = "stale";
      } else if (item.status !== "error") {
        item.status = "waiting";
      }
    });
    var active = getActiveItem();
    if (active) showResultForItem(active);
    renderBatchList();
    updateBatchSummary();
    updateActionButtons();
    if (batchItems.length) {
      setStatus(message || "参数已更新，等待重新处理");
      scheduleActivePreview(220);
    }
  }

  function updateBatchSummary(customText) {
    var total = batchItems.length;
    var done = batchItems.filter(isItemCurrent).length;
    var processing = batchItems.filter(function (item) { return item.status === "processing"; }).length;
    var errors = batchItems.filter(function (item) { return item.status === "error"; }).length;
    batchPanel.hidden = total === 0;
    batchSummary.hidden = total === 0;
    batchCount.textContent = String(total);
    batchProgress.max = Math.max(1, total);
    batchProgress.value = Math.min(total, done + errors);
    batchStats.textContent = total + " 张 · 已完成 " + done + (errors ? " · 失败 " + errors : "");

    if (customText) {
      batchProgressText.textContent = customText;
    } else if (!total) {
      batchProgressText.textContent = "等待批量处理";
    } else if (processing) {
      batchProgressText.textContent = "正在处理";
    } else if (done === total) {
      batchProgressText.textContent = "全部完成";
    } else if (done || errors) {
      batchProgressText.textContent = "已完成 " + done + "/" + total;
    } else {
      batchProgressText.textContent = "等待批量处理";
    }
  }

  function updateActionButtons() {
    var active = getActiveItem();
    var allDone = batchItems.length > 0 && batchItems.every(isItemCurrent);
    downloadBtn.disabled = isBatchProcessing || !isItemCurrent(active);
    batchProcessBtn.disabled = isBatchProcessing || batchItems.length === 0 || allDone;
    zipDownloadBtn.disabled = isBatchProcessing || !allDone;
    resetBtn.disabled = isBatchProcessing;
    fileInput.disabled = isBatchProcessing || batchItems.length >= MAX_FILES;
    dropZone.classList.toggle("is-disabled", fileInput.disabled);

    presetButtons.forEach(function (btn) { btn.disabled = isBatchProcessing; });
    effectButtons.forEach(function (btn) { btn.disabled = isBatchProcessing; });
    microLevelButtons.forEach(function (btn) { btn.disabled = isBatchProcessing; });
    intensityInput.disabled = isBatchProcessing;
    contrastInput.disabled = isBatchProcessing;
    textureToggle.disabled = isBatchProcessing;
    updateSlidersText();

    batchList.querySelectorAll(".docaging-remove-item").forEach(function (btn) {
      btn.disabled = isBatchProcessing;
    });
  }

  function renderBatchList() {
    batchList.textContent = "";
    batchItems.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "docaging-batch-item" + (item.id === activeItemId ? " is-active" : "");

      var selectBtn = document.createElement("button");
      selectBtn.type = "button";
      selectBtn.className = "docaging-batch-select";
      selectBtn.title = "点击切换预览";

      var thumb = document.createElement("img");
      thumb.className = "docaging-batch-thumb";
      thumb.src = item.originalUrl;
      thumb.alt = "";

      var info = document.createElement("span");
      info.className = "docaging-batch-info";

      var name = document.createElement("span");
      name.className = "docaging-batch-filename";
      name.textContent = item.file.name;

      var subline = document.createElement("span");
      subline.className = "docaging-batch-subline";

      var size = document.createElement("span");
      size.textContent = humanSize(item.file.size);

      var badge = document.createElement("span");
      badge.className = "docaging-status-badge " + statusClass(item);
      badge.textContent = statusLabel(item);
      if (item.error) badge.title = item.error;

      subline.appendChild(size);
      subline.appendChild(badge);
      info.appendChild(name);
      info.appendChild(subline);
      selectBtn.appendChild(thumb);
      selectBtn.appendChild(info);
      selectBtn.addEventListener("click", function () {
        selectItem(item.id, true);
      });

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "docaging-remove-item";
      removeBtn.textContent = "×";
      removeBtn.title = "移除该文件";
      removeBtn.disabled = isBatchProcessing;
      removeBtn.addEventListener("click", function () {
        removeItem(item.id);
      });

      row.appendChild(selectBtn);
      row.appendChild(removeBtn);
      batchList.appendChild(row);
    });
    updateBatchSummary();
  }

  function removeItem(itemId) {
    if (isBatchProcessing) return;
    var index = batchItems.findIndex(function (item) { return item.id === itemId; });
    if (index < 0) return;
    var item = batchItems[index];
    URL.revokeObjectURL(item.originalUrl);
    revokeItemOutput(item);
    batchItems.splice(index, 1);

    if (activeItemId === itemId) {
      activeItemId = batchItems.length ? batchItems[Math.min(index, batchItems.length - 1)].id : null;
      if (activeItemId) selectItem(activeItemId, true);
      else showEmptyPreview();
    }

    renderBatchList();
    updateActionButtons();
    setStatus(batchItems.length ? "已移除 1 张图片" : "等待上传图片");
  }

  function addFiles(fileList) {
    if (isBatchProcessing) return;
    var incoming = Array.prototype.slice.call(fileList || []);
    if (!incoming.length) return;

    var remaining = MAX_FILES - batchItems.length;
    if (remaining <= 0) {
      setStatus("最多只能添加 " + MAX_FILES + " 张图片");
      return;
    }

    var accepted = 0;
    var rejected = 0;
    incoming.slice(0, remaining).forEach(function (file) {
      var error = validateFile(file);
      if (error) {
        rejected += 1;
        return;
      }
      itemSequence += 1;
      batchItems.push({
        id: "docaging-" + itemSequence,
        file: file,
        originalUrl: URL.createObjectURL(file),
        outputBlob: null,
        outputUrl: "",
        outputName: createOutputName(file.name),
        settingsVersion: 0,
        status: "waiting",
        error: "",
        width: 0,
        height: 0
      });
      accepted += 1;
    });

    if (incoming.length > remaining) rejected += incoming.length - remaining;
    fileInput.value = "";
    renderBatchList();
    updateActionButtons();

    if (!activeItemId && batchItems.length) {
      selectItem(batchItems[0].id, true);
    } else if (accepted && activeItemId) {
      selectItem(activeItemId, false);
    }

    if (accepted) {
      setStatus("已添加 " + accepted + " 张图片" + (rejected ? "，另有 " + rejected + " 张未加入" : ""));
    } else {
      setStatus("没有可加入的图片，请检查格式、大小或数量限制");
    }
  }

  async function processAllItems() {
    if (isBatchProcessing || !batchItems.length) return;
    clearTimeout(previewTimer);
    isBatchProcessing = true;
    updateActionButtons();

    var version = settingsVersion;
    var settings = getSettingsSnapshot();
    var pending = batchItems.filter(function (item) { return !isItemCurrent(item); });
    var successCount = 0;
    var failureCount = 0;

    for (var i = 0; i < pending.length; i += 1) {
      var item = pending[i];
      var progressText = "正在处理 " + (i + 1) + "/" + pending.length;
      updateBatchSummary(progressText);
      setStatus(progressText + "：" + item.file.name);
      var ok = await processItem(item, version, settings, "正在处理：" + item.file.name);
      if (ok) successCount += 1;
      else failureCount += 1;
      updateBatchSummary("已处理 " + (i + 1) + "/" + pending.length);
    }

    isBatchProcessing = false;
    renderBatchList();
    updateActionButtons();
    if (failureCount) {
      setStatus("批量处理完成：成功 " + successCount + " 张，失败 " + failureCount + " 张");
    } else {
      setStatus("批量处理完成，共 " + batchItems.length + " 张，可导出 ZIP");
    }
  }

  function downloadBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var CRC_TABLE = null;

  function getCrcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    CRC_TABLE = new Uint32Array(256);
    for (var n = 0; n < 256; n += 1) {
      var c = n;
      for (var k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      CRC_TABLE[n] = c >>> 0;
    }
    return CRC_TABLE;
  }

  function crc32(bytes) {
    var table = getCrcTable();
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i += 1) {
      crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    var year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function concatBytes(parts) {
    var total = parts.reduce(function (sum, part) { return sum + part.length; }, 0);
    var result = new Uint8Array(total);
    var offset = 0;
    parts.forEach(function (part) {
      result.set(part, offset);
      offset += part.length;
    });
    return result;
  }

  async function createZipBlob(items) {
    var encoder = new TextEncoder();
    var localParts = [];
    var centralParts = [];
    var offset = 0;
    var now = dosDateTime(new Date());

    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var nameBytes = encoder.encode(item.outputName);
      var data = new Uint8Array(await item.outputBlob.arrayBuffer());
      var crc = crc32(data);

      var localHeader = new Uint8Array(30 + nameBytes.length);
      var localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, now.time, true);
      localView.setUint16(12, now.date, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);
      localParts.push(localHeader, data);

      var centralHeader = new Uint8Array(46 + nameBytes.length);
      var centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, now.time, true);
      centralView.setUint16(14, now.date, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);
      centralParts.push(centralHeader);

      offset += localHeader.length + data.length;
    }

    var centralDirectory = concatBytes(centralParts);
    var end = new Uint8Array(22);
    var endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, items.length, true);
    endView.setUint16(10, items.length, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);

    return new Blob(localParts.concat([centralDirectory, end]), { type: "application/zip" });
  }

  function zipFileName() {
    var date = new Date();
    function pad(value) { return String(value).padStart(2, "0"); }
    return "doc-aging-" + date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + "-" + pad(date.getHours()) + pad(date.getMinutes()) + ".zip";
  }

  function clearAll() {
    if (isBatchProcessing) return;
    clearTimeout(previewTimer);
    batchItems.forEach(function (item) {
      URL.revokeObjectURL(item.originalUrl);
      revokeItemOutput(item);
    });
    batchItems = [];
    activeItemId = null;
    fileInput.value = "";
    showEmptyPreview();
    renderBatchList();
    updateActionButtons();
    setStatus("等待上传图片");
  }

  fileInput.addEventListener("change", function () {
    addFiles(fileInput.files);
  });

  dropZone.addEventListener("dragover", function (event) {
    event.preventDefault();
    if (!fileInput.disabled) dropZone.classList.add("is-dragover");
  });

  dropZone.addEventListener("dragleave", function () {
    dropZone.classList.remove("is-dragover");
  });

  dropZone.addEventListener("drop", function (event) {
    event.preventDefault();
    dropZone.classList.remove("is-dragover");
    if (!fileInput.disabled && event.dataTransfer && event.dataTransfer.files) {
      addFiles(event.dataTransfer.files);
    }
  });

  presetButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setPreset(btn.dataset.preset);
      markActiveEffect("custom");
      invalidateOutputs("风格已更新，正在刷新当前预览…");
    });
  });

  effectButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!applyEffect(btn.dataset.effect)) return;
      invalidateOutputs("效果已更新，正在刷新当前预览…");
    });
  });

  microLevelButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (currentEffect !== "lightScanAged") return;
      setMicroLevel(btn.dataset.level);
      invalidateOutputs("轻微扫描档位已更新，正在刷新当前预览…");
    });
  });

  [intensityInput, contrastInput, textureStrengthInput].forEach(function (input) {
    input.addEventListener("input", function () {
      updateSlidersText();
      markActiveEffect("custom");
      invalidateOutputs("参数已更新，正在刷新当前预览…");
    });
  });

  textureToggle.addEventListener("change", function () {
    updateSlidersText();
    markActiveEffect("custom");
    invalidateOutputs("纹理设置已更新，正在刷新当前预览…");
  });

  downloadBtn.addEventListener("click", function () {
    var item = getActiveItem();
    if (!isItemCurrent(item)) return;
    downloadBlob(item.outputBlob, item.outputName);
    setStatus("已导出：" + item.outputName);
  });

  batchProcessBtn.addEventListener("click", processAllItems);

  zipDownloadBtn.addEventListener("click", async function () {
    var readyItems = batchItems.filter(isItemCurrent);
    if (!readyItems.length || readyItems.length !== batchItems.length || isBatchProcessing) return;
    try {
      isBatchProcessing = true;
      updateActionButtons();
      setStatus("正在生成 ZIP…");
      updateBatchSummary("正在打包 ZIP");
      await nextFrame();
      var zipBlob = await createZipBlob(readyItems);
      var fileName = zipFileName();
      downloadBlob(zipBlob, fileName);
      setStatus("已导出批量文件：" + fileName);
    } catch (error) {
      setStatus(error && error.message ? error.message : "ZIP 生成失败，请重试");
    } finally {
      isBatchProcessing = false;
      updateBatchSummary();
      updateActionButtons();
    }
  });

  resetBtn.addEventListener("click", clearAll);

  applyEffect(currentEffect);
  setMicroLevel(currentMicroLevel);
  syncMicroLevelVisibility();
  updateSlidersText();
  clearAll();
})();
