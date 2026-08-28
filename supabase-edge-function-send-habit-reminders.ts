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

  // La hora y el aviso son por jugador+hábito (no globales), así que se
  // consulta player_habit_settings en vez de la tabla habits.
  const { data: dueSettings } = await supabase
    .from('player_habit_settings')
    .select('player_id, habit_id, time_of_day, habits(emoji, label)')
    .eq('notify_enabled', true);

  const due = (dueSettings || []).filter(
    s => s.time_of_day && s.time_of_day.slice(0, 5) === `${hh}:${roundedMin}`
  );

  if (due.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  let sent = 0;

  for (const setting of due) {
    // ¿Sigue asignado ese hábito a ese jugador hoy?
    const { data: assignment } = await supabase
      .from('assignments')
      .select('player_id')
      .eq('player_id', setting.player_id)
      .eq('habit_id', setting.habit_id)
      .eq('weekday', weekday)
      .maybeSingle();
    if (!assignment) continue;

    // ¿Ya lo ha marcado hoy (hecho o no hecho)?
    const { data: existingCheck } = await supabase
      .from('checks')
      .select('done')
      .eq('player_id', setting.player_id)
      .eq('habit_id', setting.habit_id)
      .eq('date', todayStr)
      .maybeSingle();
    if (existingCheck && existingCheck.done === true) continue;

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('player_id', setting.player_id);

    const habit = setting.habits;
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: 'Hábitos', body: `${habit?.emoji || '✅'} Toca: ${habit?.label || 'tu hábito'}` })
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

1. Supabase Dashboard -> Edge Functions -> send-habit-reminders -> pega este código
   (sin este comentario final) sustituyendo el que ya había.

2. Los secrets (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) ya deberían estar puestos de
   cuando la desplegaste la primera vez. SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
   los rellena Supabase solo, no hace falta tocarlos.

3. El cron que la llama cada 5 minutos (supabase-schema-cron.sql) no cambia.
*/
