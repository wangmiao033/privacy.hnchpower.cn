/**
 * PDF 骑缝章工具 — 浏览器本地处理
 * 依赖：pdf-lib（PDFLib）、pdf.js（pdfjsLib）
 */

(function () {
  'use strict';

  var PDFJS_VER = '3.11.174';
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.worker.min.js';
  }

  /** 相对页面高度的基础比例，再乘 small/medium/large */
  var HEIGHT_BASE = {
    small: 0.15,
    medium: 0.2,
    large: 0.25
  };

  var DPI = 144;

  // —— DOM ——
  var el = {
    sealInput: document.getElementById('pdfseal-input-seal'),
    pdfInput: document.getElementById('pdfseal-input-pdf'),
    thumbWrap: document.getElementById('pdfseal-seal-thumb-wrap'),
    thumb: document.getElementById('pdfseal-seal-thumb'),
    fileInfo: document.getElementById('pdfseal-file-info'),
    error: document.getElementById('pdfseal-error'),
    warning: document.getElementById('pdfseal-warning'),
    marginSlider: document.getElementById('pdfseal-margin-slider'),
    marginNum: document.getElementById('pdfseal-margin'),
    outName: document.getElementById('pdfseal-out-name'),
    btnApply: document.getElementById('pdfseal-btn-apply'),
    btnReset: document.getElementById('pdfseal-btn-reset'),
    btnDownload: document.getElementById('pdfseal-btn-download'),
    previewCanvas: document.getElementById('pdfseal-preview-canvas'),
    loading: document.getElementById('pdfseal-loading')
  };

  var state = {
    sealFile: null,
    sealImage: null,
    sealObjectUrl: null,
    pdfFile: null,
    pdfBytes: null,
    pdfBaseName: '',
    pdfPageCount: 0,
    firstPageSizePt: { width: 0, height: 0 },
    generatedBlob: null,
    generatedName: ''
  };

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function showError(msg) {
    el.error.textContent = msg;
    el.error.hidden = false;
  }

  function clearError() {
    el.error.textContent = '';
    el.error.hidden = true;
  }

  function setWarning(text) {
    if (text) {
      el.warning.textContent = text;
      el.warning.hidden = false;
    } else {
      el.warning.hidden = true;
    }
  }

  function setLoading(on) {
    el.loading.hidden = !on;
    el.btnApply.disabled = on;
  }

  function getEdge() {
    var r = document.querySelector('input[name="pdfseal-edge"]:checked');
    return r ? r.value : 'right';
  }

  function getSizePreset() {
    var r = document.querySelector('input[name="pdfseal-size"]:checked');
    return r ? r.value : 'medium';
  }

  function getVPos() {
    var r = document.querySelector('input[name="pdfseal-vpos"]:checked');
    return r ? r.value : 'center';
  }

  function getMarginPt() {
    var v = parseFloat(el.marginNum.value, 10);
    if (isNaN(v) || v < 0) return 0;
    return Math.min(v, 144);
  }

  function defaultOutputName() {
    if (!state.pdfBaseName) return '';
    return state.pdfBaseName + '-骑缝章.pdf';
  }

  /**
   * 从文件读取 PDF 页数与首页尺寸（PDF 点）；加密或损坏则抛错
   */
  async function readPdfMeta(pdfBytes) {
    if (typeof PDFLib === 'undefined') throw new Error('pdf-lib 未加载，请检查网络或刷新重试。');
    var pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
    var pages = pdfDoc.getPages();
    var n = pages.length;
    if (n < 1) throw new Error('PDF 没有页面。');
    var first = pages[0];
    var size = first.getSize();
    return {
      pageCount: n,
      firstPageSizePt: { width: size.width, height: size.height }
    };
  }

  /**
   * 将印章图绘制到标准画布（高度按首页高度与 DPI 推算）
   * 单页时整宽一枚章；多页时按宽度切 N 片（在 sliceSealToPngBytesList 中切）
   */
  function buildSealMasterCanvas(img, pageCount, pageHeightPt, sizePreset) {
    var ratio = HEIGHT_BASE[sizePreset] || HEIGHT_BASE.medium;
    var sealHeightPt = pageHeightPt * ratio;
    var sealHeightPx = Math.max(32, Math.round((sealHeightPt / 72) * DPI));
    var sealFullWidthPx = Math.max(
      pageCount,
      Math.round(sealHeightPx * (img.naturalWidth / img.naturalHeight))
    );
    var canvas = document.createElement('canvas');
    canvas.width = sealFullWidthPx;
    canvas.height = sealHeightPx;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布上下文。');
    ctx.clearRect(0, 0, sealFullWidthPx, sealHeightPx);
    ctx.drawImage(img, 0, 0, sealFullWidthPx, sealHeightPx);
    return canvas;
  }

  function canvasToPngBytes(canvas) {
    var dataUrl = canvas.toDataURL('image/png');
    var base64 = dataUrl.split(',')[1];
    if (!base64) throw new Error('印章图导出 PNG 失败。');
    var binary = atob(base64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  /**
   * 按页数将印章画布切成 N 个竖条，输出每条的 PNG 字节
   * N===1 时一条即为整章
   */
  function sliceSealToPngBytesList(sourceCanvas, pageCount) {
    var w = sourceCanvas.width;
    var h = sourceCanvas.height;
    var n = Math.max(1, pageCount);
    var sliceW = w / n;
    var list = [];
    for (var i = 0; i < n; i++) {
      var cw = Math.max(1, Math.floor(sliceW));
      if (i === n - 1) cw = w - Math.floor(sliceW * (n - 1));
      var c = document.createElement('canvas');
      c.width = cw;
      c.height = h;
      var ctx = c.getContext('2d');
      var sx = Math.floor(i * sliceW);
      ctx.drawImage(sourceCanvas, sx, 0, cw, h, 0, 0, cw, h);
      list.push(canvasToPngBytes(c));
    }
    return list;
  }

  /**
   * 骑缝章在 PDF 中的垂直方向底边 y（pdf-lib：左下为原点）
   */
  function sealBottomYPt(pageHeightPt, sealHeightPt, vpos) {
    var base = (pageHeightPt - sealHeightPt) / 2;
    var offset = pageHeightPt * 0.12;
    if (vpos === 'top') return base + offset;
    if (vpos === 'bottom') return base - offset;
    return base;
  }

  /**
   * 将切片 PNG 嵌入每一页对应边缘
   */
  async function generateSealedPdf(pdfBytes, slicePngBytesList, options) {
    var PDFDocument = PDFLib.PDFDocument;
    var pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes);
    } catch (err) {
      var msg = (err && err.message) || String(err);
      if (/password|encrypt/i.test(msg)) {
        throw new Error('该 PDF 已加密或需要密码，无法在本地自动加盖骑缝章。');
      }
      throw new Error('无法读取 PDF（可能已加密、损坏或格式异常）：' + msg);
    }
    var pages = pdfDoc.getPages();
    var N = pages.length;
    if (slicePngBytesList.length !== N) {
      throw new Error('内部错误：切片数量与页数不一致。');
    }
    var imgAspect = options.imgAspectFull;
    var sizePreset = options.sizePreset || 'medium';
    var ratio = HEIGHT_BASE[sizePreset] || HEIGHT_BASE.medium;
    var edge = options.edge;
    var marginPt = options.marginPt;
    var vpos = options.vpos;

    var embedded = [];
    for (var i = 0; i < N; i++) {
      embedded.push(await pdfDoc.embedPng(slicePngBytesList[i]));
    }

    for (var j = 0; j < N; j++) {
      var page = pages[j];
      var sz = page.getSize();
      var pw = sz.width;
      var ph = sz.height;
      var sealH = ph * ratio;
      var fullW = sealH * imgAspect;
      var sliceW = fullW / N;
      var y = sealBottomYPt(ph, sealH, vpos);
      var x =
        edge === 'left'
          ? marginPt
          : pw - marginPt - sliceW;
      page.drawImage(embedded[j], {
        x: x,
        y: y,
        width: sliceW,
        height: sealH
      });
    }

    return pdfDoc.save();
  }

  /**
   * 仅渲染 PDF 第一页（无印章叠加）
   */
  async function renderPdfFirstPageOnly(pdfBytes, canvasEl) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js 未加载。');
    var maxW = Math.min(720, window.innerWidth - 48);
    var pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
    var pdfPage = await pdf.getPage(1);
    var baseVp = pdfPage.getViewport({ scale: 1 });
    var pwPt = baseVp.width;
    var scale = maxW / pwPt;
    var viewport = pdfPage.getViewport({ scale: scale });
    canvasEl.width = Math.floor(viewport.width);
    canvasEl.height = Math.floor(viewport.height);
    var ctx = canvasEl.getContext('2d');
    await pdfPage.render({
      canvasContext: ctx,
      viewport: viewport
    }).promise;
  }

  /**
   * 第一页预览：pdf.js 渲染 + Canvas 叠加第一片骑缝
   */
  async function renderFirstPagePreview(pdfBytes, masterSealCanvas, pageCount, options, canvasEl) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js 未加载。');
    var maxW = Math.min(720, window.innerWidth - 48);
    var loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    var pdf = await loadingTask.promise;
    var pdfPage = await pdf.getPage(1);
    var baseVp = pdfPage.getViewport({ scale: 1 });
    var pwPt = baseVp.width;
    var phPt = baseVp.height;
    var scale = maxW / pwPt;
    var viewport = pdfPage.getViewport({ scale: scale });
    canvasEl.width = Math.floor(viewport.width);
    canvasEl.height = Math.floor(viewport.height);
    var ctx = canvasEl.getContext('2d');
    await pdfPage.render({
      canvasContext: ctx,
      viewport: viewport
    }).promise;

    var pxPerPt = canvasEl.width / pwPt;
    var ratio = HEIGHT_BASE[options.sizePreset] || HEIGHT_BASE.medium;
    var sealH_px = phPt * ratio * pxPerPt;
    var fullW_px = sealH_px * options.imgAspectFull;
    var N = Math.max(1, pageCount);
    var sliceW_px = fullW_px / N;
    var margin_px = options.marginPt * pxPerPt;

    var sliceCanvas = document.createElement('canvas');
    var sw = Math.max(1, Math.floor(masterSealCanvas.width / N));
    sliceCanvas.width = sw;
    sliceCanvas.height = masterSealCanvas.height;
    var sctx = sliceCanvas.getContext('2d');
    sctx.drawImage(masterSealCanvas, 0, 0, sw, masterSealCanvas.height, 0, 0, sw, masterSealCanvas.height);

    var destX =
      options.edge === 'left'
        ? margin_px
        : canvasEl.width - margin_px - sliceW_px;
    var baseY = (canvasEl.height - sealH_px) / 2;
    var offset = canvasEl.height * 0.12;
    var destY = baseY;
    if (options.vpos === 'top') destY = baseY - offset;
    if (options.vpos === 'bottom') destY = baseY + offset;
    destY = Math.max(0, Math.min(destY, canvasEl.height - sealH_px));

    ctx.drawImage(sliceCanvas, 0, 0, sw, masterSealCanvas.height, destX, destY, sliceW_px, sealH_px);
  }

  function getLowResolutionWarning(img, pageCount) {
    var n = Math.max(1, pageCount);
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    var parts = [];
    if (w < 400) parts.push('印章图宽度较低，导出可能模糊，建议使用更高分辨率 PNG。');
    if (w < 64 * n) parts.push('当前页数为 ' + n + '，建议印章图宽度至少约 ' + 64 * n + ' 像素以保证每片清晰。');
    if (h < 64) parts.push('印章图高度过低。');
    return parts.length ? parts.join(' ') : '';
  }

  function updateFileInfo() {
    if (!state.pdfBytes) {
      el.fileInfo.innerHTML =
        '<p class="pdfseal-file-info-placeholder">请先上传 PDF 与印章图片</p>';
      return;
    }
    var name = state.pdfFile ? state.pdfFile.name : 'document.pdf';
    var html =
      '<p><strong>文件名</strong>：' +
      escapeHtml(name) +
      '</p>' +
      '<p><strong>页数</strong>：' +
      state.pdfPageCount +
      '</p>' +
      '<p><strong>大小</strong>：' +
      formatFileSize(state.pdfBytes.length) +
      '</p>';
    el.fileInfo.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        resolve({ image: image, objectUrl: url });
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('无法读取印章图片，请确认格式为 PNG/JPG。'));
      };
      image.src = url;
    });
  }

  async function refreshPreview() {
    if (!state.pdfBytes) {
      var c0 = el.previewCanvas.getContext('2d');
      c0.clearRect(0, 0, el.previewCanvas.width, el.previewCanvas.height);
      return;
    }
    clearError();
    try {
      if (!state.sealImage || !state.firstPageSizePt.height) {
        await renderPdfFirstPageOnly(state.pdfBytes, el.previewCanvas);
        return;
      }
      var master = buildSealMasterCanvas(
        state.sealImage,
        state.pdfPageCount,
        state.firstPageSizePt.height,
        getSizePreset()
      );
      await renderFirstPagePreview(
        state.pdfBytes,
        master,
        state.pdfPageCount,
        {
          edge: getEdge(),
          marginPt: getMarginPt(),
          vpos: getVPos(),
          sizePreset: getSizePreset(),
          imgAspectFull: state.sealImage.naturalWidth / state.sealImage.naturalHeight
        },
        el.previewCanvas
      );
    } catch (e) {
      showError('预览失败：' + ((e && e.message) || String(e)));
    }
  }

  async function onSealChange() {
    var file = el.sealInput.files && el.sealInput.files[0];
    clearError();
    setWarning('');
    if (state.sealObjectUrl) {
      URL.revokeObjectURL(state.sealObjectUrl);
      state.sealObjectUrl = null;
    }
    state.sealFile = null;
    state.sealImage = null;
    el.thumbWrap.hidden = true;
    if (!file) {
      await refreshPreview();
      return;
    }
    var ok = /\.(png|jpe?g)$/i.test(file.name) || /^image\/(png|jpeg)$/i.test(file.type);
    if (!ok) {
      showError('请上传 PNG 或 JPG 格式的印章图片。');
      return;
    }
    try {
      var r = await loadImageFromFile(file);
      state.sealFile = file;
      state.sealImage = r.image;
      state.sealObjectUrl = r.objectUrl;
      el.thumb.src = r.objectUrl;
      el.thumbWrap.hidden = false;
      if (state.pdfPageCount) {
        setWarning(getLowResolutionWarning(r.image, state.pdfPageCount));
      }
      await refreshPreview();
    } catch (e) {
      showError((e && e.message) || String(e));
    }
  }

  async function onPdfChange() {
    var file = el.pdfInput.files && el.pdfInput.files[0];
    clearError();
    state.pdfFile = null;
    state.pdfBytes = null;
    state.pdfPageCount = 0;
    state.firstPageSizePt = { width: 0, height: 0 };
    state.pdfBaseName = '';
    el.outName.value = '';
    if (!file) {
      updateFileInfo();
      await refreshPreview();
      return;
    }
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      showError('请上传 .pdf 文件。');
      updateFileInfo();
      return;
    }
    try {
      var buf = await file.arrayBuffer();
      var bytes = new Uint8Array(buf);
      var meta = await readPdfMeta(bytes);
      state.pdfFile = file;
      state.pdfBytes = bytes;
      state.pdfPageCount = meta.pageCount;
      state.firstPageSizePt = meta.firstPageSizePt;
      state.pdfBaseName = file.name.replace(/\.pdf$/i, '');
      if (!el.outName.value.trim()) el.outName.value = defaultOutputName();
      updateFileInfo();
      if (state.sealImage) {
        setWarning(getLowResolutionWarning(state.sealImage, state.pdfPageCount));
      }
      await refreshPreview();
    } catch (e) {
      var m = (e && e.message) || String(e);
      if (/encrypt|password|Encrypted/i.test(m)) {
        showError('该 PDF 已加密或需要密码，请解密后再试。');
      } else {
        showError('无法读取 PDF：' + m);
      }
      updateFileInfo();
    }
  }

  async function onApply() {
    clearError();
    if (!state.sealImage) {
      showError('请先上传印章图片。');
      return;
    }
    if (!state.pdfBytes) {
      showError('请先上传 PDF 文件。');
      return;
    }
    setLoading(true);
    state.generatedBlob = null;
    el.btnDownload.hidden = true;
    try {
      var master = buildSealMasterCanvas(
        state.sealImage,
        state.pdfPageCount,
        state.firstPageSizePt.height,
        getSizePreset()
      );
      var slices = sliceSealToPngBytesList(master, state.pdfPageCount);
      var out = await generateSealedPdf(state.pdfBytes, slices, {
        edge: getEdge(),
        marginPt: getMarginPt(),
        vpos: getVPos(),
        sizePreset: getSizePreset(),
        imgAspectFull: state.sealImage.naturalWidth / state.sealImage.naturalHeight
      });
      var name = el.outName.value.trim() || defaultOutputName();
      if (!/\.pdf$/i.test(name)) name += '.pdf';
      state.generatedBlob = new Blob([out], { type: 'application/pdf' });
      state.generatedName = name;
      el.btnDownload.hidden = false;
      await refreshPreview();
    } catch (e) {
      showError((e && e.message) || String(e));
    } finally {
      setLoading(false);
    }
  }

  function onDownload() {
    if (!state.generatedBlob) return;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(state.generatedBlob);
    a.download = state.generatedName || 'output.pdf';
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 2000);
  }

  function onReset() {
    clearError();
    setWarning('');
    el.sealInput.value = '';
    el.pdfInput.value = '';
    if (state.sealObjectUrl) URL.revokeObjectURL(state.sealObjectUrl);
    state.sealFile = null;
    state.sealImage = null;
    state.sealObjectUrl = null;
    state.pdfFile = null;
    state.pdfBytes = null;
    state.pdfPageCount = 0;
    state.firstPageSizePt = { width: 0, height: 0 };
    state.pdfBaseName = '';
    state.generatedBlob = null;
    state.generatedName = '';
    el.thumbWrap.hidden = true;
    el.outName.value = '';
    el.marginNum.value = '0';
    el.marginSlider.value = '0';
    el.btnDownload.hidden = true;
    updateFileInfo();
    var ctx = el.previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, el.previewCanvas.width, el.previewCanvas.height);
  }

  function syncMarginFromSlider() {
    el.marginNum.value = el.marginSlider.value;
  }

  function syncSliderFromMargin() {
    var v = parseFloat(el.marginNum.value, 10) || 0;
    v = Math.max(0, Math.min(72, v));
    el.marginSlider.value = String(Math.min(v, 72));
    if (v > 72) el.marginNum.value = String(v);
  }

  el.sealInput.addEventListener('change', onSealChange);
  el.pdfInput.addEventListener('change', onPdfChange);
  el.btnApply.addEventListener('click', onApply);
  el.btnReset.addEventListener('click', onReset);
  el.btnDownload.addEventListener('click', onDownload);

  el.marginSlider.addEventListener('input', function () {
    syncMarginFromSlider();
    refreshPreview();
  });
  el.marginNum.addEventListener('change', function () {
    syncSliderFromMargin();
    refreshPreview();
  });

  document.querySelectorAll('input[name="pdfseal-edge"]').forEach(function (r) {
    r.addEventListener('change', refreshPreview);
  });
  document.querySelectorAll('input[name="pdfseal-size"]').forEach(function (r) {
    r.addEventListener('change', refreshPreview);
  });
  document.querySelectorAll('input[name="pdfseal-vpos"]').forEach(function (r) {
    r.addEventListener('change', refreshPreview);
  });
})();
