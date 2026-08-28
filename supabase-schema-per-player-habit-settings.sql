-- Mueve la hora y el aviso de cada hábito de "global" (mismo para todos)
-- a "por jugador" (cada jugador puede tener su propia hora para el mismo hábito).
-- Ejecuta esto en el SQL Editor de Supabase.

create table if not exists player_habit_settings (
  player_id uuid not null references players(id) on delete cascade,
  habit_id uuid not null references habits(id) on delete cascade,
  time_of_day time,
  notify_enabled boolean not null default false,
  primary key (player_id, habit_id)
);

alter table player_habit_settings enable row level security;

create policy "player_habit_settings readable" on player_habit_settings for select
  using (auth.role() = 'authenticated');

create policy "player_habit_settings writable by coach" on player_habit_settings for all
  using (is_coach())
  with check (is_coach());

-- Las columnas antiguas en "habits" ya no se usan (la hora ahora es por jugador).
alter table habits drop column if exists time_of_day;
alter table habits drop column if exists notify_enabled;
