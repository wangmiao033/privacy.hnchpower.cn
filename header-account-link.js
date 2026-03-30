(function () {
  var link = document.getElementById("account-entry-link");
  if (!link) return;

  function shortEmail(email) {
    if (!email) return "";
    if (email.length <= 18) return email;
    return email.slice(0, 8) + "..." + email.slice(-7);
  }

  async function updateEntry() {
    var client = window.AppSupabaseClient;
    if (!client || !client.auth || !client.auth.getUser) {
      link.textContent = "登录 / 注册";
      return;
    }
    try {
      var result = await client.auth.getUser();
      var user = result && result.data && result.data.user;
      if (user && user.email) {
        link.textContent = shortEmail(user.email) + " · 个人中心";
      } else {
        link.textContent = "登录 / 注册";
      }
    } catch (_e) {
      link.textContent = "登录 / 注册";
    }
  }

  updateEntry();
})();
