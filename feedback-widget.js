/**
 * 仅首页：问题反馈悬浮入口（无全站注入）
 */
(function () {
  var root = document.querySelector(".home-feedback-root");
  if (!root) return;

  var fab = root.querySelector(".home-feedback-fab");
  var dialog = root.querySelector(".home-feedback-dialog");
  var backdrop = root.querySelector(".home-feedback-backdrop");
  var closeBtn = root.querySelector(".home-feedback-close");
  var copyBtn = root.querySelector(".home-feedback-copy");
  var email = "yszt@dxyx6888.com";

  function open() {
    dialog.hidden = false;
    if (backdrop) backdrop.hidden = false;
    fab.setAttribute("aria-expanded", "true");
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    dialog.hidden = true;
    if (backdrop) backdrop.hidden = true;
    fab.setAttribute("aria-expanded", "false");
    fab.focus();
  }

  function toggle() {
    if (dialog.hidden) open();
    else close();
  }

  function isOpen() {
    return !dialog.hidden;
  }

  fab.addEventListener("click", function (e) {
    e.stopPropagation();
    toggle();
  });

  if (backdrop) {
    backdrop.addEventListener("click", close);
  }
  if (closeBtn) {
    closeBtn.addEventListener("click", close);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen()) {
      e.preventDefault();
      close();
    }
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      function done() {
        var t = copyBtn.textContent;
        copyBtn.textContent = "已复制";
        copyBtn.disabled = true;
        window.setTimeout(function () {
          copyBtn.textContent = t;
          copyBtn.disabled = false;
        }, 2000);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(done).catch(function () {
          window.prompt("请手动复制邮箱", email);
        });
      } else {
        window.prompt("请手动复制邮箱", email);
      }
    });
  }
})();
