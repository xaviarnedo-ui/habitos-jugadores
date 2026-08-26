-- Añade: hora orientativa + aviso activable por hábito, y la tabla donde
-- se guardan las suscripciones a notificaciones push de cada jugador.
-- Ejecuta esto en el SQL Editor de Supabase.

alter table habits add column if not exists time_of_day time;
alter table habits add column if not exists notify_enabled boolean not null default false;

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions readable" on push_subscriptions for select
  using (auth.role() = 'authenticated');

create policy "push_subscriptions writable by owner" on push_subscriptions for all
  using (exists (select 1 from players where players.id = push_subscriptions.player_id and players.auth_id = auth.uid()))
  with check (exists (select 1 from players where players.id = push_subscriptions.player_id and players.auth_id = auth.uid()));
