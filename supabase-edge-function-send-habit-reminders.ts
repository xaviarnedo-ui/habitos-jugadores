// Código de la Edge Function "send-habit-reminders".
// Instrucciones de despliegue al final del archivo (no se despliega solo).

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;

webpush.setVapidDetails('mailto:xavi.arnedo@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const WEEKDAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const now = new Date();
  const madridNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const hh = String(madridNow.getHours()).padStart(2, '0');
  const roundedMin = String(madridNow.getMinutes() - (madridNow.getMinutes() % 5)).padStart(2, '0');
  const y = madridNow.getFullYear();
  const m = String(madridNow.getMonth() + 1).padStart(2, '0');
  const d = String(madridNow.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;
  const weekday = WEEKDAY_ORDER[madridNow.getDay()];

  const { data: habits } = await supabase
    .from('habits')
    .select('id, emoji, label, time_of_day')
    .eq('notify_enabled', true);

  const dueHabits = (habits || []).filter(
    h => h.time_of_day && h.time_of_day.slice(0, 5) === `${hh}:${roundedMin}`
  );

  if (dueHabits.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  let sent = 0;

  for (const habit of dueHabits) {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('player_id')
      .eq('habit_id', habit.id)
      .eq('weekday', weekday);

    const playerIds = (assignments || []).map(a => a.player_id);
    if (playerIds.length === 0) continue;

    const { data: doneChecks } = await supabase
      .from('checks')
      .select('player_id')
      .eq('habit_id', habit.id)
      .eq('date', todayStr)
      .in('player_id', playerIds);

    const doneSet = new Set((doneChecks || []).map(c => c.player_id));
    const pendingIds = playerIds.filter(id => !doneSet.has(id));
    if (pendingIds.length === 0) continue;

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('player_id', pendingIds);

    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: 'Hábitos', body: `${habit.emoji} Toca: ${habit.label}` })
        );
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});

/*
CÓMO DESPLEGAR (todo desde el dashboard de Supabase, sin instalar nada):

1. Supabase Dashboard -> Edge Functions -> "Deploy a new function" -> nómbrala
   "send-habit-reminders" y pega el código de arriba (sin este comentario final).

2. Edge Functions -> send-habit-reminders -> Secrets (o Project Settings -> Edge Functions -> Secrets),
   añade estos 4 secretos:
     SUPABASE_URL              -> https://cqjuqlrjidzulefeupqy.supabase.co
     SUPABASE_SERVICE_ROLE_KEY -> (Project Settings -> API -> service_role key)
     VAPID_PUBLIC_KEY          -> (te la paso en el chat, es la misma que ya está en app.js)
     VAPID_PRIVATE_KEY         -> (te la paso en el chat aparte; NUNCA la pongas en un archivo de este repo, es público)

3. Ejecuta supabase-schema-cron.sql en el SQL Editor para que se llame sola cada 5 minutos.
*/
