// ============================================================
//  Pantallas: Progreso, Hábitos, Juntos y Logros
// ============================================================
import { USERS, USER_IDS, EXERCISES, ROUTINES, STICKERS, CHALLENGES, ACHIEVEMENTS, ENERGY } from './data.js';
import * as L from './logic.js';
import { uid, photos, shrinkImage } from './store.js';
import { icon } from './icons.js';
import { $, esc, toast, openModal, closeModal, confirmBox, stickerHtml, lineChart } from './ui.js';
import { state, core, me, partner, nameOf, settingsOf, canSee } from './core.js';

const DB = () => core.db;
const render = () => core.render();
const colorOf = u => USERS[u].color;
const locked = (u, what) => `<div class="card empty"><span class="faint">${icon('lock', { size: 28 })}</span><br>${esc(nameOf(u))} no comparte ${what}.<br><span class="small faint">Lo puede activar en sus Ajustes.</span></div>`;

// ============================================================
//  PROGRESO
// ============================================================
const RANGES = [['semana', 'Semana', 7], ['mes', 'Mes', 30], ['3m', '3 meses', 91], ['6m', '6 meses', 182], ['año', 'Año', 365]];

export function viewProgreso() {
  const isMe = state.progView !== 'partner';
  const u = isMe ? me() : partner();
  if (!isMe && state.progSub === 'fotos') state.progSub = 'resumen';
  const subs = [['resumen', 'Resumen'], ['fuerza', 'Fuerza'], ['peso', 'Peso'], ['medidas', 'Medidas'], ['fotos', 'Fotos'], ['calendario', 'Calendario']]
    .filter(([k]) => isMe || k !== 'fotos');
  const views = { resumen: progResumen, fuerza: progFuerza, peso: progPeso, medidas: progMedidas, fotos: progFotos, calendario: progCalendario };
  return `
    <div class="seg">
      <button class="${isMe ? 'on' : ''}" data-act="prog-view" data-v="me">Yo</button>
      <button class="${!isMe ? 'on' : ''}" data-act="prog-view" data-v="partner">${esc(nameOf(partner()))}</button>
    </div>
    <div class="chips grid3">${subs.map(([k, l]) => `<button class="chip ${state.progSub === k ? 'on' : ''}" data-act="prog-sub" data-v="${k}">${l}</button>`).join('')}</div>
    ${(views[state.progSub] || progResumen)(u)}`;
}

export function weekSummary(u, wk) {
  const db = DB();
  const st = L.weekStats(db, u, wk);
  const prev = L.weekStats(db, u, L.addDays(wk, -7));
  const g = L.goalsOf(u, db.settingsMap);
  let wTxt = '';
  if (canSee(u, 'weight') && st.avgWeight != null) {
    const d = prev.avgWeight != null ? L.round1(st.avgWeight - prev.avgWeight) : null;
    wTxt = `<div class="row between"><span class="row" style="gap:8px"><span class="muted">${icon('scale', { size: 16 })}</span>Peso promedio</span><b>${L.fmtKg(st.avgWeight)} kg ${d != null ? `<span class="small ${d <= 0 ? 'acc' : 'muted'}">(${d > 0 ? '+' : ''}${d})</span>` : ''}</b></div>`;
  }
  const habits = canSee(u, 'habits') ? `
    <div class="row between"><span class="row" style="gap:8px"><span class="muted">${icon('drumstick', { size: 16 })}</span>Proteína (${g.protein} g)</span><b>${st.proteinDays}/7 días</b></div>
    <div class="row between"><span class="row" style="gap:8px"><span class="muted">${icon('glass-water', { size: 16 })}</span>Agua (${g.water} L)</span><b>${st.waterDays}/7 días</b></div>
    <div class="row between"><span class="row" style="gap:8px"><span class="muted">${icon('moon', { size: 16 })}</span>Sueño (${g.sleep} h+)</span><b>${st.sleepDays}/7 noches</b></div>
    <div class="row between"><span class="row" style="gap:8px"><span class="muted">${icon('footprints', { size: 16 })}</span>Pasos (${g.steps.toLocaleString('es-MX')})</span><b>${st.stepDays}/7 días</b></div>` : '';
  return `
    <div class="stats">
      <div class="stat"><b>${st.sessions}<span class="muted" style="font-size:16px">/4</span></b><span>sesiones</span></div>
      <div class="stat"><b>${st.sets}</b><span>series</span></div>
      <div class="stat"><b>${st.volume >= 10000 ? (st.volume / 1000).toFixed(1) + 'k' : st.volume.toLocaleString('es-MX')}</b><span>kg totales${prev.volume && L.addDays(wk, 6) < L.today() ? ` (${st.volume >= prev.volume ? '+' : ''}${Math.round((st.volume - prev.volume) / prev.volume * 100)}%)` : ''}</span></div>
    </div>
    <div class="list small">
      <div class="row between"><span class="row" style="gap:8px"><span class="muted">${icon('trophy', { size: 16 })}</span>Récords</span><b>${st.prs.length}</b></div>
      ${st.prs.slice(0, 6).map(p => `<div class="muted" style="padding-left:24px">${esc(p.name)} · <span class="acc">${esc(p.text)}</span></div>`).join('')}
      <div class="row between"><span class="row" style="gap:8px"><span class="muted">${icon('heart-pulse', { size: 16 })}</span>Cardio hecho</span><b>${st.cardio} sesiones</b></div>
      ${wTxt}${habits}
    </div>
    ${st.sessionsList.length ? `<div class="list">${st.sessionsList.map(s => `
      <button class="row" style="text-align:left" data-act="view-session" data-id="${s.id}">
        <span class="grow"><b>${esc(L.routineById(u, s.routine)?.name || s.routine)}</b><br><span class="small muted">${esc(L.dayName(s.date))} ${L.fmtShort(s.date)} · ${L.sessionSets(s)} series${s.prs?.length ? ` · ${s.prs.length} récord${s.prs.length > 1 ? 's' : ''}` : ''}</span></span>›</button>`).join('')}</div>` : ''}`;
}

function progResumen(u) {
  if (!canSee(u, 'train')) return locked(u, 'sus entrenamientos');
  const wk = L.addDays(L.weekStart(L.today()), 7 * state.sumWeek);
  const label = state.sumWeek === 0 ? 'Esta semana' : state.sumWeek === -1 ? 'Semana pasada' : `Semana del ${L.fmtShort(wk)}`;
  const ws = L.weekStreak(DB().sessions, u);
  return `<div class="card stack">
    <div class="row between">
      <button class="icon-btn" data-act="sum-week" data-d="-1" aria-label="Semana anterior">‹</button>
      <div class="center"><span class="eyebrow ${u !== me() ? 'p' : ''}">Resumen</span><h2>${label}</h2><span class="small muted">${L.fmtShort(wk)} – ${L.fmtShort(L.addDays(wk, 6))}</span></div>
      <button class="icon-btn" data-act="sum-week" data-d="1" ${state.sumWeek >= 0 ? 'disabled style="opacity:.3"' : ''} aria-label="Semana siguiente">›</button>
    </div>
    ${weekSummary(u, wk)}
  </div>
  <div class="card row">
    <span class="acc">${icon('flame', { size: 34 })}</span>
    <span class="grow"><b>${ws.current} semana${ws.current === 1 ? '' : 's'} seguidas</b> de 4 de 4<br><span class="small muted">Mejor racha: ${ws.best} · Esta semana: ${ws.thisWeek}/4</span></span>
  </div>`;
}

function exercisesWithData(u) {
  const count = {};
  for (const s of L.finished(DB().sessions, u)) for (const it of s.items || []) if ((it.sets || []).some(x => x.done)) count[it.ex] = (count[it.ex] || 0) + 1;
  return Object.keys(count).filter(x => EXERCISES[x]).sort((a, b) => count[b] - count[a]);
}

function progFuerza(u) {
  if (!canSee(u, 'train')) return locked(u, 'sus entrenamientos');
  const list = exercisesWithData(u);
  if (!list.length) return `<div class="card empty">Cuando termines tu primera sesión, aquí vas a ver cómo sube tu fuerza en cada ejercicio.</div>`;
  if (!list.includes(state.chartEx)) state.chartEx = list[0];
  const exId = state.chartEx, ex = EXERCISES[exId], kind = ex.kind;
  const metrics = kind === 'bw' ? [['reps', 'Reps máximas']] : kind === 'assist' ? [['assist', 'Asistencia']] : [['peso', 'Peso máximo'], ['1rm', '1RM estimado']];
  if (!metrics.some(m => m[0] === state.chartMetric)) state.chartMetric = metrics[0][0];
  const days = RANGES.find(r => r[0] === state.chartRange)[2];
  const from = L.addDays(L.today(), -days);
  const hist = L.exerciseHistory(DB().sessions, u, exId);
  const pointOf = h => {
    const top = Math.max(...h.sets.map(s => s.w)), low = Math.min(...h.sets.map(s => s.w));
    if (state.chartMetric === 'reps') { const r = Math.max(...h.sets.map(s => s.r)); return { d: h.date, y: r, label: `${r} reps` }; }
    if (state.chartMetric === 'assist') { const r = Math.max(...h.sets.filter(s => s.w === low).map(s => s.r)); return { d: h.date, y: low, label: `asist. ${L.fmtKg(low)} kg × ${r}` }; }
    if (state.chartMetric === '1rm') { const b = Math.max(...h.sets.map(s => L.e1rm(s.w, s.r))); return { d: h.date, y: L.round1(b), label: `1RM ≈ ${L.fmtKg(L.round1(b))} kg` }; }
    const r = Math.max(...h.sets.filter(s => s.w === top).map(s => s.r));
    return { d: h.date, y: top, label: `${L.fmtKg(top)} kg × ${r}` };
  };
  let pts = hist.filter(h => h.date >= from).map(pointOf);
  // por día: queda el mejor
  const better = (a, b) => (state.chartMetric === 'assist' ? a.y < b.y : a.y > b.y);
  const byKey = (keyFn) => { const m = {}; pts.forEach(p => { const k = keyFn(p.d); if (!m[k] || better(p, m[k])) m[k] = { ...p }; }); return Object.values(m); };
  pts = byKey(d => d);
  if (days >= 182) pts = byKey(d => L.weekStart(d));
  const unit = state.chartMetric === 'reps' ? 'reps' : 'kg';
  const all = hist.map(pointOf);
  const best = all.reduce((a, p) => (!a || better(p, a) ? p : a), null);
  const first = pts[0], last = pts[pts.length - 1];
  const delta = first && last && pts.length > 1 ? L.round1(last.y - first.y) : null;
  return `<div class="card stack">
    <select class="field" data-chart-ex>${list.map(x => `<option value="${x}" ${x === exId ? 'selected' : ''}>${esc(EXERCISES[x].name)}</option>`).join('')}</select>
    <div class="chips">${RANGES.map(([k, l]) => `<button class="chip ${state.chartRange === k ? 'on' : ''}" data-act="chart-range" data-v="${k}">${l}</button>`).join('')}</div>
    ${metrics.length > 1 ? `<div class="seg">${metrics.map(([k, l]) => `<button class="${state.chartMetric === k ? 'on' : ''}" data-act="chart-metric" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
    <div class="row between"><b>${esc(ex.name)}</b>${delta != null ? `<span class="pill ${(kind === 'assist' ? delta < 0 : delta > 0) ? 'good' : ''}">${delta > 0 ? '+' : ''}${L.fmtKg(delta)} ${unit} en el periodo</span>` : ''}</div>
    ${lineChart([{ name: ex.name, color: colorOf(u), points: pts }], { unit, invert: false })}
    ${days >= 182 ? '<p class="faint small">Cada punto es la mejor marca de esa semana. Toca un punto para ver el detalle.</p>' : '<p class="faint small">Toca un punto para ver el detalle.</p>'}
    ${kind === 'assist' ? '<p class="faint small">En la dominada asistida, que la línea baje es bueno: necesitas menos ayuda.</p>' : ''}
    ${state.chartMetric === '1rm' ? '<p class="faint small">1RM estimado = lo máximo que podrías levantar 1 vez, calculado con tus series (fórmula de Epley). Sirve para comparar días con distintas reps.</p>' : ''}
  </div>
  <div class="card stack">
    <div class="row between"><b>Mejor marca</b><span class="acc">${best ? esc(best.label) : '—'}${best ? ` · ${L.fmtShort(best.d)}` : ''}</span></div>
    <div class="list small">${hist.slice(-6).reverse().map(h => `<div class="row between"><span class="muted">${L.fmtShort(h.date)}</span><span>${h.sets.map(s => (kind === 'bw' && !s.w ? s.r : `${L.fmtKg(s.w)}×${s.r}`)).join(' · ')}</span></div>`).join('')}</div>
  </div>`;
}

function progPeso(u) {
  if (!canSee(u, 'weight')) return locked(u, 'su peso');
  const db = DB();
  const entries = db.body.filter(b => b.user === u).sort((a, b) => (a.date < b.date ? -1 : 1));
  const days = RANGES.find(r => r[0] === state.weightRange)[2];
  const from = L.addDays(L.today(), -days);
  const inR = entries.filter(e => e.date >= from);
  const weeks = {};
  inR.forEach(e => { const w = L.weekStart(e.date); (weeks[w] = weeks[w] || []).push(e.kg); });
  const avgPts = Object.entries(weeks).map(([w, ks]) => ({ d: L.addDays(w, 3), y: L.round1(ks.reduce((a, b) => a + b, 0) / ks.length), label: `promedio semana: ${L.fmtKg(L.round1(ks.reduce((a, b) => a + b, 0) / ks.length))} kg` }));
  const tr = L.weightTrend(db, u);
  const todayE = entries.find(e => e.date === L.today());
  return `
  ${u === me() ? `<div class="card stack">
    <b>Registrar peso de hoy</b>
    <div class="row"><input class="field grow" type="number" inputmode="decimal" step="0.1" data-weight-input placeholder="kg" value="${todayE ? todayE.kg : ''}"><button class="btn primary" data-act="add-weight">Guardar</button></div>
    <p class="faint small">Pésate 3 mañanas por semana: al despertar, después del baño y antes de desayunar. Lo que importa es el promedio de la semana, no el número de un día.</p>
  </div>` : ''}
  <div class="card stack">
    <div class="chips">${RANGES.slice(1).map(([k, l]) => `<button class="chip ${state.weightRange === k ? 'on' : ''}" data-act="weight-range" data-v="${k}">${l}</button>`).join('')}</div>
    ${lineChart([
      { name: 'Pesadas', color: colorOf(u), points: inR.map(e => ({ d: e.date, y: e.kg, label: `${L.fmtKg(e.kg)} kg` })), line: false, opacity: .45, r: 3.5 },
      { name: 'Promedio semanal', color: colorOf(u), points: avgPts, dots: true },
    ], { unit: 'kg' })}
    <div class="legend"><span><i class="dotl" style="background:${colorOf(u)};opacity:.45"></i>Cada pesada</span><span><i style="background:${colorOf(u)}"></i>Promedio semanal</span></div>
  </div>
  <div class="card stack">
    <div class="stats" style="grid-template-columns:1fr 1fr">
      <div class="stat"><b>${tr.thisAvg != null ? L.fmtKg(tr.thisAvg) : '—'}</b><span>promedio esta semana</span></div>
      <div class="stat"><b>${tr.lastAvg != null ? L.fmtKg(tr.lastAvg) : '—'}</b><span>semana pasada</span></div>
    </div>
    ${tr.msg ? `<div class="alert ${tr.tone === 'good' ? 'up' : tr.tone === 'warn' ? 'warn' : 'keep'}">${esc(tr.msg)}</div>` : '<p class="muted small">Con 2 semanas de pesadas te digo si vas al ritmo de tu meta.</p>'}
  </div>
  ${entries.length ? `<div class="card"><b>Historial</b><div class="list small" style="margin-top:6px">${entries.slice(-10).reverse().map(e => `
    <div class="row"><span class="grow muted">${esc(L.dayName(e.date))} ${L.fmtShort(e.date)}</span><b>${L.fmtKg(e.kg)} kg</b>${u === me() ? `<button class="tool" data-act="del-weight" data-id="${e.id}" aria-label="Borrar">${icon('x', { size: 16 })}</button>` : ''}</div>`).join('')}</div></div>` : ''}`;
}

const MEASURES = [['cintura', 'Cintura'], ['cadera', 'Cadera'], ['pecho', 'Pecho'], ['brazo', 'Brazo'], ['pierna', 'Pierna']];
function progMedidas(u) {
  if (!canSee(u, 'measures')) return locked(u, 'sus medidas');
  const list = DB().measures.filter(m => m.user === u).sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = list[0], last = list[list.length - 1];
  const since = last ? L.daysBetween(last.date, L.today()) : null;
  return `
  ${u === me() ? `<div class="card stack">
    <div class="row between"><b>Nuevas medidas (cm)</b>${since != null ? `<span class="pill ${since >= 14 ? 'warn' : ''}">última: hace ${since} días</span>` : ''}</div>
    ${since == null || since >= 14 ? `<div class="alert info row-ic">${icon('ruler', { size: 18 })}<span>Toca medirte. Hazlo cada 2 a 4 semanas, en la mañana y siempre en el mismo punto.</span></div>` : ''}
    <div class="stats" style="grid-template-columns:repeat(2,1fr)">${MEASURES.map(([k, l]) => `<label><span class="lbl">${l}</span><input class="field" type="number" inputmode="decimal" step="0.5" data-measure="${k}" placeholder="${last?.[k] ?? 'cm'}"></label>`).join('')}</div>
    <button class="btn primary block" data-act="add-measure">Guardar medidas</button>
  </div>` : ''}
  ${list.length ? `<div class="card stack">
    <b>Cambio desde el inicio</b>
    <div class="list small">
      <div class="row muted"><span class="grow">Medida</span><span style="width:64px;text-align:right">${L.fmtShort(first.date)}</span><span style="width:64px;text-align:right">${L.fmtShort(last.date)}</span><span style="width:60px;text-align:right">Cambio</span></div>
      ${MEASURES.map(([k, l]) => {
        const a = first[k], b = last[k];
        const d = a != null && b != null ? L.round1(b - a) : null;
        return `<div class="row"><span class="grow">${l}</span><span style="width:64px;text-align:right">${a ?? '—'}</span><span style="width:64px;text-align:right">${b ?? '—'}</span><b style="width:60px;text-align:right">${d == null ? '—' : (d > 0 ? '+' : '') + d}</b></div>`;
      }).join('')}
    </div>
  </div>
  <div class="card"><b>Historial</b><div class="list small" style="margin-top:6px">${list.slice().reverse().map(m => `
    <div class="row"><span class="grow"><b>${L.fmtShort(m.date)}</b><br><span class="muted">${MEASURES.filter(([k]) => m[k] != null).map(([k, l]) => `${l} ${m[k]}`).join(' · ')}</span></span>${u === me() ? `<button class="tool" data-act="del-measure" data-id="${m.id}" aria-label="Borrar">${icon('x', { size: 16 })}</button>` : ''}</div>`).join('')}</div></div>`
  : `<div class="card empty">Todavía no hay medidas.</div>`}`;
}

function progFotos() {
  if (state.photos === null) {
    state.photos = 'loading';
    photos.all(me()).then(list => { state.photos = list; render(); }).catch(() => { state.photos = []; render(); });
  }
  if (state.photos === 'loading') return '<div class="card empty">Cargando fotos…</div>';
  // Solo imágenes que generó la app
  const list = state.photos.filter(p => typeof p.data === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.data) && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && /^[A-Za-z0-9_-]+$/.test(p.id));
  const sel = state.photoSel.map(id => list.find(p => p.id === id)).filter(Boolean);
  let top = '';
  if (sel.length === 2) {
    const [a, b] = sel.sort((x, y) => (x.date < y.date ? -1 : 1));
    top = `<div class="card stack"><div class="row between"><b>Comparar</b><button class="link" data-act="photo-clear">Quitar selección</button></div>
      <div class="compare"><div><img src="${a.data}" alt="Foto ${L.fmtShort(a.date)}"><p class="small muted center">${L.fmtShort(a.date)}</p></div><div><img src="${b.data}" alt="Foto ${L.fmtShort(b.date)}"><p class="small muted center">${L.fmtShort(b.date)}</p></div></div>
      <p class="small muted center">${L.daysBetween(a.date, b.date)} días de diferencia</p></div>`;
  } else if (sel.length === 1) {
    const a = sel[0];
    top = `<div class="card stack"><img src="${a.data}" alt="Foto" style="width:100%;border-radius:12px"><div class="row between"><span class="muted small">${L.fmtLong(a.date)} · elige otra para comparar</span><button class="btn danger" style="min-height:40px" data-act="photo-del" data-id="${a.id}">Borrar</button></div></div>`;
  }
  return `<div class="card stack">
    <label class="btn primary block">${icon('camera', { size: 18 })} Agregar foto<input type="file" accept="image/*" data-photo-input hidden></label>
    <p class="faint small">Las fotos se guardan <b>solo en este teléfono</b>: ${esc(nameOf(partner()))} no las ve y no se suben a internet. Tómalas con la misma luz y la misma pose cada 2 a 4 semanas.</p>
  </div>
  ${top}
  ${list.length ? `<div class="photo-grid">${list.map(p => `<button class="${state.photoSel.includes(p.id) ? 'sel' : ''}" data-act="photo-sel" data-id="${p.id}"><img src="${p.data}" alt="Foto ${L.fmtShort(p.date)}" loading="lazy"><span>${L.fmtShort(p.date)}</span></button>`).join('')}</div>` : '<div class="card empty">Todavía no tienes fotos.</div>'}`;
}

function progCalendario() {
  const m = state.calMonth || L.today().slice(0, 7);
  const [y, mo] = m.split('-').map(Number);
  const first = `${m}-01`;
  const lead = (L.dow(first) + 6) % 7;
  const nDays = new Date(y, mo, 0).getDate();
  const db = DB();
  const who = USER_IDS.filter(u => canSee(u, 'train'));
  const byDay = {};
  for (const u of who) for (const s of L.finished(db.sessions, u)) if (s.date.startsWith(m)) (byDay[s.date] = byDay[s.date] || new Set()).add(u);
  const t = L.today();
  let cells = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<div class="h">${d}</div>`).join('');
  for (let i = 0; i < lead; i++) cells += '<div class="d out"></div>';
  let countMe = 0, countBoth = 0;
  for (let d = 1; d <= nDays; d++) {
    const ds = `${m}-${L.pad(d)}`;
    const set = byDay[ds] || new Set();
    if (set.has(me())) countMe++;
    if (set.size === 2) countBoth++;
    cells += `<button class="d ${ds === t ? 'today' : ''} ${!L.isTrainDay(ds) ? 'rest' : ''}" ${set.size ? `data-act="cal-day" data-d="${ds}"` : ''}>
      <span>${d}</span><span class="dots">${[...set].map(u => `<i style="background:${colorOf(u)}"></i>`).join('')}</span></button>`;
  }
  const prevM = (() => { const d = new Date(y, mo - 2, 1); return `${d.getFullYear()}-${L.pad(d.getMonth() + 1)}`; })();
  const nextM = (() => { const d = new Date(y, mo, 1); return `${d.getFullYear()}-${L.pad(d.getMonth() + 1)}`; })();
  return `<div class="card stack">
    <div class="row between">
      <button class="icon-btn" data-act="cal-month" data-m="${prevM}" aria-label="Mes anterior">‹</button>
      <h2 style="text-transform:capitalize">${L.monthName(mo - 1)} ${y}</h2>
      <button class="icon-btn" data-act="cal-month" data-m="${nextM}" ${nextM > L.today().slice(0, 7) ? 'disabled style="opacity:.3"' : ''} aria-label="Mes siguiente">›</button>
    </div>
    <div class="cal">${cells}</div>
    <div class="legend">${who.map(u => `<span><i class="dotl" style="background:${colorOf(u)}"></i>${esc(nameOf(u))}</span>`).join('')}<span class="faint">Días atenuados = descanso</span></div>
    <div class="stats" style="grid-template-columns:1fr 1fr">
      <div class="stat"><b>${countMe}</b><span>tus sesiones este mes</span></div>
      <div class="stat"><b>${countBoth}</b><span>días que fueron los dos</span></div>
    </div>
  </div>`;
}

export function sessionDetail(id) {
  const s = DB().sessions.find(x => x.id === id);
  if (!s) return;
  const u = s.user;
  const r = L.routineById(u, s.routine);
  openModal(`
    <div class="row between"><div><span class="eyebrow ${u !== me() ? 'p' : ''}">${esc(nameOf(u))} · ${esc(L.fmtLong(s.date))}</span><h2>${esc(r?.name || s.routine)}</h2></div><button class="icon-btn" data-act="modal-close" aria-label="Cerrar">${icon('x', { size: 20 })}</button></div>
    ${s.prs?.length ? `<div class="alert up row-ic">${icon('trophy', { size: 18 })}<span>${s.prs.map(p => `<b>${esc(p.name)}</b>: ${esc(p.text)}`).join('<br>')}</span></div>` : ''}
    <div class="list small">${(s.items || []).filter(it => it.sets.some(x => x.done)).map(it => `
      <div><b>${esc(EXERCISES[it.ex]?.name || it.ex)}</b><br><span class="muted">${it.sets.filter(x => x.done).map(x => (EXERCISES[it.ex]?.kind === 'bw' && !x.w ? `${x.r}` : `${L.fmtKg(L.num(x.w) || 0)}×${x.r}`)).join(' · ')}</span></div>`).join('')}
      ${s.cardio?.done ? `<div><b>Cardio</b><br><span class="muted">${s.cardio.min} min</span></div>` : ''}
    </div>
    ${s.energy ? `<p class="row" style="gap:8px"><span class="acc">${icon(ENERGY[s.energy - 1].icon, { size: 20 })}</span>Energía: ${ENERGY[s.energy - 1].label}</p>` : ''}
    ${s.notes && canSee(u, 'notes') ? `<div class="alert keep row-ic">${icon('notebook-pen', { size: 18 })}<span>${esc(s.notes)}</span></div>` : ''}
    ${u === me() ? `<button class="btn ghost danger" data-act="del-session" data-id="${s.id}">Borrar esta sesión</button>` : ''}`);
}

// ============================================================
//  HÁBITOS
// ============================================================
export function viewHabitos() {
  const u = me(), d = state.habitDate, t = L.today();
  const db = DB();
  const g = L.goalsOf(u, db.settingsMap);
  const h = db.habits.find(x => x.id === `${u}_${d}`) || {};
  const ok = L.habitOk(h, g);
  const label = d === t ? 'Hoy' : d === L.addDays(t, -1) ? 'Ayer' : L.fmtShort(d);
  const pct = (v, goal) => Math.min(100, (v || 0) / goal * 100);
  const card = (k, emoji, title, valTxt, goalTxt, btns) => `
    <div class="card habit ${ok[k] ? 'ok' : ''}">
      <div class="top"><b class="row" style="gap:8px"><span class="acc">${icon(emoji, { size: 20 })}</span>${title}</b>${ok[k] ? `<span class="pill good">${icon('check', { size: 14 })} meta</span>` : `<span class="faint small">meta ${goalTxt}</span>`}</div>
      <div class="val">${valTxt}</div>
      <div class="bar"><i style="width:${pct(h[k], g[k])}%"></i></div>
      <div class="btns">${btns}</div>
    </div>`;
  const b = (k, v, l) => `<button class="btn" data-act="hab-add" data-k="${k}" data-v="${v}">${l}</button>`;
  const s = (k, v, l) => `<button class="btn ${h[k] === v ? 'primary' : ''}" data-act="hab-set" data-k="${k}" data-v="${v}">${l}</button>`;
  // semana
  const wk = L.weekStart(d);
  const days = Array.from({ length: 7 }, (_, i) => L.addDays(wk, i));
  const rows = [['protein', 'drumstick', 'Prot.'], ['water', 'glass-water', 'Agua'], ['sleep', 'moon', 'Sueño'], ['steps', 'footprints', 'Pasos']];
  const p = partner();
  const ph = db.habits.find(x => x.id === `${p}_${t}`) || {};
  const pg = L.goalsOf(p, db.settingsMap);
  return `
    <div class="row between">
      <button class="icon-btn" data-act="hab-day" data-d="-1" aria-label="Día anterior">‹</button>
      <div class="center"><h2>${label}</h2><span class="small muted">${esc(L.fmtLong(d))}</span></div>
      <button class="icon-btn" data-act="hab-day" data-d="1" ${d >= t ? 'disabled style="opacity:.3"' : ''} aria-label="Día siguiente">›</button>
    </div>
    ${card('protein', 'drumstick', 'Proteína', `${h.protein || 0}<small>/ ${g.protein} g</small>`, `${g.protein} g`, b('protein', -10, '−10') + b('protein', 10, '+10') + b('protein', 20, '+20') + b('protein', 30, '+30'))}
    ${card('water', 'glass-water', 'Agua', `${L.fmtKg(h.water || 0)}<small>/ ${g.water} L</small>`, `${g.water} L`, b('water', -0.25, '−¼') + b('water', 0.25, '+¼ L') + b('water', 0.5, '+½ L') + b('water', 1, '+1 L'))}
    ${card('sleep', 'moon', 'Sueño', `${L.fmtKg(h.sleep || 0)}<small>horas</small>`, `${g.sleep} h`, s('sleep', 6, '6 h') + s('sleep', 7, '7 h') + s('sleep', 8, '8 h') + b('sleep', -0.5, '−½') + b('sleep', 0.5, '+½'))}
    <div class="card habit ${ok.steps ? 'ok' : ''}">
      <div class="top"><b class="row" style="gap:8px"><span class="acc">${icon('footprints', { size: 20 })}</span>Pasos</b>${ok.steps ? `<span class="pill good">${icon('check', { size: 14 })} meta</span>` : `<span class="faint small">meta ${g.steps.toLocaleString('es-MX')}</span>`}</div>
      <div class="row"><input class="field grow" type="number" inputmode="numeric" data-steps value="${h.steps || ''}" placeholder="Pasos del día" style="font-size:22px;font-family:Oswald,sans-serif"></div>
      <div class="bar"><i style="width:${pct(h.steps, g.steps)}%"></i></div>
      <div class="btns">${b('steps', 1000, '+1,000')}${b('steps', 2000, '+2,000')}${b('steps', 5000, '+5,000')}</div>
      <p class="faint small">Copia el número de la app de salud de tu cel al final del día.</p>
    </div>
    <div class="card stack">
      <b>Tu semana</b>
      <div class="week-dots">
        <span></span>${days.map(x => `<span class="center">${'LMMJVSD'[(L.dow(x) + 6) % 7]}</span>`).join('')}
        ${rows.map(([k, ic, l]) => `<span class="row" style="gap:4px">${icon(ic, { size: 13 })}${l}</span>${days.map(x => { const hx = db.habits.find(y => y.id === `${u}_${x}`); const o = hx && L.habitOk(hx, g)[k]; return `<span class="c ${o ? 'ok' : ''}">${o ? icon('check', { size: 13, stroke: 3 }) : ''}</span>`; }).join('')}`).join('')}
      </div>
    </div>
    ${canSee(p, 'habits') ? `<div class="card tight stack" style="gap:8px">
      <span class="small"><b>${esc(nameOf(p))} hoy</b></span>
      <div class="row wrap">
        <span class="pill ${(ph.protein || 0) >= pg.protein ? 'good' : ''}">${icon('drumstick', { size: 15 })} ${ph.protein || 0}/${pg.protein} g</span>
        <span class="pill ${(ph.water || 0) >= pg.water ? 'good' : ''}">${icon('glass-water', { size: 15 })} ${L.fmtKg(ph.water || 0)}/${pg.water} L</span>
        <span class="pill ${(ph.sleep || 0) >= pg.sleep ? 'good' : ''}">${icon('moon', { size: 15 })} ${L.fmtKg(ph.sleep || 0)} h</span>
        <span class="pill ${(ph.steps || 0) >= pg.steps ? 'good' : ''}">${icon('footprints', { size: 15 })} ${(ph.steps || 0).toLocaleString('es-MX')}</span>
      </div></div>` : ''}
    <div class="alert keep row-ic">${icon('lightbulb', { size: 18 })}<span>Lo que más mueve tu energía es dormir 7 horas o más. Si un día tienes que elegir, elige dormir.</span></div>`;
}

function saveHabit(k, val) {
  const u = me(), d = state.habitDate;
  const id = `${u}_${d}`;
  const cur = core.store.get('habits', id) || { id, user: u, date: d };
  core.store.put('habits', { ...cur, [k]: val });
}

// ============================================================
//  JUNTOS
// ============================================================
export function viewJuntos() {
  const u = me(), p = partner(), db = DB(), t = L.today();
  const cs = L.coupleStreak(db.sessions);
  const ch = L.challengeProgress(db, L.weekStart(t));
  const done = L.completedChallenges(db);
  const myPhrases = db.phrases.filter(x => x.from === u).sort((a, b) => b.at - a.at);
  const msgs = db.messages.filter(m => (m.from === u && m.to === p) || (m.from === p && m.to === u)).sort((a, b) => b.at - a.at).slice(0, 8);
  const st = { ok: icon('check', { size: 13, stroke: 3 }), recovery: icon('heart', { size: 12, stroke: 2.5 }), reset: icon('x', { size: 13, stroke: 3 }), pending: '' };
  const log = cs.log.slice(-21);
  const mine = ch[u], theirs = ch[p];
  return `
    <div class="card hero stack">
      <span class="eyebrow">Racha juntos</span>
      <div class="row between"><span class="huge row" style="gap:8px"><span class="acc">${icon('flame', { size: 48, stroke: 1.75 })}</span>${cs.current}</span><span class="muted small" style="text-align:right">días entrenando<br>los dos · mejor: ${cs.best}</span></div>
      <div class="row between"><span class="small">Recuperaciones de ${esc(L.monthName(Number(t.slice(5, 7)) - 1))}</span>
        <span class="lives">${(icon('heart', { size: 22, fill: 'currentColor' })).repeat(cs.left)}${`<span class="off">${icon('heart', { size: 22 })}</span>`.repeat(3 - cs.left)}</span></div>
      ${cs.started ? `<div class="streak-days">${log.map(l => `<i class="${l.st}" title="${l.date}">${st[l.st]}</i>`).join('')}</div>
        <div class="legend"><span><i class="dotl" style="background:var(--acc)"></i>Los dos</span><span><i class="dotl" style="background:var(--warn)"></i>Recuperación</span><span><i class="dotl" style="background:var(--bad)"></i>Se reinició</span></div>` : ''}
      <p class="faint small">Cuentan lunes, martes, miércoles y viernes en que entrenan los dos. Si alguno falta, se gasta una recuperación (3 por mes). Con la 4ª falta del mes, la racha vuelve a 0.${cs.todayStatus === 'pending' ? ' <b>Hoy todavía cuenta.</b>' : ''}</p>
    </div>

    <div class="card stack">
      <b>Mándale ánimo a ${esc(nameOf(p))}</b>
      <div class="sticker-grid">${STICKERS.slice(0, 8).map(s => `<button data-act="send-sticker" data-s="${s.id}">${stickerHtml(s.id)}</button>`).join('')}</div>
      <button class="link" data-act="sticker-picker">Ver todos los stickers ›</button>
      <div class="row"><input class="field grow" data-msg-input placeholder="Escríbele algo…" maxlength="200"><button class="btn primary" data-act="send-text">Enviar</button></div>
      <p class="faint small">Le aparece en grande la próxima vez que abra la app.</p>
    </div>

    ${msgs.length ? `<div class="card stack"><b>Mensajes</b><div class="list">${msgs.map(m => `
      <div class="msg">
        ${m.kind === 'sticker' ? `<span class="mini" style="background:${STICKERS.find(s => s.id === m.sticker)?.bg || '#444'}">${icon(STICKERS.find(s => s.id === m.sticker)?.icon || 'message-circle', { size: 22 })}</span>` : `<span class="mini" style="background:var(--card2)">${icon('message-circle', { size: 22 })}</span>`}
        <span class="grow small"><b>${m.from === u ? 'Tú' : esc(nameOf(m.from))}</b> <span class="faint">${L.fmtShort(L.dstr(new Date(m.at)))}</span><br>
        <span class="muted">${m.kind === 'sticker' ? esc(STICKERS.find(s => s.id === m.sticker)?.text || '') : esc(m.text)}</span></span>
        ${m.from === u ? `<span class="small ${m.read ? 'acc' : 'faint'}">${m.read ? 'Visto' : 'Enviado'}</span>` : ''}
      </div>`).join('')}</div></div>` : ''}

    <div class="card stack">
      <span class="eyebrow">Reto de la semana</span>
      <div class="row between"><h2 class="row" style="gap:8px"><span class="acc">${icon(ch.ch.icon, { size: 24 })}</span>${esc(ch.ch.title)}</h2>${ch.done ? '<span class="pill good">¡Logrado!</span>' : ''}</div>
      <p class="muted small">${esc(ch.ch.desc)}</p>
      <div class="stack" style="gap:6px">
        <div class="row between small"><span>Tú</span><b>${Math.min(mine, ch.ch.target)}/${ch.ch.target}</b></div>
        <div class="bar"><i style="width:${Math.min(100, mine / ch.ch.target * 100)}%"></i></div>
        <div class="row between small"><span>${esc(nameOf(p))}</span><b>${Math.min(theirs, ch.ch.target)}/${ch.ch.target}</b></div>
        <div class="bar p"><i style="width:${Math.min(100, theirs / ch.ch.target * 100)}%"></i></div>
      </div>
      <button class="btn ghost" data-act="pick-challenge">Cambiar el reto de esta semana</button>
      <p class="faint small">Retos completados: <b>${done.length}</b></p>
    </div>

    <div class="card stack">
      <b>Frases para ${esc(nameOf(p))}</b>
      <p class="faint small">Le salen al empezar o terminar su sesión, mezcladas con las frases de la app.</p>
      <div class="row"><input class="field grow" data-phrase-input placeholder="Ej. Hoy vas a romperla, te quiero" maxlength="160"><button class="btn primary" data-act="add-phrase">Agregar</button></div>
      ${myPhrases.length ? `<div class="list small">${myPhrases.map(x => `<div class="row"><span class="grow">“${esc(x.text)}”</span><button class="tool" data-act="del-phrase" data-id="${x.id}" aria-label="Borrar">${icon('x', { size: 16 })}</button></div>`).join('')}</div>` : ''}
    </div>

    <div class="card stack">
      <div class="row between"><b>Progreso de ${esc(nameOf(p))}</b><button class="link" data-act="see-partner">Ver todo ›</button></div>
      ${canSee(p, 'train') ? weekSummary(p, L.weekStart(t)) : `<p class="muted small">${esc(nameOf(p))} no comparte sus entrenamientos.</p>`}
    </div>`;
}

export function stickerPicker() {
  const p = partner();
  openModal(`
    <div class="row between"><h2>Para ${esc(nameOf(p))}</h2><button class="icon-btn" data-act="modal-close" aria-label="Cerrar">${icon('x', { size: 20 })}</button></div>
    <div class="sticker-grid">${STICKERS.map(s => `<button data-act="send-sticker" data-s="${s.id}">${stickerHtml(s.id)}</button>`).join('')}</div>
    <div class="row"><input class="field grow" id="modalMsg" placeholder="O escríbele algo…" maxlength="200"><button class="btn primary" data-act="send-text-modal">Enviar</button></div>`);
}

export function sendSticker(id) {
  const p = partner();
  core.store.put('messages', { id: uid(), from: me(), to: p, kind: 'sticker', sticker: id, at: Date.now(), read: false });
  closeModal();
  toast(`Sticker enviado a ${nameOf(p)}`);
}
function sendText(text) {
  text = (text || '').trim();
  if (!text) { toast('Escribe algo primero'); return false; }
  const p = partner();
  core.store.put('messages', { id: uid(), from: me(), to: p, kind: 'text', text, at: Date.now(), read: false });
  toast(`Mensaje enviado a ${nameOf(p)}`);
  return true;
}

// ============================================================
//  LOGROS
// ============================================================
export function viewLogros() {
  const u = me(), p = partner(), db = DB();
  const st = L.achievementStats(db, u);
  const got = ACHIEVEMENTS.filter(a => a.test(st));
  const pGot = ACHIEVEMENTS.filter(a => a.test(L.achievementStats(db, p))).length;
  return `
    <div class="card hero row">
      <span class="huge">${got.length}</span>
      <span class="grow"><b>de ${ACHIEVEMENTS.length} logros</b><br><span class="muted small">${esc(nameOf(p))} lleva ${pGot}</span></span>
      <span class="acc">${icon('medal', { size: 44, stroke: 1.75 })}</span>
    </div>
    <div class="ach-grid">${ACHIEVEMENTS.map(a => `
      <div class="ach ${a.test(st) ? '' : 'locked'}"><span class="e">${icon(a.icon, { size: 30, stroke: 1.75 })}</span><b>${esc(a.title)}</b><span>${esc(a.desc)}</span></div>`).join('')}</div>`;
}

// ============================================================
//  Acciones y eventos de estas pantallas
// ============================================================
export const viewActions = {
  'prog-view': el => { state.progView = el.dataset.v; render(); },
  'prog-sub': el => { state.progSub = el.dataset.v; render(); },
  'see-partner': () => { state.tab = 'progreso'; state.progView = 'partner'; state.progSub = 'resumen'; render(); window.scrollTo(0, 0); },
  'sum-week': el => { state.sumWeek = Math.min(0, state.sumWeek + Number(el.dataset.d)); render(); },
  'chart-range': el => { state.chartRange = el.dataset.v; render(); },
  'chart-metric': el => { state.chartMetric = el.dataset.v; render(); },
  'weight-range': el => { state.weightRange = el.dataset.v; render(); },
  'add-weight': () => {
    const v = L.num($('[data-weight-input]').value);
    if (!v || v < 25 || v > 300) { toast('Escribe tu peso en kg'); return; }
    const t = L.today();
    const cur = DB().body.find(e => e.user === me() && e.date === t);
    core.store.put('body', { id: cur?.id || uid(), user: me(), date: t, kg: L.round1(v) });
    document.activeElement?.blur();
    toast('Peso guardado'); render();
  },
  'del-weight': el => confirmBox('¿Borrar esta pesada?', 'Borrar', () => core.store.del('body', el.dataset.id), { danger: true }),
  'add-measure': () => {
    const m = { id: uid(), user: me(), date: L.today() };
    let any = false;
    document.querySelectorAll('[data-measure]').forEach(i => { const v = L.num(i.value); if (v && v > 5 && v < 300) { m[i.dataset.measure] = L.round1(v); any = true; } });
    if (!any) { toast('Escribe al menos una medida'); return; }
    core.store.put('measures', m);
    document.activeElement?.blur();
    toast('Medidas guardadas'); render();
  },
  'del-measure': el => confirmBox('¿Borrar estas medidas?', 'Borrar', () => core.store.del('measures', el.dataset.id), { danger: true }),
  'photo-sel': el => {
    const id = el.dataset.id, s = state.photoSel;
    if (s.includes(id)) state.photoSel = s.filter(x => x !== id);
    else state.photoSel = [...s, id].slice(-2);
    render();
  },
  'photo-clear': () => { state.photoSel = []; render(); },
  'photo-del': el => confirmBox('¿Borrar esta foto? No se puede recuperar.', 'Borrar', async () => {
    await photos.del(el.dataset.id); state.photoSel = []; state.photos = null; render();
  }, { danger: true }),
  'cal-month': el => { state.calMonth = el.dataset.m; render(); },
  'cal-day': el => {
    const d = el.dataset.d;
    const list = DB().sessions.filter(s => s.finishedAt && s.date === d && canSee(s.user, 'train'));
    if (list.length === 1) return sessionDetail(list[0].id);
    openModal(`<div class="row between"><h2>${esc(L.fmtLong(d))}</h2><button class="icon-btn" data-act="modal-close" aria-label="Cerrar">${icon('x', { size: 20 })}</button></div>
      ${list.map(s => `<button class="opt" data-act="view-session" data-id="${s.id}"><span class="avatar ${s.user !== me() ? 'p' : ''}">${nameOf(s.user)[0]}</span><span class="grow"><b>${esc(L.routineById(s.user, s.routine)?.name || '')}</b><br><span class="muted small">${L.sessionSets(s)} series${s.prs?.length ? ` · ${s.prs.length} récord${s.prs.length > 1 ? 's' : ''}` : ''}</span></span>›</button>`).join('')}`);
  },
  'del-session': el => confirmBox('¿Borrar esta sesión del historial?', 'Borrar', () => { core.store.del('sessions', el.dataset.id); toast('Sesión borrada'); }, { danger: true }),
  'hab-day': el => { const d = L.addDays(state.habitDate, Number(el.dataset.d)); if (d <= L.today()) { state.habitDate = d; render(); } },
  'hab-add': el => {
    const k = el.dataset.k, v = Number(el.dataset.v);
    const h = DB().habits.find(x => x.id === `${me()}_${state.habitDate}`) || {};
    const nv = Math.max(0, Math.round(((h[k] || 0) + v) * 100) / 100);
    saveHabit(k, nv);
    if (navigator.vibrate) navigator.vibrate(15);
  },
  'hab-set': el => { saveHabit(el.dataset.k, Number(el.dataset.v)); if (navigator.vibrate) navigator.vibrate(15); },
  'send-sticker': el => sendSticker(el.dataset.s),
  'send-text': () => { const i = $('[data-msg-input]'); if (sendText(i.value)) { i.value = ''; i.blur(); } },
  'send-text-modal': () => { if (sendText($('#modalMsg').value)) closeModal(); },
  'add-phrase': () => {
    const i = $('[data-phrase-input]'); const text = i.value.trim();
    if (!text) { toast('Escribe la frase primero'); return; }
    core.store.put('phrases', { id: uid(), from: me(), to: partner(), text, at: Date.now() });
    i.value = ''; i.blur(); toast('Frase agregada');
  },
  'del-phrase': el => core.store.del('phrases', el.dataset.id),
  'pick-challenge': () => {
    const wk = L.weekStart(L.today());
    const cur = L.challengeFor(DB(), wk);
    openModal(`<h2>Reto de esta semana</h2><p class="muted small">Lo ven los dos. Se cumple si los dos llegan a la meta antes del domingo.</p>
      ${CHALLENGES.map(c => `<button class="opt" data-act="set-challenge" data-c="${c.id}"><span class="acc">${icon(c.icon, { size: 24 })}</span><span class="grow"><b>${esc(c.title)}</b>${c.id === cur.id ? ' <span class="pill acc">actual</span>' : ''}<br><span class="muted small">${esc(c.desc)}</span></span></button>`).join('')}
      <button class="btn ghost" data-act="modal-close">Cancelar</button>`);
  },
  'set-challenge': el => {
    const wk = L.weekStart(L.today());
    core.store.put('challenges', { id: wk, week: wk, tpl: el.dataset.c, by: me(), at: Date.now() });
    closeModal(); toast('Reto cambiado');
  },
};

export function onViewChange(t) {
  if (t.hasAttribute('data-steps')) {
    const v = L.num(t.value);
    saveHabit('steps', v && v > 0 ? Math.round(v) : 0);
    toast('Pasos guardados');
  } else if (t.hasAttribute('data-chart-ex')) {
    state.chartEx = t.value; t.blur(); render();
  }
}

export async function onPhotoInput(input) {
  const f = input.files?.[0];
  if (!f) return;
  try {
    toast('Guardando foto…');
    const data = await shrinkImage(f);
    await photos.put({ id: uid(), user: me(), date: L.today(), data });
    state.photos = null; state.photoSel = [];
    toast('Foto guardada');
    render();
  } catch (e) {
    console.error(e); toast('No se pudo guardar la foto');
  }
}
