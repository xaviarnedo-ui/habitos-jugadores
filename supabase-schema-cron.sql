-- Programa la llamada automática a la Edge Function "send-habit-reminders"
-- cada 5 minutos. Ejecuta esto DESPUÉS de haber desplegado la función
-- (ver supabase-edge-function-send-habit-reminders.ts).
--
-- Antes de ejecutar, sustituye SERVICE_ROLE_KEY_AQUI por tu clave real
-- (Project Settings -> API -> service_role key).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-habit-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://cqjuqlrjidzulefeupqy.supabase.co/functions/v1/send-habit-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer SERVICE_ROLE_KEY_AQUI',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para comprobar que está programado:
-- select * from cron.job;
-- Para desprogramarlo si algún día quieres desactivarlo:
-- select cron.unschedule('send-habit-reminders');
