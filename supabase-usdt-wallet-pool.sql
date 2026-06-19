create extension if not exists pgcrypto;

create table if not exists payment_wallets (
  id uuid primary key default gen_random_uuid(),
  network text not null default 'TON',
  token text not null default 'USDT',
  address text not null unique,
  is_active boolean not null default true,
  assigned_to_telegram_id text,
  assigned_order_id uuid,
  assigned_until timestamptz,
  cooldown_until timestamptz,
  last_assigned_at timestamptz,
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_orders (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null,
  network text not null default 'TON',
  token text not null default 'USDT',
  required_amount numeric(24, 6) not null,
  wallet_address text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'expired', 'canceled')),
  assigned_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_checked_at timestamptz,
  tx_hash text unique,
  from_wallet text,
  paid_amount numeric(24, 6),
  paid_at timestamptz,
  raw_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table payment_wallets
  alter column network set default 'TON',
  alter column token set default 'USDT';

alter table payment_orders
  alter column network set default 'TON',
  alter column token set default 'USDT';

create index if not exists payment_wallets_available_idx
  on payment_wallets (network, token, is_active, assigned_order_id, cooldown_until, last_assigned_at);

create index if not exists payment_orders_pending_scan_idx
  on payment_orders (status, last_checked_at, created_at)
  where status = 'pending';

create index if not exists payment_orders_telegram_idx
  on payment_orders (telegram_id, created_at desc);

create unique index if not exists payment_transactions_tx_hash_unique
  on payment_transactions (tx_hash)
  where tx_hash is not null;

create or replace function claim_payment_wallet(
  p_order_id uuid,
  p_telegram_id text,
  p_assigned_until timestamptz,
  p_network text default 'TON',
  p_token text default 'USDT'
)
returns setof payment_wallets
language plpgsql
security definer
as $$
begin
  return query
  with picked as (
    select id
    from payment_wallets
    where is_active = true
      and network = p_network
      and token = p_token
      and assigned_order_id is null
      and (cooldown_until is null or cooldown_until <= now())
    order by last_assigned_at asc nulls first, created_at asc
    for update skip locked
    limit 1
  )
  update payment_wallets w
     set assigned_to_telegram_id = p_telegram_id,
         assigned_order_id = p_order_id,
         assigned_until = p_assigned_until,
         last_assigned_at = now(),
         updated_at = now()
    from picked
   where w.id = picked.id
  returning w.*;
end;
$$;

-- Import your own public TON receiving addresses here.
-- Private keys must never be inserted into Supabase or Render env.
--
-- insert into payment_wallets (network, token, address) values
-- ('TON', 'USDT', 'EQXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
-- ('TON', 'USDT', 'UQYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY')
-- on conflict (address) do nothing;

create table if not exists admin_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

insert into admin_settings (key, value) values
('withdraw_min_amount', '9'),
('withdraw_commission_percent', '0'),
('withdraw_requires_payment', 'true')
on conflict (key) do update set value = excluded.value;
