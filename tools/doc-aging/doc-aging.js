(function () {
  "use strict";

  var MAX_SIZE = 10 * 1024 * 1024;
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
  var resetBtn = document.getElementById("docagingResetBtn");

  var originalPreview = document.getElementById("docagingOriginalPreview");
  var originalPlaceholder = document.getElementById("docagingOriginalPlaceholder");
  var resultPreview = document.getElementById("docagingResultPreview");
  var resultPlaceholder = document.getElementById("docagingResultPlaceholder");

  var metaSize = document.getElementById("docagingMetaSize");
  var metaFile = document.getElementById("docagingMetaFile");
  var metaStatus = document.getElementById("docagingMetaStatus");

  var sourceCanvas = document.getElementById("docagingSourceCanvas");
  var outputCanvas = document.getElementById("docagingOutputCanvas");
  var sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  var outputCtx = outputCanvas.getContext("2d", { willReadFrequently: true });

  var currentPreset = "aged";
  var currentEffect = "lightScanAged";
  var currentMicroLevel = "standard";
  var currentImage = null;
  var currentFile = null;
  var outputBlob = null;
  var outputName = "doc-old-style.png";
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

  function updateSlidersText() {
    intensityValue.textContent = intensityInput.value;
    contrastValue.textContent = contrastInput.value;
    textureStrengthValue.textContent = textureStrengthInput.value;
    textureStrengthInput.disabled = !textureToggle.checked;
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

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
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
    if (file.size > MAX_SIZE) return "文件超过 10MB，请压缩后重试。";
    var name = (file.name || "").toLowerCase();
    var extOk = /\.(png|jpg|jpeg|webp)$/.test(name);
    var typeOk = ACCEPTED_TYPES.has(file.type);
    if (!extOk && !typeOk) return "仅支持 png、jpg、jpeg、webp。";
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

  function processImage() {
    if (!currentImage) return;
    var width = currentImage.naturalWidth || currentImage.width;
    var height = currentImage.naturalHeight || currentImage.height;

    sourceCanvas.width = width;
    sourceCanvas.height = height;
    outputCanvas.width = width;
    outputCanvas.height = height;

    sourceCtx.clearRect(0, 0, width, height);
    sourceCtx.drawImage(currentImage, 0, 0, width, height);
    var imageData = sourceCtx.getImageData(0, 0, width, height);
    var data = imageData.data;

    var intensity = Number(intensityInput.value) / 100;
    var contrast = Number(contrastInput.value);
    var textureStrength = Number(textureStrengthInput.value) / 100;
    var effectConfig = EFFECTS[currentEffect] || EFFECTS.mildOld;
    if (currentEffect === "lightScanAged") {
      var levelConfig = LIGHT_SCAN_LEVELS[currentMicroLevel] || LIGHT_SCAN_LEVELS.standard;
      effectConfig = Object.assign({}, effectConfig, levelConfig);
    }

    for (var i = 0; i < data.length; i += 4) {
      var p = i / 4;
      var x = p % width;
      var y = Math.floor(p / width);
      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];
      var gray = 0.299 * r + 0.587 * g + 0.114 * b;
      var noise = (randomByIndex(x, y) - 0.5) * 34 * intensity;

      if (currentPreset === "aged") {
        if (currentEffect === "lightScanAged") {
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

          if (textureToggle.checked) {
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
          if (textureToggle.checked) {
            agedR = applyTextureTone(agedR, x, y, width, height, intensity, textureStrength);
            agedG = applyTextureTone(agedG, x, y, width, height, intensity * 0.9, textureStrength);
            agedB = applyTextureTone(agedB, x, y, width, height, intensity * 0.85, textureStrength);
          }
          data[i] = agedR;
          data[i + 1] = agedG;
          data[i + 2] = agedB;
        }
      } else if (currentPreset === "scan") {
        var scanGray = Math.max(0, Math.min(255, gray + noise * 0.7));
        var scanTone = applyContrast(scanGray, contrast);
        if (textureToggle.checked) {
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
  }

  function renderResult() {
    return new Promise(function (resolve, reject) {
      processImage();
      outputCanvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error("导出失败，请重试。"));
          return;
        }
        outputBlob = blob;
        var url = URL.createObjectURL(blob);
        resultPreview.src = url;
        resultPreview.hidden = false;
        resultPlaceholder.hidden = true;
        downloadBtn.disabled = false;
        resolve();
      }, "image/png");
    });
  }

  async function handleFile(file) {
    var error = validateFile(file);
    if (error) {
      setStatus(error);
      return;
    }
    try {
      setStatus("读取图片中…");
      currentImage = await loadImage(file);
      currentFile = file;
      outputName = (file.name || "doc").replace(/\.[^.]+$/, "") + "-old-style.png";

      originalPreview.src = URL.createObjectURL(file);
      originalPreview.hidden = false;
      originalPlaceholder.hidden = true;
      metaSize.textContent = currentImage.naturalWidth + " × " + currentImage.naturalHeight;
      metaFile.textContent = humanSize(file.size);

      setStatus("处理中…");
      await renderResult();
      setStatus("处理完成，可导出 PNG");
    } catch (e) {
      setStatus(e && e.message ? e.message : "处理失败，请重试。");
    }
  }

  function clearAll() {
    fileInput.value = "";
    currentImage = null;
    currentFile = null;
    outputBlob = null;
    outputName = "doc-old-style.png";
    originalPreview.hidden = true;
    originalPreview.removeAttribute("src");
    resultPreview.hidden = true;
    resultPreview.removeAttribute("src");
    originalPlaceholder.hidden = false;
    resultPlaceholder.hidden = false;
    downloadBtn.disabled = true;
    metaSize.textContent = "-";
    metaFile.textContent = "-";
    setStatus("等待上传图片");
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
    updateSlidersText();
    markActiveEffect(effectKey);
    if (effectKey === "lightScanAged") {
      setMicroLevel("standard");
    }
    return true;
  }

  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  dropZone.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropZone.classList.add("is-dragover");
  });
  dropZone.addEventListener("dragleave", function () {
    dropZone.classList.remove("is-dragover");
  });
  dropZone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropZone.classList.remove("is-dragover");
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  presetButtons.forEach(function (btn) {
    btn.addEventListener("click", async function () {
      setPreset(btn.dataset.preset);
      markActiveEffect("custom");
      if (!currentImage) return;
      try {
        setStatus("应用风格中…");
        await renderResult();
        setStatus("处理完成，可导出 PNG");
      } catch (e) {
        setStatus("风格应用失败，请重试。");
      }
    });
  });

  [intensityInput, contrastInput, textureStrengthInput].forEach(function (el) {
    el.addEventListener("input", async function () {
      updateSlidersText();
      markActiveEffect("custom");
      if (!currentImage) return;
      try {
        setStatus("参数调整中…");
        await renderResult();
        setStatus("处理完成，可导出 PNG");
      } catch (e) {
        setStatus("参数调整失败，请重试。");
      }
    });
  });

  textureToggle.addEventListener("change", async function () {
    updateSlidersText();
    markActiveEffect("custom");
    if (!currentImage) return;
    try {
      setStatus("纹理调整中…");
      await renderResult();
      setStatus("处理完成，可导出 PNG");
    } catch (e) {
      setStatus("纹理调整失败，请重试。");
    }
  });

  effectButtons.forEach(function (btn) {
    btn.addEventListener("click", async function () {
      if (!applyEffect(btn.dataset.effect)) return;
      if (!currentImage) return;
      try {
        setStatus("应用效果中…");
        await renderResult();
        setStatus("处理完成，可导出 PNG");
      } catch (e) {
        setStatus("效果应用失败，请重试。");
      }
    });
  });

  microLevelButtons.forEach(function (btn) {
    btn.addEventListener("click", async function () {
      if (currentEffect !== "lightScanAged") return;
      setMicroLevel(btn.dataset.level);
      if (!currentImage) return;
      try {
        setStatus("应用轻微扫描档位中…");
        await renderResult();
        setStatus("处理完成，可导出 PNG");
      } catch (e) {
        setStatus("档位应用失败，请重试。");
      }
    });
  });

  downloadBtn.addEventListener("click", function () {
    if (!outputBlob) return;
    var link = document.createElement("a");
    link.href = URL.createObjectURL(outputBlob);
    link.download = outputName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus("已导出：" + outputName);
  });

  resetBtn.addEventListener("click", clearAll);

  applyEffect(currentEffect);
  setMicroLevel(currentMicroLevel);
  syncMicroLevelVisibility();
  updateSlidersText();
  clearAll();
})();
