(function () {
  "use strict";

  var MAX_FILE_SIZE = 10 * 1024 * 1024;
  var ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

  var fileInput = document.getElementById("sealcutFileInput");
  var dropZone = document.getElementById("sealcutDropZone");
  var downloadBtn = document.getElementById("sealcutDownloadBtn");
  var resetBtn = document.getElementById("sealcutResetBtn");

  var originalPreview = document.getElementById("sealcutOriginalPreview");
  var originalPlaceholder = document.getElementById("sealcutOriginalPlaceholder");
  var resultPreview = document.getElementById("sealcutResultPreview");
  var resultPlaceholder = document.getElementById("sealcutResultPlaceholder");

  var metaDimension = document.getElementById("sealcutMetaDimension");
  var metaSize = document.getElementById("sealcutMetaSize");
  var metaStatus = document.getElementById("sealcutMetaStatus");
  var minRedInput = document.getElementById("sealcutMinRed");
  var redDiffInput = document.getElementById("sealcutRedDiff");
  var minSaturationInput = document.getElementById("sealcutMinSaturation");
  var minRedValue = document.getElementById("sealcutMinRedValue");
  var redDiffValue = document.getElementById("sealcutRedDiffValue");
  var minSaturationValue = document.getElementById("sealcutMinSaturationValue");
  var presetButtons = document.querySelectorAll(".sealcut-preset-btn");

  var workingCanvas = document.getElementById("sealcutWorkingCanvas");
  var resultCanvas = document.getElementById("sealcutResultCanvas");
  var workingCtx = workingCanvas.getContext("2d", { willReadFrequently: true });
  var resultCtx = resultCanvas.getContext("2d", { willReadFrequently: true });

  var outputPngBlob = null;
  var outputFileName = "seal-cutout.png";
  var currentImage = null;
  var currentFile = null;
  var currentPresetKey = "scan";
  var PRESETS = {
    scan: { minRed: 72, redDiff: 22, minSaturation: 0.16 },
    screenshot: { minRed: 82, redDiff: 25, minSaturation: 0.2 },
    conservative: { minRed: 95, redDiff: 30, minSaturation: 0.26 },
    aggressive: { minRed: 58, redDiff: 15, minSaturation: 0.1 }
  };

  function setStatus(text) {
    metaStatus.textContent = text;
  }

  function humanSize(size) {
    if (size < 1024) return size + " B";
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
    return (size / (1024 * 1024)).toFixed(2) + " MB";
  }

  function clearResult() {
    outputPngBlob = null;
    downloadBtn.disabled = true;
    resultPreview.hidden = true;
    resultPreview.removeAttribute("src");
    resultPlaceholder.hidden = false;
  }

  function getThresholds() {
    return {
      minRed: Number(minRedInput.value),
      redDiff: Number(redDiffInput.value),
      minSaturation: Number(minSaturationInput.value)
    };
  }

  function syncThresholdLabels() {
    minRedValue.textContent = String(minRedInput.value);
    redDiffValue.textContent = String(redDiffInput.value);
    minSaturationValue.textContent = Number(minSaturationInput.value).toFixed(2);
  }

  function markActivePreset(presetKey) {
    currentPresetKey = presetKey;
    presetButtons.forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.preset === presetKey);
    });
  }

  function applyPresetValues(presetKey) {
    var preset = PRESETS[presetKey];
    if (!preset) return false;
    minRedInput.value = String(preset.minRed);
    redDiffInput.value = String(preset.redDiff);
    minSaturationInput.value = String(preset.minSaturation);
    syncThresholdLabels();
    markActivePreset(presetKey);
    return true;
  }

  function resetAll() {
    fileInput.value = "";
    currentImage = null;
    currentFile = null;
    metaDimension.textContent = "-";
    metaSize.textContent = "-";
    setStatus("等待上传图片");
    originalPreview.hidden = true;
    originalPreview.removeAttribute("src");
    originalPlaceholder.hidden = false;
    clearResult();
  }

  function validateFile(file) {
    if (!file) return "未读取到文件。";
    if (file.size > MAX_FILE_SIZE) return "文件超过 10MB，请压缩后再上传。";

    var fileName = (file.name || "").toLowerCase();
    var extOk = /\.(png|jpg|jpeg|webp)$/.test(fileName);
    var mimeOk = ACCEPTED_TYPES.has(file.type);
    if (!extOk && !mimeOk) return "仅支持 png、jpg、jpeg、webp 格式。";
    return "";
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var objectUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("图片读取失败，请更换图片重试。"));
      };
      img.src = objectUrl;
    });
  }

  function rgbToHsv(r, g, b) {
    var rn = r / 255;
    var gn = g / 255;
    var bn = b / 255;
    var max = Math.max(rn, gn, bn);
    var min = Math.min(rn, gn, bn);
    var delta = max - min;
    var h = 0;
    var s = max === 0 ? 0 : delta / max;
    var v = max;

    if (delta !== 0) {
      if (max === rn) h = ((gn - bn) / delta) % 6;
      else if (max === gn) h = (bn - rn) / delta + 2;
      else h = (rn - gn) / delta + 4;
      h *= 60;
      if (h < 0) h += 360;
    }

    return { h: h, s: s, v: v };
  }

  function isLikelyNeutral(r, g, b) {
    var delta = Math.max(r, g, b) - Math.min(r, g, b);
    return delta <= 22;
  }

  function processImage(img, thresholds) {
    var width = img.naturalWidth || img.width;
    var height = img.naturalHeight || img.height;

    workingCanvas.width = width;
    workingCanvas.height = height;
    resultCanvas.width = width;
    resultCanvas.height = height;

    workingCtx.clearRect(0, 0, width, height);
    resultCtx.clearRect(0, 0, width, height);
    workingCtx.drawImage(img, 0, 0, width, height);

    var src = workingCtx.getImageData(0, 0, width, height);
    var srcData = src.data;
    var out = resultCtx.createImageData(width, height);
    var outData = out.data;
    var keepMask = new Uint8Array(width * height);

    var minRed = thresholds.minRed;
    var redDiff = thresholds.redDiff;
    var minSaturation = thresholds.minSaturation;

    for (var i = 0; i < srcData.length; i += 4) {
      var r = srcData[i];
      var g = srcData[i + 1];
      var b = srcData[i + 2];
      var a = srcData[i + 3];
      var pxIndex = i / 4;

      if (a === 0) continue;

      var hsv = rgbToHsv(r, g, b);
      var saturation = hsv.s;

      var isRed =
        r >= minRed &&
        r - g >= redDiff &&
        r - b >= redDiff &&
        saturation >= minSaturation;

      var isRedHue = hsv.h <= 28 || hsv.h >= 330;
      var darkTextLike = r < 95 && g < 95 && b < 95;
      var grayTextLike = isLikelyNeutral(r, g, b) && hsv.v < 0.72;
      var paperLike = isLikelyNeutral(r, g, b) && hsv.v >= 0.72;

      if (isRed && isRedHue && !darkTextLike && !grayTextLike && !paperLike) {
        keepMask[pxIndex] = 1;
      }
    }

    for (var y = 1; y < height - 1; y++) {
      for (var x = 1; x < width - 1; x++) {
        var idx = y * width + x;
        if (keepMask[idx]) continue;

        var n =
          keepMask[idx - width - 1] +
          keepMask[idx - width] +
          keepMask[idx - width + 1] +
          keepMask[idx - 1] +
          keepMask[idx + 1] +
          keepMask[idx + width - 1] +
          keepMask[idx + width] +
          keepMask[idx + width + 1];

        if (n >= 5) keepMask[idx] = 1;
      }
    }

    for (var p = 0; p < keepMask.length; p += 1) {
      var off = p * 4;
      if (!keepMask[p]) {
        outData[off] = 0;
        outData[off + 1] = 0;
        outData[off + 2] = 0;
        outData[off + 3] = 0;
        continue;
      }

      var rr = srcData[off];
      var gg = srcData[off + 1];
      var bb = srcData[off + 2];
      var hsv2 = rgbToHsv(rr, gg, bb);
      var redStrength = Math.max(rr - gg, rr - bb);
      var alphaBoost = Math.min(1, redStrength / 110 + hsv2.s * 0.4);

      outData[off] = Math.min(255, Math.round(rr * 1.05 + 8));
      outData[off + 1] = Math.max(0, Math.round(gg * 0.88));
      outData[off + 2] = Math.max(0, Math.round(bb * 0.88));
      outData[off + 3] = Math.max(80, Math.min(255, Math.round(srcData[off + 3] * alphaBoost)));
    }

    resultCtx.putImageData(out, 0, 0);
  }

  async function renderCutoutFromCurrentImage(statusText) {
    if (!currentImage || !currentFile) return;
    setStatus(statusText || "识别红章并去除背景中…");
    processImage(currentImage, getThresholds());
    outputPngBlob = await canvasToPngBlob(resultCanvas);
    outputFileName = (currentFile.name || "seal").replace(/\.[^.]+$/, "") + "-cutout.png";

    var resultUrl = URL.createObjectURL(outputPngBlob);
    resultPreview.src = resultUrl;
    resultPreview.hidden = false;
    resultPlaceholder.hidden = true;
    downloadBtn.disabled = false;
    setStatus("处理完成，可导出透明 PNG");
  }

  function canvasToPngBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error("导出失败，请重试。"));
          return;
        }
        resolve(blob);
      }, "image/png");
    });
  }

  async function handleFile(file) {
    var validationError = validateFile(file);
    if (validationError) {
      setStatus(validationError);
      clearResult();
      return;
    }

    try {
      setStatus("读取图片中…");
      var image = await loadImageFromFile(file);
      currentImage = image;
      currentFile = file;

      metaDimension.textContent = image.naturalWidth + " × " + image.naturalHeight;
      metaSize.textContent = humanSize(file.size);

      originalPreview.src = URL.createObjectURL(file);
      originalPreview.hidden = false;
      originalPlaceholder.hidden = true;

      setStatus("生成透明 PNG 中…");
      await renderCutoutFromCurrentImage("识别红章并去除背景中…");
    } catch (error) {
      clearResult();
      setStatus(error && error.message ? error.message : "处理失败，请更换图片重试。");
    }
  }

  function onDrop(e) {
    e.preventDefault();
    dropZone.classList.remove("is-dragover");
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files[0]) return;
    handleFile(e.dataTransfer.files[0]);
  }

  fileInput.addEventListener("change", function () {
    if (!fileInput.files || !fileInput.files[0]) return;
    handleFile(fileInput.files[0]);
  });

  dropZone.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropZone.classList.add("is-dragover");
  });
  dropZone.addEventListener("dragleave", function () {
    dropZone.classList.remove("is-dragover");
  });
  dropZone.addEventListener("drop", onDrop);

  downloadBtn.addEventListener("click", function () {
    if (!outputPngBlob) return;
    var link = document.createElement("a");
    link.href = URL.createObjectURL(outputPngBlob);
    link.download = outputFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus("已导出：" + outputFileName);
  });

  resetBtn.addEventListener("click", resetAll);

  [minRedInput, redDiffInput, minSaturationInput].forEach(function (input) {
    input.addEventListener("input", async function () {
      syncThresholdLabels();
      markActivePreset("custom");
      if (!currentImage) return;
      try {
        await renderCutoutFromCurrentImage("参数调整中，重新处理…");
      } catch (error) {
        setStatus(error && error.message ? error.message : "参数调整失败，请重试。");
      }
    });
  });

  presetButtons.forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var presetKey = btn.dataset.preset;
      if (!applyPresetValues(presetKey)) return;
      if (!currentImage) return;
      try {
        await renderCutoutFromCurrentImage("应用参数预设中…");
      } catch (error) {
        setStatus(error && error.message ? error.message : "预设应用失败，请重试。");
      }
    });
  });

  applyPresetValues(currentPresetKey);
  syncThresholdLabels();
  resetAll();
})();
