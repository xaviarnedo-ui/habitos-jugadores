-- Esquema para la app "Hábitos" (Atlético Baleares)
-- Cómo usarlo: Supabase > tu proyecto > SQL Editor > pega todo esto > Run.
-- Es seguro ejecutarlo una sola vez sobre un proyecto nuevo y vacío.

create extension if not exists pgcrypto;

create table habits (
  id uuid primary key default gen_random_uuid(),
  emoji text not null default '✅',
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table assignments (
  player_id uuid not null references players(id) on delete cascade,
  weekday text not null check (weekday in ('mon','tue','wed','thu','fri','sat','sun')),
  habit_id uuid not null references habits(id) on delete cascade,
  primary key (player_id, weekday, habit_id)
);

create table checks (
  player_id uuid not null references players(id) on delete cascade,
  date date not null,
  habit_id uuid not null references habits(id) on delete cascade,
  primary key (player_id, date, habit_id)
);

create table weights (
  player_id uuid not null references players(id) on delete cascade,
  date date not null,
  kg numeric(5,1) not null,
  primary key (player_id, date)
);

create table fasting_sessions (
  player_id uuid primary key references players(id) on delete cascade,
  active_start timestamptz,
  goal_hours int not null default 16
);

create table fasting_history (
  id bigserial primary key,
  player_id uuid not null references players(id) on delete cascade,
  date date not null,
  hours numeric(4,1) not null
);

create table settings (
  id int primary key default 1 check (id = 1),
  coach_auth_id uuid references auth.users(id)
);
insert into settings (id, coach_auth_id) values (1, null);

-- ---------- Row Level Security ----------

alter table habits enable row level security;
alter table players enable row level security;
alter table assignments enable row level security;
alter table checks enable row level security;
alter table weights enable row level security;
alter table fasting_sessions enable row level security;
alter table fasting_history enable row level security;
alter table settings enable row level security;

create or replace function is_coach() returns boolean as $$
  select exists (select 1 from settings where coach_auth_id = auth.uid());
$$ language sql stable;

-- settings: cualquier usuario logueado puede leer; solo se puede fijar el
-- entrenador una vez (bootstrap) o si ya eres tú el entrenador
create policy "settings readable" on settings for select using (auth.role() = 'authenticated');
create policy "settings bootstrap or coach update" on settings for update
  using (coach_auth_id is null or coach_auth_id = auth.uid())
  with check (coach_auth_id is null or coach_auth_id = auth.uid());

-- habits: lectura para todos los logueados, escritura solo entrenador
create policy "habits readable" on habits for select using (auth.role() = 'authenticated');
create policy "habits writable by coach" on habits for all using (is_coach()) with check (is_coach());

-- players: lectura para todos los logueados; alta/baja solo entrenador;
-- actualización por el entrenador, por el propio jugador, o auto-vinculación
-- (un jugador recién registrado se enlaza a su fila si el email coincide)
create policy "players readable" on players for select using (auth.role() = 'authenticated');
create policy "players insert by coach" on players for insert with check (is_coach());
create policy "players update by coach or self" on players for update
  using (is_coach() or auth_id = auth.uid() or (auth_id is null and email = auth.jwt() ->> 'email'))
  with check (is_coach() or auth_id = auth.uid());
create policy "players delete by coach" on players for delete using (is_coach());

-- assignments: lectura para todos, escritura solo entrenador
create policy "assignments readable" on assignments for select using (auth.role() = 'authenticated');
create policy "assignments writable by coach" on assignments for all using (is_coach()) with check (is_coach());

-- checks: lectura para todos (dashboard del entrenador), escritura solo el
-- propio jugador sobre sus propios registros
create policy "checks readable" on checks for select using (auth.role() = 'authenticated');
create policy "checks writable by owner" on checks for all
  using (exists (select 1 from players where players.id = checks.player_id and players.auth_id = auth.uid()))
  with check (exists (select 1 from players where players.id = checks.player_id and players.auth_id = auth.uid()));

-- weights: igual que checks
create policy "weights readable" on weights for select using (auth.role() = 'authenticated');
create policy "weights writable by owner" on weights for all
  using (exists (select 1 from players where players.id = weights.player_id and players.auth_id = auth.uid()))
  with check (exists (select 1 from players where players.id = weights.player_id and players.auth_id = auth.uid()));

-- fasting_sessions: igual que checks
create policy "fasting_sessions readable" on fasting_sessions for select using (auth.role() = 'authenticated');
create policy "fasting_sessions writable by owner" on fasting_sessions for all
  using (exists (select 1 from players where players.id = fasting_sessions.player_id and players.auth_id = auth.uid()))
  with check (exists (select 1 from players where players.id = fasting_sessions.player_id and players.auth_id = auth.uid()));

-- fasting_history: igual que checks
create policy "fasting_history readable" on fasting_history for select using (auth.role() = 'authenticated');
create policy "fasting_history writable by owner" on fasting_history for all
  using (exists (select 1 from players where players.id = fasting_history.player_id and players.auth_id = auth.uid()))
  with check (exists (select 1 from players where players.id = fasting_history.player_id and players.auth_id = auth.uid()));

-- ---------- Batería de hábitos por defecto ----------
insert into habits (emoji, label, sort_order) values
  ('💤', 'Dormir 8 horas', 1),
  ('💧', 'Hidratación (2L agua)', 2),
  ('🥗', 'Comida saludable', 3),
  ('🧘', 'Estiramientos / movilidad', 4),
  ('🚭', 'Sin alcohol / tabaco', 5);
