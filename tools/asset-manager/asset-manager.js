const ASSET_MANAGER_CONFIG = {
  apiBaseUrl: "",
  tokenStorageKey: "asset_manager_token",
  apiBaseStorageKey: "asset_manager_api_base_url",
  maxFileSizeMB: 50,
};

const els = {
  modeBanner: document.getElementById("assetModeBanner"),
  apiBaseInput: document.getElementById("assetApiBaseInput"),
  tokenInput: document.getElementById("assetTokenInput"),
  saveConfigBtn: document.getElementById("assetSaveConfigBtn"),
  clearConfigBtn: document.getElementById("assetClearConfigBtn"),
  fileInput: document.getElementById("assetFileInput"),
  folderInput: document.getElementById("assetFolderInput"),
  folderBtn: document.getElementById("assetFolderBtn"),
  dropZone: document.getElementById("assetDropZone"),
  exportBtn: document.getElementById("assetExportBtn"),
  clearBtn: document.getElementById("assetClearBtn"),
  gameInput: document.getElementById("assetGameInput"),
  channelInput: document.getElementById("assetChannelInput"),
  uploadCategoryInput: document.getElementById("assetUploadCategoryInput"),
  tagsInput: document.getElementById("assetTagsInput"),
  noteInput: document.getElementById("assetNoteInput"),
  publicInput: document.getElementById("assetPublicInput"),
  cardGrid: document.getElementById("assetCardGrid"),
  tableCard: document.querySelector(".asset-table-card"),
  tableBody: document.getElementById("assetTableBody"),
  statusText: document.getElementById("assetStatusText"),
  visibleCount: document.getElementById("assetVisibleCount"),
  searchInput: document.getElementById("assetSearchInput"),
  gameFilter: document.getElementById("assetGameFilter"),
  categoryFilter: document.getElementById("assetCategoryFilter"),
  channelFilter: document.getElementById("assetChannelFilter"),
  typeFilter: document.getElementById("assetTypeFilter"),
  orientationFilter: document.getElementById("assetOrientationFilter"),
  formatFilter: document.getElementById("assetFormatFilter"),
  sizeFilter: document.getElementById("assetSizeFilter"),
  dateFilter: document.getElementById("assetDateFilter"),
  categoryList: document.getElementById("assetCategoryList"),
  cardViewBtn: document.getElementById("assetCardViewBtn"),
  tableViewBtn: document.getElementById("assetTableViewBtn"),
  statTotal: document.getElementById("assetStatTotal"),
  statImages: document.getElementById("assetStatImages"),
  statVideos: document.getElementById("assetStatVideos"),
  statArchives: document.getElementById("assetStatArchives"),
  statSize: document.getElementById("assetStatSize"),
  statLandscape: document.getElementById("assetStatLandscape"),
  statPortrait: document.getElementById("assetStatPortrait"),
  statSquare: document.getElementById("assetStatSquare"),
};

const SUPPORTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "psd", "zip", "rar", "7z", "mp4", "mov", "pdf"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z"]);
const KNOWN_SPECS = {
  "1080x450": ["Banner", ["biubiu", "首页banner"]],
  "672x378": ["Banner", ["九游", "首页信息流banner"]],
  "660x370": ["Banner", ["九游", "找游戏焦点banner"]],
  "1080x604": ["Banner", ["豌豆荚", "首页信息流banner"]],
  "1080x906": ["商店图", ["商店图"]],
  "1280x720": ["宣传图", ["横版宣传图"]],
  "720x1280": ["宣传图", ["竖版宣传图"]],
  "1080x1920": ["宣传图", ["竖版宣传图"]],
  "1080x2340": ["闪屏", ["闪屏"]],
  "751x1500": ["闪屏", ["loading图"]],
  "512x512": ["Icon", ["游戏icon"]],
  "1024x1024": ["Icon", ["游戏icon"]],
  "50x50": ["Icon", ["表情聊天页图标"]],
  "750x560": ["其他", ["表情崇拜引导图"]],
  "720x405": ["宣传图", ["素材广告图"]],
  "2952x960": ["Banner", ["时下热门资源位"]],
};

let assets = [];

init();

function init() {
  els.apiBaseInput.value = localStorage.getItem(ASSET_MANAGER_CONFIG.apiBaseStorageKey) || ASSET_MANAGER_CONFIG.apiBaseUrl;
  els.tokenInput.value = localStorage.getItem(ASSET_MANAGER_CONFIG.tokenStorageKey) || "";
  bindEvents();
  setView("table");
  updateModeBanner();
  loadRemoteAssets();
  render();
}

function bindEvents() {
  els.fileInput.addEventListener("change", () => handleFiles(els.fileInput.files));
  els.folderInput.addEventListener("change", () => handleFiles(els.folderInput.files));
  els.folderBtn.addEventListener("click", () => els.folderInput.click());
  els.clearBtn.addEventListener("click", clearAssets);
  els.exportBtn.addEventListener("click", exportCsv);
  els.saveConfigBtn.addEventListener("click", saveConfig);
  els.clearConfigBtn.addEventListener("click", clearConfig);
  els.cardViewBtn.addEventListener("click", () => setView("card"));
  els.tableViewBtn.addEventListener("click", () => setView("table"));

  [els.searchInput, els.gameFilter, els.categoryFilter, els.channelFilter, els.typeFilter, els.orientationFilter, els.formatFilter, els.sizeFilter, els.dateFilter].forEach((input) => {
    input.addEventListener("input", render);
  });

  els.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.dropZone.classList.add("is-dragover");
  });
  els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("is-dragover"));
  els.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("is-dragover");
    handleFiles(event.dataTransfer.files);
  });
}

async function handleFiles(fileList) {
  const allFiles = Array.from(fileList || []);
  const files = allFiles.filter(isSupportedFile);
  const oversized = files.filter((file) => file.size > ASSET_MANAGER_CONFIG.maxFileSizeMB * 1024 * 1024);
  if (oversized.length) {
    showStatus(`有 ${oversized.length} 个文件超过 ${ASSET_MANAGER_CONFIG.maxFileSizeMB}MB，已跳过。`, true);
  }
  const validFiles = files.filter((file) => file.size <= ASSET_MANAGER_CONFIG.maxFileSizeMB * 1024 * 1024);
  if (!validFiles.length) {
    showStatus("没有发现支持的素材文件。", true);
    return;
  }

  showStatus(`正在分析 ${validFiles.length} 个素材...`);
  const analyzed = await Promise.all(validFiles.map(analyzeFile));
  if (isRemoteMode()) {
    await uploadRemoteAssets(analyzed);
  } else {
    assets = mergeAssets(assets, analyzed);
  }
  updateFilters();
  render();
  els.fileInput.value = "";
  els.folderInput.value = "";
}

async function analyzeFile(file) {
  const extension = getExtension(file.name);
  const dimension = await readDimension(file, extension);
  const orientation = getOrientation(dimension.width, dimension.height);
  const detected = detectAsset(file, dimension, extension);
  const uploadMeta = getUploadMeta();
  const channel = uploadMeta.channelName || detected.channel;
  const category = uploadMeta.category || detected.category;
  const tags = unique([...detected.tags, ...uploadMeta.tags]);
  const publicUrl = "";
  const kind = getKind(file, extension);
  const path = file.webkitRelativePath || file.name;
  const previewUrl = IMAGE_EXTENSIONS.has(extension) && extension !== "svg" ? URL.createObjectURL(file) : "";

  return {
    id: `local_${path}_${file.size}_${file.lastModified}`,
    file,
    path,
    key: "",
    publicUrl,
    originalName: file.name,
    displayName: inferDisplayName(file.name, channel, category),
    gameName: uploadMeta.gameName,
    channelName: channel,
    category,
    tags,
    note: uploadMeta.note,
    isPublic: uploadMeta.isPublic,
    kind,
    extension,
    format: extension.toUpperCase(),
    mimeType: file.type || guessMimeType(extension),
    size: file.size,
    sizeLabel: formatBytes(file.size),
    uploadedAt: new Date(),
    uploadedLabel: formatDate(new Date()),
    modifiedAt: file.lastModified ? new Date(file.lastModified) : null,
    width: dimension.width,
    height: dimension.height,
    orientation,
    dimensionLabel: dimension.width && dimension.height ? `${dimension.width}x${dimension.height}` : "-",
    previewUrl,
  };
}

function getUploadMeta() {
  return {
    gameName: els.gameInput.value.trim(),
    channelName: els.channelInput.value.trim(),
    category: els.uploadCategoryInput.value,
    tags: parseTags(els.tagsInput.value),
    note: els.noteInput.value.trim(),
    isPublic: els.publicInput.checked,
  };
}

async function uploadRemoteAssets(items) {
  const uploaded = [];
  const failed = [];
  for (const item of items) {
    try {
      const form = new FormData();
      form.append("file", item.file);
      form.append("gameName", item.gameName);
      form.append("channelName", item.channelName);
      form.append("category", item.category);
      form.append("tags", item.tags.join(","));
      form.append("note", item.note);
      form.append("width", item.width || "");
      form.append("height", item.height || "");
      form.append("orientation", item.orientation);
      form.append("detectedType", item.category);
      form.append("isPublic", item.isPublic ? "true" : "false");
      const response = await fetch(`${getApiBaseUrl()}/api/assets/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const data = await readJson(response);
      uploaded.push(normalizeRemoteAsset(data.asset || data));
    } catch (error) {
      failed.push(`${item.originalName}: ${error.message}`);
    }
  }
  assets = mergeAssets(assets, uploaded);
  if (failed.length) {
    showStatus(`已上传 ${uploaded.length} 个素材，失败 ${failed.length} 个：${failed.slice(0, 3).join("；")}`, true);
  } else {
    showStatus(`已上传 ${uploaded.length} 个素材到 R2。`);
  }
}

async function loadRemoteAssets() {
  if (!isRemoteMode()) return;
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/assets?limit=200`, { headers: authHeaders(false) });
    const data = await readJson(response);
    assets = (data.items || []).map(normalizeRemoteAsset);
    updateFilters();
    render();
  } catch (error) {
    showStatus(`读取 R2 素材失败：${error.message}`, true);
  }
}

function normalizeRemoteAsset(item) {
  const extension = item.extension || getExtension(item.fileName || item.originalName || item.key || "");
  const width = Number(item.width) || null;
  const height = Number(item.height) || null;
  return {
    id: item.id,
    file: null,
    path: item.path || item.key || item.fileName || "",
    key: item.key || "",
    publicUrl: item.publicUrl || "",
    originalName: item.originalName || item.fileName || item.name || "素材",
    displayName: item.displayName || item.name || item.originalName || "素材",
    gameName: item.gameName || "",
    channelName: item.channelName || "未识别",
    category: item.category || "未分类",
    tags: Array.isArray(item.tags) ? item.tags : parseTags(item.tags || ""),
    note: item.note || "",
    isPublic: item.isPublic !== false,
    kind: item.kind || getKind({ type: item.mimeType }, extension),
    extension,
    format: extension.toUpperCase(),
    mimeType: item.mimeType || guessMimeType(extension),
    size: Number(item.size) || 0,
    sizeLabel: formatBytes(Number(item.size) || 0),
    uploadedAt: item.uploadedAt ? new Date(item.uploadedAt) : new Date(),
    uploadedLabel: item.uploadedAt ? formatDate(new Date(item.uploadedAt)) : "-",
    width,
    height,
    orientation: item.orientation || getOrientation(width, height),
    dimensionLabel: width && height ? `${width}x${height}` : "-",
    previewUrl: item.publicUrl || "",
  };
}

function isSupportedFile(file) {
  return SUPPORTED_EXTENSIONS.has(getExtension(file.name));
}

async function readDimension(file, extension) {
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension)) return readImageDimension(file);
  if (extension === "psd") return readPsdDimension(file);
  return { width: null, height: null };
}

function readImageDimension(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve({ width: null, height: null });
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

async function readPsdDimension(file) {
  try {
    const buffer = await file.slice(0, 26).arrayBuffer();
    const view = new DataView(buffer);
    const signature = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (signature !== "8BPS") return { width: null, height: null };
    return { height: view.getUint32(14, false), width: view.getUint32(18, false) };
  } catch {
    return { width: null, height: null };
  }
}

function detectAsset(file, dimension, extension) {
  const name = normalizeText(file.name);
  const tags = [];
  let category = "未分类";
  let channel = inferChannel(file);
  const specKey = dimension.width && dimension.height ? `${dimension.width}x${dimension.height}` : "";
  if (KNOWN_SPECS[specKey]) {
    category = KNOWN_SPECS[specKey][0];
    tags.push(...KNOWN_SPECS[specKey][1], specKey);
  }

  const nameRules = [
    ["Logo", "Logo", ["logo"]],
    ["Icon", "Icon", ["icon", "图标"]],
    ["Banner", "Banner", ["banner"]],
    ["闪屏", "闪屏", ["splash", "闪屏"]],
    ["闪屏", "loading图", ["loading"]],
  ];
  nameRules.forEach(([nextCategory, tag, keys]) => {
    if (keys.some((key) => name.includes(key))) {
      category = nextCategory;
      tags.push(tag);
    }
  });

  if (extension === "psd") category = "PSD源文件";
  if (ARCHIVE_EXTENSIONS.has(extension)) category = "压缩包";
  if (VIDEO_EXTENSIONS.has(extension)) category = "视频";
  if (extension === "pdf") category = "其他";

  if (category === "未分类") category = inferByRatio(dimension.width, dimension.height, extension);
  if (channel !== "未识别") tags.push(channel);
  return { category, channel, tags: unique(tags) };
}

function inferChannel(file) {
  const text = normalizeText(`${file.webkitRelativePath || ""} ${file.name}`);
  const rules = [
    ["九游", ["九游", "9you", "jiuyou"]],
    ["豌豆荚", ["豌豆荚", "wandoujia"]],
    ["TapTap", ["taptap", "tap"]],
    ["biubiu", ["biubiu"]],
    ["应用宝", ["yingyongbao", "应用宝"]],
    ["华为", ["huawei", "华为"]],
    ["OPPO", ["oppo"]],
    ["vivo", ["vivo"]],
    ["Apple", ["apple", "appstore", "ios"]],
    ["Google Play", ["googleplay", "google play", "gp"]],
  ];
  const match = rules.find(([, keys]) => keys.some((key) => text.includes(normalizeText(key))));
  return match ? match[0] : "未识别";
}

function inferByRatio(width, height, extension) {
  if (ARCHIVE_EXTENSIONS.has(extension)) return "压缩包";
  if (VIDEO_EXTENSIONS.has(extension)) return "视频";
  if (!width || !height) return "其他";
  if (width === height) return width <= 1200 ? "Icon" : "商店图";
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.08) return "宣传图";
  if (Math.abs(ratio - 9 / 16) < 0.08) return "宣传图";
  if (height > width * 2) return "闪屏";
  if (width > height * 2) return "Banner";
  return ratio > 1 ? "横版宣传图" : "竖版宣传图";
}

function getOrientation(width, height) {
  if (!width || !height) return "未知";
  if (width > height) return "横图";
  if (width < height) return "竖图";
  return "方图";
}

function inferDisplayName(filename, channel, category) {
  const base = filename.replace(/\.[^.]+$/, "");
  const cleaned = base
    .replace(/\b(image|img|icon|logo|qrcode|qr|banner)\b/gi, "")
    .replace(/\b(taptap|tap|biubiu|appstore|googleplay|huawei|oppo|vivo)\b/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || (channel !== "未识别" ? `${channel}${category}` : base);
}

function getKind(file, extension) {
  const map = {
    png: "PNG 图片", jpg: "JPEG 图片", jpeg: "JPEG 图片", webp: "WEBP 图片", gif: "GIF 图片",
    psd: "PSD 源文件", svg: "SVG 矢量图", pdf: "PDF 文档", zip: "ZIP 压缩包", rar: "RAR 压缩包",
    "7z": "7Z 压缩包", mp4: "MP4 视频", mov: "MOV 视频",
  };
  return map[extension] || file.type || "未知";
}

function render() {
  const filtered = getFilteredAssets();
  renderStats();
  renderCategories(filtered);
  renderCards(filtered);
  renderTable(filtered);
  updateFilters();
  els.exportBtn.disabled = assets.length === 0;
  els.statusText.textContent = assets.length ? `已分析 ${assets.length} 个素材，当前显示 ${filtered.length} 个。` : "等待上传素材。";
  els.visibleCount.textContent = `${filtered.length} 项`;
}

function getFilteredAssets() {
  const query = normalizeText(els.searchInput.value);
  const sizeQuery = normalizeText(els.sizeFilter.value);
  const selectedDate = els.dateFilter.value;
  return assets.filter((asset) => {
    const haystack = normalizeText(`${asset.originalName} ${asset.displayName} ${asset.gameName} ${asset.channelName} ${asset.category} ${asset.kind} ${asset.dimensionLabel} ${asset.tags.join(",")} ${asset.note}`);
    const dimensionHaystack = normalizeText(`${asset.dimensionLabel} ${asset.width || ""}x${asset.height || ""} ${asset.category} ${asset.tags.join(",")}`);
    const uploadedDate = asset.uploadedAt instanceof Date && !Number.isNaN(asset.uploadedAt.getTime()) ? asset.uploadedAt.toISOString().slice(0, 10) : "";
    return (!query || haystack.includes(query))
      && (els.gameFilter.value === "all" || asset.gameName === els.gameFilter.value)
      && (els.categoryFilter.value === "all" || asset.category === els.categoryFilter.value)
      && (els.channelFilter.value === "all" || asset.channelName === els.channelFilter.value)
      && (els.typeFilter.value === "all" || asset.kind === els.typeFilter.value)
      && (els.orientationFilter.value === "all" || asset.orientation === els.orientationFilter.value)
      && (els.formatFilter.value === "all" || asset.extension === els.formatFilter.value)
      && (!sizeQuery || dimensionHaystack.includes(sizeQuery))
      && (!selectedDate || uploadedDate === selectedDate);
  });
}

function renderStats() {
  els.statTotal.textContent = assets.length;
  els.statImages.textContent = assets.filter((asset) => asset.width && asset.height).length;
  els.statVideos.textContent = assets.filter((asset) => VIDEO_EXTENSIONS.has(asset.extension)).length;
  els.statArchives.textContent = assets.filter((asset) => ARCHIVE_EXTENSIONS.has(asset.extension)).length;
  els.statSize.textContent = formatBytes(assets.reduce((sum, asset) => sum + asset.size, 0));
  els.statLandscape.textContent = assets.filter((asset) => asset.orientation === "横图").length;
  els.statPortrait.textContent = assets.filter((asset) => asset.orientation === "竖图").length;
  els.statSquare.textContent = assets.filter((asset) => asset.orientation === "方图").length;
}

function renderCategories(list) {
  const entries = Object.entries(countBy(list, "category")).sort((a, b) => b[1] - a[1]);
  els.categoryList.innerHTML = entries.length ? entries.map(([name, count]) => `
    <div class="asset-category-item"><strong>${escapeHtml(name)}</strong><span>${count} 项</span></div>
  `).join("") : '<p class="asset-empty-small">上传后显示分类统计。</p>';
}

function renderCards(list) {
  els.cardGrid.innerHTML = list.length ? list.map((asset) => `
    <article class="asset-card-item">
      <div class="asset-card-preview">${renderPreviewContent(asset)}</div>
      <div class="asset-card-body">
        <h3 class="asset-card-title">${escapeHtml(asset.displayName)}</h3>
        <div class="asset-card-meta">
          <span class="asset-tag">${escapeHtml(asset.category)}</span>
          <span class="asset-tag">${escapeHtml(asset.dimensionLabel)}</span>
          <span class="asset-tag">${escapeHtml(asset.sizeLabel)}</span>
        </div>
        <p class="asset-card-note">${escapeHtml(asset.gameName || "未填写游戏")} · ${escapeHtml(asset.channelName)} · ${escapeHtml(asset.orientation)}</p>
        <div class="asset-card-tags">${asset.tags.map((tag) => `<span class="asset-tag">${escapeHtml(tag)}</span>`).join("")}</div>
        <p class="asset-card-note">${escapeHtml(asset.note || asset.originalName)}</p>
        <div class="asset-card-actions">${renderActions(asset)}</div>
      </div>
    </article>
  `).join("") : '<p class="asset-empty">上传素材后自动生成卡片。</p>';
}

function renderTable(list) {
  els.tableBody.innerHTML = list.length ? list.map((asset) => `
    <tr>
      <td><div class="asset-preview">${renderPreviewContent(asset)}</div></td>
      <td><div class="asset-name"><strong>${escapeHtml(asset.displayName)}</strong><span>${escapeHtml(asset.originalName)}</span></div></td>
      <td>${escapeHtml(asset.gameName || "-")}</td>
      <td><span class="asset-tag">${escapeHtml(asset.channelName)}</span></td>
      <td>${escapeHtml(asset.category)}</td>
      <td>${escapeHtml(asset.dimensionLabel)}</td>
      <td>${escapeHtml(asset.orientation)}</td>
      <td>${escapeHtml(asset.sizeLabel)}</td>
      <td>${escapeHtml(asset.kind)}</td>
      <td>${escapeHtml(asset.uploadedLabel)}</td>
      <td>${escapeHtml(asset.tags.join(", "))}</td>
      <td><div class="asset-row-actions">${renderActions(asset)}</div></td>
    </tr>
  `).join("") : '<tr><td colspan="12" class="asset-empty">没有匹配的素材。</td></tr>';
}

function renderPreviewContent(asset) {
  if (asset.previewUrl && IMAGE_EXTENSIONS.has(asset.extension) && asset.extension !== "svg") {
    return `<img src="${asset.previewUrl}" alt="">`;
  }
  return escapeHtml(asset.extension.toUpperCase());
}

function renderActions(asset) {
  const canOpen = asset.publicUrl || asset.previewUrl;
  return `
    ${canOpen ? `<a class="asset-link-btn" href="${escapeHtml(asset.publicUrl || asset.previewUrl)}" target="_blank" rel="noopener">预览</a>` : ""}
    <button class="asset-link-btn" type="button" onclick="copyAssetLink('${escapeAttr(asset.id)}')">复制链接</button>
    ${canOpen ? `<a class="asset-link-btn" href="${escapeHtml(asset.publicUrl || asset.previewUrl)}" download="${escapeHtml(asset.originalName)}">下载</a>` : ""}
    <button class="asset-link-btn" type="button" onclick="editAsset('${escapeAttr(asset.id)}')">编辑</button>
    <button class="asset-link-btn asset-danger" type="button" onclick="deleteAsset('${escapeAttr(asset.id)}')">删除</button>
  `;
}

function updateFilters() {
  updateFilter(els.gameFilter, assets.map((asset) => asset.gameName), "全部游戏");
  updateFilter(els.categoryFilter, assets.map((asset) => asset.category), "全部分类");
  updateFilter(els.channelFilter, assets.map((asset) => asset.channelName), "全部渠道");
  updateFilter(els.typeFilter, assets.map((asset) => asset.kind), "全部种类");
  updateFilter(els.formatFilter, assets.map((asset) => asset.extension), "全部格式");
}

function updateFilter(select, values, label) {
  const current = select.value;
  const unique = Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  select.innerHTML = `<option value="all">${label}</option>${unique.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  select.value = unique.includes(current) ? current : "all";
}

window.copyAssetLink = async function copyAssetLink(id) {
  const asset = assets.find((item) => item.id === id);
  if (!asset) return;
  const link = asset.publicUrl || asset.previewUrl || asset.originalName;
  await navigator.clipboard.writeText(link);
  showStatus("链接已复制。");
};

window.editAsset = async function editAsset(id) {
  const asset = assets.find((item) => item.id === id);
  if (!asset) return;
  const gameName = prompt("游戏名", asset.gameName || "") ?? asset.gameName;
  const channelName = prompt("渠道名", asset.channelName || "") ?? asset.channelName;
  const category = prompt("分类", asset.category || "") ?? asset.category;
  const tags = parseTags(prompt("标签，逗号分隔", asset.tags.join(", ")) ?? asset.tags.join(", "));
  const note = prompt("备注", asset.note || "") ?? asset.note;
  Object.assign(asset, { gameName, channelName, category, tags, note });
  if (isRemoteMode()) {
    await fetch(`${getApiBaseUrl()}/api/assets/${encodeURIComponent(asset.id)}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ gameName, channelName, category, tags, note }),
    }).then(readJson);
  }
  render();
};

window.deleteAsset = async function deleteAsset(id) {
  const asset = assets.find((item) => item.id === id);
  if (!asset || !confirm("确定删除这个素材吗？删除后无法恢复。")) return;
  if (isRemoteMode()) {
    await fetch(`${getApiBaseUrl()}/api/assets/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then(readJson);
  }
  if (asset.previewUrl && !asset.publicUrl) URL.revokeObjectURL(asset.previewUrl);
  assets = assets.filter((item) => item.id !== id);
  render();
};

function exportCsv() {
  const rows = getFilteredAssets();
  const headers = ["文件名", "公开链接", "游戏名", "渠道名", "分类", "宽度", "高度", "方向", "文件大小", "格式", "标签", "备注", "上传时间"];
  const csv = [headers, ...rows.map((asset) => [
    asset.originalName, asset.publicUrl, asset.gameName, asset.channelName, asset.category, asset.width || "", asset.height || "",
    asset.orientation, asset.sizeLabel, asset.format, asset.tags.join("|"), asset.note, asset.uploadedLabel,
  ])].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `asset_inventory_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function clearAssets() {
  assets.forEach((asset) => {
    if (asset.previewUrl && !asset.publicUrl) URL.revokeObjectURL(asset.previewUrl);
  });
  assets = [];
  render();
}

function saveConfig() {
  localStorage.setItem(ASSET_MANAGER_CONFIG.apiBaseStorageKey, els.apiBaseInput.value.trim().replace(/\/+$/, ""));
  localStorage.setItem(ASSET_MANAGER_CONFIG.tokenStorageKey, els.tokenInput.value.trim());
  updateModeBanner();
  loadRemoteAssets();
}

function clearConfig() {
  localStorage.removeItem(ASSET_MANAGER_CONFIG.apiBaseStorageKey);
  localStorage.removeItem(ASSET_MANAGER_CONFIG.tokenStorageKey);
  els.apiBaseInput.value = "";
  els.tokenInput.value = "";
  updateModeBanner();
}

function updateModeBanner() {
  if (isRemoteMode()) {
    els.modeBanner.className = "asset-mode-banner";
    els.modeBanner.textContent = "当前为 R2 云端模式，上传、编辑和删除将通过 Worker API 写入 Cloudflare R2。";
  } else {
    els.modeBanner.className = "asset-mode-banner is-local";
    els.modeBanner.textContent = "当前为本地演示模式，素材不会上传到云端，刷新页面后可能清空。请先配置 Cloudflare Worker API 地址启用 R2。";
  }
}

function setView(view) {
  els.tableCard.classList.toggle("is-table", view === "table");
  els.cardViewBtn.classList.toggle("is-active", view === "card");
  els.tableViewBtn.classList.toggle("is-active", view === "table");
}

function isRemoteMode() {
  return Boolean(getApiBaseUrl());
}

function getApiBaseUrl() {
  return (localStorage.getItem(ASSET_MANAGER_CONFIG.apiBaseStorageKey) || ASSET_MANAGER_CONFIG.apiBaseUrl || "").replace(/\/+$/, "");
}

function authHeaders(required = true) {
  const token = localStorage.getItem(ASSET_MANAGER_CONFIG.tokenStorageKey) || "";
  if (required && !token) throw new Error("请先填写素材管理 Token。");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || data.message || `HTTP ${response.status}`);
  return data;
}

function showStatus(message, isError = false) {
  els.statusText.textContent = message;
  els.statusText.style.color = isError ? "#b91c1c" : "";
}

function mergeAssets(current, incoming) {
  const map = new Map(current.map((asset) => [asset.id, asset]));
  incoming.forEach((asset) => map.set(asset.id, asset));
  return Array.from(map.values()).sort((a, b) => b.uploadedAt - a.uploadedAt);
}

function countBy(list, key) {
  return list.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
}

function unique(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function parseTags(value) {
  if (Array.isArray(value)) return value;
  return String(value || "").split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
}

function getExtension(filename) {
  const match = String(filename || "").toLowerCase().match(/\.([^.]+)$/);
  return match ? match[1] : "";
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** index;
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function guessMimeType(extension) {
  return {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
    svg: "image/svg+xml", pdf: "application/pdf", mp4: "video/mp4", mov: "video/quicktime",
  }[extension] || "application/octet-stream";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
