-- policy_links: 真短链最小表结构
create table if not exists public.policy_links (
  id bigint generated always as identity primary key,
  short_code varchar(8) not null unique,
  company text not null,
  game text not null,
  email text not null,
  date date not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_policy_links_short_code on public.policy_links(short_code);
create index if not exists idx_policy_links_created_at on public.policy_links(created_at desc);

alter table public.policy_links enable row level security;

-- 最小安全方案：不开放前端直接读写，统一走 Edge Function（service role）
drop policy if exists "policy_links_public_read" on public.policy_links;
drop policy if exists "policy_links_public_insert" on public.policy_links;
drop policy if exists "policy_links_auth_read_own" on public.policy_links;
