-- Permite distinguir "hecho", "no hecho" (el jugador lo marca explícitamente)
-- y "sin responder todavía" (no cuenta como sí ni como no).
-- Ejecuta esto en el SQL Editor de Supabase.

alter table checks add column if not exists done boolean not null default true;
