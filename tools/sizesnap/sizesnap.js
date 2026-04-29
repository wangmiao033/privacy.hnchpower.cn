(function () {
  "use strict";

  var ICON_EXPORTS = [
    { filename: "128x128.gif", w: 128, h: 128, format: "gif" },
    { filename: "128x128.png", w: 128, h: 128, format: "png" },
    { filename: "128x128_blank.gif", w: 128, h: 128, format: "gif" },
    { filename: "128x128_blank.png", w: 128, h: 128, format: "png" },
    { filename: "512x512.gif", w: 512, h: 512, format: "gif" },
    { filename: "512x512.png", w: 512, h: 512, format: "png" },
    { filename: "512x512_blank.gif", w: 512, h: 512, format: "gif" },
    { filename: "512x512_blank.png", w: 512, h: 512, format: "png" },
    { filename: "691x350.jpg", w: 691, h: 350, format: "jpeg" },
    { filename: "984x984.jpg", w: 984, h: 984, format: "jpeg" },
    { filename: "1280x720.jpg", w: 1280, h: 720, format: "jpeg" },
    { filename: "1920x500.jpg", w: 1920, h: 500, format: "jpeg" },
    { filename: "1920x1080.jpg", w: 1920, h: 1080, format: "jpeg" },
  ];
  var COMMON_ICON_FILES = {
    "128x128.gif": true,
    "128x128.png": true,
    "128x128_blank.gif": true,
    "128x128_blank.png": true,
    "512x512.gif": true,
    "512x512.png": true,
    "512x512_blank.gif": true,
    "512x512_blank.png": true,
    "984x984.jpg": true,
  };
  var COMMON_WIDE_FILES = {
    "691x350.jpg": true,
    "1280x720.jpg": true,
    "1920x500.jpg": true,
    "1920x1080.jpg": true,
  };

  var state = {
    resizeFiles: [],
    iconFile: null,
    selectedIconFiles: {},
  };

  var tabResize = document.getElementById("tab-resize");
  var tabIcon = document.getElementById("tab-icon");
  var panelResize = document.getElementById("panel-resize");
  var panelIcon = document.getElementById("panel-icon");

  var resizeUploadBox = document.getElementById("resizeUploadBox");
  var resizeFileInput = document.getElementById("resizeFileInput");
  var resizePreviewList = document.getElementById("resizePreviewList");
  var resizeClearBtn = document.getElementById("resizeClearBtn");
  var resizeSizeInput = document.getElementById("resizeSizeInput");
  var resizeMode = document.getElementById("resizeMode");
  var resizeFormat = document.getElementById("resizeFormat");
  var resizeGenerateBtn = document.getElementById("resizeGenerateBtn");
  var resizeStatus = document.getElementById("resizeStatus");
  var resizeProgressBar = document.getElementById("resizeProgressBar");

  var iconUploadBox = document.getElementById("iconUploadBox");
  var iconFileInput = document.getElementById("iconFileInput");
  var iconPreviewBox = document.getElementById("iconPreviewBox");
  var iconClearBtn = document.getElementById("iconClearBtn");
  var iconGenerateBtn = document.getElementById("iconGenerateBtn");
  var iconStatus = document.getElementById("iconStatus");
  var iconProgressBar = document.getElementById("iconProgressBar");
  var iconExportList = document.getElementById("iconExportList");
  var iconExportTitle = document.getElementById("iconExportTitle");
  var iconSelectAllBtn = document.getElementById("iconSelectAllBtn");
  var iconSelectNoneBtn = document.getElementById("iconSelectNoneBtn");
  var iconSelectCommonIconBtn = document.getElementById("iconSelectCommonIconBtn");
  var iconSelectCommonWideBtn = document.getElementById("iconSelectCommonWideBtn");

  function setProgress(el, v) {
    el.style.width = Math.max(0, Math.min(100, v)) + "%";
  }

  function parseSizes(text) {
    return text
      .split(/\n|,|，|;/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean)
      .map(function (s) {
        var m = s.match(/^(\d+)\s*[xX*×]\s*(\d+)$/);
        if (!m) return null;
        return { w: Number(m[1]), h: Number(m[2]), name: Number(m[1]) + "x" + Number(m[2]) };
      })
      .filter(Boolean);
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("无法读取图片：" + file.name));
      };
      img.src = url;
    });
  }

  function drawImageToCanvas(img, targetW, targetH, mode) {
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器不支持 Canvas。");
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (mode === "contain") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      var scaleContain = Math.min(targetW / img.naturalWidth, targetH / img.naturalHeight);
      var dwContain = img.naturalWidth * scaleContain;
      var dhContain = img.naturalHeight * scaleContain;
      var dxContain = (targetW - dwContain) / 2;
      var dyContain = (targetH - dhContain) / 2;
      ctx.drawImage(img, dxContain, dyContain, dwContain, dhContain);
      return canvas;
    }

    if (mode === "stretch") {
      ctx.drawImage(img, 0, 0, targetW, targetH);
      return canvas;
    }

    var scaleCover = Math.max(targetW / img.naturalWidth, targetH / img.naturalHeight);
    var sw = targetW / scaleCover;
    var sh = targetH / scaleCover;
    var sx = (img.naturalWidth - sw) / 2;
    var sy = (img.naturalHeight - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
    return canvas;
  }

  function canvasToBlob(canvas, format) {
    if (format === "gif") return canvasToGifBlob(canvas);
    return new Promise(function (resolve, reject) {
      var mime = format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
      var quality = format === "png" ? undefined : 0.95;
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error("图片导出失败。"));
          return;
        }
        resolve(blob);
      }, mime, quality);
    });
  }

  function canvasToGifBlob(canvas) {
    try {
      if (!window.gifenc || typeof window.gifenc.GIFEncoder !== "function") {
        throw new Error("gifenc 未正确加载。");
      }

      var ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("当前浏览器不支持 Canvas。");

      var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var rgba = new Uint8Array(imageData.data);
      var palette = window.gifenc.quantize(rgba, 256);
      var indexed = window.gifenc.applyPalette(rgba, palette);
      var gif = window.gifenc.GIFEncoder();
      gif.writeFrame(indexed, canvas.width, canvas.height, { palette: palette, repeat: -1 });
      gif.finish();
      var bytes = gif.bytes();
      return Promise.resolve(new Blob([bytes], { type: "image/gif" }));
    } catch (err) {
      return Promise.reject(new Error("GIF 编码失败（gifenc）。请检查图片尺寸或重试。"));
    }
  }

  function downloadBlob(blob, filename) {
    var link = document.createElement("a");
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function renderResizePreview() {
    resizePreviewList.innerHTML = "";
    if (!state.resizeFiles.length) {
      resizeStatus.textContent = "等待上传图片。";
      return;
    }
    state.resizeFiles.forEach(function (file, i) {
      var url = URL.createObjectURL(file);
      var item = document.createElement("article");
      item.className = "sizesnap-preview-item";
      item.innerHTML = '<img alt=""><p></p>';
      item.querySelector("img").src = url;
      item.querySelector("p").textContent = i + 1 + ". " + file.name;
      resizePreviewList.appendChild(item);
    });
    resizeStatus.textContent = "已选择 " + state.resizeFiles.length + " 张图片。";
  }

  function addResizeFiles(fileList) {
    var imageFiles = Array.from(fileList || []).filter(function (f) {
      return f.type.indexOf("image/") === 0;
    });
    if (!imageFiles.length) {
      resizeStatus.textContent = "未检测到可处理的图片文件。";
      return;
    }
    state.resizeFiles = state.resizeFiles.concat(imageFiles);
    setProgress(resizeProgressBar, 0);
    renderResizePreview();
  }

  function renderIconPreview() {
    iconPreviewBox.innerHTML = "";
    if (!state.iconFile) {
      iconStatus.textContent = "等待上传 icon。";
      return;
    }
    var card = document.createElement("article");
    card.className = "sizesnap-icon-preview-item";
    card.innerHTML = '<img alt=""><p></p>';
    card.querySelector("img").src = state.iconFile.url;
    card.querySelector("p").textContent = state.iconFile.file.name;
    iconPreviewBox.appendChild(card);
  }

  function setIconFileFromList(fileList) {
    var imageFiles = Array.from(fileList || []).filter(function (f) {
      return f.type.indexOf("image/") === 0;
    });
    if (!imageFiles.length) {
      iconStatus.textContent = "未检测到可处理的 icon 图片。";
      return;
    }
    if (state.iconFile) URL.revokeObjectURL(state.iconFile.url);
    state.iconFile = {
      file: imageFiles[0],
      url: URL.createObjectURL(imageFiles[0]),
    };
    setProgress(iconProgressBar, 0);
    iconStatus.textContent = imageFiles.length > 1 ? "Icon 模式仅使用第一张图片。" : "已选择 1 张 icon。";
    renderIconPreview();
  }

  function setTab(tab) {
    var isResize = tab === "resize";
    tabResize.classList.toggle("is-active", isResize);
    tabIcon.classList.toggle("is-active", !isResize);
    tabResize.setAttribute("aria-selected", String(isResize));
    tabIcon.setAttribute("aria-selected", String(!isResize));
    panelResize.classList.toggle("is-active", isResize);
    panelIcon.classList.toggle("is-active", !isResize);
  }

  async function generateResizeZip() {
    var sizes = parseSizes(resizeSizeInput.value);
    if (!state.resizeFiles.length) {
      resizeStatus.textContent = "请先上传图片。";
      return;
    }
    if (!sizes.length) {
      resizeStatus.textContent = "请填写正确尺寸，例如 720x1280。";
      return;
    }

    resizeGenerateBtn.disabled = true;
    setProgress(resizeProgressBar, 0);
    resizeStatus.textContent = "正在处理，请勿关闭页面……";

    try {
      var zip = new JSZip();
      var mode = resizeMode.value;
      var format = resizeFormat.value;
      var ext = format === "jpeg" ? "jpg" : format;
      var total = state.resizeFiles.length * sizes.length;
      var done = 0;
      var images = [];
      for (var i = 0; i < state.resizeFiles.length; i++) {
        images.push(await loadImage(state.resizeFiles[i]));
      }
      for (var s = 0; s < sizes.length; s++) {
        var size = sizes[s];
        var folder = zip.folder(size.name);
        if (!folder) throw new Error("创建 ZIP 目录失败");
        for (var j = 0; j < images.length; j++) {
          var canvas = drawImageToCanvas(images[j], size.w, size.h, mode);
          var blob = await canvasToBlob(canvas, format);
          folder.file(j + 1 + "." + ext, blob);
          done += 1;
          setProgress(resizeProgressBar, (done / total) * 100);
          resizeStatus.textContent = "处理中：" + done + "/" + total + "，当前尺寸 " + size.name;
        }
      }
      var zipBlob = await zip.generateAsync({ type: "blob" }, function (meta) {
        setProgress(resizeProgressBar, meta.percent);
      });
      downloadBlob(zipBlob, "resized_images_all_sizes.zip");
      setProgress(resizeProgressBar, 100);
      resizeStatus.textContent = "完成：已生成 resized_images_all_sizes.zip";
    } catch (err) {
      resizeStatus.textContent = err && err.message ? err.message : "处理失败：建议分批处理后重试。";
    } finally {
      resizeGenerateBtn.disabled = false;
    }
  }

  async function generateIconZip() {
    if (!state.iconFile) {
      iconStatus.textContent = "请先上传 icon。";
      return;
    }
    var selectedItems = ICON_EXPORTS.filter(function (item) {
      return Boolean(state.selectedIconFiles[item.filename]);
    });
    if (!selectedItems.length) {
      iconStatus.textContent = "请至少选择一个导出尺寸。";
      return;
    }
    iconGenerateBtn.disabled = true;
    setProgress(iconProgressBar, 0);
    iconStatus.textContent = "正在生成 Icon ZIP……";

    try {
      var zip = new JSZip();
      var image = await loadImage(state.iconFile.file);
      for (var i = 0; i < selectedItems.length; i++) {
        var item = selectedItems[i];
        iconStatus.textContent = "正在生成 " + item.filename;
        var canvas = drawImageToCanvas(image, item.w, item.h, "cover");
        var blob = await canvasToBlob(canvas, item.format);
        zip.file(item.filename, blob);
        setProgress(iconProgressBar, ((i + 1) / selectedItems.length) * 100);
      }
      var zipBlob = await zip.generateAsync({ type: "blob" }, function (meta) {
        setProgress(iconProgressBar, meta.percent);
      });
      downloadBlob(zipBlob, "icon_batch_output.zip");
      setProgress(iconProgressBar, 100);
      iconStatus.textContent = "已完成，共生成 " + selectedItems.length + " 个文件。";
    } catch (err) {
      iconStatus.textContent = err && err.message ? err.message : "处理失败：请稍后重试。";
    } finally {
      updateIconSelectionSummary();
    }
  }

  function bindDragUpload(boxEl, onFiles) {
    ["dragenter", "dragover"].forEach(function (evt) {
      boxEl.addEventListener(evt, function (e) {
        e.preventDefault();
        boxEl.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      boxEl.addEventListener(evt, function (e) {
        e.preventDefault();
        boxEl.classList.remove("dragover");
      });
    });
    boxEl.addEventListener("drop", function (e) {
      onFiles(e.dataTransfer.files);
    });
  }

  function countSelectedIconFiles() {
    var count = 0;
    for (var i = 0; i < ICON_EXPORTS.length; i++) {
      if (state.selectedIconFiles[ICON_EXPORTS[i].filename]) count += 1;
    }
    return count;
  }

  function updateIconSelectionSummary() {
    var selected = countSelectedIconFiles();
    iconExportTitle.textContent = "导出文件清单（已选 " + selected + " / " + ICON_EXPORTS.length + "）";
    iconGenerateBtn.disabled = selected === 0;
  }

  function applyIconSelectionMap(map) {
    for (var i = 0; i < ICON_EXPORTS.length; i++) {
      var filename = ICON_EXPORTS[i].filename;
      state.selectedIconFiles[filename] = Boolean(map[filename]);
    }
    renderIconExportList();
    updateIconSelectionSummary();
  }

  function selectAllIconFiles() {
    var map = {};
    for (var i = 0; i < ICON_EXPORTS.length; i++) {
      map[ICON_EXPORTS[i].filename] = true;
    }
    applyIconSelectionMap(map);
  }

  function clearAllIconFiles() {
    applyIconSelectionMap({});
  }

  function renderIconExportList() {
    iconExportList.innerHTML = "";
    ICON_EXPORTS.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "sizesnap-export-item";
      var checked = state.selectedIconFiles[item.filename] ? "checked" : "";
      row.innerHTML =
        '<label class="sizesnap-export-item-label">' +
        '<input type="checkbox" data-icon-file="' +
        item.filename +
        '" ' +
        checked +
        ">" +
        '<span class="sizesnap-export-item-name">' +
        item.filename +
        "</span>" +
        '<span class="sizesnap-export-item-size">' +
        item.w +
        "x" +
        item.h +
        "</span>" +
        "</label>";
      iconExportList.appendChild(row);
    });
    var checkboxes = iconExportList.querySelectorAll("input[type='checkbox'][data-icon-file]");
    checkboxes.forEach(function (checkbox) {
      checkbox.addEventListener("change", function () {
        var filename = checkbox.getAttribute("data-icon-file");
        state.selectedIconFiles[filename] = checkbox.checked;
        updateIconSelectionSummary();
      });
    });
  }

  tabResize.addEventListener("click", function () {
    setTab("resize");
  });
  tabIcon.addEventListener("click", function () {
    setTab("icon");
  });

  resizeFileInput.addEventListener("change", function (e) {
    addResizeFiles(e.target.files);
    e.target.value = "";
  });
  bindDragUpload(resizeUploadBox, addResizeFiles);

  resizeClearBtn.addEventListener("click", function () {
    state.resizeFiles = [];
    resizePreviewList.innerHTML = "";
    resizeFileInput.value = "";
    setProgress(resizeProgressBar, 0);
    resizeStatus.textContent = "已清空。";
  });
  resizeGenerateBtn.addEventListener("click", generateResizeZip);

  iconFileInput.addEventListener("change", function (e) {
    setIconFileFromList(e.target.files);
    e.target.value = "";
  });
  bindDragUpload(iconUploadBox, setIconFileFromList);

  iconClearBtn.addEventListener("click", function () {
    if (state.iconFile) URL.revokeObjectURL(state.iconFile.url);
    state.iconFile = null;
    iconPreviewBox.innerHTML = "";
    iconFileInput.value = "";
    setProgress(iconProgressBar, 0);
    iconStatus.textContent = "已清空。";
  });
  iconGenerateBtn.addEventListener("click", generateIconZip);
  iconSelectAllBtn.addEventListener("click", selectAllIconFiles);
  iconSelectNoneBtn.addEventListener("click", clearAllIconFiles);
  iconSelectCommonIconBtn.addEventListener("click", function () {
    applyIconSelectionMap(COMMON_ICON_FILES);
  });
  iconSelectCommonWideBtn.addEventListener("click", function () {
    applyIconSelectionMap(COMMON_WIDE_FILES);
  });

  selectAllIconFiles();
})();
