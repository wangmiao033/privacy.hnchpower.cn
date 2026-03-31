/**
 * 隐私政策「发布成功」后写入 Supabase policy_publish_logs（方案 A：直连）。
 * 与后台仓库 examples/policy-publish-log.frontend.ts 中 logPolicyPublishDirect 对齐。
 * 依赖：全局 window.AppSupabaseClient（由 auth.js 初始化）、RLS user_id = auth.uid()。
 */
(function () {
  /**
   * @param {{ company_name?: string, app_name?: string, publish_url: string, publish_time?: string }} payload
   */
  window.logPolicyPublishDirect = async function (payload) {
    console.log("[policy_publish_logs][debug] 进入 logPolicyPublishDirect", payload);
    var client = window.AppSupabaseClient;
    if (!client || !client.auth || !client.from) {
      console.error("[policy_publish_logs] AppSupabaseClient 不可用");
      return;
    }
    if (!payload || !payload.publish_url) {
      console.error("[policy_publish_logs] publish_url 缺失");
      return;
    }
    try {
      var res = await client.auth.getUser();
      var user = res && res.data && res.data.user;
      console.log("[policy_publish_logs][debug] getUser 结果 user.id / email:", user && user.id, user && user.email);
      if (!user || !user.id) {
        console.error("[policy_publish_logs] 未获取到登录用户");
        return;
      }
      var row = {
        user_id: user.id,
        email: user.email || null,
        company_name: payload.company_name != null ? payload.company_name : null,
        app_name: payload.app_name != null ? payload.app_name : null,
        publish_url: payload.publish_url,
        publish_time: payload.publish_time || new Date().toISOString(),
      };
      console.log("[policy_publish_logs][debug] insert payload:", row);
      var ins = await client.from("policy_publish_logs").insert(row);
      console.log("[policy_publish_logs][debug] Supabase insert 返回 data:", ins.data, "error:", ins.error);
      if (ins.error) {
        console.error(
          "[policy_publish_logs] insert failed:",
          ins.error.message || String(ins.error)
        );
      }
    } catch (err) {
      console.error("[policy_publish_logs] insert exception:", err);
    }
  };
})();
