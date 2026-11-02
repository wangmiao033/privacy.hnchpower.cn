-- HN Tools / Alipay billing. Apply only after backup and review; no existing policy rows are changed.
-- All money values are integer cents; do not accept price from browser.
create table if not exists public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  user_id uuid not null,
  plan text not null check (plan in ('single', 'lifetime')),
  amount_fen integer not null check (amount_fen in (100, 9900)),
  payment_provider text not null default 'alipay' check (payment_provider = 'alipay'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'closed')),
  alipay_trade_no text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint billing_order_amount_plan check
    ((plan = 'single' and amount_fen = 100) or (plan = 'lifetime' and amount_fen = 9900))
);
create index if not exists billing_orders_user_created_idx on public.billing_orders(user_id, created_at desc);

create table if not exists public.billing_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  publish_credits integer not null default 0 check (publish_credits >= 0),
  is_lifetime boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Idempotent publication key prevents charging twice if a network response is lost.
create table if not exists public.billing_publications (
  user_id uuid not null,
  request_id uuid not null,
  kind text not null check (kind in ('policy', 'document')),
  short_code text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
create index if not exists billing_publications_user_created_idx
  on public.billing_publications(user_id, created_at desc);

alter table public.billing_orders enable row level security;
alter table public.billing_entitlements enable row level security;
alter table public.billing_publications enable row level security;
-- Only Edge Functions with server credentials are allowed to read/write billing records.
revoke all on table public.billing_orders from anon, authenticated;
revoke all on table public.billing_entitlements from anon, authenticated;
revoke all on table public.billing_publications from anon, authenticated;

-- Called exclusively by a server-side, RSA2-verified Alipay notification.
create or replace function public.billing_mark_paid(
  p_order_no text, p_trade_no text, p_amount_fen integer
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order public.billing_orders%rowtype;
begin
  select * into v_order from public.billing_orders
    where order_no = p_order_no for update;
  if not found or v_order.amount_fen <> p_amount_fen
     or p_trade_no is null or length(p_trade_no) < 10 then
    return false;
  end if;
  if v_order.status = 'paid' then
    return v_order.alipay_trade_no = p_trade_no;
  end if;
  if v_order.status <> 'pending' then
    return false;
  end if;
  update public.billing_orders
    set status='paid', alipay_trade_no=p_trade_no, paid_at=now(), updated_at=now()
    where id=v_order.id;
  insert into public.billing_entitlements(user_id, publish_credits, is_lifetime)
    values(v_order.user_id,
      case when v_order.plan='single' then 1 else 0 end,
      v_order.plan='lifetime')
    on conflict (user_id) do update
      set publish_credits=public.billing_entitlements.publish_credits + excluded.publish_credits,
          is_lifetime=public.billing_entitlements.is_lifetime or excluded.is_lifetime,
          updated_at=now();
  return true;
end;
$$;

-- Only a trusted server may call this RPC, after verifying the Supabase user JWT.
-- Credit consumption + short-link insert happen in one database transaction.
create or replace function public.billing_publish_policy(
  p_user_id uuid,
  p_kind text,
  p_request_id uuid,
  p_short_code text,
  p_company text default null,
  p_game text default null,
  p_email text default null,
  p_date date default null,
  p_title text default null,
  p_content_html text default null,
  p_content_text text default null
) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_entitlement public.billing_entitlements%rowtype;
  v_previous public.billing_publications%rowtype;
begin
  if p_user_id is null or p_request_id is null or p_kind not in ('policy','document')
     or p_short_code !~ '^[A-Za-z0-9]{6,12}$' then
    raise exception 'INVALID_PUBLISH_REQUEST';
  end if;
  -- This row lock serializes all publish attempts by the same user.
  insert into public.billing_entitlements(user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  select * into v_entitlement from public.billing_entitlements
    where user_id=p_user_id for update;
  select * into v_previous from public.billing_publications
    where user_id=p_user_id and request_id=p_request_id;
  if found then
    if v_previous.kind <> p_kind then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return v_previous.short_code;
  end if;
  if not v_entitlement.is_lifetime then
    if v_entitlement.publish_credits < 1 then
      raise exception 'PAYMENT_REQUIRED';
    end if;
    update public.billing_entitlements
      set publish_credits=publish_credits-1, updated_at=now()
      where user_id=p_user_id;
  end if;
  if p_kind='policy' then
    if p_company is null or p_game is null or p_email is null or p_date is null then
      raise exception 'INVALID_PUBLISH_FIELDS';
    end if;
    insert into public.policy_links(short_code,company,game,email,date,created_by)
      values(p_short_code,p_company,p_game,p_email,p_date,p_user_id);
  else
    if p_title is null or p_content_html is null then
      raise exception 'INVALID_PUBLISH_FIELDS';
    end if;
    insert into public.document_policy_links(short_code,title,content_html,content_text,created_by)
      values(p_short_code,p_title,p_content_html,p_content_text,p_user_id);
  end if;
  insert into public.billing_publications(user_id, request_id, kind, short_code)
    values(p_user_id,p_request_id,p_kind,p_short_code);
  return p_short_code;
end;
$$;

-- Only use this after a verified, completed Alipay refund.
-- Existing published links intentionally remain readable.
create or replace function public.billing_mark_refunded(p_order_no text, p_trade_no text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order public.billing_orders%rowtype;
  v_other_lifetime boolean;
begin
  select * into v_order from public.billing_orders
    where order_no=p_order_no for update;
  if not found or v_order.alipay_trade_no is distinct from p_trade_no then
    return false;
  end if;
  if v_order.status='refunded' then return true; end if;
  if v_order.status<>'paid' then return false; end if;
  update public.billing_orders
    set status='refunded', refunded_at=now(), updated_at=now() where id=v_order.id;
  select exists(select 1 from public.billing_orders
    where user_id=v_order.user_id and plan='lifetime' and status='paid')
    into v_other_lifetime;
  update public.billing_entitlements
    set publish_credits=case when v_order.plan='single'
      then greatest(0,publish_credits-1) else publish_credits end,
      is_lifetime=v_other_lifetime,
      updated_at=now()
    where user_id=v_order.user_id;
  return true;
end;
$$;

-- SECURITY DEFINER functions in exposed public schema must NEVER be callable by users.
revoke all on function public.billing_mark_paid(text,text,integer) from public, anon, authenticated;
grant execute on function public.billing_mark_paid(text,text,integer) to service_role;
revoke all on function public.billing_mark_refunded(text,text) from public, anon, authenticated;
grant execute on function public.billing_mark_refunded(text,text) to service_role;
revoke all on function public.billing_publish_policy(uuid,text,uuid,text,text,text,text,date,text,text,text)
  from public, anon, authenticated;
grant execute on function public.billing_publish_policy(uuid,text,uuid,text,text,text,text,date,text,text,text)
  to service_role;
