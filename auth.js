(function () {
  var cfg = window.SupabaseConfig || {};
  var supabaseLib = window.supabase;
  var hasAuthUi = false;
  var statusEl = document.getElementById("auth-status");
  var guestBox = document.getElementById("auth-guest");
  var userBox = document.getElementById("auth-user");
  var userEmailEl = document.getElementById("auth-user-email");
  var emailEl = document.getElementById("auth-email");
  var passwordEl = document.getElementById("auth-password");
  var btnSignUp = document.getElementById("btn-signup");
  var btnSignIn = document.getElementById("btn-signin");
  var btnSignOut = document.getElementById("btn-signout");

  hasAuthUi = !!(statusEl && guestBox && userBox);

  function initOnlyClient() {
    if (!supabaseLib || !supabaseLib.createClient) return null;
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || /YOUR_/.test(cfg.SUPABASE_URL) || /YOUR_/.test(cfg.SUPABASE_ANON_KEY)) return null;
    var client = supabaseLib.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    window.AppSupabaseClient = client;
    return client;
  }

  if (!hasAuthUi) {
    initOnlyClient();
    return;
  }

  function setStatus(message, type) {
    statusEl.textContent = message || "";
    statusEl.classList.remove("is-success", "is-error", "is-info");
    if (type) statusEl.classList.add(type);
  }

  function setLoading(loading) {
    if (btnSignUp) btnSignUp.disabled = loading;
    if (btnSignIn) btnSignIn.disabled = loading;
    if (btnSignOut) btnSignOut.disabled = loading;
  }

  function emailOk(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function readCredentials() {
    return {
      email: (emailEl && emailEl.value || "").trim(),
      password: (passwordEl && passwordEl.value || "").trim(),
    };
  }

  function showGuest() {
    guestBox.hidden = false;
    userBox.hidden = true;
  }

  function showUser(email) {
    guestBox.hidden = true;
    userBox.hidden = false;
    if (userEmailEl) userEmailEl.textContent = email || "";
    setStatus("当前登录：" + (email || ""), "is-success");
  }

  if (!supabaseLib || !supabaseLib.createClient) {
    setStatus("Supabase SDK 加载失败，请刷新页面重试。", "is-error");
    return;
  }
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || /YOUR_/.test(cfg.SUPABASE_URL) || /YOUR_/.test(cfg.SUPABASE_ANON_KEY)) {
    setStatus("请先在 supabase-config.js 中填写 SUPABASE_URL 和 SUPABASE_ANON_KEY。", "is-error");
    showGuest();
    return;
  }

  var supabase = initOnlyClient();
  if (!supabase) {
    setStatus("Supabase 客户端初始化失败，请检查配置。", "is-error");
    return;
  }
  window.AppSupabaseClient = supabase;

  async function refreshUser() {
    try {
      var result = await supabase.auth.getUser();
      var user = result && result.data && result.data.user;
      if (user && user.email) {
        showUser(user.email);
        setStatus("当前登录：" + user.email, "is-success");
      } else {
        showGuest();
      }
    } catch (e) {
      showGuest();
      setStatus("获取登录状态失败，请检查网络。", "is-error");
    }
  }

  async function handleSignUp() {
    var c = readCredentials();
    if (!c.email) return setStatus("请输入邮箱。", "is-error");
    if (!emailOk(c.email)) return setStatus("邮箱格式不正确。", "is-error");
    if (!c.password) return setStatus("请输入密码。", "is-error");
    setLoading(true);
    setStatus("正在注册...", "is-info");
    try {
      var res = await supabase.auth.signUp({
        email: c.email,
        password: c.password,
        options: {
          emailRedirectTo: "https://privacy.hnchpower.cn",
        },
      });
      if (res.error) {
        setStatus("注册失败：" + res.error.message, "is-error");
        return;
      }
      var user = res.data && res.data.user;
      var session = res.data && res.data.session;
      if (user && !session) {
        setStatus("注册成功，请前往邮箱完成验证后再登录", "is-info");
      } else {
        setStatus("注册成功，已自动登录。", "is-success");
      }
      await refreshUser();
    } catch (e) {
      setStatus("注册失败，可能是网络异常，请稍后重试。", "is-error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    var c = readCredentials();
    if (!c.email) return setStatus("请输入邮箱。", "is-error");
    if (!emailOk(c.email)) return setStatus("邮箱格式不正确。", "is-error");
    if (!c.password) return setStatus("请输入密码。", "is-error");
    setLoading(true);
    setStatus("正在登录...", "is-info");
    try {
      var res = await supabase.auth.signInWithPassword({
        email: c.email,
        password: c.password,
      });
      if (res.error) {
        var msg = res.error.message || "未知错误";
        if (/Email not confirmed/i.test(msg)) {
          setStatus("邮箱尚未验证，请先完成邮箱验证。", "is-error");
        } else {
          setStatus("登录失败：" + msg, "is-error");
        }
        return;
      }
      setStatus("登录成功。", "is-success");
      await refreshUser();
    } catch (e) {
      setStatus("登录失败，可能是网络异常，请稍后重试。", "is-error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    setLoading(true);
    setStatus("正在退出...", "is-info");
    try {
      var res = await supabase.auth.signOut();
      if (res.error) {
        setStatus("退出失败：" + res.error.message, "is-error");
        return;
      }
      showGuest();
      setStatus("已退出登录。", "is-success");
    } catch (e) {
      setStatus("退出失败，可能是网络异常，请稍后重试。", "is-error");
    } finally {
      setLoading(false);
    }
  }

  if (btnSignUp) btnSignUp.addEventListener("click", handleSignUp);
  if (btnSignIn) btnSignIn.addEventListener("click", handleSignIn);
  if (btnSignOut) btnSignOut.addEventListener("click", handleSignOut);

  supabase.auth.onAuthStateChange(function (_event, session) {
    var user = session && session.user;
    if (user && user.email) {
      showUser(user.email);
    } else {
      showGuest();
      setStatus("当前未登录，可登录后发布短链。", "is-info");
    }
  });

  refreshUser();
})();
