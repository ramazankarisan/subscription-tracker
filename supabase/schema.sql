-- SubTrack schema — run once in the Supabase SQL editor.
-- Per-user tables with Row Level Security so each account only ever sees its
-- own rows. The reminder Edge Function uses the service-role key and bypasses
-- RLS to read everyone's due items.

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------- Tables ----------

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  cost numeric not null default 0,
  currency text not null default 'EUR',
  cycle text not null default 'monthly',
  custom_interval_days integer,
  next_renewal date not null,
  cancel_url text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  currency text not null default 'EUR',
  amount_per_payment numeric not null default 0,
  total_payments integer not null default 1,
  paid_payments integer not null default 0,
  first_payment_date date not null,
  interval_months integer not null default 1,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reminder_lead_days integer not null default 7,
  reminder_offsets integer[] not null default '{3,0}',
  recipient_email text not null default '',
  updated_at timestamptz not null default now()
);

-- Idempotency ledger: one row per (item, reminder date, offset) actually sent,
-- so a reminder goes out at most once even if the cron runs twice or catches up.
create table if not exists public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_kind text not null,          -- 'subscription' | 'installment'
  item_id uuid not null,
  reminder_date date not null,      -- due_date - offset_days
  offset_days integer not null,
  sent_at timestamptz not null default now(),
  unique (user_id, item_kind, item_id, reminder_date, offset_days)
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id);
create index if not exists installments_user_idx on public.installments (user_id);
create index if not exists reminder_log_user_idx on public.reminder_log (user_id);

-- ---------- Row Level Security ----------

alter table public.subscriptions enable row level security;
alter table public.installments enable row level security;
alter table public.app_settings enable row level security;
alter table public.reminder_log enable row level security;

create policy "own subscriptions" on public.subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own installments" on public.installments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own settings" on public.app_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Clients may read their own send history; only the server (service role)
-- writes to it, so no insert/update/delete policy is granted here.
create policy "own reminder log" on public.reminder_log
  for select using (auth.uid() = user_id);
