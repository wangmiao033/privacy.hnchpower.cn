function resolveBgRemoveApiBaseUrl() {
  var raw = typeof window !== "undefined" ? window.BG_REMOVE_API_BASE_URL : undefined;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().replace(/\/+$/, "");
  }
  var host = "";
  try {
    host = typeof location !== "undefined" ? location.hostname || "" : "";
  } catch (_e) {}
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:8000";
  }
  return "";
}

const API_BASE_URL = resolveBgRemoveApiBaseUrl();

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const fileInput = document.getElementById("bgremoveFileInput");
const dropZone = document.getElementById("bgremoveDropZone");
const processBtn = document.getElementById("bgremoveProcessBtn");
const downloadBtn = document.getElementById("bgremoveDownloadBtn");
const resetBtn = document.getElementById("bgremoveResetBtn");
const convertBtn = document.getElementById("bgremoveConvertBtn");
const convertFormatSelect = document.getElementById("bgremoveConvertFormat");
const extractTextBtn = document.getElementById("bgremoveExtractTextBtn");
const selectTextRegionBtn = document.getElementById("bgremoveSelectTextRegionBtn");
const downloadTextBtn = document.getElementById("bgremoveDownloadTextBtn");
const textRegionSelect = document.getElementById("bgremoveTextRegion");
const textPresetSelect = document.getElementById("bgremoveTextPreset");
const textStrengthInput = document.getElementById("bgremoveTextStrength");
const textStrengthValue = document.getElementById("bgremoveTextStrengthValue");
const textGlowInput = document.getElementById("bgremoveTextGlow");
const textGlowValue = document.getElementById("bgremoveTextGlowValue");
const originalPreview = document.getElementById("bgremoveOriginalPreview");
const resultPreview = document.getElementById("bgremoveResultPreview");
const resultCanvas = document.getElementById("bgremoveResultCanvas");
const textCanvas = document.getElementById("bgremoveTextCanvas");
const resultPreviewBox = resultCanvas.closest(".bgremove-preview-box");
const originalPreviewBox = document.getElementById("bgremoveOriginalPreviewBox");
const selectionRect = document.getElementById("bgremoveSelectionRect");
const originalPlaceholder = document.getElementById("bgremoveOriginalPlaceholder");
const resultPlaceholder = document.getElementById("bgremoveResultPlaceholder");
const textPlaceholder = document.getElementById("bgremoveTextPlaceholder");
const apiBaseEl = document.getElementById("bgremoveApiBase");
const dimensionEl = document.getElementById("bgremoveMetaDimension");
const sizeEl = document.getElementById("bgremoveMetaSize");
const statusEl = document.getElementById("bgremoveMetaStatus");
const brushSizeInput = document.getElementById("bgremoveBrushSize");
const resetEditsBtn = document.getElementById("bgremoveResetEditsBtn");
const modeInputs = Array.from(document.querySelectorAll("input[name='bgremoveMode']"));
const formatInputs = Array.from(document.querySelectorAll("input[name='bgremoveDownloadFormat']"));
const previewBgButtons = Array.from(document.querySelectorAll("[data-preview-bg]"));
const brushModeButtons = Array.from(document.querySelectorAll("[data-brush-mode]"));

let currentFile = null;
let originalObjectUrl = "";
let resultObjectUrl = "";
let resultBlob = null;
let originalBitmap = null;
let resultBaseBitmap = null;
let brushMode = "restore";
let isPainting = false;
let hasTextExtraction = false;
let isSelectingTextRegion = false;
let selectionStart = null;
let customTextRegion = null;

apiBaseEl.textContent = API_BASE_URL || "未配置（请编辑 bg-remove-config.js）";

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) {
    handleFile(file);
  }
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("is-dragover");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragover");
  const file = event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) {
    handleFile(file);
  }
});

processBtn.addEventListener("click", () => {
  if (currentFile) {
    removeBackground(currentFile);
  }
});

downloadBtn.addEventListener("click", async () => {
  if (!resultObjectUrl) {
    return;
  }

  try {
    await downloadResult();
  } catch (error) {
    setStatus(error.message || "下载失败，请重新生成后再试。", true);
  }
});

resetBtn.addEventListener("click", resetTool);
resetEditsBtn.addEventListener("click", resetCanvasEdits);
textStrengthInput.addEventListener("input", () => {
  textStrengthValue.textContent = textStrengthInput.value;
});
textGlowInput.addEventListener("input", () => {
  textGlowValue.textContent = textGlowInput.value;
});

extractTextBtn.addEventListener("click", async () => {
  if (!currentFile) {
    return;
  }

  try {
    await extractTextLayer();
  } catch (error) {
    setStatus(error.message || "文字提取失败，请调整参数后重试。", true);
  }
});

selectTextRegionBtn.addEventListener("click", () => {
  if (!currentFile) {
    return;
  }
  isSelectingTextRegion = true;
  textRegionSelect.value = "custom";
  originalPreviewBox.classList.add("is-selecting");
  setStatus("在原图预览上拖拽框选要提取的文字区域。");
});

originalPreviewBox.addEventListener("pointerdown", (event) => {
  if (!isSelectingTextRegion || originalPreview.hidden) {
    return;
  }
  event.preventDefault();
  selectionStart = getOriginalImagePoint(event);
  originalPreviewBox.setPointerCapture(event.pointerId);
  updateSelectionRect(selectionStart, selectionStart);
});

originalPreviewBox.addEventListener("pointermove", (event) => {
  if (!isSelectingTextRegion || !selectionStart) {
    return;
  }
  event.preventDefault();
  updateSelectionRect(selectionStart, getOriginalImagePoint(event));
});

originalPreviewBox.addEventListener("pointerup", (event) => {
  if (!isSelectingTextRegion || !selectionStart) {
    return;
  }
  event.preventDefault();
  const end = getOriginalImagePoint(event);
  customTextRegion = normalizeImageRegion(selectionStart, end);
  selectionStart = null;
  isSelectingTextRegion = false;
  originalPreviewBox.classList.remove("is-selecting");
  textRegionSelect.value = "custom";
  setStatus("已框选文字区域，可以点击“提取文字”。");
});

originalPreviewBox.addEventListener("pointercancel", () => {
  selectionStart = null;
  isSelectingTextRegion = false;
  originalPreviewBox.classList.remove("is-selecting");
});

downloadTextBtn.addEventListener("click", async () => {
  if (!hasTextExtraction) {
    return;
  }

  try {
    const blob = await textCanvasToBlob();
    const baseName = currentFile ? currentFile.name.replace(/\.[^.]+$/, "") : "text-layer";
    triggerDownload(URL.createObjectURL(blob), `${baseName}_text_logo.png`, true);
    setStatus("文字 / Logo PNG 已开始下载。");
  } catch (error) {
    setStatus(error.message || "文字结果下载失败。", true);
  }
});

previewBgButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setPreviewBackground(button.dataset.previewBg);
  });
});

brushModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setBrushMode(button.dataset.brushMode);
  });
});

resultCanvas.addEventListener("pointerdown", (event) => {
  if (!originalBitmap || resultCanvas.hidden) {
    return;
  }
  isPainting = true;
  resultCanvas.setPointerCapture(event.pointerId);
  paintAt(event);
});

resultCanvas.addEventListener("pointermove", (event) => {
  if (isPainting) {
    paintAt(event);
  }
});

resultCanvas.addEventListener("pointerup", () => {
  if (isPainting) {
    isPainting = false;
    setStatus("已应用手动修补，可以继续编辑或下载。");
  }
});

resultCanvas.addEventListener("pointercancel", () => {
  isPainting = false;
});

convertBtn.addEventListener("click", async () => {
  if (!currentFile) {
    return;
  }

  try {
    await convertOriginalImage();
  } catch (error) {
    setStatus(error.message || "图片格式转换失败，请换一张图片重试。", true);
  }
});

formatInputs.forEach((input) => {
  input.addEventListener("change", updateDownloadButtonText);
});

function handleFile(file) {
  if (!ACCEPTED_TYPES.has(file.type)) {
    setStatus("仅支持 PNG、JPG、JPEG、WEBP 图片。", true);
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    setStatus("图片不能超过 12MB。", true);
    return;
  }

  resetResult();
  currentFile = file;
  sizeEl.textContent = formatBytes(file.size);
  setStatus("图片已选择，可以开始抠图。");

  if (originalObjectUrl) {
    URL.revokeObjectURL(originalObjectUrl);
  }
  originalObjectUrl = URL.createObjectURL(file);
  originalPreview.src = originalObjectUrl;
  originalPreview.hidden = false;
  originalPlaceholder.hidden = true;
  processBtn.disabled = false;
  convertBtn.disabled = false;
  extractTextBtn.disabled = false;
  selectTextRegionBtn.disabled = false;

  const image = new Image();
  image.onload = () => {
    dimensionEl.textContent = `${image.naturalWidth} x ${image.naturalHeight}`;
  };
  image.onerror = () => {
    dimensionEl.textContent = "-";
  };
  image.src = originalObjectUrl;
}

async function removeBackground(file) {
  if (!API_BASE_URL) {
    setStatus(
      "当前为公网访问但未配置抠图 API。请先部署 backend-bg-remove，再在 bg-remove-config.js 中设置 BG_REMOVE_API_BASE_URL（HTTPS 根地址）。",
      true
    );
    return;
  }
  processBtn.disabled = true;
  downloadBtn.disabled = true;
  resetResult();
  setStatus("正在上传并处理图片...");

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", getSelectedMode());

    const response = await fetch(`${trimTrailingSlash(API_BASE_URL)}/api/remove-background`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new Error(message || `处理失败，HTTP ${response.status}`);
    }

    resultBlob = await response.blob();
    if (resultBlob.size === 0) {
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
    setStatus(getCompletionMessage());
  } catch (error) {
    resetResult();
    setStatus(getFriendlyErrorMessage(error), true);
  } finally {
    processBtn.disabled = !currentFile;
  }
}

function resetTool() {
  currentFile = null;
  fileInput.value = "";
  dimensionEl.textContent = "-";
  sizeEl.textContent = "-";
  processBtn.disabled = true;
  convertBtn.disabled = true;
  extractTextBtn.disabled = true;
  selectTextRegionBtn.disabled = true;
  customTextRegion = null;
  selectionRect.hidden = true;
  resetTextExtraction();
  resetResult();

  if (originalObjectUrl) {
    URL.revokeObjectURL(originalObjectUrl);
    originalObjectUrl = "";
  }
  originalPreview.removeAttribute("src");
  originalPreview.hidden = true;
  originalPlaceholder.hidden = false;
  setStatus("等待上传图片");
}

function resetResult() {
  downloadBtn.disabled = true;
  resultBlob = null;
  setEditorEnabled(false);
  closeImageBitmaps();
  if (resultObjectUrl) {
    URL.revokeObjectURL(resultObjectUrl);
    resultObjectUrl = "";
  }
  resultPreview.removeAttribute("src");
  resultPreview.hidden = true;
  clearResultCanvas();
  resultCanvas.hidden = true;
  resultPlaceholder.hidden = false;
}

function resetTextExtraction() {
  hasTextExtraction = false;
  downloadTextBtn.disabled = true;
  const context = textCanvas.getContext("2d");
  context.clearRect(0, 0, textCanvas.width || 1, textCanvas.height || 1);
  textCanvas.width = 0;
  textCanvas.height = 0;
  textCanvas.hidden = true;
  textPlaceholder.hidden = false;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b91c1c" : "";
}

async function readErrorMessage(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => null);
    return data && (data.detail || data.error || data.message);
  }
  return response.text().catch(() => "");
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function getFriendlyErrorMessage(error) {
  const message = error && error.message ? error.message : "";
  if (message === "Failed to fetch" || message.includes("NetworkError")) {
    if (!API_BASE_URL) {
      return "未配置抠图 API：请在 bg-remove-config.js 中填写公网服务地址（浏览器无法访问你电脑上的 localhost）。";
    }
    return `无法连接抠图后端：请确认 ${API_BASE_URL} 已部署且可公网访问（本地开发请先启动 uvicorn 端口 8000）。`;
  }
  return message || "抠图失败，请检查后端服务。";
}

function getSelectedMode() {
  const checkedInput = modeInputs.find((input) => input.checked);
  return checkedInput ? checkedInput.value : "standard";
}

function getSelectedModeLabel() {
  const checkedInput = modeInputs.find((input) => input.checked);
  const label = checkedInput ? checkedInput.closest("label") : null;
  const title = label ? label.querySelector("strong") : null;
  return title ? title.textContent : "标准";
}

function getCompletionMessage() {
  const mode = getSelectedMode();
  const formatLabel = getSelectedFormatLabel();
  if (mode === "fine") {
    return `抠图完成（精细边缘）。如果插画、海报细节被误删，请改用“插画海报”重新处理。可以下载 ${formatLabel}。`;
  }
  if (mode === "standard") {
    return `抠图完成（标准）。如果是游戏海报或二次元图片，建议再试“插画海报”。可以下载 ${formatLabel}。`;
  }
  return `抠图完成（插画海报），可以下载 ${formatLabel}。`;
}

async function downloadResult() {
  const format = getSelectedFormat();
  const baseName = currentFile ? currentFile.name.replace(/\.[^.]+$/, "") : "bg-removed";

  if (format === "jpg") {
    setStatus("正在生成 JPG 白底图片...");
    const jpgBlob = await canvasToBlob("image/jpeg", 0.92, "#ffffff");
    triggerDownload(URL.createObjectURL(jpgBlob), `${baseName}_white_bg.jpg`, true);
    setStatus("JPG 已生成并开始下载。");
    return;
  }

  const pngBlob = await canvasToBlob("image/png");
  triggerDownload(URL.createObjectURL(pngBlob), `${baseName}_transparent.png`, true);
}

async function convertOriginalImage() {
  const format = convertFormatSelect.value;
  const output = await convertImageBlob(currentFile, format);
  const baseName = currentFile ? currentFile.name.replace(/\.[^.]+$/, "") : "converted";
  const suffix = format === "jpg" ? "jpg" : format;
  triggerDownload(URL.createObjectURL(output.blob), `${baseName}_converted.${suffix}`, true);
  setStatus(`已转换为 ${output.label} 并开始下载。`);
}

async function extractTextLayer() {
  const bitmap = await createImageBitmap(currentFile);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = bitmap.width;
  sourceCanvas.height = bitmap.height;
  const sourceContext = sourceCanvas.getContext("2d");
  sourceContext.drawImage(bitmap, 0, 0);
  bitmap.close();

  const sourceData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const outputData = sourceContext.createImageData(sourceCanvas.width, sourceCanvas.height);
  const regionMask = getTextRegionMask(sourceCanvas.width, sourceCanvas.height, textRegionSelect.value);
  const strength = Number(textStrengthInput.value);
  const glow = Number(textGlowInput.value);
  const preset = textPresetSelect.value;

  for (let index = 0; index < sourceData.data.length; index += 4) {
    const pixelIndex = index / 4;
    const x = pixelIndex % sourceCanvas.width;
    const y = Math.floor(pixelIndex / sourceCanvas.width);
    const regionWeight = regionMask(x, y);
    if (regionWeight <= 0) {
      continue;
    }

    const red = sourceData.data[index];
    const green = sourceData.data[index + 1];
    const blue = sourceData.data[index + 2];
    const alpha = sourceData.data[index + 3];
    const score = getTextPixelScore(red, green, blue, preset);
    const threshold = strength / 100;
    const softness = Math.max(0.04, glow / 100);
    const maskAlpha = clamp((score - threshold) / softness, 0, 1) * regionWeight;

    if (maskAlpha > 0.01) {
      outputData.data[index] = red;
      outputData.data[index + 1] = green;
      outputData.data[index + 2] = blue;
      outputData.data[index + 3] = Math.round(alpha * maskAlpha);
    }
  }

  textCanvas.width = sourceCanvas.width;
  textCanvas.height = sourceCanvas.height;
  const textContext = textCanvas.getContext("2d");
  textContext.clearRect(0, 0, textCanvas.width, textCanvas.height);
  textContext.putImageData(outputData, 0, 0);
  textCanvas.hidden = false;
  textPlaceholder.hidden = true;
  hasTextExtraction = true;
  downloadTextBtn.disabled = false;
  setStatus("文字 / Logo 已提取。可调整区域、文字类型和强度后重新提取。");
}

function getTextRegionMask(width, height, region) {
  if (region === "custom" && customTextRegion) {
    const left = customTextRegion.left / width;
    const top = customTextRegion.top / height;
    const right = customTextRegion.right / width;
    const bottom = customTextRegion.bottom / height;
    return createRegionMask([[left, top, right, bottom]], width, height);
  }

  const regions = {
    top: [[0.52, 0, 1, 0.22]],
    title: [[0, 0.58, 1, 0.88]],
    bottom: [[0, 0.82, 1, 0.97]],
    poster: [
      [0.5, 0, 1, 0.22],
      [0, 0.58, 1, 0.88],
      [0, 0.82, 1, 0.97],
    ],
    all: [[0, 0, 1, 1]],
  };
  const selectedRegions = regions[region] || regions.poster;
  return createRegionMask(selectedRegions, width, height);
}

function createRegionMask(selectedRegions, width, height) {
  return (x, y) => {
    const nx = x / width;
    const ny = y / height;
    for (const [left, top, right, bottom] of selectedRegions) {
      if (nx >= left && nx <= right && ny >= top && ny <= bottom) {
        return 1;
      }
    }
    return 0;
  };
}

function getOriginalImagePoint(event) {
  const imageRect = originalPreview.getBoundingClientRect();
  const x = clamp(event.clientX - imageRect.left, 0, imageRect.width);
  const y = clamp(event.clientY - imageRect.top, 0, imageRect.height);
  return {
    displayX: x,
    displayY: y,
    imageX: (x / imageRect.width) * originalPreview.naturalWidth,
    imageY: (y / imageRect.height) * originalPreview.naturalHeight,
    imageRect,
  };
}

function updateSelectionRect(start, end) {
  const imageRect = originalPreview.getBoundingClientRect();
  const boxRect = originalPreviewBox.getBoundingClientRect();
  const left = Math.min(start.displayX, end.displayX);
  const top = Math.min(start.displayY, end.displayY);
  const width = Math.abs(start.displayX - end.displayX);
  const height = Math.abs(start.displayY - end.displayY);
  selectionRect.style.left = `${imageRect.left - boxRect.left + left}px`;
  selectionRect.style.top = `${imageRect.top - boxRect.top + top}px`;
  selectionRect.style.width = `${width}px`;
  selectionRect.style.height = `${height}px`;
  selectionRect.hidden = false;
}

function normalizeImageRegion(start, end) {
  return {
    left: Math.max(0, Math.min(start.imageX, end.imageX)),
    top: Math.max(0, Math.min(start.imageY, end.imageY)),
    right: Math.min(originalPreview.naturalWidth, Math.max(start.imageX, end.imageX)),
    bottom: Math.min(originalPreview.naturalHeight, Math.max(start.imageY, end.imageY)),
  };
}

function getTextPixelScore(red, green, blue, preset) {
  const max = Math.max(red, green, blue) / 255;
  const min = Math.min(red, green, blue) / 255;
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  const warmth = Math.max(0, red - blue) / 255;
  const gold = Math.max(0, red * 1.08 + green * 0.78 - blue * 1.35) / 255;
  const redness = Math.max(0, red - Math.max(green, blue) * 0.85) / 255;
  const darkness = 1 - luminance;

  if (preset === "gold") {
    return clamp(luminance * 0.48 + saturation * 0.2 + warmth * 0.24 + gold * 0.32, 0, 1);
  }
  if (preset === "red") {
    return clamp(redness * 0.72 + saturation * 0.18 + luminance * 0.16, 0, 1);
  }
  if (preset === "dark") {
    return clamp(darkness * 0.7 + saturation * 0.16, 0, 1);
  }
  return clamp(luminance * 0.82 + saturation * 0.12 + max * 0.15, 0, 1);
}

function textCanvasToBlob() {
  if (!hasTextExtraction || !textCanvas.width || !textCanvas.height) {
    throw new Error("没有可下载的文字结果。");
  }

  return new Promise((resolve, reject) => {
    textCanvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("文字结果导出失败。"));
      }
    }, "image/png");
  });
}

function triggerDownload(url, filename, shouldRevoke) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  if (shouldRevoke) {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function convertPngBlobToJpg(blob) {
  if (!blob) {
    throw new Error("没有可下载的抠图结果。");
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((jpgBlob) => {
      if (jpgBlob) {
        resolve(jpgBlob);
      } else {
        reject(new Error("JPG 生成失败。"));
      }
    }, "image/jpeg", 0.92);
  });
}

async function setupEditableResult(blob) {
  closeImageBitmaps();
  const [nextResultBitmap, nextOriginalBitmap] = await Promise.all([
    createImageBitmap(blob),
    createImageBitmap(currentFile),
  ]);
  resultBaseBitmap = nextResultBitmap;
  originalBitmap = nextOriginalBitmap;
  resultCanvas.width = resultBaseBitmap.width;
  resultCanvas.height = resultBaseBitmap.height;
  resetCanvasEdits(false);
}

function resetCanvasEdits(shouldNotify = true) {
  if (!resultBaseBitmap) {
    return;
  }
  const context = resultCanvas.getContext("2d");
  context.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
  context.drawImage(resultBaseBitmap, 0, 0, resultCanvas.width, resultCanvas.height);
  if (shouldNotify) {
    setStatus("已还原为 AI 抠图结果。");
  }
}

function paintAt(event) {
  event.preventDefault();
  const point = getCanvasPoint(event);
  const radius = Number(brushSizeInput.value) / 2;
  const context = resultCanvas.getContext("2d");
  context.save();
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.clip();

  if (brushMode === "erase") {
    context.clearRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
  } else {
    context.drawImage(originalBitmap, 0, 0, resultCanvas.width, resultCanvas.height);
  }

  context.restore();
}

function getCanvasPoint(event) {
  const rect = resultCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * resultCanvas.width,
    y: ((event.clientY - rect.top) / rect.height) * resultCanvas.height,
  };
}

function setPreviewBackground(value) {
  resultPreviewBox.classList.toggle("bgremove-result-bg", value === "checker");
  resultPreviewBox.classList.toggle("bgremove-result-white", value === "white");
  resultPreviewBox.classList.toggle("bgremove-result-black", value === "black");
  resultPreviewBox.classList.toggle("bgremove-result-gray", value === "gray");
  previewBgButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.previewBg === value);
  });
}

function setBrushMode(value) {
  brushMode = value === "erase" ? "erase" : "restore";
  brushModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.brushMode === brushMode);
  });
}

function setEditorEnabled(isEnabled) {
  brushSizeInput.disabled = !isEnabled;
  resetEditsBtn.disabled = !isEnabled;
  brushModeButtons.forEach((button) => {
    button.disabled = !isEnabled;
  });
}

function clearResultCanvas() {
  const context = resultCanvas.getContext("2d");
  context.clearRect(0, 0, resultCanvas.width || 1, resultCanvas.height || 1);
  resultCanvas.width = 0;
  resultCanvas.height = 0;
}

function closeImageBitmaps() {
  if (originalBitmap) {
    originalBitmap.close();
    originalBitmap = null;
  }
  if (resultBaseBitmap) {
    resultBaseBitmap.close();
    resultBaseBitmap = null;
  }
}

function canvasToBlob(mimeType, quality, backgroundColor) {
  if (resultCanvas.hidden || !resultCanvas.width || !resultCanvas.height) {
    throw new Error("没有可下载的抠图结果。");
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = resultCanvas.width;
  exportCanvas.height = resultCanvas.height;
  const context = exportCanvas.getContext("2d");
  if (backgroundColor) {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  }
  context.drawImage(resultCanvas, 0, 0);

  return new Promise((resolve, reject) => {
    exportCanvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("导出图片失败。"));
      }
    }, mimeType, quality);
  });
}

async function convertImageBlob(blob, format) {
  if (!blob) {
    throw new Error("请先上传图片。");
  }

  const mimeTypeMap = {
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const labelMap = {
    jpg: "JPG",
    png: "PNG",
    webp: "WEBP",
  };
  const mimeType = mimeTypeMap[format] || "image/jpeg";
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");

  if (format === "jpg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((convertedBlob) => {
      if (convertedBlob) {
        resolve({ blob: convertedBlob, label: labelMap[format] || "JPG" });
      } else {
        reject(new Error("图片格式转换失败。"));
      }
    }, mimeType, format === "png" ? undefined : 0.92);
  });
}

function getSelectedFormat() {
  const checkedInput = formatInputs.find((input) => input.checked);
  return checkedInput ? checkedInput.value : "png";
}

function getSelectedFormatLabel() {
  return getSelectedFormat() === "jpg" ? "JPG" : "透明 PNG";
}

function updateDownloadButtonText() {
  downloadBtn.textContent = `下载 ${getSelectedFormat() === "jpg" ? "JPG" : "PNG"}`;
}

function formatBytes(bytes) {
  if (!bytes) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** index;
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
