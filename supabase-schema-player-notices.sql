-- Avisos puntuales del entrenador a un jugador (p.ej. "Comprar báscula").
-- Le aparecen al jugador cada día hasta que los marca como hechos.
-- Ejecuta esto en el SQL Editor de Supabase.

create table if not exists player_notices (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  message text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table player_notices enable row level security;

create policy "player_notices readable" on player_notices for select
  using (auth.role() = 'authenticated');

create policy "player_notices writable by coach" on player_notices for all
  using (is_coach())
  with check (is_coach());

-- El jugador solo puede marcarlo como hecho (no puede crear ni borrar avisos).
create policy "player_notices markable done by owner" on player_notices for update
  using (exists (select 1 from players where players.id = player_notices.player_id and players.auth_id = auth.uid()))
  with check (exists (select 1 from players where players.id = player_notices.player_id and players.auth_id = auth.uid()));
