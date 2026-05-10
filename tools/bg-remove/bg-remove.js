const API_BASE_URL = window.BG_REMOVE_API_BASE_URL || "http://localhost:8000";

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const fileInput = document.getElementById("bgremoveFileInput");
const dropZone = document.getElementById("bgremoveDropZone");
const processBtn = document.getElementById("bgremoveProcessBtn");
const downloadBtn = document.getElementById("bgremoveDownloadBtn");
const resetBtn = document.getElementById("bgremoveResetBtn");
const convertBtn = document.getElementById("bgremoveConvertBtn");
const convertFormatSelect = document.getElementById("bgremoveConvertFormat");
const originalPreview = document.getElementById("bgremoveOriginalPreview");
const resultPreview = document.getElementById("bgremoveResultPreview");
const resultCanvas = document.getElementById("bgremoveResultCanvas");
const resultPreviewBox = resultCanvas.closest(".bgremove-preview-box");
const originalPlaceholder = document.getElementById("bgremoveOriginalPlaceholder");
const resultPlaceholder = document.getElementById("bgremoveResultPlaceholder");
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

apiBaseEl.textContent = API_BASE_URL;

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
    return `无法连接抠图后端：请确认 ${API_BASE_URL} 已启动，或上线后把 API 地址改为公网服务。`;
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
