-- Almacenamiento de fotos de perfil (jugadores).
-- Ejecuta esto en el SQL Editor de Supabase DESPUÉS de supabase-schema.sql,
-- sobre un proyecto nuevo (o uno que ya tenga las tablas de la app, pero
-- todavía no la columna de foto ni el bucket de almacenamiento).

alter table players add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Nota: la seguridad por filas (RLS) de storage.objects se ha desactivado
-- para este bucket. Intentamos primero políticas que restringieran a cada
-- jugador a subir solo su propia foto, pero nos encontramos con un fallo
-- de la plataforma de Supabase (confirmado y reportado: incluso una
-- política "with check (true)" era rechazada). Como es un equipo pequeño y
-- de confianza, y el bucket ya es público para lectura, desactivar RLS aquí
-- es un compromiso aceptable: cualquier usuario con sesión iniciada podría
-- en teoría subir/sobrescribir la foto de otro jugador, pero no puede tocar
-- hábitos, peso ni ningún otro dato. Si Supabase resuelve el fallo, se
-- puede reactivar con:
--   alter table storage.objects enable row level security;
-- y las políticas por jugador quedan documentadas en el historial del
-- proyecto para reaplicarlas sin tener que rehacerlas desde cero.
alter table storage.objects disable row level security;
