(function () {
  "use strict";

  var STORAGE_THEME = "hn-tools-theme";
  var STORAGE_FAVORITES = "hn-tools-favorites";
  var STORAGE_RECENT = "hn-tools-recent";
  var MAX_RECENT = 4;

  var root = document.documentElement;
  var searchInput = document.getElementById("global-search");
  var toolCards = Array.prototype.slice.call(document.querySelectorAll(".tool-card"));
  var categoryButtons = Array.prototype.slice.call(document.querySelectorAll(".category-tab"));
  var emptyState = document.getElementById("tool-empty");
  var recentSection = document.getElementById("recent");
  var recentTools = document.getElementById("recent-tools");
  var clearRecent = document.getElementById("clear-recent");
  var themeToggle = document.getElementById("theme-toggle");
  var sidebar = document.getElementById("site-sidebar");
  var sidebarOpen = document.getElementById("sidebar-open");
  var sidebarClose = document.getElementById("sidebar-close");
  var sidebarBackdrop = document.getElementById("sidebar-backdrop");
  var activeCategory = "all";

  function safeRead(key, fallback) {
    try {
      var parsed = JSON.parse(localStorage.getItem(key));
      return parsed == null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Local storage may be disabled; the site remains usable.
    }
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function getFavorites() {
    var value = safeRead(STORAGE_FAVORITES, []);
    return Array.isArray(value) ? value : [];
  }

  function updateFavoriteButtons() {
    var favorites = getFavorites();
    document.querySelectorAll("[data-favorite]").forEach(function (button) {
      var id = button.getAttribute("data-favorite");
      var selected = favorites.indexOf(id) >= 0;
      button.classList.toggle("is-favorite", selected);
      button.textContent = selected ? "★" : "☆";
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.setAttribute("title", selected ? "取消收藏" : "收藏工具");
    });
  }

  function setActiveCategory(category) {
    activeCategory = category || "all";
    categoryButtons.forEach(function (button) {
      var selected = button.getAttribute("data-category") === activeCategory;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    applyFilters();
  }

  function applyFilters() {
    var query = normalize(searchInput ? searchInput.value : "");
    var favorites = getFavorites();
    var visible = 0;

    toolCards.forEach(function (card) {
      var category = card.getAttribute("data-category") || "";
      var id = card.getAttribute("data-tool-id") || "";
      var text = normalize(card.textContent + " " + (card.getAttribute("data-keywords") || ""));
      var categoryMatch = activeCategory === "all" || category === activeCategory || (activeCategory === "favorites" && favorites.indexOf(id) >= 0);
      var queryMatch = !query || text.indexOf(query) >= 0;
      var show = categoryMatch && queryMatch;
      card.classList.toggle("is-hidden", !show);
      if (show) visible += 1;
    });

    if (emptyState) emptyState.hidden = visible !== 0;
  }

  function addRecent(id) {
    if (!id) return;
    var recent = safeRead(STORAGE_RECENT, []);
    if (!Array.isArray(recent)) recent = [];
    recent = recent.filter(function (item) { return item !== id; });
    recent.unshift(id);
    safeWrite(STORAGE_RECENT, recent.slice(0, MAX_RECENT));
    renderRecent();
  }

  function cloneIcon(card) {
    var icon = card.querySelector(".tool-icon");
    return icon ? icon.cloneNode(true) : document.createElement("span");
  }

  function renderRecent() {
    if (!recentSection || !recentTools) return;
    var recent = safeRead(STORAGE_RECENT, []);
    if (!Array.isArray(recent)) recent = [];
    var available = recent.map(function (id) {
      return toolCards.find(function (card) { return card.getAttribute("data-tool-id") === id; });
    }).filter(Boolean);

    recentTools.textContent = "";
    if (!available.length) {
      recentSection.hidden = true;
      return;
    }

    available.forEach(function (card) {
      var sourceLink = card.querySelector(".tool-card-link");
      var title = card.querySelector("h3");
      var category = card.getAttribute("data-category") || "工具";
      var link = document.createElement("a");
      link.className = "recent-item";
      link.href = sourceLink ? sourceLink.getAttribute("href") : "#";
      link.appendChild(cloneIcon(card));
      var copy = document.createElement("div");
      var strong = document.createElement("strong");
      strong.textContent = title ? title.textContent : "工具";
      var small = document.createElement("small");
      small.textContent = category === "policy" ? "政策与发布" : category === "pdf" ? "PDF 与文件" : "图片与素材";
      copy.appendChild(strong);
      copy.appendChild(small);
      link.appendChild(copy);
      link.addEventListener("click", function () { addRecent(card.getAttribute("data-tool-id")); });
      recentTools.appendChild(link);
    });
    recentSection.hidden = false;
  }

  function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.add("is-open");
    if (sidebarBackdrop) sidebarBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove("is-open");
    if (sidebarBackdrop) sidebarBackdrop.hidden = true;
    document.body.style.overflow = "";
  }

  function setTheme(theme) {
    var next = theme === "light" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    safeWrite(STORAGE_THEME, next);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "light" ? "#edf3fb" : "#08111f");
    if (themeToggle) themeToggle.setAttribute("title", next === "light" ? "切换深色主题" : "切换浅色主题");
  }

  function initTheme() {
    var saved = safeRead(STORAGE_THEME, "");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
      return;
    }
    var prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    setTheme(prefersLight ? "light" : "dark");
  }

  categoryButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      setActiveCategory(button.getAttribute("data-category"));
    });
  });

  document.querySelectorAll("[data-category-link]").forEach(function (link) {
    link.addEventListener("click", function () {
      setActiveCategory(link.getAttribute("data-category-link"));
      closeSidebar();
    });
  });

  document.querySelectorAll("[data-favorite]").forEach(function (button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var id = button.getAttribute("data-favorite");
      var favorites = getFavorites();
      var index = favorites.indexOf(id);
      if (index >= 0) favorites.splice(index, 1);
      else favorites.unshift(id);
      safeWrite(STORAGE_FAVORITES, favorites);
      updateFavoriteButtons();
      applyFilters();
    });
  });

  toolCards.forEach(function (card) {
    var link = card.querySelector(".tool-card-link");
    if (link) link.addEventListener("click", function () { addRecent(card.getAttribute("data-tool-id")); });
  });

  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        searchInput.value = "";
        applyFilters();
        searchInput.blur();
      }
    });
  }

  document.addEventListener("keydown", function (event) {
    var target = event.target;
    var typing = target && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (searchInput) searchInput.focus();
    } else if (!typing && event.key === "/") {
      event.preventDefault();
      if (searchInput) searchInput.focus();
    }
  });

  if (clearRecent) {
    clearRecent.addEventListener("click", function () {
      safeWrite(STORAGE_RECENT, []);
      renderRecent();
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      setTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light");
    });
  }

  if (sidebarOpen) sidebarOpen.addEventListener("click", openSidebar);
  if (sidebarClose) sidebarClose.addEventListener("click", closeSidebar);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener("click", closeSidebar);
  document.querySelectorAll(".sidebar-link").forEach(function (link) {
    link.addEventListener("click", function () {
      document.querySelectorAll(".sidebar-link").forEach(function (item) { item.classList.remove("is-active"); });
      link.classList.add("is-active");
      if (window.innerWidth <= 820) closeSidebar();
    });
  });

  var year = document.getElementById("home-year");
  if (year) year.textContent = String(new Date().getFullYear());

  initTheme();
  updateFavoriteButtons();
  renderRecent();
  applyFilters();
})();
