(function () {
  "use strict";

  var MAX_SIZE = 10 * 1024 * 1024;
  var ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

  var fileInput = document.getElementById("docagingFileInput");
  var dropZone = document.getElementById("docagingDropZone");
  var presetButtons = document.querySelectorAll(".docaging-presets button");
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
  var currentImage = null;
  var currentFile = null;
  var outputBlob = null;
  var outputName = "doc-old-style.png";

  function setStatus(text) {
    metaStatus.textContent = text;
  }

  function updateSlidersText() {
    intensityValue.textContent = intensityInput.value;
    contrastValue.textContent = contrastInput.value;
    textureStrengthValue.textContent = textureStrengthInput.value;
    textureStrengthInput.disabled = !textureToggle.checked;
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
        var sepiaR = Math.min(255, gray * 1.08 + 26 + noise);
        var sepiaG = Math.min(255, gray * 0.97 + 14 + noise * 0.8);
        var sepiaB = Math.min(255, gray * 0.8 - 10 + noise * 0.6);
        var agedR = applyContrast(sepiaR, contrast);
        var agedG = applyContrast(sepiaG, contrast * 0.9);
        var agedB = applyContrast(sepiaB, contrast * 0.8);
        if (textureToggle.checked) {
          agedR = applyTextureTone(agedR, x, y, width, height, intensity, textureStrength);
          agedG = applyTextureTone(agedG, x, y, width, height, intensity * 0.9, textureStrength);
          agedB = applyTextureTone(agedB, x, y, width, height, intensity * 0.85, textureStrength);
        }
        data[i] = agedR;
        data[i + 1] = agedG;
        data[i + 2] = agedB;
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
    if (!currentImage) return;
    try {
      setStatus("纹理调整中…");
      await renderResult();
      setStatus("处理完成，可导出 PNG");
    } catch (e) {
      setStatus("纹理调整失败，请重试。");
    }
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

  updateSlidersText();
  clearAll();
})();
