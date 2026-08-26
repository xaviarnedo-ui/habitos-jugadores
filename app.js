import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://cqjuqlrjidzulefeupqy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxanVxbHJqaWR6dWxlZmV1cHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0OTcxMTQsImV4cCI6MjEwMjA3MzExNH0.QxXV-PLREwxc2rJKs5TSNR81-u5I8o_AnSaHxz7ZaJE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const VAPID_PUBLIC_KEY = 'BIez-kUYmKbzOphKs5GPzQ44qguPuPk9faMa2vsGLZ8RYjfb235nBM_gSid-PDgNu36DPgMS1v78phRbaArY64A';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

const WEEKDAYS = [
  { key: 'mon', short: 'L', label: 'Lunes' },
  { key: 'tue', short: 'M', label: 'Martes' },
  { key: 'wed', short: 'X', label: 'Miércoles' },
  { key: 'thu', short: 'J', label: 'Jueves' },
  { key: 'fri', short: 'V', label: 'Viernes' },
  { key: 'sat', short: 'S', label: 'Sábado' },
  { key: 'sun', short: 'D', label: 'Domingo' },
];

function emptyWeekMap() {
  const map = {};
  WEEKDAYS.forEach(d => { map[d.key] = []; });
  return map;
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function weekdayKeyForDateStr(dateStr) {
  const jsDay = new Date(dateStr + 'T00:00:00').getDay(); // 0=Sun..6=Sat
  const order = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return order[jsDay];
}

function todayKey(d = new Date()) {
  // Use local date components (not toISOString, which converts to UTC and
  // can shift the calendar day in timezones ahead of UTC).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getMondayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return todayKey(d);
}

function initials(name) {
  return (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function avatarThumbHtml(player) {
  if (player.avatarUrl) return `<img src="${player.avatarUrl}" class="avatar-thumb" alt="">`;
  return `<span class="avatar-thumb avatar-fallback">${initials(player.name)}</span>`;
}

function translateAuthError(error) {
  const msg = (error && error.message) || '';
  if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.';
  if (/already registered/i.test(msg)) return 'Ya existe una cuenta con ese email. Prueba a iniciar sesión.';
  if (/password should be at least/i.test(msg)) return 'La contraseña es demasiado corta (mínimo 6 caracteres).';
  return msg || 'Ha ocurrido un error. Inténtalo de nuevo.';
}

let state = {
  habits: [],
  players: [],
  coachAuthId: null,
  records: {}, // records[date][playerId][habitId] = true
  session: null, // { type: 'coach', email } | { type: 'player', playerId }
};
let selectedDetailPlayer = null; // player id
let editingPlayerEmail = null; // player id
let playerEmailEditError = '';
const adminSelectedDay = {}; // playerId -> weekday key, UI-only state
let fastingIntervalId = null;
let currentAuthMode = 'signin';
let currentPlayerTab = 'hoy'; // 'hoy' | 'semana' | 'perfil'
let currentCoachTab = 'equipo'; // 'equipo' | 'habitos' | 'jugadores' | 'ajustes'

const PLAYER_TAB_TITLES = { hoy: 'HOY', semana: 'SEMANA', perfil: 'PERFIL' };
const COACH_TAB_TITLES = { equipo: 'EQUIPO', habitos: 'HÁBITOS', jugadores: 'JUGADORES', ajustes: 'AJUSTES' };

function showTab(role, tabName) {
  const prefix = role === 'player' ? 'tab-player-' : 'tab-coach-';
  const navId = role === 'player' ? 'bottomnavPlayer' : 'bottomnavCoach';
  const screenId = role === 'player' ? 'screen-player' : 'screen-coach';
  document.querySelectorAll(`#${screenId} .tab-content`).forEach(el => {
    el.classList.toggle('active', el.id === prefix + tabName);
  });
  document.querySelectorAll(`#${navId} .nav-item`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
}

function pctTierClass(pct) {
  if (pct === null) return 'empty';
  if (pct >= 80) return 'win';
  if (pct >= 40) return 'mid';
  return 'loss';
}

function clearFastingInterval() {
  if (fastingIntervalId) {
    clearInterval(fastingIntervalId);
    fastingIntervalId = null;
  }
}

function getPlayerById(id) {
  return state.players.find(p => p.id === id);
}

async function loadAllData() {
  const [
    { data: habits },
    { data: players },
    { data: assignments },
    { data: checks },
    { data: weights },
    { data: fastingSessions },
    { data: fastingHistory },
    { data: settingsRows },
  ] = await Promise.all([
    supabase.from('habits').select('*').order('sort_order'),
    supabase.from('players').select('*').order('name'),
    supabase.from('assignments').select('*'),
    supabase.from('checks').select('*'),
    supabase.from('weights').select('*'),
    supabase.from('fasting_sessions').select('*'),
    supabase.from('fasting_history').select('*'),
    supabase.from('settings').select('*'),
  ]);

  state.habits = (habits || []).map(h => ({ id: h.id, emoji: h.emoji, label: h.label, timeOfDay: h.time_of_day, notifyEnabled: h.notify_enabled }));
  state.coachAuthId = settingsRows && settingsRows[0] ? settingsRows[0].coach_auth_id : null;

  const assignmentsByPlayer = {};
  (assignments || []).forEach(a => {
    if (!assignmentsByPlayer[a.player_id]) assignmentsByPlayer[a.player_id] = emptyWeekMap();
    assignmentsByPlayer[a.player_id][a.weekday].push(a.habit_id);
  });

  const fastingSessionByPlayer = {};
  (fastingSessions || []).forEach(f => { fastingSessionByPlayer[f.player_id] = f; });

  const fastingHistoryByPlayer = {};
  (fastingHistory || []).forEach(f => {
    if (!fastingHistoryByPlayer[f.player_id]) fastingHistoryByPlayer[f.player_id] = [];
    fastingHistoryByPlayer[f.player_id].push({ date: f.date, hours: Number(f.hours) });
  });

  const weightsByPlayer = {};
  (weights || []).forEach(w => {
    if (!weightsByPlayer[w.player_id]) weightsByPlayer[w.player_id] = {};
    weightsByPlayer[w.player_id][w.date] = Number(w.kg);
  });

  state.players = (players || []).map(p => ({
    id: p.id,
    authId: p.auth_id,
    name: p.name,
    email: p.email,
    avatarUrl: p.avatar_url || null,
    habitsByDay: assignmentsByPlayer[p.id] || emptyWeekMap(),
    weightLog: weightsByPlayer[p.id] || {},
    fasting: {
      activeStart: fastingSessionByPlayer[p.id] ? fastingSessionByPlayer[p.id].active_start : null,
      goalHours: fastingSessionByPlayer[p.id] ? fastingSessionByPlayer[p.id].goal_hours : 16,
      history: fastingHistoryByPlayer[p.id] || [],
    },
  }));

  state.records = {};
  (checks || []).forEach(c => {
    if (!state.records[c.date]) state.records[c.date] = {};
    if (!state.records[c.date][c.player_id]) state.records[c.date][c.player_id] = {};
    state.records[c.date][c.player_id][c.habit_id] = true;
  });
}

async function refreshAndRender() {
  await loadAllData();
  render();
}

function habitsForOnDate(player, dateStr) {
  if (!player) return [];
  const dayKey = weekdayKeyForDateStr(dateStr);
  const ids = player.habitsByDay[dayKey] || [];
  return ids.map(id => state.habits.find(h => h.id === id)).filter(Boolean);
}

function computeWeeklySummary(player) {
  const today = todayKey();
  const monday = getMondayOfWeek(today);
  const dates = [];
  const cursor = new Date(monday + 'T00:00:00');
  const todayDate = new Date(today + 'T00:00:00');
  while (cursor <= todayDate) {
    dates.push(todayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const perHabit = {};
  let totalAssigned = 0;
  let totalDone = 0;

  dates.forEach(date => {
    const habits = habitsForOnDate(player, date);
    const rec = (state.records[date] && state.records[date][player.id]) || {};
    habits.forEach(h => {
      if (!perHabit[h.id]) perHabit[h.id] = { emoji: h.emoji, label: h.label, assigned: 0, done: 0 };
      perHabit[h.id].assigned++;
      totalAssigned++;
      if (rec[h.id]) {
        perHabit[h.id].done++;
        totalDone++;
      }
    });
  });

  return {
    perHabit,
    pct: totalAssigned ? Math.round((totalDone / totalAssigned) * 100) : null,
    weekStartLabel: formatDateLabel(monday),
    weekEndLabel: formatDateLabel(today),
  };
}

function getCurrentPlayer() {
  if (!state.session || state.session.type !== 'player') return null;
  return getPlayerById(state.session.playerId);
}

function getScreens() {
  return document.querySelectorAll('.screen');
}

function showScreen(id) {
  getScreens().forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function render() {
  const logoutBtn = document.getElementById('logoutBtn');
  logoutBtn.style.display = state.session ? 'flex' : 'none';
  document.getElementById('bottomnavPlayer').style.display = 'none';
  document.getElementById('bottomnavCoach').style.display = 'none';

  if (!state.session) {
    showScreen('screen-login');
    document.getElementById('topbarTitle').textContent = 'HÁBITOS';
    document.getElementById('topbarSubtitle').textContent = 'Atlético Baleares';
    return;
  }

  if (state.session.type === 'player') {
    const player = getCurrentPlayer();
    if (!player) {
      state.session = null;
      showScreen('screen-login');
      document.getElementById('loginMessage').textContent = 'Tu entrenador te ha eliminado del equipo.';
      return;
    }
    renderPlayerToday(player);
    showScreen('screen-player');
    document.getElementById('bottomnavPlayer').style.display = 'flex';
    showTab('player', currentPlayerTab);
    document.getElementById('topbarTitle').textContent = PLAYER_TAB_TITLES[currentPlayerTab];
    document.getElementById('topbarSubtitle').textContent = player.name;
  } else if (state.session.type === 'coach') {
    renderCoach();
    showScreen('screen-coach');
    document.getElementById('bottomnavCoach').style.display = 'flex';
    showTab('coach', currentCoachTab);
    document.getElementById('topbarTitle').textContent = COACH_TAB_TITLES[currentCoachTab];
    document.getElementById('topbarSubtitle').textContent = 'Panel del entrenador';
  }
}

/* ---------- AUTH ---------- */

async function resolveSessionAndRender() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    state.session = null;
    render();
    return;
  }

  await loadAllData();

  if (state.coachAuthId && state.coachAuthId === user.id) {
    state.session = { type: 'coach', email: user.email };
    clearAuthInputs();
    render();
    return;
  }

  let player = state.players.find(p => p.authId === user.id);

  if (!player) {
    const email = normalizeEmail(user.email);
    const unlinked = state.players.find(p => !p.authId && normalizeEmail(p.email) === email);
    if (unlinked) {
      const { error } = await supabase.from('players').update({ auth_id: user.id }).eq('id', unlinked.id);
      if (!error) {
        await loadAllData();
        player = state.players.find(p => p.id === unlinked.id);
      }
    }
  }

  if (player) {
    state.session = { type: 'player', playerId: player.id };
    clearAuthInputs();
    render();
    return;
  }

  if (!state.coachAuthId) {
    document.getElementById('bootstrapEmailLabel').textContent = user.email;
    document.getElementById('loginFormBox').style.display = 'none';
    document.getElementById('bootstrapBox').style.display = 'block';
    return;
  }

  await supabase.auth.signOut();
  state.session = null;
  document.getElementById('loginMessage').textContent = 'Tu entrenador no te ha añadido con este email todavía.';
  render();
}

function clearAuthInputs() {
  document.getElementById('authEmailInput').value = '';
  document.getElementById('authPasswordInput').value = '';
  document.getElementById('loginFormBox').style.display = 'block';
  document.getElementById('bootstrapBox').style.display = 'none';
}

async function handleAuthSubmit() {
  const email = normalizeEmail(document.getElementById('authEmailInput').value);
  const password = document.getElementById('authPasswordInput').value;
  const messageEl = document.getElementById('loginMessage');
  const submitBtn = document.getElementById('authSubmitBtn');
  messageEl.textContent = '';

  if (!email || !password) {
    messageEl.textContent = 'Introduce email y contraseña.';
    return;
  }
  if (currentAuthMode === 'signup' && password.length < 6) {
    messageEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    return;
  }

  submitBtn.disabled = true;
  try {
    if (currentAuthMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) { messageEl.textContent = translateAuthError(error); return; }
      if (!data.session) {
        messageEl.textContent = 'Cuenta creada. Revisa tu email para confirmarla y luego inicia sesión.';
        return;
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { messageEl.textContent = translateAuthError(error); return; }
    }
    await resolveSessionAndRender();
  } finally {
    submitBtn.disabled = false;
  }
}

async function confirmBootstrapCoach() {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('settings').update({ coach_auth_id: user.id }).eq('id', 1);
  await resolveSessionAndRender();
}

async function cancelBootstrapCoach() {
  await supabase.auth.signOut();
  clearAuthInputs();
  document.getElementById('loginMessage').textContent = 'Vale, no se ha configurado ningún entrenador.';
}

/* ---------- PLAYER ---------- */

function renderProfileCard(player) {
  const box = document.getElementById('profileCard');
  const summary = computeWeeklySummary(player);

  const avatarHtml = player.avatarUrl
    ? `<img src="${player.avatarUrl}" alt="Foto de ${player.name}">`
    : `<div class="avatar-fallback">${initials(player.name)}</div>`;

  const habitIds = Object.keys(summary.perHabit);
  let habitRowsHtml = '<div class="hint-text">Sin hábitos asignados esta semana.</div>';
  if (habitIds.length > 0) {
    habitRowsHtml = habitIds.map(id => {
      const h = summary.perHabit[id];
      return `<div class="profile-habit-row"><span>${h.emoji} ${h.label}</span><span>${h.done}/${h.assigned}</span></div>`;
    }).join('');
  }

  box.innerHTML = `
    <div class="profile-head">
      <div class="avatar-wrap" id="avatarWrap">${avatarHtml}<div class="avatar-edit-hint">Cambiar</div></div>
      <div>
        <div class="profile-name">${player.name}</div>
        <div class="hint-text">Semana del ${summary.weekStartLabel} al ${summary.weekEndLabel}</div>
      </div>
    </div>
    <div class="profile-week-pct">
      <div class="big">${summary.pct === null ? '–' : summary.pct + '%'}</div>
      <div class="hint-text">cumplimiento esta semana</div>
    </div>
    <div class="profile-habit-list">${habitRowsHtml}</div>
    <input type="file" id="avatarInput" accept="image/*" style="display:none">
    <p class="hint-text" id="avatarError"></p>
  `;

  document.getElementById('avatarWrap').onclick = () => {
    document.getElementById('avatarInput').click();
  };
  document.getElementById('avatarInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (file) await uploadAvatarForPlayer(player, file, document.getElementById('avatarError'));
  };
}

async function uploadAvatarForPlayer(player, file, errorEl) {
  if (errorEl) errorEl.textContent = 'Subiendo foto...';
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${player.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file);
  if (uploadError) {
    if (errorEl) errorEl.textContent = 'No se pudo subir la foto. Inténtalo de nuevo.';
    return;
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const { error: dbError } = await supabase.from('players').update({ avatar_url: data.publicUrl }).eq('id', player.id);
  if (dbError) {
    if (errorEl) errorEl.textContent = 'La foto se subió pero no se pudo guardar. Inténtalo de nuevo.';
    return;
  }
  await refreshAndRender();
}

function renderPlayerToday(player) {
  renderProfileCard(player);
  const today = todayKey();
  document.getElementById('todayDateLabel').textContent = formatDateLabel(today);

  const myHabits = habitsForOnDate(player, today);
  const rec = (state.records[today] && state.records[today][player.id]) || {};
  const habitList = document.getElementById('habitList');
  habitList.innerHTML = '';

  if (myHabits.length === 0) {
    habitList.innerHTML = '<div class="empty-state">Tu entrenador no te ha asignado hábitos para hoy.</div>';
  } else {
    myHabits.forEach(h => {
      const checked = !!rec[h.id];
      const card = document.createElement('div');
      card.className = 'habit-card' + (checked ? ' checked' : '');
      const timeHtml = h.timeOfDay ? `<span style="display:block;font-size:0.75rem;color:var(--text-dim);font-weight:400;">${h.timeOfDay.slice(0, 5)}</span>` : '';
      card.innerHTML = `
        <span class="emoji">${h.emoji}</span>
        <span class="label">${h.label}${timeHtml}</span>
        <span class="check-mark">${checked ? '✓' : ''}</span>
      `;
      card.onclick = async () => {
        if (checked) {
          await supabase.from('checks').delete().match({ player_id: player.id, date: today, habit_id: h.id });
        } else {
          await supabase.from('checks').insert({ player_id: player.id, date: today, habit_id: h.id });
        }
        await refreshAndRender();
      };
      habitList.appendChild(card);
    });
  }

  const total = myHabits.length;
  const done = myHabits.filter(h => rec[h.id]).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('todayPct').textContent = total ? pct + '%' : '–';
  document.getElementById('todayBarFill').style.width = pct + '%';

  renderWeightCard(player);
  renderFastingCard(player);
  renderWeekStrip(player);
  renderNotifyBox(player);
}

/* ---------- PUSH NOTIFICATIONS ---------- */

async function getExistingPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const registration = await navigator.serviceWorker.register('sw.js');
  return registration.pushManager.getSubscription();
}

async function renderNotifyBox(player) {
  const box = document.getElementById('notifyBox');
  if (!box) return;

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    box.innerHTML = '<p class="hint-text">Este navegador no admite notificaciones.</p>';
    return;
  }
  if (Notification.permission === 'denied') {
    box.innerHTML = '<p class="hint-text">Has bloqueado las notificaciones para esta app. Actívalas desde los ajustes del navegador.</p>';
    return;
  }

  const sub = await getExistingPushSubscription();
  box.innerHTML = `
    <p class="hint-text">Recibe un aviso cuando se acerque la hora de un hábito activado por tu entrenador.</p>
    <button class="${sub ? 'ghost' : 'primary'}" id="notifyToggleBtn">${sub ? 'Desactivar notificaciones' : 'Activar notificaciones'}</button>
    <p class="hint-text" id="notifyError"></p>
  `;
  document.getElementById('notifyToggleBtn').onclick = () => sub ? disablePush(player, sub) : enablePush(player);
}

async function enablePush(player) {
  const errorEl = document.getElementById('notifyError');
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (errorEl) errorEl.textContent = 'No has dado permiso para las notificaciones.';
      return;
    }
    const registration = await navigator.serviceWorker.register('sw.js');
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const json = subscription.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert({
      player_id: player.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }, { onConflict: 'endpoint' });
    if (error) {
      if (errorEl) errorEl.textContent = 'No se pudo activar. Inténtalo de nuevo.';
      return;
    }
    await renderNotifyBox(player);
  } catch (e) {
    if (errorEl) errorEl.textContent = 'No se pudo activar. Inténtalo de nuevo.';
  }
}

async function disablePush(player, subscription) {
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
  await renderNotifyBox(player);
}

function getPreviousWeightEntry(player, beforeDate) {
  const dates = Object.keys(player.weightLog).filter(d => d < beforeDate).sort();
  if (dates.length === 0) return null;
  const date = dates[dates.length - 1];
  return { date, kg: player.weightLog[date] };
}

function renderWeightCard(player) {
  const today = todayKey();
  const box = document.getElementById('weightBox');
  const current = player.weightLog[today];
  const previous = getPreviousWeightEntry(player, today);

  let trendHtml = '';
  if (previous) {
    if (current !== undefined) {
      const diff = Math.round((current - previous.kg) * 10) / 10;
      const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      const sign = diff > 0 ? '+' : '';
      trendHtml = `<p class="weight-trend ${cls}">${sign}${diff}kg desde el ${formatDateLabel(previous.date)} (${previous.kg}kg)</p>`;
    } else {
      trendHtml = `<p class="hint-text">Último peso registrado: ${previous.kg}kg (${formatDateLabel(previous.date)})</p>`;
    }
  }

  box.innerHTML = `
    <div class="add-player-row">
      <input type="number" id="weightInput" step="0.1" min="0" placeholder="kg" value="${current !== undefined ? current : ''}">
      <button class="primary" id="saveWeightBtn">${current !== undefined ? 'Actualizar' : 'Guardar'}</button>
    </div>
    <p class="hint-text" id="weightError"></p>
    ${trendHtml}
  `;

  document.getElementById('saveWeightBtn').onclick = async () => {
    const input = document.getElementById('weightInput');
    const value = parseFloat(input.value.replace(',', '.'));
    const errorEl = document.getElementById('weightError');
    if (isNaN(value) || value <= 0) {
      errorEl.textContent = 'Introduce un peso válido.';
      return;
    }
    const kg = Math.round(value * 10) / 10;
    const { error } = await supabase.from('weights').upsert(
      { player_id: player.id, date: today, kg },
      { onConflict: 'player_id,date' }
    );
    if (error) { errorEl.textContent = 'No se pudo guardar. Inténtalo de nuevo.'; return; }
    await refreshAndRender();
  };
}

function renderFastingCard(player) {
  clearFastingInterval();
  const box = document.getElementById('fastingBox');
  const f = player.fasting;

  if (f.activeStart) {
    box.innerHTML = `
      <div class="fasting-active">
        <div class="fasting-elapsed" id="fastingElapsed">00:00:00</div>
        <div class="hint-text">Objetivo: ${f.goalHours}h</div>
        <div class="progress-bar-track"><div class="progress-bar-fill" id="fastingBarFill" style="width:0%"></div></div>
        <button class="primary" id="endFastBtn">Terminar ayuno</button>
      </div>
    `;
    document.getElementById('endFastBtn').onclick = () => endFast(player);

    const tick = () => {
      const elapsedMs = Date.now() - new Date(f.activeStart).getTime();
      const elapsedEl = document.getElementById('fastingElapsed');
      const barEl = document.getElementById('fastingBarFill');
      if (!elapsedEl || !barEl) return; // screen changed, stop touching stale DOM
      elapsedEl.textContent = formatDuration(elapsedMs);
      const pct = Math.min(100, (elapsedMs / (f.goalHours * 3600000)) * 100);
      barEl.style.width = pct + '%';
      elapsedEl.classList.toggle('goal-reached', pct >= 100);
    };
    tick();
    fastingIntervalId = setInterval(tick, 1000);
  } else {
    const last = f.history[f.history.length - 1];
    box.innerHTML = `
      ${last ? `<p class="fasting-last">Último ayuno: ${last.hours}h (${formatDateLabel(last.date)})</p>` : ''}
      <div class="add-player-row">
        <select id="fastingGoalSelect">
          <option value="12">Objetivo: 12h</option>
          <option value="14">Objetivo: 14h</option>
          <option value="16" selected>Objetivo: 16h</option>
          <option value="18">Objetivo: 18h</option>
          <option value="20">Objetivo: 20h</option>
          <option value="24">Objetivo: 24h</option>
        </select>
        <button class="primary" id="startFastBtn">Empezar ayuno</button>
      </div>
    `;
    document.getElementById('startFastBtn').onclick = () => {
      const goal = parseInt(document.getElementById('fastingGoalSelect').value, 10);
      startFast(player, goal);
    };
  }
}

async function startFast(player, goalHours) {
  await supabase.from('fasting_sessions').upsert(
    { player_id: player.id, active_start: new Date().toISOString(), goal_hours: goalHours },
    { onConflict: 'player_id' }
  );
  await refreshAndRender();
}

async function endFast(player) {
  const f = player.fasting;
  const hours = Math.round(((Date.now() - new Date(f.activeStart).getTime()) / 3600000) * 10) / 10;
  await supabase.from('fasting_history').insert({ player_id: player.id, date: todayKey(), hours });
  await supabase.from('fasting_sessions').update({ active_start: null }).eq('player_id', player.id);
  await refreshAndRender();
}

function renderWeekStrip(player) {
  const strip = document.getElementById('weekStrip');
  strip.innerHTML = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    const myHabits = habitsForOnDate(player, key);
    const total = myHabits.length;
    const rec = (state.records[key] && state.records[key][player.id]) || {};
    const done = myHabits.filter(h => rec[h.id]).length;
    const pct = total ? Math.round((done / total) * 100) : null;
    const cell = document.createElement('div');
    cell.className = 'week-day' + (i === 0 ? ' today' : '');
    const label = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
    const tier = pctTierClass(pct);
    cell.innerHTML = `${label}<span class="pct ${tier} mono">${pct === null ? '–' : pct + '%'}</span>`;
    strip.appendChild(cell);
  }
}

/* ---------- COACH ---------- */

function renderCoach() {
  const contentEl = document.getElementById('content');
  const scrollY = contentEl.scrollTop;
  const picker = document.getElementById('coachDatePicker');
  if (!picker.value) picker.value = todayKey();
  const date = picker.value;

  document.getElementById('coachEmailLabel').textContent = state.session.email || '—';

  let teamDoneSum = 0;
  let teamPossible = 0;

  const wrap = document.getElementById('dashTableWrap');

  if (state.players.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Todavía no hay jugadores añadidos.</div>';
    document.getElementById('teamPct').textContent = '—';
  } else {
    let html = '<table class="dash"><thead><tr><th style="text-align:left">Jugador</th><th>Asignados</th><th>Hoy</th><th>%</th><th>Peso</th></tr></thead><tbody>';

    state.players.forEach(p => {
      const myHabits = habitsForOnDate(p, date);
      const rec = (state.records[date] && state.records[date][p.id]) || {};
      const done = myHabits.filter(h => rec[h.id]).length;
      const total = myHabits.length;
      const pct = total ? Math.round((done / total) * 100) : null;
      if (total > 0) {
        teamDoneSum += done;
        teamPossible += total;
      }
      const weight = p.weightLog[date];
      html += `<tr class="row-clickable" data-player="${p.id}"><td class="name-cell">${avatarThumbHtml(p)}${p.name}</td><td>${total}</td><td class="total-cell">${done}/${total}</td><td>${pct === null ? '–' : pct + '%'}</td><td>${weight !== undefined ? weight + 'kg' : '–'}</td></tr>`;
    });

    html += '</tbody></table>';
    wrap.innerHTML = html;

    wrap.querySelectorAll('tr[data-player]').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-player');
        selectedDetailPlayer = selectedDetailPlayer === id ? null : id;
        renderPlayerDetail(date);
      });
    });

    const teamPct = teamPossible ? Math.round((teamDoneSum / teamPossible) * 100) : 0;
    document.getElementById('teamPct').textContent = teamPossible ? teamPct + '%' : '—';
  }

  renderPlayerDetail(date);
  renderAdminHabits();
  renderAdminPlayers();

  contentEl.scrollTop = scrollY;
}

function renderPlayerDetail(date) {
  const panel = document.getElementById('playerDetailPanel');
  if (!selectedDetailPlayer || !getPlayerById(selectedDetailPlayer)) {
    panel.innerHTML = '';
    return;
  }
  const player = getPlayerById(selectedDetailPlayer);
  const myHabits = habitsForOnDate(player, date);
  const rec = (state.records[date] && state.records[date][player.id]) || {};

  let html = `<div class="detail-panel"><div class="detail-head"><strong>${avatarThumbHtml(player)}${player.name} — ${formatDateLabel(date)}</strong><button class="pill-link" id="closeDetailBtn">Cerrar</button></div>`;
  if (myHabits.length === 0) {
    html += '<div class="empty-state">Este jugador no tiene hábitos asignados este día.</div>';
  } else {
    myHabits.forEach(h => {
      const done = !!rec[h.id];
      html += `<div class="detail-habit-row"><span>${h.emoji}</span><span class="flex1">${h.label}</span><span class="${done ? 'cell-ok' : 'cell-no'}">${done ? '✓' : '–'}</span></div>`;
    });
  }
  const fastingLines = [];
  if (player.fasting.activeStart && date === todayKey()) {
    const elapsedH = ((Date.now() - new Date(player.fasting.activeStart).getTime()) / 3600000).toFixed(1);
    fastingLines.push(`🕐 Ayuno en curso: ${elapsedH}h (objetivo ${player.fasting.goalHours}h)`);
  }
  const histEntry = player.fasting.history.find(h => h.date === date);
  if (histEntry) fastingLines.push(`✅ Ayuno completado ese día: ${histEntry.hours}h`);
  if (player.weightLog[date] !== undefined) {
    fastingLines.push(`⚖️ Peso: ${player.weightLog[date]}kg`);
  }
  if (fastingLines.length > 0) {
    html += `<div class="hint-text" style="margin-top:10px">${fastingLines.join('<br>')}</div>`;
  }

  html += '</div>';
  panel.innerHTML = html;
  document.getElementById('closeDetailBtn').addEventListener('click', () => {
    selectedDetailPlayer = null;
    renderPlayerDetail(date);
  });
}

function renderAdminPlayers() {
  const box = document.getElementById('adminPlayerList');
  box.innerHTML = '';
  if (state.players.length === 0) {
    box.innerHTML = '<div style="color:var(--text-dim); font-size:0.85rem;">Sin jugadores todavía.</div>';
    return;
  }
  state.players.forEach(p => {
    if (!adminSelectedDay[p.id]) {
      adminSelectedDay[p.id] = weekdayKeyForDateStr(todayKey());
    }
    const activeDay = adminSelectedDay[p.id];
    const assignedIds = p.habitsByDay[activeDay] || [];

    const card = document.createElement('div');
    card.className = 'player-admin-card';

    const head = document.createElement('div');
    head.className = 'player-admin-head';
    const dayLabel = WEEKDAYS.find(d => d.key === activeDay).label;

    const infoSpan = document.createElement('span');
    infoSpan.className = 'flex1';
    const nameDiv = document.createElement('div');
    const avatarBtn = document.createElement('span');
    avatarBtn.innerHTML = avatarThumbHtml(p);
    avatarBtn.style.cursor = 'pointer';
    avatarBtn.title = 'Cambiar foto';
    const avatarFileInput = document.createElement('input');
    avatarFileInput.type = 'file';
    avatarFileInput.accept = 'image/*';
    avatarFileInput.style.display = 'none';
    const avatarErr = document.createElement('div');
    avatarErr.className = 'hint-text';
    avatarBtn.onclick = () => avatarFileInput.click();
    avatarFileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) await uploadAvatarForPlayer(p, file, avatarErr);
    };
    nameDiv.appendChild(avatarBtn);
    nameDiv.appendChild(document.createTextNode(p.name));
    nameDiv.appendChild(avatarFileInput);
    infoSpan.appendChild(nameDiv);
    infoSpan.appendChild(avatarErr);

    if (editingPlayerEmail === p.id) {
      const editRow = document.createElement('div');
      editRow.className = 'inline-edit-row';
      const emailInput = document.createElement('input');
      emailInput.type = 'email';
      emailInput.value = p.email || '';
      emailInput.placeholder = 'email@ejemplo.com';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'primary';
      saveBtn.textContent = 'Guardar';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'ghost';
      cancelBtn.textContent = 'Cancelar';
      saveBtn.onclick = async () => {
        const norm = normalizeEmail(emailInput.value);
        if (!norm) {
          playerEmailEditError = 'Introduce un email.';
          renderCoach();
          return;
        }
        const { error } = await supabase.from('players').update({ email: norm }).eq('id', p.id);
        if (error) {
          playerEmailEditError = error.code === '23505' ? 'Ese email ya está en uso.' : 'No se pudo actualizar.';
          renderCoach();
          return;
        }
        editingPlayerEmail = null;
        playerEmailEditError = '';
        await refreshAndRender();
      };
      cancelBtn.onclick = () => {
        editingPlayerEmail = null;
        playerEmailEditError = '';
        renderCoach();
      };
      editRow.appendChild(emailInput);
      editRow.appendChild(saveBtn);
      editRow.appendChild(cancelBtn);
      infoSpan.appendChild(editRow);
      if (playerEmailEditError) {
        const errDiv = document.createElement('div');
        errDiv.className = 'hint-text';
        errDiv.textContent = playerEmailEditError;
        infoSpan.appendChild(errDiv);
      }
    } else {
      const emailDiv = document.createElement('div');
      emailDiv.className = 'player-email';
      if (p.authId) {
        emailDiv.innerHTML = `${p.email} · <span style="color:var(--gold)">✅ cuenta activa</span>`;
      } else {
        emailDiv.textContent = `${p.email} · aún no se ha registrado`;
      }
      infoSpan.appendChild(emailDiv);
    }
    head.appendChild(infoSpan);

    if (editingPlayerEmail !== p.id) {
      const countSpan = document.createElement('span');
      countSpan.className = 'assigned-count';
      countSpan.textContent = `${assignedIds.length}/${state.habits.length} · ${dayLabel}`;
      head.appendChild(countSpan);

      if (!p.authId) {
        const editEmailBtn = document.createElement('button');
        editEmailBtn.className = 'ghost';
        editEmailBtn.textContent = 'Editar email';
        editEmailBtn.onclick = () => {
          editingPlayerEmail = p.id;
          playerEmailEditError = '';
          renderCoach();
        };
        head.appendChild(editEmailBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.textContent = 'Eliminar';
      delBtn.onclick = async () => {
        await supabase.from('players').delete().eq('id', p.id);
        if (selectedDetailPlayer === p.id) selectedDetailPlayer = null;
        await refreshAndRender();
      };
      head.appendChild(delBtn);
    }
    card.appendChild(head);

    const dayTabs = document.createElement('div');
    dayTabs.className = 'day-tabs';
    WEEKDAYS.forEach(d => {
      const tab = document.createElement('div');
      tab.className = 'day-tab' + (d.key === activeDay ? ' active' : '');
      tab.textContent = d.short;
      tab.title = d.label;
      tab.onclick = () => {
        adminSelectedDay[p.id] = d.key;
        renderCoach();
      };
      dayTabs.appendChild(tab);
    });
    card.appendChild(dayTabs);

    const chips = document.createElement('div');
    chips.className = 'assign-chips';
    if (state.habits.length === 0) {
      chips.innerHTML = '<span class="assign-chips-empty">Añade hábitos a la batería primero.</span>';
    } else {
      state.habits.forEach(h => {
        const assigned = assignedIds.includes(h.id);
        const chip = document.createElement('div');
        chip.className = 'assign-chip' + (assigned ? ' assigned' : '');
        chip.innerHTML = `<span>${h.emoji}</span><span>${h.label}</span>`;
        chip.onclick = async () => {
          if (assigned) {
            await supabase.from('assignments').delete().match({ player_id: p.id, weekday: activeDay, habit_id: h.id });
          } else {
            await supabase.from('assignments').insert({ player_id: p.id, weekday: activeDay, habit_id: h.id });
          }
          await refreshAndRender();
        };
        chips.appendChild(chip);
      });
    }
    card.appendChild(chips);

    const copyRow = document.createElement('div');
    copyRow.className = 'copy-row';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ghost';
    copyBtn.textContent = `Copiar ${dayLabel} a toda la semana`;
    copyBtn.onclick = async () => {
      const sourceIds = p.habitsByDay[activeDay].slice();
      await supabase.from('assignments').delete().eq('player_id', p.id);
      if (sourceIds.length > 0) {
        const rows = [];
        WEEKDAYS.forEach(d => { sourceIds.forEach(habitId => rows.push({ player_id: p.id, weekday: d.key, habit_id: habitId })); });
        await supabase.from('assignments').insert(rows);
      }
      await refreshAndRender();
    };
    copyRow.appendChild(copyBtn);
    card.appendChild(copyRow);

    box.appendChild(card);
  });
}

async function addAdminPlayer() {
  const nameInput = document.getElementById('adminNewPlayerInput');
  const emailInput = document.getElementById('adminNewPlayerEmailInput');
  const errorEl = document.getElementById('adminAddPlayerError');
  const name = nameInput.value.trim();
  const email = normalizeEmail(emailInput.value);
  errorEl.textContent = '';
  if (!name || !email) {
    errorEl.textContent = 'Nombre y email son obligatorios.';
    return;
  }
  const { error } = await supabase.from('players').insert({ name, email });
  if (error) {
    errorEl.textContent = error.code === '23505' ? 'Ese email ya está en uso.' : 'No se pudo añadir el jugador.';
    return;
  }
  nameInput.value = '';
  emailInput.value = '';
  await refreshAndRender();
}

function renderAdminHabits() {
  const box = document.getElementById('adminHabitList');
  box.innerHTML = '';
  if (state.habits.length === 0) {
    box.innerHTML = '<div style="color:var(--text-dim); font-size:0.85rem;">Sin hábitos en la batería todavía.</div>';
    return;
  }
  state.habits.forEach(h => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `<span>${h.emoji}</span><span class="flex1">${h.label}</span>`;

    const controls = document.createElement('div');
    controls.className = 'admin-row-controls';

    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.value = h.timeOfDay ? h.timeOfDay.slice(0, 5) : '';
    timeInput.style.flex = '0 0 110px';
    timeInput.onchange = async () => {
      const time_of_day = timeInput.value || null;
      const updates = { time_of_day };
      if (!time_of_day && h.notifyEnabled) updates.notify_enabled = false;
      await supabase.from('habits').update(updates).eq('id', h.id);
      await refreshAndRender();
    };
    controls.appendChild(timeInput);

    const notifyBtn = document.createElement('button');
    notifyBtn.className = h.notifyEnabled ? 'primary' : 'ghost';
    notifyBtn.textContent = h.notifyEnabled ? '🔔' : '🔕';
    notifyBtn.title = h.timeOfDay ? (h.notifyEnabled ? 'Aviso activado' : 'Activar aviso') : 'Pon una hora primero';
    notifyBtn.disabled = !h.timeOfDay;
    notifyBtn.onclick = async () => {
      await supabase.from('habits').update({ notify_enabled: !h.notifyEnabled }).eq('id', h.id);
      await refreshAndRender();
    };
    controls.appendChild(notifyBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = 'Eliminar';
    delBtn.onclick = async () => {
      await supabase.from('habits').delete().eq('id', h.id);
      await refreshAndRender();
    };
    controls.appendChild(delBtn);

    row.appendChild(controls);
    box.appendChild(row);
  });
}

async function addAdminHabit() {
  const emojiInput = document.getElementById('adminNewHabitEmoji');
  const labelInput = document.getElementById('adminNewHabitLabel');
  const timeInput = document.getElementById('adminNewHabitTime');
  const emoji = emojiInput.value.trim() || '✅';
  const label = labelInput.value.trim();
  if (!label) return;
  await supabase.from('habits').insert({ emoji, label, sort_order: state.habits.length + 1, time_of_day: timeInput.value || null });
  emojiInput.value = '';
  labelInput.value = '';
  timeInput.value = '';
  await refreshAndRender();
}

/* ---------- EVENTS ---------- */

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentAuthMode = tab.dataset.mode;
    document.getElementById('authSubmitBtn').textContent = currentAuthMode === 'signup' ? 'Crear cuenta' : 'Entrar';
    document.getElementById('authHint').textContent = currentAuthMode === 'signup'
      ? 'Crea tu contraseña (mínimo 6 caracteres). Tu entrenador debe haberte añadido antes con este email.'
      : 'Entra con tu email y contraseña.';
    document.getElementById('loginMessage').textContent = '';
  });
});

document.getElementById('authSubmitBtn').addEventListener('click', handleAuthSubmit);
document.getElementById('authPasswordInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleAuthSubmit();
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  clearFastingInterval();
  await supabase.auth.signOut();
  state.session = null;
  render();
});

document.getElementById('coachDatePicker').addEventListener('change', () => {
  selectedDetailPlayer = null;
  renderCoach();
});

document.getElementById('adminAddPlayerBtn').addEventListener('click', addAdminPlayer);
document.getElementById('adminNewPlayerEmailInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') addAdminPlayer();
});

document.getElementById('adminAddHabitBtn').addEventListener('click', addAdminHabit);
document.getElementById('adminNewHabitLabel').addEventListener('keydown', e => {
  if (e.key === 'Enter') addAdminHabit();
});

document.getElementById('bootstrapYesBtn').addEventListener('click', confirmBootstrapCoach);
document.getElementById('bootstrapNoBtn').addEventListener('click', cancelBootstrapCoach);

document.getElementById('bottomnavPlayer').addEventListener('click', e => {
  const btn = e.target.closest('.nav-item');
  if (!btn) return;
  currentPlayerTab = btn.dataset.tab;
  document.getElementById('content').scrollTop = 0;
  render();
});

document.getElementById('bottomnavCoach').addEventListener('click', e => {
  const btn = e.target.closest('.nav-item');
  if (!btn) return;
  currentCoachTab = btn.dataset.tab;
  document.getElementById('content').scrollTop = 0;
  render();
});

function setupRealtimeSubscriptions() {
  const tables = ['habits', 'players', 'assignments', 'checks', 'weights', 'fasting_sessions', 'fasting_history', 'settings'];
  let channel = supabase.channel('app-changes');
  tables.forEach(table => {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      if (state.session) refreshAndRender();
    });
  });
  channel.subscribe();
}

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await resolveSessionAndRender();
  } else {
    render();
  }
  setupRealtimeSubscriptions();
}

init();
