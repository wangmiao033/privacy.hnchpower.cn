const API_BASE_URL = window.BG_REMOVE_API_BASE_URL || "http://localhost:8000";

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const fileInput = document.getElementById("bgremoveFileInput");
const dropZone = document.getElementById("bgremoveDropZone");
const processBtn = document.getElementById("bgremoveProcessBtn");
const downloadBtn = document.getElementById("bgremoveDownloadBtn");
const resetBtn = document.getElementById("bgremoveResetBtn");
const originalPreview = document.getElementById("bgremoveOriginalPreview");
const resultPreview = document.getElementById("bgremoveResultPreview");
const originalPlaceholder = document.getElementById("bgremoveOriginalPlaceholder");
const resultPlaceholder = document.getElementById("bgremoveResultPlaceholder");
const apiBaseEl = document.getElementById("bgremoveApiBase");
const dimensionEl = document.getElementById("bgremoveMetaDimension");
const sizeEl = document.getElementById("bgremoveMetaSize");
const statusEl = document.getElementById("bgremoveMetaStatus");

let currentFile = null;
let originalObjectUrl = "";
let resultObjectUrl = "";

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

downloadBtn.addEventListener("click", () => {
  if (!resultObjectUrl) {
    return;
  }

  const link = document.createElement("a");
  const baseName = currentFile ? currentFile.name.replace(/\.[^.]+$/, "") : "bg-removed";
  link.href = resultObjectUrl;
  link.download = `${baseName}_transparent.png`;
  link.click();
});

resetBtn.addEventListener("click", resetTool);

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

    const response = await fetch(`${trimTrailingSlash(API_BASE_URL)}/api/remove-background`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new Error(message || `处理失败，HTTP ${response.status}`);
    }

    const blob = await response.blob();
    if (blob.size === 0) {
      throw new Error("后端返回了空文件。");
    }

    if (resultObjectUrl) {
      URL.revokeObjectURL(resultObjectUrl);
    }
    resultObjectUrl = URL.createObjectURL(blob);
    resultPreview.src = resultObjectUrl;
    resultPreview.hidden = false;
    resultPlaceholder.hidden = true;
    downloadBtn.disabled = false;
    setStatus("抠图完成，可以下载透明 PNG。");
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
  if (resultObjectUrl) {
    URL.revokeObjectURL(resultObjectUrl);
    resultObjectUrl = "";
  }
  resultPreview.removeAttribute("src");
  resultPreview.hidden = true;
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

function formatBytes(bytes) {
  if (!bytes) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** index;
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
