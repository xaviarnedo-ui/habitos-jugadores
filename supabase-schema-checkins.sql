-- Preguntas diarias del jugador: calidad del sueño y nivel de energía.
-- Ejecuta esto en el SQL Editor de Supabase.

create table if not exists daily_checkins (
  player_id uuid not null references players(id) on delete cascade,
  date date not null,
  sleep smallint,
  energy smallint,
  primary key (player_id, date)
);

alter table daily_checkins enable row level security;

create policy "daily_checkins readable" on daily_checkins for select
  using (auth.role() = 'authenticated');

create policy "daily_checkins writable by owner" on daily_checkins for all
  using (exists (select 1 from players where players.id = daily_checkins.player_id and players.auth_id = auth.uid()))
  with check (exists (select 1 from players where players.id = daily_checkins.player_id and players.auth_id = auth.uid()));
