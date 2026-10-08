-- Expense Planner: per-user sync tables for Supabase.
--
-- Run once: Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again (it is idempotent).
--
-- Design:
--   * One row per record, owned by the signed-in user (user_id = auth.uid()).
--   * Row Level Security: a user can only ever see or change their own rows.
--   * Deletes are "soft" (deleted_at is set) so a delete on one device reaches the others.
--   * updated_at is stamped by the SERVER on every insert/update (clients cannot set it), so
--     "give me everything changed since X" is reliable even if a device clock is wrong.
--   * Column checks mirror the app's own validation, as a second line of defence.

-- ---------------------------------------------------------------- tables

create table if not exists public.transactions (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null check (char_length(id) between 1 and 64),
  type       text not null check (type in ('income', 'expense')),
  amount     numeric(12, 2) not null check (amount > 0 and amount <= 1000000000),
  category   text not null check (char_length(category) between 1 and 40),
  date       date not null check (date between date '1900-01-01' and date '2100-12-31'),
  notes      text not null default '' check (char_length(notes) <= 200),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.budgets (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category      text not null check (char_length(category) between 1 and 40),
  monthly_limit numeric(12, 2) not null check (monthly_limit > 0 and monthly_limit <= 1000000000),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  primary key (user_id, category)
);

create table if not exists public.subscriptions (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null check (char_length(id) between 1 and 64),
  name       text not null check (char_length(name) between 1 and 60),
  cost       numeric(12, 2) not null check (cost > 0 and cost <= 1000000000),
  cycle      text not null check (cycle in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  next_due   date not null check (next_due between date '1900-01-01' and date '2100-12-31'),
  last_paid  date check (last_paid is null or last_paid between date '1900-01-01' and date '2100-12-31'),
  anchor_day smallint not null default 1 check (anchor_day between 1 and 31),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

-- "Everything for me changed since X" is the main sync query.
create index if not exists transactions_user_updated  on public.transactions  (user_id, updated_at);
create index if not exists budgets_user_updated       on public.budgets       (user_id, updated_at);
create index if not exists subscriptions_user_updated on public.subscriptions (user_id, updated_at);

-- ---------------------------------------------------------------- server-side timestamp

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists transactions_touch  on public.transactions;
drop trigger if exists budgets_touch       on public.budgets;
drop trigger if exists subscriptions_touch on public.subscriptions;

create trigger transactions_touch  before insert or update on public.transactions
  for each row execute function public.touch_updated_at();
create trigger budgets_touch       before insert or update on public.budgets
  for each row execute function public.touch_updated_at();
create trigger subscriptions_touch before insert or update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- Row Level Security

do $$
declare
  t text;
begin
  foreach t in array array['transactions', 'budgets', 'subscriptions'] loop
    execute format('alter table public.%I enable row level security', t);

    -- Only signed-in users may touch these tables; the anonymous (logged-out) role gets nothing.
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

    -- One policy per operation, each limited to the signed-in role and to the user's own rows.
    execute format('drop policy if exists "own rows: select" on public.%I', t);
    execute format('drop policy if exists "own rows: insert" on public.%I', t);
    execute format('drop policy if exists "own rows: update" on public.%I', t);
    execute format('drop policy if exists "own rows: delete" on public.%I', t);

    execute format($p$create policy "own rows: select" on public.%I for select to authenticated
      using ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "own rows: insert" on public.%I for insert to authenticated
      with check ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "own rows: update" on public.%I for update to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)$p$, t);
    execute format($p$create policy "own rows: delete" on public.%I for delete to authenticated
      using ((select auth.uid()) = user_id)$p$, t);
  end loop;
end;
$$;
