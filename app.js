import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://cqjuqlrjidzulefeupqy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxanVxbHJqaWR6dWxlZmV1cHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0OTcxMTQsImV4cCI6MjEwMjA3MzExNH0.QxXV-PLREwxc2rJKs5TSNR81-u5I8o_AnSaHxz7ZaJE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isPasswordRecovery = false;
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    isPasswordRecovery = true;
    render();
  }
});

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

function formatTimeLabel(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDatetimeLocalValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateDaysBefore(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - days);
  return todayKey(d);
}

function weekdayLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' });
}

function weekdayShortLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
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
let selectedWeekDate = null; // date string, player's own Semana tab
let editingPlayerEmail = null; // player id
let editingHabitId = null; // habit id, Hábitos tab
let selectedPlayerId = null; // player id, Jugadores tab (ficha abierta)
let currentPlayerDetailSubtab = 'resumen'; // 'resumen' | 'habitos' | 'ayuno' | 'nutricion' | 'cuenta'
let addingNewPlayer = false; // Jugadores tab, formulario "Nuevo jugador"
let playerEmailEditError = '';
let fastingIntervalId = null;
let editingFastingStart = false; // player's own Hoy tab
let confirmingFastingEnd = false; // player's own Hoy tab
let currentAuthMode = 'signin';
let currentPlayerTab = 'hoy'; // 'hoy' | 'semana' | 'perfil'
let currentCoachTab = 'resumen'; // 'resumen' | 'habitos' | 'jugadores' | 'ajustes'

const PLAYER_TAB_TITLES = { hoy: 'HOY', semana: 'SEMANA', tips: 'TIPS', perfil: 'PERFIL' };
const COACH_TAB_TITLES = { resumen: 'RESUMEN', habitos: 'HÁBITOS', jugadores: 'JUGADORES', ajustes: 'AJUSTES' };

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

async function loadAllData(retried = false) {
  // Si el móvil ha pasado mucho rato en segundo plano (toda la noche, por
  // ejemplo), el token de sesión puede haber caducado sin refrescarse a
  // tiempo. getSession() lo detecta y lo refresca antes de consultar; si
  // aun así alguna consulta falla por eso, se reintenta una vez tras forzar
  // el refresco. Sin esto, las consultas fallaban en silencio (data=null,
  // el error no se comprobaba) y la app parecía "resetearse" -- por
  // ejemplo, un ayuno en curso desaparecía y volvía a mostrar "Empezar
  // ayuno" aunque en la base de datos siguiera activo.
  await supabase.auth.getSession();

  const results = await Promise.all([
    supabase.from('habits').select('*').order('sort_order'),
    supabase.from('players').select('*').order('name'),
    supabase.from('assignments').select('*'),
    supabase.from('checks').select('*'),
    supabase.from('weights').select('*'),
    supabase.from('fasting_sessions').select('*'),
    supabase.from('fasting_history').select('*'),
    supabase.from('settings').select('*'),
    supabase.from('daily_checkins').select('*'),
    supabase.from('player_habit_settings').select('*'),
    supabase.from('player_nutrition_tips').select('*'),
  ]);

  const authError = results.find(r => r.error && /jwt|token|auth/i.test(r.error.message || ''));
  if (authError && !retried) {
    await supabase.auth.refreshSession();
    return loadAllData(true);
  }
  results.forEach(r => { if (r.error) console.warn('[loadAllData] fallo en una consulta:', r.error.message); });

  const [
    { data: habits },
    { data: players },
    { data: assignments },
    { data: checks },
    { data: weights },
    { data: fastingSessions },
    { data: fastingHistory },
    { data: settingsRows },
    { data: checkins },
    { data: habitSettings },
    { data: nutritionTips },
  ] = results;

  state.habits = (habits || []).map(h => ({ id: h.id, emoji: h.emoji, label: h.label, sortOrder: h.sort_order }));
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

  const checkinsByPlayer = {};
  (checkins || []).forEach(c => {
    if (!checkinsByPlayer[c.player_id]) checkinsByPlayer[c.player_id] = {};
    checkinsByPlayer[c.player_id][c.date] = { sleep: c.sleep, energy: c.energy };
  });

  const habitSettingsByPlayer = {};
  (habitSettings || []).forEach(s => {
    if (!habitSettingsByPlayer[s.player_id]) habitSettingsByPlayer[s.player_id] = {};
    habitSettingsByPlayer[s.player_id][s.habit_id] = { timeOfDay: s.time_of_day, notifyEnabled: s.notify_enabled };
  });

  const nutritionTipsByPlayer = {};
  (nutritionTips || []).forEach(t => {
    if (!nutritionTipsByPlayer[t.player_id]) nutritionTipsByPlayer[t.player_id] = {};
    nutritionTipsByPlayer[t.player_id][t.category] = t.tip;
  });

  state.players = (players || []).map(p => ({
    id: p.id,
    authId: p.auth_id,
    name: p.name,
    email: p.email,
    avatarUrl: p.avatar_url || null,
    habitsByDay: assignmentsByPlayer[p.id] || emptyWeekMap(),
    habitSettings: habitSettingsByPlayer[p.id] || {},
    nutritionTips: nutritionTipsByPlayer[p.id] || {},
    weightLog: weightsByPlayer[p.id] || {},
    wellness: checkinsByPlayer[p.id] || {},
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
    state.records[c.date][c.player_id][c.habit_id] = c.done;
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
  return ids.map(id => {
    const h = state.habits.find(hh => hh.id === id);
    if (!h) return null;
    const settings = player.habitSettings[id] || {};
    return { ...h, timeOfDay: settings.timeOfDay || null, notifyEnabled: !!settings.notifyEnabled };
  }).filter(Boolean);
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
    totalAssigned,
    totalDone,
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
  if (isPasswordRecovery) {
    showScreen('screen-login');
    document.getElementById('logoutBtn').style.display = 'none';
    document.getElementById('bottomnavPlayer').style.display = 'none';
    document.getElementById('bottomnavCoach').style.display = 'none';
    document.getElementById('loginFormBox').style.display = 'none';
    document.getElementById('bootstrapBox').style.display = 'none';
    document.getElementById('recoveryBox').style.display = 'block';
    document.getElementById('topbarTitle').textContent = 'HÁBITOS';
    document.getElementById('topbarSubtitle').textContent = 'Nueva contraseña';
    return;
  }

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

const REMEMBERED_EMAIL_KEY = 'habitosRememberedEmail';

function prefillRememberedEmail() {
  const saved = localStorage.getItem(REMEMBERED_EMAIL_KEY);
  if (saved) document.getElementById('authEmailInput').value = saved;
}

function clearAuthInputs() {
  prefillRememberedEmail();
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
    localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
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

  document.getElementById('weightChartCard').innerHTML = weightChartHtml(player);
  document.getElementById('fastingChartCard').innerHTML = fastingChartHtml(player);
}

function nutritionTipsHtml(player) {
  return NUTRITION_CATEGORIES.map(cat => {
    const tip = player.nutritionTips[cat.key];
    const textHtml = tip
      ? `<span style="color:var(--ink-soft); font-size:0.88rem;">${tip.replace(/</g, '&lt;')}</span>`
      : `<span style="color:var(--ink-soft); font-size:0.88rem; font-style:italic;">Sin tip todavía.</span>`;
    return `
      <div class="profile-habit-row" style="flex-direction:column; align-items:flex-start; gap:4px;">
        <span style="font-weight:700;">${cat.emoji} ${cat.label}</span>
        ${textHtml}
      </div>
    `;
  }).join('');
}

function resizeImageToJpeg(file, maxSize = 640, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > maxSize) { height = Math.round(height * (maxSize / width)); width = maxSize; }
      } else if (height > maxSize) {
        width = Math.round(width * (maxSize / height)); height = maxSize;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (blob) resolve(blob); else reject(new Error('No se pudo procesar la imagen.'));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Formato de imagen no compatible.')); };
    img.src = url;
  });
}

async function uploadAvatarForPlayer(player, file, errorEl) {
  if (errorEl) errorEl.textContent = 'Subiendo foto...';

  let blob;
  try {
    blob = await resizeImageToJpeg(file);
  } catch (e) {
    if (errorEl) errorEl.textContent = 'No se pudo leer esa foto. Prueba a hacer una captura de pantalla de ella y sube esa imagen.';
    return;
  }

  const path = `${player.id}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage.from('avatars')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) {
    if (errorEl) errorEl.textContent = 'No se pudo subir la foto: ' + (uploadError.message || 'inténtalo de nuevo.');
    return;
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const { error: dbError } = await supabase.from('players').update({ avatar_url: data.publicUrl }).eq('id', player.id);
  if (dbError) {
    if (errorEl) errorEl.textContent = 'La foto se subió pero no se pudo guardar: ' + (dbError.message || '');
    return;
  }
  await refreshAndRender();
}

function renderPlayerToday(player) {
  renderProfileCard(player);
  document.getElementById('nutritionTipsCard').innerHTML = nutritionTipsHtml(player);
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
      const answer = rec[h.id]; // true = hecho, false = no hecho, undefined = sin responder
      const card = document.createElement('div');
      card.className = 'habit-card' + (answer === true ? ' checked' : answer === false ? ' declined' : '');
      const timeHtml = h.timeOfDay ? `<span style="display:block;font-size:0.75rem;color:var(--text-dim);font-weight:400;">${h.timeOfDay.slice(0, 5)}</span>` : '';
      card.innerHTML = `
        <span class="emoji">${h.emoji}</span>
        <span class="label">${h.label}${timeHtml}</span>
        <div class="habit-answer">
          <button class="answer-btn yes${answer === true ? ' active' : ''}" title="Lo he hecho">✓</button>
          <button class="answer-btn no${answer === false ? ' active' : ''}" title="No lo he hecho">✗</button>
        </div>
      `;
      const setAnswer = async done => {
        await supabase.from('checks').upsert(
          { player_id: player.id, date: today, habit_id: h.id, done },
          { onConflict: 'player_id,date,habit_id' }
        );
        await refreshAndRender();
      };
      card.querySelector('.answer-btn.yes').onclick = () => setAnswer(true);
      card.querySelector('.answer-btn.no').onclick = () => setAnswer(false);
      habitList.appendChild(card);
    });
  }

  const total = myHabits.length;
  const done = myHabits.filter(h => rec[h.id]).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('todayPct').textContent = total ? pct + '%' : '–';
  document.getElementById('todayBarFill').style.width = pct + '%';

  renderWellnessCard(player);
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

function weightChartHtml(player, endDate = todayKey()) {
  const dates = [];
  for (let i = 6; i >= 0; i--) dates.push(dateDaysBefore(endDate, i));

  const points = dates.map(d => ({ date: d, kg: player.weightLog[d] }));
  const known = points.filter(p => p.kg !== undefined);
  if (known.length < 2) {
    return '<p class="hint-text" style="margin:0">Aún no hay suficientes registros de peso esta semana para la gráfica.</p>';
  }

  const kgs = known.map(p => p.kg);
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const pad = Math.max(0.4, (max - min) * 0.25);
  const yMin = min - pad;
  const yMax = max + pad;
  const w = 300, h = 100, padX = 14, padY = 20;
  const stepX = (w - padX * 2) / (points.length - 1);
  const scaleY = kg => padY + (h - padY * 2) - ((kg - yMin) / (yMax - yMin)) * (h - padY * 2);

  const coords = points.map((p, i) => p.kg !== undefined ? { x: padX + i * stepX, y: scaleY(p.kg), kg: p.kg } : null);

  let pathD = '';
  coords.forEach(c => { if (c) pathD += (pathD === '' ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1) + ' '; });

  const dots = coords.map(c => c ? `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="var(--navy)" />` : '').join('');
  const labels = coords.map(c => c ? `<text x="${c.x.toFixed(1)}" y="${(c.y - 9).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--ink-soft)">${c.kg}</text>` : '').join('');
  const dayLabels = dates.map(d => `<span>${weekdayShortLabel(d)}</span>`).join('');

  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block;">
      <path d="${pathD.trim()}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      ${dots}${labels}
    </svg>
    <div class="chart-day-labels">${dayLabels}</div>
  `;
}

function fastingChartHtml(player, endDate = todayKey()) {
  const dates = [];
  for (let i = 6; i >= 0; i--) dates.push(dateDaysBefore(endDate, i));
  const goal = player.fasting.goalHours || 16;

  const entries = dates.map(d => {
    const entry = player.fasting.history.find(h => h.date === d);
    return { date: d, hours: entry ? entry.hours : null };
  });
  const known = entries.filter(e => e.hours !== null);
  if (known.length === 0) {
    return '<p class="hint-text" style="margin:0">Aún no hay ayunos completados esta semana.</p>';
  }

  const maxHours = Math.max(goal, ...known.map(e => e.hours)) * 1.15;
  const w = 300, h = 100, padX = 14, padBottom = 20, padTop = 16;
  const barSlot = (w - padX * 2) / entries.length;
  const barWidth = barSlot * 0.5;
  const usableH = h - padTop - padBottom;

  let bars = '';
  entries.forEach((e, i) => {
    const cx = padX + i * barSlot + barSlot / 2;
    if (e.hours === null) {
      bars += `<rect x="${(cx - barWidth / 2).toFixed(1)}" y="${(h - padBottom - 3).toFixed(1)}" width="${barWidth.toFixed(1)}" height="3" rx="1.5" fill="var(--line)" />`;
      return;
    }
    const barH = Math.max(4, (e.hours / maxHours) * usableH);
    const y = h - padBottom - barH;
    const color = e.hours >= goal ? 'var(--win)' : 'var(--loss)';
    bars += `<rect x="${(cx - barWidth / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${color}" />`;
    bars += `<text x="${cx.toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--ink-soft)">${e.hours}h</text>`;
  });

  const dayLabels = dates.map(d => `<span>${weekdayShortLabel(d)}</span>`).join('');

  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block;">
      <line x1="${padX}" y1="${(h - padBottom).toFixed(1)}" x2="${(w - padX).toFixed(1)}" y2="${(h - padBottom).toFixed(1)}" stroke="var(--line)" stroke-width="1" />
      ${bars}
    </svg>
    <div class="chart-day-labels">${dayLabels}</div>
  `;
}

const SLEEP_OPTIONS = [
  { value: 1, emoji: '😣', label: 'Muy mal' },
  { value: 2, emoji: '🙁', label: 'Mal' },
  { value: 3, emoji: '😐', label: 'Regular' },
  { value: 4, emoji: '🙂', label: 'Bien' },
  { value: 5, emoji: '😄', label: 'Muy bien' },
];
const ENERGY_OPTIONS = [
  { value: 1, emoji: '🥱', label: 'Muy cansado' },
  { value: 2, emoji: '😪', label: 'Cansado' },
  { value: 3, emoji: '😐', label: 'Regular' },
  { value: 4, emoji: '🙂', label: 'Fresco' },
  { value: 5, emoji: '⚡', label: 'Muy fresco' },
];
const NUTRITION_CATEGORIES = [
  { key: 'desayuno', emoji: '🍳', label: 'Desayuno' },
  { key: 'pre_entreno', emoji: '⏱️', label: 'Pre entreno' },
  { key: 'post_entreno', emoji: '🥤', label: 'Post entreno' },
  { key: 'comida', emoji: '🍽️', label: 'Comida' },
  { key: 'merienda', emoji: '🍎', label: 'Merienda' },
  { key: 'cena', emoji: '🌙', label: 'Cena' },
];

function moodRowHtml(options, selected) {
  return options.map(o => `
    <button class="mood-btn${selected === o.value ? ' active' : ''}" data-value="${o.value}">
      <span class="mood-emoji">${o.emoji}</span>
      <span class="mood-label">${o.label}</span>
    </button>
  `).join('');
}

function renderWellnessCard(player) {
  const today = todayKey();
  const box = document.getElementById('wellnessBox');
  const entry = player.wellness[today] || {};

  box.innerHTML = `
    <p class="field-label" style="margin-bottom:8px">¿Qué tal has dormido hoy?</p>
    <div class="mood-row" id="sleepRow">${moodRowHtml(SLEEP_OPTIONS, entry.sleep)}</div>
    <p class="field-label" style="margin:16px 0 8px">¿Cómo te sientes hoy?</p>
    <div class="mood-row" id="energyRow">${moodRowHtml(ENERGY_OPTIONS, entry.energy)}</div>
  `;

  const setMood = async (field, value) => {
    await supabase.from('daily_checkins').upsert(
      { player_id: player.id, date: today, [field]: value },
      { onConflict: 'player_id,date' }
    );
    await refreshAndRender();
  };

  box.querySelectorAll('#sleepRow .mood-btn').forEach(btn => {
    btn.onclick = () => setMood('sleep', Number(btn.dataset.value));
  });
  box.querySelectorAll('#energyRow .mood-btn').forEach(btn => {
    btn.onclick = () => setMood('energy', Number(btn.dataset.value));
  });
}

function renderWeightCard(player) {
  const today = todayKey();
  const box = document.getElementById('weightBox');
  const current = player.weightLog[today];
  const previous = getPreviousWeightEntry(player, today);

  let trendHtml = '';
  if (current !== undefined) {
    const weekAgoDate = dateDaysBefore(today, 7);
    const weekAgoKg = player.weightLog[weekAgoDate];
    if (weekAgoKg !== undefined) {
      const diff = Math.round((current - weekAgoKg) * 10) / 10;
      const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      const sign = diff > 0 ? '+' : '';
      trendHtml = `<p class="weight-trend ${cls}">${sign}${diff}kg vs. el ${weekdayLabel(today)} pasado</p>`;
    }
  } else if (previous) {
    trendHtml = `<p class="hint-text">Último peso registrado: ${previous.kg}kg (${formatDateLabel(previous.date)})</p>`;
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
  const nowLocal = toDatetimeLocalValue(new Date());

  if (f.activeStart) {
    if (confirmingFastingEnd) {
      box.innerHTML = `
        <div class="fasting-active">
          <div class="hint-text">Objetivo: ${f.goalHours}h · Inicio: ${formatTimeLabel(new Date(f.activeStart))}</div>
          <div class="fasting-edit-row">
            <label class="field-label" style="margin:0">Hora en la que terminaste</label>
            <input type="datetime-local" id="fastingEndInput" value="${nowLocal}" max="${nowLocal}">
            <div class="field-row">
              <button class="primary" id="confirmEndFastBtn">Confirmar fin</button>
              <button class="ghost" id="cancelEndFastBtn">Cancelar</button>
            </div>
            <p class="hint-text" id="fastingEndError"></p>
          </div>
        </div>
      `;
      document.getElementById('confirmEndFastBtn').onclick = () => {
        const val = document.getElementById('fastingEndInput').value;
        const errorEl = document.getElementById('fastingEndError');
        const endDate = val ? new Date(val) : new Date();
        if (endDate.getTime() < new Date(f.activeStart).getTime()) {
          errorEl.textContent = 'La hora de fin no puede ser anterior a la de inicio.';
          return;
        }
        endFast(player, endDate);
      };
      document.getElementById('cancelEndFastBtn').onclick = () => {
        confirmingFastingEnd = false;
        renderFastingCard(player);
      };
      return;
    }

    if (editingFastingStart) {
      box.innerHTML = `
        <div class="fasting-active">
          <div class="fasting-edit-row">
            <label class="field-label" style="margin:0">Hora en la que empezaste</label>
            <input type="datetime-local" id="fastingStartEditInput" value="${toDatetimeLocalValue(new Date(f.activeStart))}" max="${nowLocal}">
            <div class="field-row">
              <button class="primary" id="saveFastStartBtn">Guardar</button>
              <button class="ghost" id="cancelFastStartBtn">Cancelar</button>
            </div>
            <p class="hint-text" id="fastingStartError"></p>
          </div>
        </div>
      `;
      document.getElementById('saveFastStartBtn').onclick = () => {
        const val = document.getElementById('fastingStartEditInput').value;
        const errorEl = document.getElementById('fastingStartError');
        if (!val) return;
        const newStart = new Date(val);
        if (newStart.getTime() > Date.now()) {
          errorEl.textContent = 'La hora de inicio no puede ser en el futuro.';
          return;
        }
        updateFastStart(player, newStart);
      };
      document.getElementById('cancelFastStartBtn').onclick = () => {
        editingFastingStart = false;
        renderFastingCard(player);
      };
      return;
    }

    box.innerHTML = `
      <div class="fasting-active">
        <div class="fasting-elapsed" id="fastingElapsed">00:00:00</div>
        <div class="hint-text">Objetivo: ${f.goalHours}h · Inicio: ${formatTimeLabel(new Date(f.activeStart))} · <span class="fasting-edit-link" id="editFastStartLink">Editar</span></div>
        <div class="progress-bar-track"><div class="progress-bar-fill" id="fastingBarFill" style="width:0%"></div></div>
        <button class="primary" id="endFastBtn">Terminar ayuno</button>
      </div>
    `;
    document.getElementById('endFastBtn').onclick = () => {
      confirmingFastingEnd = true;
      renderFastingCard(player);
    };
    document.getElementById('editFastStartLink').onclick = () => {
      editingFastingStart = true;
      renderFastingCard(player);
    };

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
      <div class="fasting-edit-row">
        <label class="field-label" style="margin:0">Hora de inicio</label>
        <input type="datetime-local" id="fastingStartInput" value="${nowLocal}" max="${nowLocal}">
      </div>
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
      const val = document.getElementById('fastingStartInput').value;
      const startDate = val ? new Date(val) : new Date();
      startFast(player, goal, startDate);
    };
  }
}

async function startFast(player, goalHours, startDate) {
  await supabase.from('fasting_sessions').upsert(
    { player_id: player.id, active_start: (startDate || new Date()).toISOString(), goal_hours: goalHours },
    { onConflict: 'player_id' }
  );
  await refreshAndRender();
}

async function updateFastStart(player, newStart) {
  await supabase.from('fasting_sessions').update({ active_start: newStart.toISOString() }).eq('player_id', player.id);
  editingFastingStart = false;
  await refreshAndRender();
}

async function endFast(player, endDate) {
  const f = player.fasting;
  const end = endDate || new Date();
  const hours = Math.round(((end.getTime() - new Date(f.activeStart).getTime()) / 3600000) * 10) / 10;
  await supabase.from('fasting_history').insert({ player_id: player.id, date: todayKey(end), hours });
  await supabase.from('fasting_sessions').update({ active_start: null }).eq('player_id', player.id);
  confirmingFastingEnd = false;
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
    cell.className = 'week-day' + (i === 0 ? ' today' : '') + (selectedWeekDate === key ? ' selected' : '');
    const label = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
    const tier = pctTierClass(pct);
    cell.innerHTML = `${label}<span class="pct ${tier} mono">${pct === null ? '–' : pct + '%'}</span>`;
    cell.onclick = () => {
      selectedWeekDate = selectedWeekDate === key ? null : key;
      renderWeekStrip(player);
    };
    strip.appendChild(cell);
  }
  renderWeekDayDetail(player);
}

function renderWeekDayDetail(player) {
  const panel = document.getElementById('weekDayDetailPanel');
  if (!selectedWeekDate) {
    panel.innerHTML = '';
    return;
  }
  const date = selectedWeekDate;
  const myHabits = habitsForOnDate(player, date);
  const rec = (state.records[date] && state.records[date][player.id]) || {};

  let html = `<div class="detail-panel"><div class="detail-head"><strong>${formatDateLabel(date)}</strong><button class="pill-link" id="closeWeekDayBtn">Cerrar</button></div>`;
  if (myHabits.length === 0) {
    html += '<div class="empty-state">No tenías hábitos asignados este día.</div>';
  } else {
    myHabits.forEach(h => {
      const answer = rec[h.id];
      const mark = answer === true ? '✓' : answer === false ? '✗' : '–';
      const cls = answer === true ? 'cell-ok' : answer === false ? 'cell-bad' : 'cell-no';
      html += `<div class="detail-habit-row"><span>${h.emoji}</span><span class="flex1">${h.label}</span><span class="${cls}">${mark}</span></div>`;
    });
  }

  const lines = [];
  if (player.weightLog[date] !== undefined) lines.push(`Peso: ${player.weightLog[date]}kg`);
  const histEntry = player.fasting.history.find(h => h.date === date);
  if (histEntry) lines.push(`✅ Ayuno completado: ${histEntry.hours}h`);
  const wellness = player.wellness[date];
  if (wellness && wellness.sleep) {
    const opt = SLEEP_OPTIONS.find(o => o.value === wellness.sleep);
    lines.push(`Sueño: ${opt ? opt.label : wellness.sleep}`);
  }
  if (wellness && wellness.energy) {
    const opt = ENERGY_OPTIONS.find(o => o.value === wellness.energy);
    lines.push(`Energía: ${opt ? opt.label : wellness.energy}`);
  }
  if (lines.length > 0) {
    html += `<div class="hint-text" style="margin-top:10px">${lines.join('<br>')}</div>`;
  }

  html += '</div>';
  panel.innerHTML = html;
  document.getElementById('closeWeekDayBtn').addEventListener('click', () => {
    selectedWeekDate = null;
    renderWeekStrip(player);
  });
}

/* ---------- COACH ---------- */

const LOW_COMPLETION_THRESHOLD = 50; // %, por debajo de esto y con muestra suficiente, alerta

function pctBadgeHtml(pct) {
  return `<span class="pct-badge ${pctTierClass(pct)}">${pct === null ? '–' : pct + '%'}</span>`;
}

function openPlayerDetail(playerId, subtab = 'resumen') {
  currentCoachTab = 'jugadores';
  selectedPlayerId = playerId;
  currentPlayerDetailSubtab = subtab;
  document.getElementById('content').scrollTop = 0;
  render();
}

function computeCoachAlerts() {
  const alerts = [];
  state.players.forEach(p => {
    if (!p.authId) {
      alerts.push({ playerId: p.id, playerName: p.name, icon: '✉️', message: 'Todavía no se ha registrado en la app.', subtab: 'cuenta' });
    }
    const assignedAnyDay = new Set();
    WEEKDAYS.forEach(d => (p.habitsByDay[d.key] || []).forEach(id => assignedAnyDay.add(id)));
    if (assignedAnyDay.size === 0) {
      alerts.push({ playerId: p.id, playerName: p.name, icon: '📭', message: 'No tiene ningún hábito asignado.', subtab: 'habitos' });
    } else {
      const summary = computeWeeklySummary(p);
      if (summary.totalAssigned >= 3 && summary.pct !== null && summary.pct < LOW_COMPLETION_THRESHOLD) {
        alerts.push({ playerId: p.id, playerName: p.name, icon: '📉', message: `Cumplimiento bajo esta semana: ${summary.pct}%.`, subtab: 'resumen' });
      }
    }
  });
  return alerts;
}

function renderAttentionPanel() {
  const box = document.getElementById('attentionPanel');
  const alerts = computeCoachAlerts();
  if (alerts.length === 0) {
    box.innerHTML = '<div class="note-row good">✅ Todo en orden — sin avisos pendientes.</div>';
    return;
  }
  box.innerHTML = alerts.map((a, i) =>
    `<div class="alert-row" data-idx="${i}"><span class="alert-row-icon">${a.icon}</span><span class="alert-row-text"><strong>${a.playerName}</strong> · ${a.message}</span><span class="alert-row-chevron">›</span></div>`
  ).join('');
  box.querySelectorAll('.alert-row').forEach(row => {
    const alert = alerts[Number(row.dataset.idx)];
    row.onclick = () => openPlayerDetail(alert.playerId, alert.subtab);
  });
}

function renderTeamRoster(date) {
  const wrap = document.getElementById('dashTableWrap');
  let teamDoneSum = 0;
  let teamPossible = 0;

  if (state.players.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Todavía no hay jugadores añadidos.</div>';
    document.getElementById('teamPct').textContent = '—';
    return;
  }

  wrap.innerHTML = '';
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
    const energy = p.wellness[date] && p.wellness[date].energy;
    const fasted = p.fasting.history.some(h => h.date === date);

    const row = document.createElement('div');
    row.className = 'team-row';
    row.innerHTML = `
      ${avatarThumbHtml(p)}
      <div class="team-row-info">
        <div class="team-row-name">${p.name}</div>
        <div class="team-row-stats">
          <span>⚖️ ${weight !== undefined ? weight + 'kg' : '–'}</span>
          <span>⚡ ${energy ? energy + '/5' : '–'}</span>
          <span>${fasted ? '🕐 ayuno ✓' : '🕐 ayuno –'}</span>
        </div>
      </div>
      ${pctBadgeHtml(pct)}
    `;
    row.onclick = () => openPlayerDetail(p.id);
    wrap.appendChild(row);
  });

  const teamPct = teamPossible ? Math.round((teamDoneSum / teamPossible) * 100) : 0;
  document.getElementById('teamPct').textContent = teamPossible ? teamPct + '%' : '—';
}

function renderCoach() {
  const contentEl = document.getElementById('content');
  const scrollY = contentEl.scrollTop;
  contentEl.classList.toggle('coach-wide', currentCoachTab === 'jugadores');
  const picker = document.getElementById('coachDatePicker');
  if (!picker.value) picker.value = todayKey();
  const date = picker.value;

  document.getElementById('coachEmailLabel').textContent = state.session.email || '—';
  const unregisteredCount = state.players.filter(p => !p.authId).length;
  document.getElementById('settingsPlayerCount').textContent = String(state.players.length);
  document.getElementById('settingsUnregisteredCount').textContent = String(unregisteredCount);
  document.getElementById('settingsHabitCount').textContent = String(state.habits.length);

  renderTeamRoster(date);
  renderAttentionPanel();
  renderAdminHabits();
  renderJugadoresTab();

  contentEl.scrollTop = scrollY;
}

// Cuadrícula única por jugador: qué días tiene cada hábito asignado + a qué hora y
// si avisa, todo en una fila por hábito (antes eran dos secciones separadas que
// repetían el nombre de cada hábito dos veces).
function buildHabitScheduleGrid(p) {
  const wrap = document.createElement('div');
  if (state.habits.length === 0) {
    wrap.className = 'hint-text';
    wrap.textContent = 'Añade hábitos a la batería primero.';
    return wrap;
  }
  wrap.className = 'assign-grid-wrap';
  const grid = document.createElement('div');
  grid.className = 'assign-grid schedule-grid';
  grid.appendChild(document.createElement('div')); // corner
  WEEKDAYS.forEach(d => {
    const label = document.createElement('div');
    label.className = 'assign-grid-daylabel';
    label.textContent = d.short;
    label.title = d.label;
    grid.appendChild(label);
  });
  ['Hora', 'Aviso'].forEach(text => {
    const label = document.createElement('div');
    label.className = 'assign-grid-daylabel';
    label.textContent = text;
    grid.appendChild(label);
  });

  state.habits.forEach(h => {
    const nameCell = document.createElement('div');
    nameCell.className = 'assign-grid-habit';
    nameCell.innerHTML = `<span>${h.emoji}</span><span>${h.label}</span>`;
    grid.appendChild(nameCell);

    let assignedAnyDay = false;
    WEEKDAYS.forEach(d => {
      const assigned = (p.habitsByDay[d.key] || []).includes(h.id);
      if (assigned) assignedAnyDay = true;
      const cell = document.createElement('button');
      cell.className = 'assign-cell' + (assigned ? ' checked' : '');
      cell.textContent = assigned ? '✓' : '';
      cell.title = `${h.label} · ${d.label}`;
      cell.onclick = async () => {
        if (assigned) {
          await supabase.from('assignments').delete().match({ player_id: p.id, weekday: d.key, habit_id: h.id });
        } else {
          await supabase.from('assignments').insert({ player_id: p.id, weekday: d.key, habit_id: h.id });
        }
        await refreshAndRender();
      };
      grid.appendChild(cell);
    });

    const settings = p.habitSettings[h.id] || {};

    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.className = 'schedule-time-input';
    timeInput.value = settings.timeOfDay ? settings.timeOfDay.slice(0, 5) : '';
    timeInput.disabled = !assignedAnyDay;
    timeInput.title = assignedAnyDay ? '' : 'Asigna este hábito algún día primero';
    timeInput.onchange = async () => {
      const time_of_day = timeInput.value || null;
      const updates = { player_id: p.id, habit_id: h.id, time_of_day };
      if (!time_of_day && settings.notifyEnabled) updates.notify_enabled = false;
      await supabase.from('player_habit_settings').upsert(updates, { onConflict: 'player_id,habit_id' });
      await refreshAndRender();
    };
    grid.appendChild(timeInput);

    const notifyBtn = document.createElement('button');
    notifyBtn.className = 'schedule-notify-btn ' + (settings.notifyEnabled ? 'primary' : 'ghost');
    notifyBtn.textContent = settings.notifyEnabled ? '🔔' : '🔕';
    notifyBtn.title = settings.timeOfDay ? (settings.notifyEnabled ? 'Aviso activado' : 'Activar aviso') : 'Pon una hora primero';
    notifyBtn.disabled = !settings.timeOfDay;
    notifyBtn.onclick = async () => {
      await supabase.from('player_habit_settings').upsert(
        { player_id: p.id, habit_id: h.id, notify_enabled: !settings.notifyEnabled },
        { onConflict: 'player_id,habit_id' }
      );
      await refreshAndRender();
    };
    grid.appendChild(notifyBtn);
  });
  wrap.appendChild(grid);
  return wrap;
}

function buildPlayerSummarySubtab(p, date) {
  const wrap = document.createElement('div');

  const myHabits = habitsForOnDate(p, date);
  const rec = (state.records[date] && state.records[date][p.id]) || {};

  const dayTitle = document.createElement('div');
  dayTitle.className = 'hint-text';
  dayTitle.style.margin = '0 0 8px';
  dayTitle.textContent = `Hábitos del ${formatDateLabel(date)}`;
  wrap.appendChild(dayTitle);

  if (myHabits.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Este jugador no tiene hábitos asignados este día.';
    wrap.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'admin-list';
    myHabits.forEach(h => {
      const answer = rec[h.id];
      const mark = answer === true ? '✓' : answer === false ? '✗' : '–';
      const cls = answer === true ? 'cell-ok' : answer === false ? 'cell-bad' : 'cell-no';
      const row = document.createElement('div');
      row.className = 'detail-habit-row';
      row.innerHTML = `<span>${h.emoji}</span><span class="flex1">${h.label}</span><span class="${cls}">${mark}</span>`;
      list.appendChild(row);
    });
    wrap.appendChild(list);
  }

  const lines = [];
  if (p.fasting.activeStart && date === todayKey()) {
    const elapsedH = ((Date.now() - new Date(p.fasting.activeStart).getTime()) / 3600000).toFixed(1);
    lines.push(`🕐 Ayuno en curso: ${elapsedH}h (objetivo ${p.fasting.goalHours}h)`);
  }
  const histEntry = p.fasting.history.find(h => h.date === date);
  if (histEntry) lines.push(`✅ Ayuno completado ese día: ${histEntry.hours}h`);
  if (p.weightLog[date] !== undefined) lines.push(`⚖️ Peso: ${p.weightLog[date]}kg`);
  if (lines.length > 0) {
    const info = document.createElement('div');
    info.className = 'hint-text';
    info.style.margin = '10px 0 0';
    info.innerHTML = lines.join('<br>');
    wrap.appendChild(info);
  }

  const summary = computeWeeklySummary(p);
  const weekTitle = document.createElement('div');
  weekTitle.className = 'section-title';
  weekTitle.style.margin = '20px 0 8px';
  weekTitle.textContent = `Esta semana (${summary.weekStartLabel} – ${summary.weekEndLabel})`;
  wrap.appendChild(weekTitle);

  const weekHero = document.createElement('div');
  weekHero.className = 'card stat-hero';
  weekHero.style.margin = '0 0 14px';
  weekHero.innerHTML = `<div class="stat-hero-value display mono">${summary.pct === null ? '–' : summary.pct + '%'}</div><div class="stat-hero-label">cumplimiento esta semana</div>`;
  wrap.appendChild(weekHero);

  const chartsTitle1 = document.createElement('div');
  chartsTitle1.className = 'section-title';
  chartsTitle1.style.margin = '20px 0 6px';
  chartsTitle1.textContent = `Peso · 7 días hasta ${formatDateLabel(date)}`;
  wrap.appendChild(chartsTitle1);
  const weightCard = document.createElement('div');
  weightCard.className = 'card';
  weightCard.innerHTML = weightChartHtml(p, date);
  wrap.appendChild(weightCard);

  const chartsTitle2 = document.createElement('div');
  chartsTitle2.className = 'section-title';
  chartsTitle2.style.margin = '20px 0 6px';
  chartsTitle2.textContent = `Ayuno · 7 días hasta ${formatDateLabel(date)}`;
  wrap.appendChild(chartsTitle2);
  const fastCard = document.createElement('div');
  fastCard.className = 'card';
  fastCard.innerHTML = fastingChartHtml(p, date);
  wrap.appendChild(fastCard);

  return wrap;
}

function buildHabitsSubtab(p) {
  const wrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'hint-text';
  title.style.margin = '0 0 8px';
  title.textContent = 'Qué días tiene cada hábito, a qué hora y si avisa.';
  wrap.appendChild(title);
  wrap.appendChild(buildHabitScheduleGrid(p));
  return wrap;
}

function buildFastingSubtab(p) {
  const wrap = document.createElement('div');

  const row = document.createElement('div');
  row.className = 'admin-row';
  const label = document.createElement('div');
  label.className = 'admin-row-head';
  label.innerHTML = `<span>⏳</span><span class="flex1">${p.fasting.activeStart ? 'Ayuno en curso' : 'Próximo ayuno'}</span>`;
  row.appendChild(label);

  const controls = document.createElement('div');
  controls.className = 'admin-row-controls';
  const select = document.createElement('select');
  [12, 14, 16, 18, 20, 24].forEach(hrs => {
    const opt = document.createElement('option');
    opt.value = hrs;
    opt.textContent = `${hrs}h`;
    if (hrs === p.fasting.goalHours) opt.selected = true;
    select.appendChild(opt);
  });
  const err = document.createElement('div');
  err.className = 'hint-text';
  select.onchange = async () => {
    err.textContent = '';
    const { error } = await supabase.from('fasting_sessions').upsert(
      { player_id: p.id, goal_hours: parseInt(select.value, 10) },
      { onConflict: 'player_id' }
    );
    if (error) {
      err.textContent = 'No se pudo guardar: ' + (error.message || 'error desconocido');
      return;
    }
    await refreshAndRender();
  };
  controls.appendChild(select);
  row.appendChild(controls);
  wrap.appendChild(row);
  wrap.appendChild(err);

  const info = document.createElement('p');
  info.className = 'hint-text';
  if (p.fasting.activeStart) {
    const elapsedH = ((Date.now() - new Date(p.fasting.activeStart).getTime()) / 3600000).toFixed(1);
    info.textContent = `Empezó hace ${elapsedH}h.`;
    wrap.appendChild(info);
  } else if (p.fasting.history.length > 0) {
    const last = p.fasting.history[p.fasting.history.length - 1];
    info.textContent = `Último ayuno: ${last.hours}h (${formatDateLabel(last.date)}).`;
    wrap.appendChild(info);
  }
  return wrap;
}

function buildNutritionSubtab(p) {
  const wrap = document.createElement('div');
  wrap.className = 'admin-list';
  NUTRITION_CATEGORIES.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'stretch';

    const label = document.createElement('div');
    label.className = 'admin-row-head';
    label.innerHTML = `<span>${cat.emoji}</span><span class="flex1">${cat.label}</span>`;
    row.appendChild(label);

    const textarea = document.createElement('textarea');
    textarea.className = 'nutrition-tip-input';
    textarea.rows = 2;
    textarea.placeholder = `Tip de ${cat.label.toLowerCase()}...`;
    textarea.value = p.nutritionTips[cat.key] || '';
    const tipErr = document.createElement('div');
    tipErr.className = 'hint-text';
    textarea.onchange = async () => {
      tipErr.textContent = '';
      const { error } = await supabase.from('player_nutrition_tips').upsert(
        { player_id: p.id, category: cat.key, tip: textarea.value.trim() || null },
        { onConflict: 'player_id,category' }
      );
      if (error) {
        tipErr.textContent = 'No se pudo guardar: ' + (error.message || 'error desconocido');
        return;
      }
      await refreshAndRender();
    };
    row.appendChild(textarea);
    row.appendChild(tipErr);

    wrap.appendChild(row);
  });
  return wrap;
}

function buildAccountSubtab(p) {
  const wrap = document.createElement('div');

  const avatarRow = document.createElement('div');
  avatarRow.className = 'account-avatar-row';
  const avatarBtn = document.createElement('span');
  avatarBtn.innerHTML = avatarThumbHtml(p);
  avatarBtn.className = 'account-avatar-btn';
  avatarBtn.title = 'Cambiar foto';
  const avatarFileInput = document.createElement('input');
  avatarFileInput.type = 'file';
  avatarFileInput.accept = 'image/*';
  avatarFileInput.style.display = 'none';
  avatarBtn.onclick = () => avatarFileInput.click();
  const avatarErr = document.createElement('div');
  avatarErr.className = 'hint-text';
  avatarErr.style.margin = '0';
  avatarFileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) await uploadAvatarForPlayer(p, file, avatarErr);
  };
  const avatarLabel = document.createElement('span');
  avatarLabel.className = 'hint-text';
  avatarLabel.style.margin = '0';
  avatarLabel.textContent = 'Foto de perfil (clic para cambiar)';
  avatarRow.appendChild(avatarBtn);
  avatarRow.appendChild(avatarLabel);
  avatarRow.appendChild(avatarFileInput);
  wrap.appendChild(avatarRow);
  wrap.appendChild(avatarErr);

  const emailWrap = document.createElement('div');
  emailWrap.style.marginTop = '14px';
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
    emailWrap.appendChild(editRow);
    if (playerEmailEditError) {
      const errDiv = document.createElement('div');
      errDiv.className = 'hint-text';
      errDiv.textContent = playerEmailEditError;
      emailWrap.appendChild(errDiv);
    }
  } else {
    const emailDiv = document.createElement('div');
    emailDiv.className = 'player-email';
    if (p.authId) {
      emailDiv.innerHTML = `${p.email} · <span style="color:var(--gold)">✅ cuenta activa</span>`;
    } else {
      emailDiv.textContent = `${p.email} · aún no se ha registrado`;
    }
    emailWrap.appendChild(emailDiv);
    if (!p.authId) {
      const editEmailBtn = document.createElement('button');
      editEmailBtn.className = 'ghost';
      editEmailBtn.textContent = 'Editar email';
      editEmailBtn.style.marginTop = '8px';
      editEmailBtn.onclick = () => {
        editingPlayerEmail = p.id;
        playerEmailEditError = '';
        renderCoach();
      };
      emailWrap.appendChild(editEmailBtn);
    }
  }
  wrap.appendChild(emailWrap);

  const dangerTitle = document.createElement('div');
  dangerTitle.className = 'section-title';
  dangerTitle.style.margin = '26px 0 8px';
  dangerTitle.textContent = 'Zona de peligro';
  wrap.appendChild(dangerTitle);

  const delBtn = document.createElement('button');
  delBtn.className = 'danger';
  delBtn.textContent = 'Eliminar jugador';
  delBtn.onclick = async () => {
    await supabase.from('players').delete().eq('id', p.id);
    if (selectedPlayerId === p.id) selectedPlayerId = null;
    await refreshAndRender();
  };
  wrap.appendChild(delBtn);

  return wrap;
}

const PLAYER_SUBTABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'habitos', label: 'Hábitos y horarios' },
  { key: 'ayuno', label: 'Ayuno' },
  { key: 'nutricion', label: 'Nutrición' },
  { key: 'cuenta', label: 'Cuenta' },
];

function renderPlayerDetailPane() {
  const pane = document.getElementById('playerDetailPane');
  const player = selectedPlayerId ? getPlayerById(selectedPlayerId) : null;

  if (!player) {
    const pcts = state.players.map(p => computeWeeklySummary(p).pct).filter(pct => pct !== null);
    const avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    pane.innerHTML = `
      <div class="card empty-state">
        <p>${state.players.length === 0 ? 'Añade tu primer jugador para empezar.' : 'Elige un jugador de la lista para ver su ficha.'}</p>
        ${state.players.length > 0 ? `<p class="hint-text">${state.players.length} jugadores en el equipo · cumplimiento medio esta semana: ${avgPct === null ? '–' : avgPct + '%'}</p>` : ''}
      </div>
    `;
    return;
  }

  const picker = document.getElementById('coachDatePicker');
  const date = picker.value || todayKey();
  const myHabits = habitsForOnDate(player, date);
  const rec = (state.records[date] && state.records[date][player.id]) || {};
  const done = myHabits.filter(h => rec[h.id]).length;
  const dayPct = myHabits.length ? Math.round((done / myHabits.length) * 100) : null;

  pane.innerHTML = `
    <div class="card player-detail-card">
      <div class="player-detail-head">
        ${avatarThumbHtml(player)}
        <span class="flex1">
          <div class="player-detail-name">${player.name}</div>
          <div class="player-email">${player.authId ? '✅ cuenta activa' : 'aún no se ha registrado'}</div>
        </span>
        ${pctBadgeHtml(dayPct)}
      </div>
      <div class="subtab-bar" id="playerSubtabBar"></div>
      <div id="playerSubtabContent"></div>
    </div>
  `;

  const bar = document.getElementById('playerSubtabBar');
  PLAYER_SUBTABS.forEach(st => {
    const btn = document.createElement('button');
    btn.className = 'subtab-btn' + (currentPlayerDetailSubtab === st.key ? ' active' : '');
    btn.textContent = st.label;
    btn.onclick = () => {
      currentPlayerDetailSubtab = st.key;
      renderPlayerDetailPane();
    };
    bar.appendChild(btn);
  });

  const content = document.getElementById('playerSubtabContent');
  content.innerHTML = '';
  let built;
  if (currentPlayerDetailSubtab === 'habitos') built = buildHabitsSubtab(player);
  else if (currentPlayerDetailSubtab === 'ayuno') built = buildFastingSubtab(player);
  else if (currentPlayerDetailSubtab === 'nutricion') built = buildNutritionSubtab(player);
  else if (currentPlayerDetailSubtab === 'cuenta') built = buildAccountSubtab(player);
  else built = buildPlayerSummarySubtab(player, date);
  content.appendChild(built);
}

function renderJugadoresTab() {
  const listBox = document.getElementById('adminPlayerList');
  const searchInput = document.getElementById('playerSearchInput');
  const query = (searchInput.value || '').trim().toLowerCase();
  const players = state.players.filter(p => !query || p.name.toLowerCase().includes(query));

  listBox.innerHTML = '';
  if (state.players.length === 0) {
    listBox.innerHTML = '<div class="hint-text" style="margin:0">Sin jugadores todavía.</div>';
  } else if (players.length === 0) {
    listBox.innerHTML = '<div class="hint-text" style="margin:0">Ningún jugador coincide con la búsqueda.</div>';
  } else {
    players.forEach(p => {
      const assignedAnyDay = new Set();
      WEEKDAYS.forEach(d => (p.habitsByDay[d.key] || []).forEach(id => assignedAnyDay.add(id)));
      const isSelected = selectedPlayerId === p.id;

      const row = document.createElement('div');
      row.className = 'player-list-row' + (isSelected ? ' active' : '');
      row.innerHTML = `
        ${avatarThumbHtml(p)}
        <div class="player-list-row-info">
          <div class="player-list-row-name">${p.name}</div>
          <div class="player-list-row-meta">${assignedAnyDay.size}/${state.habits.length} hábitos${p.authId ? '' : ' · sin registrar'}</div>
        </div>
      `;
      row.onclick = () => {
        selectedPlayerId = p.id;
        renderCoach();
      };
      listBox.appendChild(row);
    });
  }

  document.getElementById('toggleAddPlayerBtn').style.display = addingNewPlayer ? 'none' : 'block';
  document.getElementById('addPlayerForm').style.display = addingNewPlayer ? 'block' : 'none';

  renderPlayerDetailPane();
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
  addingNewPlayer = false;
  await refreshAndRender();
}

async function commitHabitOrder(box) {
  const orderedIds = Array.from(box.children)
    .filter(el => el.classList.contains('admin-row') && el.dataset.habitId)
    .map(el => el.dataset.habitId);
  const ordered = orderedIds.map(id => state.habits.find(h => h.id === id)).filter(Boolean);
  const updates = [];
  ordered.forEach((h, i) => {
    const newSortOrder = i + 1;
    if (h.sortOrder !== newSortOrder) {
      updates.push(supabase.from('habits').update({ sort_order: newSortOrder }).eq('id', h.id));
    }
  });
  if (updates.length > 0) {
    await Promise.all(updates);
    await refreshAndRender();
  }
}

function startHabitDrag(e, row, box) {
  e.preventDefault();
  const pointerId = e.pointerId;
  row.setPointerCapture(pointerId);
  row.classList.add('dragging');

  const onMove = ev => {
    if (ev.pointerId !== pointerId) return;
    const y = ev.clientY;
    const siblings = Array.from(box.children).filter(el => el !== row && el.classList.contains('admin-row'));
    let target = null;
    for (const sib of siblings) {
      const rect = sib.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) { target = sib; break; }
    }
    if (target) {
      if (target.previousElementSibling !== row) box.insertBefore(row, target);
    } else if (box.lastElementChild !== row) {
      box.appendChild(row);
    }
  };

  const onUp = async ev => {
    if (ev.pointerId !== pointerId) return;
    try { row.releasePointerCapture(pointerId); } catch (err) {}
    row.classList.remove('dragging');
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    await commitHabitOrder(box);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

function renderAdminHabits() {
  const box = document.getElementById('adminHabitList');
  box.innerHTML = '';
  if (state.habits.length === 0) {
    box.innerHTML = '<div style="color:var(--text-dim); font-size:0.85rem;">Sin hábitos en la batería todavía.</div>';
    return;
  }
  state.habits.forEach((h, i) => {
    const row = document.createElement('div');
    row.className = 'admin-row habit-manage-row';
    row.dataset.habitId = h.id;

    if (editingHabitId === h.id) {
      const editRow = document.createElement('div');
      editRow.className = 'inline-edit-row';
      const emojiInput = document.createElement('input');
      emojiInput.type = 'text';
      emojiInput.value = h.emoji;
      emojiInput.style.flex = '0 0 60px';
      emojiInput.placeholder = 'Emoji';
      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.value = h.label;
      labelInput.placeholder = 'Nombre del hábito';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'primary';
      saveBtn.textContent = 'Guardar';
      saveBtn.onclick = async () => {
        const newLabel = labelInput.value.trim();
        if (!newLabel) return;
        await supabase.from('habits').update({ emoji: emojiInput.value.trim() || '✅', label: newLabel }).eq('id', h.id);
        editingHabitId = null;
        await refreshAndRender();
      };
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'ghost';
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.onclick = () => {
        editingHabitId = null;
        renderCoach();
      };
      editRow.appendChild(emojiInput);
      editRow.appendChild(labelInput);
      editRow.appendChild(saveBtn);
      editRow.appendChild(cancelBtn);
      row.appendChild(editRow);
      box.appendChild(row);
      return;
    }

    const usageCount = state.players.filter(p => Object.values(p.habitsByDay).some(ids => ids.includes(h.id))).length;
    const head = document.createElement('div');
    head.className = 'admin-row-head';
    head.innerHTML = `<span class="drag-handle" title="Arrastra para reordenar">⠿</span><span>${h.emoji}</span><span class="flex1">${h.label}</span><span class="assigned-count">asignado a ${usageCount}/${state.players.length} jugadores</span>`;
    row.appendChild(head);
    head.querySelector('.drag-handle').addEventListener('pointerdown', e => startHabitDrag(e, row, box));

    const controls = document.createElement('div');
    controls.className = 'admin-row-controls';

    const editBtn = document.createElement('button');
    editBtn.className = 'ghost';
    editBtn.textContent = 'Editar';
    editBtn.onclick = () => {
      editingHabitId = h.id;
      renderCoach();
    };
    controls.appendChild(editBtn);

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
  const emoji = emojiInput.value.trim() || '✅';
  const label = labelInput.value.trim();
  if (!label) return;
  await supabase.from('habits').insert({ emoji, label, sort_order: state.habits.length + 1 });
  emojiInput.value = '';
  labelInput.value = '';
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
  renderCoach();
});

document.getElementById('adminAddPlayerBtn').addEventListener('click', addAdminPlayer);
document.getElementById('adminNewPlayerEmailInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') addAdminPlayer();
});
document.getElementById('toggleAddPlayerBtn').addEventListener('click', () => {
  addingNewPlayer = true;
  renderCoach();
  document.getElementById('adminNewPlayerInput').focus();
});
document.getElementById('cancelAddPlayerBtn').addEventListener('click', () => {
  addingNewPlayer = false;
  document.getElementById('adminAddPlayerError').textContent = '';
  renderCoach();
});
document.getElementById('playerSearchInput').addEventListener('input', () => {
  renderCoach();
});

document.getElementById('adminAddHabitBtn').addEventListener('click', addAdminHabit);
document.getElementById('adminNewHabitLabel').addEventListener('keydown', e => {
  if (e.key === 'Enter') addAdminHabit();
});

document.getElementById('bootstrapYesBtn').addEventListener('click', confirmBootstrapCoach);
document.getElementById('bootstrapNoBtn').addEventListener('click', cancelBootstrapCoach);

document.getElementById('forgotPasswordLink').addEventListener('click', async () => {
  const email = normalizeEmail(document.getElementById('authEmailInput').value);
  const messageEl = document.getElementById('loginMessage');
  if (!email) {
    messageEl.textContent = 'Escribe tu email arriba y vuelve a pulsar "¿Has olvidado tu contraseña?".';
    return;
  }
  messageEl.textContent = 'Enviando...';
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  messageEl.textContent = error
    ? 'No se pudo enviar el email. Inténtalo de nuevo.'
    : 'Te hemos enviado un email para restablecer la contraseña.';
});

document.getElementById('recoverySubmitBtn').addEventListener('click', async () => {
  const pw = document.getElementById('recoveryPasswordInput').value;
  const messageEl = document.getElementById('recoveryMessage');
  if (pw.length < 6) {
    messageEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    return;
  }
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) {
    messageEl.textContent = 'No se pudo guardar. Inténtalo de nuevo.';
    return;
  }
  isPasswordRecovery = false;
  document.getElementById('recoveryPasswordInput').value = '';
  messageEl.textContent = '';
  await resolveSessionAndRender();
});

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

const coachNavEl = document.getElementById('bottomnavCoach');
if (localStorage.getItem('coachSidebarCollapsed') === '1') {
  coachNavEl.classList.add('collapsed');
}
document.getElementById('sidebarToggleBtn').addEventListener('click', () => {
  const collapsed = coachNavEl.classList.toggle('collapsed');
  localStorage.setItem('coachSidebarCollapsed', collapsed ? '1' : '0');
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

// Cuando el móvil vuelve de segundo plano (p. ej. se reabre la app al día
// siguiente) sin llegar a recargar la página del todo, refresca los datos:
// evita que se vea información obsoleta (o que un ayuno en curso parezca
// haberse perdido) hasta que el usuario toque algo.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.session) {
    refreshAndRender();
  }
});

async function init() {
  prefillRememberedEmail();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await resolveSessionAndRender();
  } else {
    render();
  }
  setupRealtimeSubscriptions();
}

init();
