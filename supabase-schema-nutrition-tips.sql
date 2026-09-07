-- Tips nutricionales por jugador (Desayuno, Pre entreno, Post entreno,
-- Comida, Merienda, Cena). Los escribe el entrenador y los ve el jugador
-- en su propio perfil.
-- Ejecuta esto en el SQL Editor de Supabase.

create table if not exists player_nutrition_tips (
  player_id uuid not null references players(id) on delete cascade,
  category text not null check (category in ('desayuno', 'pre_entreno', 'post_entreno', 'comida', 'merienda', 'cena')),
  tip text,
  primary key (player_id, category)
);

alter table player_nutrition_tips enable row level security;

create policy "player_nutrition_tips readable" on player_nutrition_tips for select
  using (auth.role() = 'authenticated');

create policy "player_nutrition_tips writable by coach" on player_nutrition_tips for all
  using (is_coach())
  with check (is_coach());
