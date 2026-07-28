(function () {
  "use strict";

  var MAX_FILE_SIZE = 20 * 1024 * 1024;
  var ALLOWED_EXTENSIONS = ["xlsx", "xls", "xlsm", "ods", "csv"];
  var apiBase = String(window.BG_REMOVE_API_BASE_URL || "").trim().replace(/\/+$/, "");

  var input = document.getElementById("sheetpdfFileInput");
  var dropzone = document.getElementById("sheetpdfDropzone");
  var fileInfo = document.getElementById("sheetpdfFileInfo");
  var fileName = document.getElementById("sheetpdfFileName");
  var fileMeta = document.getElementById("sheetpdfFileMeta");
  var removeFileButton = document.getElementById("sheetpdfRemoveFile");
  var convertButton = document.getElementById("sheetpdfConvertBtn");
  var resetButton = document.getElementById("sheetpdfResetBtn");
  var serviceBadge = document.getElementById("sheetpdfServiceBadge");
  var statusBox = document.getElementById("sheetpdfStatus");
  var statusTitle = document.getElementById("sheetpdfStatusTitle");
  var statusText = document.getElementById("sheetpdfStatusText");
  var progress = document.getElementById("sheetpdfProgress");
  var resultBox = document.getElementById("sheetpdfResult");
  var resultName = document.getElementById("sheetpdfResultName");
  var resultMeta = document.getElementById("sheetpdfResultMeta");
  var downloadButton = document.getElementById("sheetpdfDownloadBtn");

  var selectedFile = null;
  var resultUrl = "";
  var resultFilename = "";
  var isProcessing = false;

  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 1024 * 100 ? 1 : 0) + " KB";
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  }

  function extensionOf(name) {
    var pieces = String(name || "").toLowerCase().split(".");
    return pieces.length > 1 ? pieces.pop() : "";
  }

  function outputName(name) {
    var clean = String(name || "表格").replace(/\.[^.]+$/, "");
    return clean + ".pdf";
  }

  function setStatus(type, title, text) {
    statusBox.className = "sheetpdf-status is-" + type;
    statusTitle.textContent = title;
    statusText.textContent = text;
  }

  function setBusy(busy) {
    isProcessing = busy;
    progress.hidden = !busy;
    input.disabled = busy;
    removeFileButton.disabled = busy;
    resetButton.disabled = busy;
    convertButton.disabled = busy || !selectedFile || !apiBase;
    convertButton.textContent = busy ? "正在转换，请稍候…" : "开始转换 PDF";
  }

  function clearResult() {
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      resultUrl = "";
    }
    resultFilename = "";
    resultBox.hidden = true;
  }

  function resetSelection() {
    if (isProcessing) return;
    selectedFile = null;
    input.value = "";
    fileInfo.hidden = true;
    clearResult();
    convertButton.disabled = true;
    setStatus("idle", "等待上传文件", apiBase ? "选择表格后即可转换。" : "转换服务尚未配置，请联系管理员。");
  }

  function acceptFile(file) {
    clearResult();
    if (!file) return;

    var ext = extensionOf(file.name);
    if (ALLOWED_EXTENSIONS.indexOf(ext) === -1) {
      selectedFile = null;
      fileInfo.hidden = true;
      convertButton.disabled = true;
      setStatus("error", "文件格式不支持", "请选择 XLSX、XLS、XLSM、ODS 或 CSV 表格文件。");
      return;
    }

    if (file.size <= 0) {
      selectedFile = null;
      fileInfo.hidden = true;
      convertButton.disabled = true;
      setStatus("error", "文件为空", "请重新选择可以正常打开的表格文件。");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      selectedFile = null;
      fileInfo.hidden = true;
      convertButton.disabled = true;
      setStatus("error", "文件过大", "单个文件不能超过 20MB。");
      return;
    }

    selectedFile = file;
    fileName.textContent = file.name;
    fileMeta.textContent = ext.toUpperCase() + " · " + formatSize(file.size);
    fileInfo.hidden = false;
    convertButton.disabled = !apiBase;
    setStatus("idle", "文件已就绪", apiBase ? "点击“开始转换 PDF”即可生成文件。" : "转换服务尚未配置，请联系管理员。");
  }

  function parseError(response, fallback) {
    return response.text().then(function (text) {
      if (!text) return fallback;
      try {
        var data = JSON.parse(text);
        return data.detail || data.message || fallback;
      } catch (error) {
        return fallback;
      }
    });
  }

  function triggerDownload() {
    if (!resultUrl) return;
    var link = document.createElement("a");
    link.href = resultUrl;
    link.download = resultFilename || "表格转换.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function convertFile() {
    if (!selectedFile || !apiBase || isProcessing) return;

    clearResult();
    setBusy(true);
    setStatus("processing", "正在转换表格", "正在上传并使用 LibreOffice 生成 PDF，首次启动可能需要几十秒。");

    var controller = new AbortController();
    var timeout = window.setTimeout(function () {
      controller.abort();
    }, 180000);

    try {
      var formData = new FormData();
      formData.append("file", selectedFile, selectedFile.name);

      var response = await fetch(apiBase + "/api/spreadsheet-to-pdf", {
        method: "POST",
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await parseError(response, "转换失败，请稍后重试。"));
      }

      var blob = await response.blob();
      if (!blob.size) {
        throw new Error("转换服务没有返回有效 PDF。");
      }

      resultUrl = URL.createObjectURL(blob);
      resultFilename = outputName(selectedFile.name);
      resultName.textContent = resultFilename;
      resultMeta.textContent = formatSize(blob.size) + " · 已生成，可再次下载";
      resultBox.hidden = false;
      setStatus("success", "转换完成", "PDF 已生成并开始下载，请检查浏览器下载列表。");
      triggerDownload();
    } catch (error) {
      var message = error && error.name === "AbortError"
        ? "转换超时。服务可能正在冷启动，请稍后重新尝试。"
        : (error && error.message ? error.message : "转换失败，请稍后重试。");
      setStatus("error", "转换失败", message);
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  dropzone.addEventListener("dragover", function (event) {
    event.preventDefault();
    if (!isProcessing) dropzone.classList.add("is-dragover");
  });

  dropzone.addEventListener("dragleave", function () {
    dropzone.classList.remove("is-dragover");
  });

  dropzone.addEventListener("drop", function (event) {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
    if (isProcessing) return;
    var files = event.dataTransfer && event.dataTransfer.files;
    if (files && files[0]) acceptFile(files[0]);
  });

  input.addEventListener("change", function () {
    acceptFile(input.files && input.files[0]);
  });

  removeFileButton.addEventListener("click", resetSelection);
  resetButton.addEventListener("click", resetSelection);
  convertButton.addEventListener("click", convertFile);
  downloadButton.addEventListener("click", triggerDownload);

  if (apiBase) {
    serviceBadge.textContent = "服务已配置";
    serviceBadge.classList.add("is-ready");
    setStatus("idle", "等待上传文件", "选择表格后即可转换。");
  } else {
    serviceBadge.textContent = "服务未配置";
    serviceBadge.classList.add("is-error");
    setStatus("error", "转换服务未配置", "请联系管理员配置后端服务地址。");
  }
})();
