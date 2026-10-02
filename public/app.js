// ============================================================
//  Chiquis — app principal
// ============================================================
import { USERS, ROUTINES, EXERCISES, PHRASES_START, PHRASES_END, ACHIEVEMENTS, STICKERS, ENERGY } from './data.js';
import * as L from './logic.js';
import { createStore, uid } from './store.js';
import { cleanList } from './sanitize.js';
import { icon } from './icons.js';
import { $, esc, toast, openModal, closeModal, modalOpen, confirmBox, stickerHtml, confetti } from './ui.js';
import { state, core, me, partner, nameOf, settingsOf, saveSettings, canSee } from './core.js';
import { viewProgreso, viewHabitos, viewJuntos, viewLogros, viewActions, onPhotoInput, onViewChange, sendSticker, stickerPicker, sessionDetail } from './views.js';

const TABS = [
  { id: 'hoy', ic: 'dumbbell', label: 'Hoy' },
  { id: 'progreso', ic: 'chart-line', label: 'Progreso' },
  { id: 'habitos', ic: 'circle-check', label: 'Hábitos' },
  { id: 'juntos', ic: 'heart-handshake', label: 'Juntos' },
  { id: 'logros', ic: 'trophy', label: 'Logros' },
];

// ---------------- Datos ----------------
function buildDB() {
  const s = core.store;
  const get = c => cleanList(c, s.all(c));
  const settings = get('settings');
  core.db = {
    sessions: get('sessions'),
    body: get('body'),
    measures: get('measures'),
    habits: get('habits'),
    messages: get('messages'),
    phrases: get('phrases'),
    challenges: get('challenges'),
    settings,
    settingsMap: Object.fromEntries(settings.map(x => [x.id, x])),
  };
}
const DB = () => core.db;

// ---------------- Tema claro / oscuro ----------------
// 'auto' sigue al sistema del teléfono; 'light' y 'dark' lo fijan solo en este teléfono.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function getThemePref() { try { return localStorage.getItem('gym.theme') || 'auto'; } catch { return 'auto'; } }
function isDark() { const t = getThemePref(); return t === 'dark' || (t === 'auto' && darkQuery.matches); }
function setThemePref(t) {
  try { localStorage.setItem('gym.theme', t); } catch {}
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  updateThemeColor();
}
function updateThemeColor() {
  const brand = document.querySelector('.picker.brand');
  document.querySelector('meta[name=theme-color]').setAttribute('content', brand ? '#FB6C64' : isDark() ? '#111317' : '#F7F3EE');
}
setThemePref(getThemePref());
darkQuery.addEventListener('change', () => { updateThemeColor(); render(); });

function applyTheme() {
  const u = USERS[state.user] || Object.values(USERS)[0];
  const p = USERS[L.other(u.id)];
  const r = document.documentElement.style;
  r.setProperty('--acc', u.color);
  r.setProperty('--partner', p.color);
  updateThemeColor();
}

// ---------------- Render principal ----------------
function typingInApp() {
  const ae = document.activeElement;
  return ae && $('#app').contains(ae) && ae.matches('input, textarea, select');
}

const isCloud = () => core.store?.mode === 'firebase';

function render() {
  if (isCloud()) {
    const st = core.store.status;
    if (st === 'iniciando') return renderSplash();
    if (st === 'login' || st === 'denied') return renderLogin();
    if (core.store.userId && state.user !== core.store.userId) { state.user = core.store.userId; localStorage.setItem('gym.user', state.user); }
  }
  if (!state.user || !USERS[state.user]) return renderPicker();
  if (typingInApp()) { state.deferred = true; return; }
  applyTheme();
  const y = window.scrollY;
  const views = { hoy: viewHoy, progreso: viewProgreso, habitos: viewHabitos, juntos: viewJuntos, logros: viewLogros };
  const unread = DB().messages.filter(m => m.to === me() && !m.read).length;
  $('#app').innerHTML = `
    ${header()}
    <main>${(views[state.tab] || viewHoy)()}</main>
    <nav id="nav">${TABS.map(t => `
      <button class="${state.tab === t.id ? 'on' : ''}" data-act="tab" data-tab="${t.id}">
        ${icon(t.ic, { size: 24, cls: 'nav-ic' })}${t.label}
        ${t.id === 'juntos' && unread ? `<span class="badge">${unread}</span>` : ''}
      </button>`).join('')}</nav>`;
  window.scrollTo(0, y);
}
core.render = render;

document.addEventListener('focusout', () => {
  setTimeout(() => { if (state.deferred && !typingInApp()) { state.deferred = false; render(); } }, 400);
});

function header() {
  const st = core.store.status;
  const info = {
    local: ['', 'Solo este teléfono'],
    conectando: ['warn', 'Conectando…'],
    ok: ['ok', 'Sincronizado'],
    subiendo: ['warn', 'Guardando…'],
    offline: ['warn', 'Sin internet'],
    error: ['bad', 'Error de conexión'],
  }[st] || ['', st];
  return `<header id="top">
    <button class="who" data-act="${isCloud() ? 'settings' : 'switch-user'}"><span class="avatar">${nameOf(me())[0]}</span><b>${esc(nameOf(me()))}</b><span class="faint">${icon('chevron-down', { size: 16 })}</span></button>
    <span class="sync"><span class="dot ${info[0]}"></span>${info[1]}</span>
    <button class="icon-btn" data-act="settings" aria-label="Ajustes">${icon('settings')}</button>
  </header>`;
}

function renderSplash() {
  setTimeout(updateThemeColor);
  $('#app').innerHTML = `<div class="picker brand center"><img class="logo" src="icono-v2-512.png" alt="" width="112" height="112"><h1 style="font-size:40px">Chiquis</h1><p class="muted">Cargando…</p></div>`;
}

function renderLogin() {
  const st = core.store;
  const denied = st.status === 'denied';
  document.documentElement.style.setProperty('--acc', '#FF7A3D');
  setTimeout(updateThemeColor);
  $('#app').innerHTML = `<div class="picker brand">
    <div class="center stack" style="gap:6px;margin-bottom:10px">
      <img class="logo" src="icono-v2-512.png" alt="" width="112" height="112">
      <h1 style="font-size:44px">Chiquis</h1>
      <p class="muted">${denied ? 'Esta cuenta no tiene acceso' : 'Entra con tu cuenta de Google'}</p>
    </div>
    ${denied ? `<div class="alert warn">La cuenta <b>${esc(st.email)}</b> no está registrada en esta app. Entra con una de las cuentas registradas.</div>
      <button class="btn primary block" data-act="logout">Usar otra cuenta</button>`
    : `<button class="btn primary block" data-act="login" style="min-height:56px;font-size:17px">Entrar con Google</button>
      ${st.loginError ? `<div class="alert warn">No se pudo entrar (${esc(st.loginError)}). Intenta otra vez.</div>` : ''}
      <p class="faint small center">Solo pueden entrar las dos cuentas registradas. Lo haces una vez y la app te recuerda.</p>`}
  </div>`;
}

function renderPicker() {
  document.documentElement.style.setProperty('--acc', '#FF7A3D');
  setTimeout(updateThemeColor);
  $('#app').innerHTML = `<div class="picker brand">
    <div class="center stack" style="gap:6px;margin-bottom:10px">
      <img class="logo" src="icono-v2-512.png" alt="" width="112" height="112">
      <h1 style="font-size:44px">Chiquis</h1>
      <p class="muted">¿Quién eres?</p>
    </div>
    ${Object.values(USERS).map(u => `
      <button class="who-btn" data-act="pick-user" data-u="${u.id}" style="border-color:${u.color}55">
        <span class="avatar" style="background:${u.color}">${u.name[0]}</span>
        <span class="grow"><span class="big" style="font-size:28px;display:block">${u.name}</span><span class="muted small">Toca para entrar</span></span>
      </button>`).join('')}
    <p class="faint small center">Puedes cambiar de perfil cuando quieras desde arriba.</p>
  </div>`;
}

// ---------------- Hoy ----------------
function openSessionOf(u) {
  return DB().sessions.filter(s => s.user === u && !s.finishedAt).sort((a, b) => b.startedAt - a.startedAt)[0] || null;
}
function firstDate(u) {
  const f = L.finished(DB().sessions, u);
  return f.length ? f[0].date : null;
}
function inArranque(u, date = L.today()) {
  const f = firstDate(u);
  return !f || L.daysBetween(f, date) < 14;
}

function viewHoy() {
  const u = me(), p = partner(), t = L.today();
  const db = DB();
  const open = openSessionOf(u);
  const doneToday = L.finished(db.sessions, u).filter(s => s.date === t);
  const next = L.nextRoutine(db.sessions, u);
  const ws = L.weekStreak(db.sessions, u);
  const cs = L.coupleStreak(db.sessions);
  let main = '';

  if (open) {
    const r = L.routineById(u, open.routine);
    const total = open.items.reduce((a, it) => a + it.sets.length, 0);
    const done = open.items.reduce((a, it) => a + it.sets.filter(s => s.done).length, 0);
    main = `<div class="card hero stack">
      <span class="eyebrow">Sesión a medias${open.date !== t ? ' · ' + L.fmtShort(open.date) : ''}</span>
      <h2 class="big">${esc(r?.name || open.routine)}</h2>
      <div class="bar"><i style="width:${total ? done / total * 100 : 0}%"></i></div>
      <p class="muted small">${done} de ${total} series hechas</p>
      <button class="btn primary block" data-act="resume">Continuar sesión</button>
      <button class="btn ghost block danger" data-act="discard">Descartar sesión</button>
    </div>`;
  } else if (doneToday.length) {
    const s = doneToday[doneToday.length - 1];
    const r = L.routineById(u, s.routine);
    main = `<div class="card hero stack">
      <span class="eyebrow">${icon('circle-check', { size: 14 })} Hoy ya entrenaste</span>
      <h2 class="big">${esc(r?.name || s.routine)}</h2>
      <div class="stats">
        <div class="stat"><b>${L.sessionSets(s)}</b><span>series</span></div>
        <div class="stat"><b>${Math.round(L.sessionVolume(s)).toLocaleString('es-MX')}</b><span>kg totales</span></div>
        <div class="stat"><b>${s.prs?.length || 0}</b><span>récords</span></div>
      </div>
      <button class="btn block" data-act="view-session" data-id="${s.id}">Ver sesión</button>
      <p class="muted small">La próxima vez toca <b>${esc(next.name)}</b>.</p>
    </div>`;
  } else if (L.isTrainDay(t)) {
    const alerts = next.items.map(it => L.suggestion(db.sessions, u, next.id, it)).filter(s => s.alert).length;
    const ups = next.items.map(it => L.suggestion(db.sessions, u, next.id, it)).filter(s => s.type === 'up').length;
    main = `<div class="card hero stack">
      <span class="eyebrow">Hoy te toca</span>
      <h2 class="big" style="font-size:42px">${esc(next.name)}</h2>
      <p class="muted">${esc(next.subtitle)}</p>
      <div class="row wrap">
        <span class="pill">${icon('dumbbell', { size: 15 })} ${next.items.length} ejercicios</span>
        <span class="pill">${icon('heart-pulse', { size: 15 })} cardio ${next.cardio.min} min</span>
        ${ups ? `<span class="pill good">${icon('trending-up', { size: 15 })} toca subir en ${ups}</span>` : ''}
        ${alerts ? `<span class="pill warn">${icon('triangle-alert', { size: 15 })} ${alerts} estancado${alerts > 1 ? 's' : ''}</span>` : ''}
      </div>
      ${inArranque(u) ? `<div class="alert info row-ic">${icon('sprout', { size: 18 })}<span><b>Semanas de arranque:</b> haz una serie menos y deja 3–4 reps en reserva. Tu cuerpo se está readaptando.</span></div>` : ''}
      <button class="btn primary block" data-act="start" data-r="${next.id}">Empezar ${esc(next.name)}</button>
      <button class="link" data-act="pick-routine">Elegir otra rutina</button>
    </div>`;
  } else {
    main = `<div class="card stack">
      <span class="eyebrow">Hoy es descanso</span>
      <h2 class="big">A recuperar</h2>
      <p class="muted">Camina un rato, toma agua y duerme bien: ahí es donde creces. El próximo entrenamiento es <b>${esc(next.name)}</b>.</p>
      <button class="btn ghost block" data-act="pick-routine">Entrenar de todos modos</button>
    </div>`;
  }

  // Estado del otro
  const pOpen = openSessionOf(p);
  const pDone = L.finished(db.sessions, p).filter(s => s.date === t);
  let pText;
  if (pDone.length) pText = `ya terminó <b>${esc(L.routineById(p, pDone[pDone.length - 1].routine)?.name || '')}</b>`;
  else if (pOpen && pOpen.date === t) pText = `está entrenando ahora`;
  else if (L.isTrainDay(t)) pText = 'todavía no entrena hoy';
  else pText = 'hoy descansa';

  const ch = L.challengeProgress(db, L.weekStart(t));
  const g = L.goalsOf(u, db.settingsMap);
  const h = db.habits.find(x => x.id === `${u}_${t}`) || {};

  return `
    <div><span class="eyebrow">${esc(L.fmtLong(t))}</span><h1 style="font-size:30px;margin-top:2px">Hola, ${esc(nameOf(u))}</h1></div>
    ${main}
    <div class="row" style="align-items:stretch">
      <div class="card tight grow stack" style="gap:4px">
        <span class="muted small">Tu racha</span>
        <span class="big row" style="gap:6px"><span class="acc">${icon('flame', { size: 28 })}</span>${ws.current} <span style="font-size:16px" class="muted">sem</span></span>
        <span class="small muted">Esta semana ${ws.thisWeek}/4</span>
      </div>
      <button class="card tight grow stack" style="gap:4px;text-align:left" data-act="tab" data-tab="juntos">
        <span class="muted small">Racha juntos</span>
        <span class="big row" style="gap:6px"><span class="pc">${icon('heart-handshake', { size: 28 })}</span>${cs.current} <span style="font-size:16px" class="muted">días</span></span>
        <span class="small muted">${cs.started ? `Recuperaciones: ${cs.left}/3` : 'Empieza al entrenar los dos'}</span>
      </button>
    </div>
    <div class="card tight row">
      <span class="avatar p">${nameOf(p)[0]}</span>
      <span class="grow small">${esc(nameOf(p))} ${pText}</span>
      <button class="btn" style="min-height:40px;padding:8px 12px" data-act="sticker-picker">Mandar ánimo</button>
    </div>
    <button class="card tight stack" style="gap:8px;text-align:left" data-act="tab" data-tab="juntos">
      <div class="row between"><span class="small row" style="gap:6px">${icon(ch.ch.icon, { size: 16 })}<b>Reto: ${esc(ch.ch.title)}</b></span><span class="pill ${ch.done ? 'good' : ''}">${ch.done ? '¡Logrado!' : `${Math.min(ch[u], ch.ch.target)}/${ch.ch.target} · ${Math.min(ch[p], ch.ch.target)}/${ch.ch.target}`}</span></div>
      <div class="bar"><i style="width:${Math.min(100, ch[u] / ch.ch.target * 100)}%"></i></div>
      <div class="bar p"><i style="width:${Math.min(100, ch[p] / ch.ch.target * 100)}%"></i></div>
    </button>
    <button class="card tight" style="text-align:left" data-act="tab" data-tab="habitos">
      <div class="row between"><span class="small"><b>Hábitos de hoy</b></span><span class="faint small">Abrir ›</span></div>
      <div class="row wrap" style="margin-top:8px">
        <span class="pill ${(h.protein || 0) >= g.protein ? 'good' : ''}">${icon('drumstick', { size: 15 })} ${h.protein || 0}/${g.protein} g</span>
        <span class="pill ${(h.water || 0) >= g.water ? 'good' : ''}">${icon('glass-water', { size: 15 })} ${L.fmtKg(h.water || 0)}/${g.water} L</span>
        <span class="pill ${(h.sleep || 0) >= g.sleep ? 'good' : ''}">${icon('moon', { size: 15 })} ${L.fmtKg(h.sleep || 0)} h</span>
        <span class="pill ${(h.steps || 0) >= g.steps ? 'good' : ''}">${icon('footprints', { size: 15 })} ${(h.steps || 0).toLocaleString('es-MX')}</span>
      </div>
    </button>`;
}

// ---------------- Sesión ----------------
function prefillSets(u, routineId, planItem, ex, sessionId) {
  const sug = L.suggestion(DB().sessions, u, routineId, { ...planItem, ex }, sessionId);
  let n = planItem.sets;
  if (inArranque(u)) n = Math.max(1, n - 1);
  const sets = [];
  for (let j = 0; j < n; j++) {
    if (sug.type === 'up' && sug.weight != null) sets.push({ w: sug.weight, r: '', done: false });
    else if (sug.last) {
      const ls = sug.last.sets[Math.min(j, sug.last.sets.length - 1)];
      sets.push({ w: ls.w || '', r: ls.r, done: false });
    } else sets.push({ w: '', r: '', done: false });
  }
  return sets;
}

function startSession(routineId) {
  const u = me();
  const r = L.routineById(u, routineId);
  const id = uid();
  const s = {
    id, user: u, date: L.today(), routine: r.id, startedAt: Date.now(), finishedAt: null,
    items: r.items.map((it, i) => ({ slot: i, ex: it.ex, base: it.ex, sets: prefillSets(u, r.id, it, it.ex, id) })),
    cardio: { min: r.cardio.min, done: false }, notes: '', energy: null,
  };
  state.draft = s;
  core.store.put('sessions', s);
  showSession();
  const ph = pickPhrase('start');
  openModal(`<div class="celebrate">
      <div class="trophy">${icon('dumbbell', { size: 64, stroke: 1.75 })}</div>
      <span class="eyebrow">${esc(r.name)}</span>
      <p class="quote">“${esc(ph.text)}”</p>
      ${ph.from ? `<p class="quote-from">— ${esc(nameOf(ph.from))}</p>` : ''}
      <button class="btn primary block" data-act="modal-close">¡Vamos!</button>
    </div>`, { centered: true });
}

function pickPhrase(when) {
  const u = me();
  const mine = DB().phrases.filter(p => p.to === u);
  if (mine.length && Math.random() < 0.6) {
    const p = mine[Math.floor(Math.random() * mine.length)];
    return { text: p.text, from: p.from };
  }
  const list = when === 'start' ? PHRASES_START : PHRASES_END;
  return { text: list[Math.floor(Math.random() * list.length)] };
}

function showSession() {
  state.sessionVisible = true;
  $('#session').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderSession();
  $('#session').scrollTop = 0;
}
function hideSession() {
  state.sessionVisible = false;
  $('#session').classList.add('hidden');
  document.body.style.overflow = '';
  render();
}

let saveT = null;
function saveDraftSoon() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { if (state.draft) core.store.put('sessions', state.draft); }, 700);
}
function saveDraftNow() { clearTimeout(saveT); if (state.draft) core.store.put('sessions', state.draft); }

function renderSession() {
  const s = state.draft;
  if (!s) return;
  const u = s.user;
  const r = L.routineById(u, s.routine);
  const total = s.items.reduce((a, it) => a + it.sets.length, 0);
  const done = s.items.reduce((a, it) => a + it.sets.filter(x => x.done).length, 0);
  const sc = $('#session').scrollTop;
  $('#session').innerHTML = `
    <div class="s-top">
      <button class="icon-btn" data-act="minimize" aria-label="Minimizar">${icon('chevron-down')}</button>
      <div class="grow">
        <div class="row between"><b>${esc(r.name)}</b><span class="small muted">${done}/${total} series</span></div>
        <div class="progress-line" style="margin-top:6px"><i style="width:${total ? done / total * 100 : 0}%"></i></div>
      </div>
    </div>
    <div class="s-body">
      ${inArranque(u, s.date) ? `<div class="alert info row-ic">${icon('sprout', { size: 18 })}<span>Arranque: ya te quité una serie por ejercicio. Deja 3–4 reps en reserva.</span></div>` : ''}
      <details class="card tight"><summary class="small"><b>Calentamiento · 10 min</b></summary><p class="muted small" style="margin-top:8px">${esc(r.warmup)}</p></details>
      <div class="alert keep row-ic">${icon('lightbulb', { size: 18 })}<span>${esc(r.key)}</span></div>
      ${s.items.map((it, i) => exCard(s, r, it, i)).join('')}
      <div class="ex ${s.cardio.done ? 'done' : ''}">
        <div class="ex-head"><span class="ex-num">${icon('heart-pulse', { size: 17 })}</span><div class="grow"><div class="ex-name">Cardio</div><div class="ex-meta">${esc(r.cardio.text)}</div></div></div>
        <div class="set ${s.cardio.done ? 'ok' : ''}" style="grid-template-columns:1fr 52px">
          <div class="unit"><input type="number" inputmode="numeric" data-cardio value="${esc(s.cardio.min)}"><small>min</small></div>
          <button class="check" data-act="cardio-done" aria-label="Cardio hecho">${icon('check', { size: 22, stroke: 2.5 })}</button>
        </div>
      </div>
      <div class="card stack">
        <b>¿Cómo te sentiste?</b>
        <div class="energy">${ENERGY.map((e, k) => `<button class="${s.energy === k + 1 ? 'on' : ''}" data-act="energy" data-v="${k + 1}" aria-label="${e.label}">${icon(e.icon, { size: 22 })}<small>${e.label}</small></button>`).join('')}</div>
        <textarea class="field" data-notes placeholder="Notas: cómo te sentiste, qué máquina estaba ocupada, algo que quieras recordar…">${esc(s.notes)}</textarea>
      </div>
    </div>
    <div class="s-bottom"><button class="btn primary block" data-act="finish">Terminar sesión</button></div>`;
  $('#session').scrollTop = sc;
}
core.renderSession = renderSession;

function exCard(s, r, it, i) {
  const plan = r.items[it.slot];
  const ex = EXERCISES[it.ex];
  const kind = ex.kind;
  const sug = L.suggestion(DB().sessions, s.user, s.routine, { ...plan, ex: it.ex }, s.id);
  const allDone = it.sets.length && it.sets.every(x => x.done);
  const range = plan.lo === plan.hi ? `${plan.hi}` : `${plan.lo}–${plan.hi}`;
  const wLabel = kind === 'assist' ? 'asist.' : 'kg';
  const lastTxt = sug.last ? sug.last.sets.map(x => (kind === 'bw' && !x.w ? `${x.r}` : `${L.fmtKg(x.w)}×${x.r}`)).join(' · ') : null;
  const rPh = sug.type === 'up' ? String(plan.lo) : range;
  return `<div class="ex ${allDone ? 'done' : ''}" id="ex${i}">
    <div class="ex-head">
      <span class="ex-num">${allDone ? icon('check', { size: 17, stroke: 2.5 }) : i + 1}</span>
      <div class="grow">
        <div class="ex-name">${esc(ex.name)}</div>
        <div class="ex-meta">${plan.sets} × ${range}${plan.side ? ' por lado' : ''} · descanso ${esc(plan.rest)}${it.ex !== it.base ? ` · <span class="acc">cambiado</span>` : ''}</div>
        ${plan.note ? `<div class="ex-meta row" style="gap:4px">${icon('notebook-pen', { size: 13 })}${esc(plan.note)}</div>` : ''}
      </div>
      <div class="ex-tools">
        <button class="tool" data-act="tips" data-i="${i}" aria-label="Técnica">${icon('info', { size: 18 })}</button>
        <button class="tool" data-act="swap" data-i="${i}" aria-label="Cambiar ejercicio">${icon('arrow-left-right', { size: 18 })}</button>
      </div>
    </div>
    ${state.tipsOpen[i] ? `<ul class="tips">${ex.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    <div class="alert row-ic ${sug.type === 'up' ? 'up' : 'keep'}">${icon(sug.type === 'up' ? 'arrow-up' : sug.type === 'new' ? 'sparkles' : 'equal', { size: 18 })}<span>${esc(sug.text)}</span></div>
    ${sug.alert ? `<div class="alert warn row-ic">${icon('triangle-alert', { size: 18 })}<span><b>${esc(sug.alert.text)}</b><br>${L.STAGNATION_TIPS.slice(0, 3).map(esc).join('<br>')}</span></div>` : ''}
    ${lastTxt ? `<div class="small muted">La vez pasada (${L.fmtShort(sug.last.date)}): ${lastTxt}</div>` : ''}
    <div class="sets-head"><span>#</span><span>${kind === 'assist' ? 'asistencia' : kind === 'bw' ? 'kg (opcional)' : 'kg'}</span><span>reps</span><span></span></div>
    <div class="sets">
      ${it.sets.map((x, j) => `<div class="set ${x.done ? 'ok' : ''}">
        <span class="n">${j + 1}</span>
        <div class="unit"><input type="number" inputmode="decimal" step="0.5" data-i="${i}" data-j="${j}" data-f="w" value="${esc(x.w)}" placeholder="${kind === 'bw' ? '—' : wLabel}"><small>${x.w !== '' && x.w != null ? wLabel : ''}</small></div>
        <div class="unit"><input type="number" inputmode="numeric" data-i="${i}" data-j="${j}" data-f="r" value="${esc(x.r)}" placeholder="${rPh}"><small>${x.r !== '' && x.r != null ? 'reps' : ''}</small></div>
        <button class="check" data-act="set-done" data-i="${i}" data-j="${j}" aria-label="Serie hecha">${icon('check', { size: 22, stroke: 2.5 })}</button>
      </div>`).join('')}
    </div>
    <div class="ex-actions">
      ${sug.last ? `<button class="btn grow" data-act="same" data-i="${i}">${icon('equal', { size: 16 })} Igual que la vez pasada</button>` : '<span class="grow"></span>'}
      <button class="btn ghost" data-act="add-set" data-i="${i}" aria-label="Agregar serie">${icon('plus', { size: 18 })}</button>
      ${it.sets.length > 1 ? `<button class="btn ghost" data-act="rm-set" data-i="${i}" aria-label="Quitar serie">${icon('minus', { size: 18 })}</button>` : ''}
    </div>
  </div>`;
}

function finishSession() {
  const s = state.draft;
  // quita series vacías no marcadas
  s.items.forEach(it => { it.sets = it.sets.filter(x => x.done || (x.r !== '' && x.r != null)); });
  s.items.forEach(it => it.sets.forEach(x => { if (!x.done && L.num(x.r)) x.done = true; }));
  s.finishedAt = Date.now();
  const others = DB().sessions.filter(x => x.id !== s.id);
  s.prs = L.detectPRs([...others, s], s);
  core.store.put('sessions', s);
  state.draft = null;
  state.tipsOpen = {};
  hideSession();
  celebrate(s);
}

function celebrate(s) {
  const prs = s.prs || [];
  const mins = Math.max(1, Math.round((s.finishedAt - s.startedAt) / 60000));
  const ph = pickPhrase('end');
  if (prs.length) confetti();
  openModal(`<div class="celebrate">
    <div class="trophy">${icon(prs.length ? 'trophy' : 'party-popper', { size: 64, stroke: 1.75 })}</div>
    <h2 class="big">${prs.length ? `¡${prs.length} récord${prs.length > 1 ? 's' : ''} nuevo${prs.length > 1 ? 's' : ''}!` : '¡Sesión terminada!'}</h2>
    ${prs.length ? `<div class="list" style="width:100%;text-align:left">${prs.map(p => `<div><b>${esc(p.name)}</b><br><span class="acc">${esc(p.text)}</span></div>`).join('')}</div>` : ''}
    <div class="stats" style="width:100%">
      <div class="stat"><b>${L.sessionSets(s)}</b><span>series</span></div>
      <div class="stat"><b>${Math.round(L.sessionVolume(s)).toLocaleString('es-MX')}</b><span>kg totales</span></div>
      <div class="stat"><b>${mins}</b><span>minutos</span></div>
    </div>
    <p class="quote">“${esc(ph.text)}”</p>
    ${ph.from ? `<p class="quote-from">— ${esc(nameOf(ph.from))}</p>` : ''}
    <button class="btn block" data-act="sticker-picker">Mandarle un sticker a ${esc(nameOf(partner()))}</button>
    <button class="btn primary block" data-act="modal-close">Listo</button>
  </div>`, { centered: true, onClose: () => setTimeout(checkQueue, 300) });
}

// ---------------- Mensajes y logros pendientes ----------------
function checkQueue() {
  if (!state.user || state.sessionVisible || modalOpen()) return;
  if (isCloud() && !core.store.ready) return;
  const u = me();
  const unread = DB().messages.filter(m => m.to === u && !m.read).sort((a, b) => a.at - b.at);
  if (unread.length) return showMessage(unread[0], unread.length);
  checkAchievements();
}

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'justo ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function showMessage(m, count) {
  if (navigator.vibrate) navigator.vibrate(80);
  openModal(`<div class="celebrate">
    <span class="eyebrow p">${esc(nameOf(m.from))} te mandó ${m.kind === 'sticker' ? 'un sticker' : 'un mensaje'} · ${ago(m.at)}</span>
    ${m.kind === 'sticker' ? stickerHtml(m.sticker, 'xl') : `<p class="quote" style="font-size:24px">“${esc(m.text)}”</p>`}
    ${m.kind === 'sticker' && m.text ? `<p class="quote">${esc(m.text)}</p>` : ''}
    <div class="row" style="width:100%"><button class="btn grow" data-act="reply">Responder</button><button class="btn primary grow" data-act="modal-close">${icon('heart', { size: 18, fill: 'currentColor' })} ${count > 1 ? `Siguiente (${count - 1})` : 'Gracias'}</button></div>
  </div>`, { centered: true, onClose: () => {
    // solo se cambia "visto" (las reglas no dejan tocar nada más del mensaje)
    const raw = core.store.get('messages', m.id);
    if (raw && !raw.read) core.store.put('messages', { ...raw, read: true });
    setTimeout(checkQueue, 250);
  } });
}

function checkAchievements() {
  const u = me();
  const db = DB();
  if (!db) return;
  const stats = L.achievementStats(db, u);
  const unlocked = ACHIEVEMENTS.filter(a => a.test(stats)).map(a => a.id);
  const seen = settingsOf(u).seenAch || [];
  const fresh = unlocked.filter(id => !seen.includes(id));
  if (!fresh.length) return;
  saveSettings(u, { seenAch: [...new Set([...seen, ...fresh])] });
  const list = ACHIEVEMENTS.filter(a => fresh.includes(a.id));
  confetti();
  openModal(`<div class="celebrate">
    <span class="eyebrow">¡Logro desbloqueado!</span>
    <div class="ach-grid" style="grid-template-columns:repeat(${Math.min(3, list.length)},1fr);width:100%">
      ${list.map(a => `<div class="ach"><span class="e">${icon(a.icon, { size: 30, stroke: 1.75 })}</span><b>${esc(a.title)}</b><span>${esc(a.desc)}</span></div>`).join('')}
    </div>
    <button class="btn primary block" data-act="modal-close">¡Genial!</button>
  </div>`, { centered: true });
}

// ---------------- Ajustes ----------------
function openSettings() {
  const u = me(), st = settingsOf(u), g = L.goalsOf(u, DB().settingsMap), p = partner();
  const share = [['train', 'Entrenamientos y récords'], ['notes', 'Notas de mis sesiones'], ['weight', 'Peso corporal'], ['measures', 'Medidas'], ['habits', 'Hábitos']];
  const mode = core.store.mode === 'firebase'
    ? `Sincronizado con Firebase. Estado: <b>${esc(core.store.status)}</b>${core.store.errorMsg ? ` (${esc(core.store.errorMsg)})` : ''}`
    : 'Modo local: los datos se guardan solo en este teléfono. Llena <b>firebase-config.js</b> para sincronizar.';
  openModal(`
    <div class="row between"><h2>Ajustes</h2><button class="icon-btn" data-act="modal-close" aria-label="Cerrar">${icon('x')}</button></div>
    ${isCloud() ? '' : `<button class="btn block" data-act="switch-user">Cambiar a ${esc(nameOf(p))}</button>`}
    <div class="stack" style="gap:8px">
      <b>Apariencia</b>
      <div class="seg">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, l]) => `<button class="${getThemePref() === k ? 'on' : ''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div>
      <p class="faint small">Automático usa el mismo tema que tu celular. Se guarda solo en este teléfono.</p>
    </div>
    <div class="stack" style="gap:8px">
      <b>Qué puede ver ${esc(nameOf(p))}</b>
      ${share.map(([k, l]) => `<label class="opt"><input type="checkbox" data-share="${k}" ${st.share[k] ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--acc)"><span class="grow">${l}</span></label>`).join('')}
      <p class="faint small">Las fotos nunca se comparten: se quedan en tu teléfono.</p>
    </div>
    <div class="stack" style="gap:8px">
      <b>Mis metas diarias</b>
      <div class="row"><label class="grow"><span class="lbl">Proteína (g)</span><input class="field" type="number" inputmode="numeric" data-goal="protein" value="${g.protein}"></label>
      <label class="grow"><span class="lbl">Agua (L)</span><input class="field" type="number" inputmode="decimal" step="0.25" data-goal="water" value="${g.water}"></label></div>
      <div class="row"><label class="grow"><span class="lbl">Sueño (h)</span><input class="field" type="number" inputmode="decimal" step="0.5" data-goal="sleep" value="${g.sleep}"></label>
      <label class="grow"><span class="lbl">Pasos</span><input class="field" type="number" inputmode="numeric" data-goal="steps" value="${g.steps}"></label></div>
      <button class="btn primary block" data-act="save-goals">Guardar metas</button>
    </div>
    <div class="stack" style="gap:8px"><b>Sincronización</b><p class="muted small">${mode}</p></div>
    <button class="btn ghost block" data-act="export">Descargar respaldo (JSON)</button>
    ${isCloud() ? `<div class="stack" style="gap:8px"><b>Cuenta</b><p class="muted small">${esc(core.store.email || '')}</p><button class="btn ghost block danger" data-act="logout">Cerrar sesión</button></div>` : ''}
    <p class="faint small center">Chiquis · v2</p>`);
}

function exportBackup() {
  const data = {};
  for (const c of ['sessions', 'body', 'measures', 'habits', 'messages', 'phrases', 'challenges', 'settings']) data[c] = core.store.all(c);
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chiquis-respaldo-${L.today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------- Acciones ----------------
const actions = {
  'pick-user': el => {
    if (isCloud()) return; state.user = el.dataset.u; localStorage.setItem('gym.user', state.user); state.tab = 'hoy'; state.progView = 'me'; render(); setTimeout(checkQueue, 400); },
  login: () => core.store.signIn(),
  logout: () => confirmBox('¿Cerrar sesión en este teléfono?', 'Cerrar sesión', () => core.store.signOut()),
  'switch-user': () => {
    if (isCloud()) return;
    closeModal();
    if (state.draft) { saveDraftNow(); state.draft = null; }
    if (state.sessionVisible) hideSession();
    state.user = partner(); localStorage.setItem('gym.user', state.user);
    state.progView = 'me'; state.photos = null; state.photoSel = []; state.tab = 'hoy'; state.habitDate = L.today();
    render(); toast(`Ahora eres ${nameOf(state.user)}`); setTimeout(checkQueue, 400);
  },
  tab: el => { state.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  settings: openSettings,
  'modal-close': () => closeModal(),
  start: el => { closeModal(); startSession(el.dataset.r); },
  'pick-routine': () => {
    const u = me(), next = L.nextRoutine(DB().sessions, u);
    openModal(`<h2>¿Qué rutina vas a hacer?</h2>
      ${ROUTINES[u].map(r => `<button class="opt" data-act="start" data-r="${r.id}"><span class="grow"><b>${esc(r.name)}</b>${r.id === next.id ? ' <span class="pill acc">te toca</span>' : ''}<br><span class="muted small">${esc(r.subtitle)}</span></span>›</button>`).join('')}
      <button class="btn ghost" data-act="modal-close">Cancelar</button>`);
  },
  resume: () => { state.draft = openSessionOf(me()); if (state.draft) showSession(); },
  discard: () => confirmBox('¿Descartar esta sesión? Se borra lo que anotaste.', 'Sí, descartar', () => {
    const o = openSessionOf(me()); if (o) core.store.del('sessions', o.id); state.draft = null; render();
  }, { danger: true }),
  minimize: () => { saveDraftNow(); hideSession(); },
  tips: el => { const i = el.dataset.i; state.tipsOpen[i] = !state.tipsOpen[i]; renderSession(); },
  'set-done': el => {
    const it = state.draft.items[el.dataset.i];
    const x = it.sets[el.dataset.j];
    if (!x.done) {
      const row = el.closest('.set');
      const rIn = row.querySelector('[data-f=r]'), wIn = row.querySelector('[data-f=w]');
      if (x.r === '' || x.r == null) {
        const ph = rIn.placeholder.includes('–') ? null : L.num(rIn.placeholder);
        if (!ph) { toast('Escribe cuántas reps hiciste'); rIn.focus(); return; }
        x.r = ph;
      }
      if ((x.w === '' || x.w == null) && EXERCISES[it.ex].kind !== 'bw') { toast('Escribe el peso'); wIn.focus(); return; }
      x.done = true;
      if (navigator.vibrate) navigator.vibrate(30);
    } else x.done = false;
    saveDraftNow(); renderSession();
  },
  same: el => {
    const i = el.dataset.i, it = state.draft.items[i], s = state.draft;
    const plan = L.routineById(s.user, s.routine).items[it.slot];
    const sug = L.suggestion(DB().sessions, s.user, s.routine, { ...plan, ex: it.ex }, s.id);
    if (!sug.last) return;
    it.sets = sug.last.sets.map(x => ({ w: x.w, r: x.r, done: true }));
    if (navigator.vibrate) navigator.vibrate(30);
    saveDraftNow(); renderSession(); toast('Copiado igual que la vez pasada');
  },
  'add-set': el => { const it = state.draft.items[el.dataset.i]; const l = it.sets[it.sets.length - 1] || {}; it.sets.push({ w: l.w ?? '', r: '', done: false }); saveDraftNow(); renderSession(); },
  'rm-set': el => { const it = state.draft.items[el.dataset.i]; if (it.sets.length > 1) it.sets.pop(); saveDraftNow(); renderSession(); },
  swap: el => {
    const i = el.dataset.i, it = state.draft.items[i];
    const base = EXERCISES[it.base];
    const opts = [it.base, ...base.alts].filter(x => x !== it.ex && EXERCISES[x]);
    openModal(`<h2>Cambiar ${esc(EXERCISES[it.ex].name)}</h2>
      <p class="muted small">Por si la máquina está ocupada. La progresión de cada ejercicio se guarda por separado.</p>
      ${opts.map(x => `<button class="opt" data-act="swap-to" data-i="${i}" data-ex="${x}"><span class="grow"><b>${esc(EXERCISES[x].name)}</b>${x === it.base ? ' <span class="pill">original</span>' : ''}<br><span class="muted small">${esc(EXERCISES[x].tips[0])}</span></span>›</button>`).join('')}
      <button class="btn ghost" data-act="modal-close">Cancelar</button>`);
  },
  'swap-to': el => {
    const s = state.draft, it = s.items[el.dataset.i];
    const plan = L.routineById(s.user, s.routine).items[it.slot];
    it.ex = el.dataset.ex;
    it.sets = prefillSets(s.user, s.routine, plan, it.ex, s.id);
    closeModal(); saveDraftNow(); renderSession(); toast('Ejercicio cambiado');
  },
  'cardio-done': () => { const c = state.draft.cardio; c.done = !c.done; saveDraftNow(); renderSession(); },
  energy: el => { state.draft.energy = Number(el.dataset.v); saveDraftNow(); renderSession(); },
  finish: () => {
    const s = state.draft;
    const left = s.items.reduce((a, it) => a + it.sets.filter(x => !x.done).length, 0);
    if (left) confirmBox(`Te faltan <b>${left}</b> series sin marcar. ¿Terminar de todos modos?`, 'Terminar', finishSession);
    else finishSession();
  },
  'view-session': el => sessionDetail(el.dataset.id),
  'sticker-picker': () => stickerPicker(),
  reply: () => { closeModal(); setTimeout(() => stickerPicker(), 50); },
  'save-goals': () => {
    const goals = {};
    document.querySelectorAll('[data-goal]').forEach(i => { const v = L.num(i.value); if (v != null && v > 0) goals[i.dataset.goal] = v; });
    saveSettings(me(), { goals }); closeModal(); toast('Metas guardadas'); render();
  },
  export: exportBackup,
  theme: el => { setThemePref(el.dataset.v); render(); openSettings(); },
  ...viewActions,
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const f = actions[el.dataset.act];
  if (f) { e.preventDefault(); f(el, e); }
});

// Entradas dentro de la sesión
$('#session').addEventListener('input', e => {
  const t = e.target, s = state.draft;
  if (!s) return;
  if (t.dataset.f) {
    const x = s.items[t.dataset.i].sets[t.dataset.j];
    x[t.dataset.f] = t.value === '' ? '' : L.num(t.value);
    const small = t.parentElement.querySelector('small');
    if (small) small.textContent = t.value ? (t.dataset.f === 'r' ? 'reps' : EXERCISES[s.items[t.dataset.i].ex].kind === 'assist' ? 'asist.' : 'kg') : '';
  } else if (t.hasAttribute('data-cardio')) s.cardio.min = L.num(t.value) || 0;
  else if (t.hasAttribute('data-notes')) s.notes = t.value;
  saveDraftSoon();
});

// Ajustes: compartir (cambia al instante)
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.share) {
    const st = settingsOf(me());
    saveSettings(me(), { share: { ...st.share, [t.dataset.share]: t.checked } });
    toast(t.checked ? 'Ahora lo puede ver' : 'Ya no lo puede ver');
  } else if (t.matches('[data-photo-input]')) onPhotoInput(t);
  else onViewChange(t);
});

// ---------------- Inicio ----------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
(async function init() {
  core.store = await createStore();
  buildDB();
  core.store.on(() => {
    buildDB();
    if (state.draft) {
      // mantener la sesión en curso como la tenemos en memoria
    }
    render();
    if (!state.sessionVisible) setTimeout(checkQueue, 200);
  });
  render();
  await core.store.start();
  // si quedó una sesión abierta de hoy, ofrecer continuar (no se abre sola)
  setTimeout(checkQueue, 600);
})();

// Refresca la pantalla al volver a la app (cambio de día, mensajes nuevos)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user) {
    if (state.habitDate !== L.today() && state.tab !== 'habitos') state.habitDate = L.today();
    render(); setTimeout(checkQueue, 300);
  }
});
