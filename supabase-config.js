/**
 * Supabase 前端配置（仅使用 anon key）
 *
 * 使用前只需要替换下方两个值：
 * 1) SUPABASE_URL
 * 2) SUPABASE_ANON_KEY
 *
 * 安全提醒：
 * - 不要在前端放 service role key
 * - 需在 Supabase 后台启用 Email Provider
 * - 需配置 Site URL / Redirect URLs（用于邮箱确认跳转）
 */
(function (global) {
  global.SupabaseConfig = {
    SUPABASE_URL: "https://bypekqxsnuvqbgvdosdl.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_TFfmF3_7t8ceSwP1B0iKxA_sfcb5kca",
  };
})(typeof window !== "undefined" ? window : this);
