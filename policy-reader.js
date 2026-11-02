/* Progressive enhancement only. Does not change, store, or submit legal content. */
(function () {
  "use strict";
  var SIZE_KEY = "hn-policy-reader-font-size";
  var MIN = 16;
  var MAX = 21;
  var size = 17;
  var headings = [];
  var observer = null;
  var ticking = false;

  function getArticle() {
    return document.getElementById("doc-article") ||
      document.getElementById("agreement-root");
  }
  function safeGetSize() {
    try {
      var parsed = Number(localStorage.getItem(SIZE_KEY));
      return parsed >= MIN && parsed <= MAX ? parsed : 17;
    } catch (_) { return 17; }
  }
  function setSize(next) {
    size = Math.max(MIN, Math.min(MAX, Math.round(next)));
    document.documentElement.style.setProperty("--reader-font-size", size + "px");
    var value = document.getElementById("reader-size-value");
    if (value) value.textContent = String(size);
    var less = document.getElementById("reader-size-minus");
    var more = document.getElementById("reader-size-plus");
    if (less) less.disabled = size === MIN;
    if (more) more.disabled = size === MAX;
    try { localStorage.setItem(SIZE_KEY, String(size)); } catch (_) {}
  }
  function buildToc() {
    var article = getArticle();
    if (!article || article.querySelector(".agreement-placeholder") ||
        article.querySelector(".agreement-error") ||
        article.querySelector(".doc-error")) return false;
    if (!article.textContent || article.textContent.trim().length < 60) return false;
    var found = Array.prototype.slice.call(article.querySelectorAll(
      "h2,h3,h4,.policy-doc-section-title,.policy-doc-subsection-title"
    )).filter(function (element) {
      return (element.textContent || "").trim().length >= 2;
    });
    if (found.length < 3) return true;
    var deduped = found.filter(function (element, index) {
      return found.indexOf(element) === index;
    }).slice(0, 36);
    headings = deduped;
    var listDesktop = document.getElementById("reader-toc-desktop");
    var listMobile = document.getElementById("reader-toc-mobile");
    if (!listDesktop || !listMobile) return true;
    listDesktop.textContent = "";
    listMobile.textContent = "";
    deduped.forEach(function (h, index) {
      var id = h.id || "reader-section-" + (index + 1);
      if (!h.id) h.id = id;
      var label = (h.textContent || "").trim().replace(/\s+/g, " ").slice(0, 52);
      [listDesktop, listMobile].forEach(function (list) {
        var a = document.createElement("a");
        a.href = "#" + encodeURIComponent(id);
        a.textContent = label;
        a.className = h.matches("h3,h4,.policy-doc-subsection-title") ? "sublevel" : "";
        list.appendChild(a);
      });
    });
    document.documentElement.dataset.hasToc = "true";
    var aside = document.getElementById("reader-toc-aside");
    var mobile = document.getElementById("reader-mobile-toc");
    if (aside) aside.hidden = false;
    if (mobile) mobile.hidden = false;
    return true;
  }
  function progress() {
    var scrollable = Math.max(1,
      document.documentElement.scrollHeight - window.innerHeight);
    var percent = Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100));
    var line = document.getElementById("reader-progress");
    if (line) line.style.width = percent + "%";
    var backtop = document.getElementById("reader-backtop");
    if (backtop) backtop.classList.toggle("is-visible", window.scrollY > 480);
    if (headings.length) {
      var activeIndex = 0;
      headings.forEach(function (element, index) {
        if (element.getBoundingClientRect().top <= 135) activeIndex = index;
      });
      var list = document.getElementById("reader-toc-desktop");
      if (list) {
        Array.prototype.slice.call(list.querySelectorAll("a")).forEach(function (a, index) {
          a.classList.toggle("is-active", index === activeIndex);
        });
      }
    }
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      progress();
      ticking = false;
    });
  }
  function init() {
    size = safeGetSize();
    setSize(size);
    document.getElementById("reader-size-minus")?.addEventListener("click", function () {
      setSize(size - 1);
    });
    document.getElementById("reader-size-plus")?.addEventListener("click", function () {
      setSize(size + 1);
    });
    document.getElementById("reader-print")?.addEventListener("click", function () {
      window.print();
    });
    document.getElementById("reader-backtop")?.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    progress();

    var article = getArticle();
    if (!article) return;
    if (buildToc()) { progress(); return; }
    observer = new MutationObserver(function () {
      if (buildToc()) {
        observer.disconnect();
        observer = null;
        progress();
      }
    });
    observer.observe(article, { childList: true, subtree: true, characterData: false });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();