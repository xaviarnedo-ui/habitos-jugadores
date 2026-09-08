-- Permite al entrenador fijar el objetivo de ayuno (goal_hours) de cualquier
-- jugador desde su panel. Antes solo el propio jugador podía escribir en
-- fasting_sessions (política "fasting_sessions writable by owner"); esta
-- política adicional da también permiso al entrenador.
-- Ejecuta esto en el SQL Editor de Supabase.

create policy "fasting_sessions writable by coach" on fasting_sessions for all
  using (is_coach())
  with check (is_coach());
