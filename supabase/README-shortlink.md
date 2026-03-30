# Supabase 真短链最小落地说明

## 1) 执行 SQL（建表 + RLS）

在 Supabase SQL Editor 执行：

- `supabase/sql/001_policy_links.sql`

这会创建 `public.policy_links`，并启用 RLS（默认不开放前端直接读写）。

## 2) 部署 Edge Functions

需要部署两个函数：

- `create-policy-link`
- `get-policy-link`

目录分别为：

- `supabase/functions/create-policy-link/index.ts`
- `supabase/functions/get-policy-link/index.ts`

示例命令（本地已安装 Supabase CLI）：

```bash
supabase functions deploy create-policy-link
supabase functions deploy get-policy-link
```

说明：

- 项目已提供 `supabase/config.toml`：
  - `create-policy-link`：`verify_jwt = true`（必须登录后可创建短链）
  - `get-policy-link`：`verify_jwt = false`（公开读取短链内容）
- 更新该配置后请重新部署函数。

## 3) 配置 Function Secrets

在 Supabase 项目里为函数配置以下环境变量：

- `APP_SUPABASE_URL`
- `APP_SUPABASE_ANON_KEY`
- `APP_SUPABASE_SECRET_KEY`

说明：

- 前端仍只用 `anon/publishable key`。
- `APP_SUPABASE_SECRET_KEY` 只在函数端使用，不能放到前端。

## 4) 前端已接入行为

- 生成页点击“一键发布”时调用 `create-policy-link` 保存数据并拿到 `short_code`
- 最终链接形态：`/agreement.html?id=xxxxxx`
- 正式页优先按 `id/code` 调用 `get-policy-link` 读取并展示
- 若 URL 没有 `id/code`，仍兼容旧参数逻辑（`c/g/e/d` 及 legacy 参数）
