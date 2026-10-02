// ============================================================
//  Lógica pura (sin interfaz): fechas, progresión, récords,
//  rachas, retos y estadísticas.
// ============================================================
import { USERS, USER_IDS, ROUTINES, EXERCISES, TRAIN_DAYS, STREAK_RECOVERIES, CHALLENGES, increment } from './data.js';

// ---------------- Fechas (siempre en hora local) ----------------
export const pad = n => String(n).padStart(2, '0');
export const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => dstr(new Date());
export const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); };
export const dow = s => parseD(s).getDay();
export const weekStart = s => addDays(s, -((dow(s) + 6) % 7)); // lunes
export const isTrainDay = s => TRAIN_DAYS.includes(dow(s));
export const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
export const monthKey = s => s.slice(0, 7);

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fmtLong = s => { const d = parseD(s); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
export const fmtShort = s => { const d = parseD(s); return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`; };
export const dayName = s => DIAS[dow(s)];
export const monthName = m => MESES[m];

// ---------------- Utilidades ----------------
export const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };
export const round1 = n => Math.round(n * 10) / 10;
export const fmtKg = n => (n == null ? '—' : (Number.isInteger(n) ? String(n) : String(round1(n))));
export const other = u => (u === USER_IDS[0] ? USER_IDS[1] : USER_IDS[0]);
export const e1rm = (w, r) => (w > 0 && r > 0 ? w * (1 + r / 30) : 0);

export function routineById(user, id) { return ROUTINES[user].find(r => r.id === id); }

// Sesiones terminadas de un usuario, de la más vieja a la más nueva
export function finished(sessions, user) {
  return sessions.filter(s => s.user === user && s.finishedAt)
    .sort((a, b) => (a.date === b.date ? a.finishedAt - b.finishedAt : a.date < b.date ? -1 : 1));
}

// ---------------- Qué toca hoy ----------------
// La semana "se recorre": toca la rutina que sigue a la última que hiciste.
export function nextRoutine(sessions, user) {
  const list = ROUTINES[user];
  const done = finished(sessions, user);
  if (!done.length) return list[0];
  const last = done[done.length - 1];
  const i = list.findIndex(r => r.id === last.routine);
  return list[(i + 1) % list.length];
}

// ---------------- Historial por ejercicio ----------------
const doneSets = item => (item.sets || []).filter(s => s.done && (num(s.r) || 0) > 0)
  .map(s => ({ w: num(s.w) ?? 0, r: num(s.r) }));

// Desempeños de un ejercicio en un "lugar" de rutina (rutina + ejercicio), del más nuevo al más viejo
export function slotHistory(sessions, user, routine, ex, excludeId) {
  const out = [];
  for (const s of finished(sessions, user).reverse()) {
    if (s.id === excludeId || s.routine !== routine) continue;
    for (const it of s.items || []) {
      if (it.ex !== ex) continue;
      const sets = doneSets(it);
      if (sets.length) { out.push({ date: s.date, sets }); break; }
    }
  }
  return out;
}

// Desempeños de un ejercicio en cualquier rutina, del más viejo al más nuevo
export function exerciseHistory(sessions, user, ex, beforeId) {
  const out = [];
  for (const s of finished(sessions, user)) {
    if (s.id === beforeId) break;
    for (const it of s.items || []) {
      if (it.ex !== ex) continue;
      const sets = doneSets(it);
      if (sets.length) out.push({ date: s.date, sessionId: s.id, sets });
    }
  }
  return out;
}

const topW = sets => Math.max(...sets.map(s => s.w));
const minW = sets => Math.min(...sets.map(s => s.w));
const repsAt = (sets, w) => sets.filter(s => s.w === w).reduce((a, s) => a + s.r, 0);
const maxReps = sets => Math.max(...sets.map(s => s.r));

// Puntaje para comparar dos desempeños (más alto = mejor)
function score(kind, sets) {
  if (kind === 'bw') return sets.reduce((a, s) => a + s.r, 0);
  if (kind === 'assist') { const w = minW(sets); return -w * 1000 + repsAt(sets, w); }
  const w = topW(sets); return w * 1000 + repsAt(sets, w);
}

// Sugerencia para hoy, comparando con la última vez que hiciste ESE ejercicio en ESA rutina
export function suggestion(sessions, user, routine, item, excludeId) {
  const ex = EXERCISES[item.ex];
  const kind = ex?.kind || 'w';
  const hist = slotHistory(sessions, user, routine, item.ex, excludeId);
  if (!hist.length) {
    return { type: 'new', text: kind === 'assist'
      ? 'Primera vez: elige una asistencia con la que llegues al rango dejando 2 reps en reserva.'
      : 'Primera vez: elige un peso con el que termines las reps dejando 2 en reserva.' };
  }
  const last = hist[0];
  const inc = increment(user, item.ex);
  const lo = item.lo, hi = item.hi;
  let res;
  if (kind === 'bw') {
    const all = last.sets.length >= item.sets && last.sets.every(s => s.r >= hi);
    res = all
      ? { type: 'up', text: `Llegaste al tope (${hi} reps) en todas: hoy agrega peso ligero o haz las reps más lentas.` }
      : { type: 'keep', text: 'Busca 1 rep más que la vez pasada en al menos una serie.' };
  } else if (kind === 'assist') {
    const w = minW(last.sets);
    const atTop = last.sets.filter(s => s.w === w && s.r >= hi).length >= item.sets;
    res = atTop && w > 0
      ? { type: 'up', weight: Math.max(0, w - inc), text: `Llegaste a ${hi} reps en todas: baja la asistencia a ${fmtKg(Math.max(0, w - inc))} kg y empieza en ${lo} reps.` }
      : { type: 'keep', weight: w, text: `Misma asistencia (${fmtKg(w)} kg) y busca 1 rep más.` };
  } else {
    const w = topW(last.sets);
    const atTop = last.sets.filter(s => s.w === w && s.r >= hi).length >= item.sets;
    res = atTop
      ? { type: 'up', weight: w + inc, text: `Completaste ${item.sets} × ${hi} con ${fmtKg(w)} kg: hoy sube a ${fmtKg(w + inc)} kg y empieza en ${lo} reps.` }
      : { type: 'keep', weight: w, text: `Mismo peso (${fmtKg(w)} kg) y busca 1 rep más que la vez pasada. Subes cuando hagas ${item.sets} × ${hi}.` };
  }
  // Estancamiento
  let alert = stagnation(kind, hist);
  // Si ya llegaste al tope, lo que toca es subir: solo avisamos si llevas 4 semanas sin hacerlo
  if (alert && res.type === 'up' && alert.weeks < 4) alert = null;
  return { ...res, last, alert };
}

export function stagnation(kind, hist) {
  if (hist.length >= 4 && kind !== 'bw') {
    const ws = hist.slice(0, 4).map(h => (kind === 'assist' ? minW(h.sets) : topW(h.sets)));
    if (ws.every(w => w === ws[0])) {
      return { weeks: 4, text: `Llevas 4 semanas con ${fmtKg(ws[0])} kg en este ejercicio.` };
    }
  }
  if (hist.length >= 3) {
    const [a, b, c] = hist.slice(0, 3).map(h => score(kind, h.sets));
    if (a <= c && b <= c) return { weeks: 3, text: 'Llevas 3 semanas sin subir ni peso ni reps aquí.' };
  }
  return null;
}

export const STAGNATION_TIPS = [
  'Revisa sueño y proteína de la semana: es lo primero que frena la fuerza.',
  'Prueba subir solo 1 rep en la primera serie, aunque las demás se queden igual.',
  'Si sigues igual, cámbialo por una alternativa (botón de cambiar) durante 4 a 6 semanas.',
  'Si te sientes muy cansado varias sesiones, haz una semana con la mitad de series.',
];

// ---------------- Récords personales ----------------
// Compara cada ejercicio de la sesión contra TODO lo anterior de ese ejercicio
export function detectPRs(sessions, session) {
  const prs = [];
  const prev = sessions.filter(s => s.user === session.user && s.finishedAt && s.id !== session.id &&
    (s.date < session.date || (s.date === session.date && s.finishedAt < (session.finishedAt || Infinity))));
  for (const it of session.items || []) {
    const sets = doneSets(it);
    if (!sets.length) continue;
    const kind = EXERCISES[it.ex]?.kind || 'w';
    const before = exerciseHistory(prev, session.user, it.ex);
    if (!before.length) continue;
    const allPrev = before.flatMap(h => h.sets);
    const name = EXERCISES[it.ex]?.name || it.ex;
    if (kind === 'bw') {
      const m = maxReps(sets), pm = maxReps(allPrev);
      if (m > pm) prs.push({ ex: it.ex, name, text: `${m} reps (antes ${pm})` });
    } else if (kind === 'assist') {
      const w = minW(sets.filter(s => s.r >= 1)), pw = minW(allPrev);
      if (w < pw) prs.push({ ex: it.ex, name, text: `Asistencia ${fmtKg(w)} kg (antes ${fmtKg(pw)})` });
    } else {
      const w = topW(sets), pw = topW(allPrev);
      if (w > pw) prs.push({ ex: it.ex, name, text: `${fmtKg(w)} kg (antes ${fmtKg(pw)})` });
      else if (w === pw && w > 0) {
        const r = Math.max(...sets.filter(s => s.w === w).map(s => s.r));
        const pr = Math.max(...allPrev.filter(s => s.w === w).map(s => s.r));
        if (r > pr) prs.push({ ex: it.ex, name, text: `${r} reps con ${fmtKg(w)} kg (antes ${pr})` });
      }
    }
  }
  return prs;
}

export const sessionVolume = s => (s.items || []).reduce((a, it) =>
  a + doneSets(it).reduce((b, x) => b + (EXERCISES[it.ex]?.kind === 'assist' ? 0 : x.w * x.r), 0), 0);
export const sessionSets = s => (s.items || []).reduce((a, it) => a + doneSets(it).length, 0);

// ---------------- Rachas ----------------
// Racha semanal personal: semanas seguidas (lunes a domingo) con 4 sesiones o más
export function weekStreak(sessions, user, now = today()) {
  const counts = {};
  for (const s of finished(sessions, user)) counts[weekStart(s.date)] = (counts[weekStart(s.date)] || 0) + 1;
  const thisW = weekStart(now);
  let cur = 0, w = addDays(thisW, -7);
  while ((counts[w] || 0) >= 4) { cur++; w = addDays(w, -7); }
  if ((counts[thisW] || 0) >= 4) cur++;
  // mejor racha histórica
  const weeks = Object.keys(counts).sort();
  let best = 0, run = 0, prevW = null;
  for (const wk of weeks) {
    if (counts[wk] >= 4 && prevW && addDays(prevW, 7) === wk && run > 0) run++;
    else run = counts[wk] >= 4 ? 1 : 0;
    best = Math.max(best, run); prevW = wk;
  }
  const bestWeek = Math.max(0, ...Object.values(counts));
  return { current: cur, best: Math.max(best, cur), thisWeek: counts[thisW] || 0, bestWeek };
}

// Racha juntos: lun, mar, mié y vie en que los DOS entrenaron.
// Faltar usa una recuperación (3 al mes). La 4ª falta del mes la reinicia a 0.
export function coupleStreak(sessions, now = today()) {
  const daysOf = u => new Set(finished(sessions, u).map(s => s.date));
  const [ua, ub] = USER_IDS;
  const c = daysOf(ua), r = daysOf(ub);
  const both = [...c].filter(d => r.has(d) && isTrainDay(d)).sort();
  const empty = { current: 0, best: 0, missesThisMonth: 0, left: STREAK_RECOVERIES, started: false, log: [], todayStatus: 'pending' };
  if (!both.length) return empty;
  let d = both[0], cur = 0, best = 0, month = monthKey(d), misses = 0;
  const log = [];
  while (d <= now) {
    if (isTrainDay(d)) {
      if (monthKey(d) !== month) { month = monthKey(d); misses = 0; }
      const ok = c.has(d) && r.has(d);
      if (ok) { cur++; log.push({ date: d, st: 'ok' }); }
      else if (d === now) { log.push({ date: d, st: 'pending', c: c.has(d), r: r.has(d) }); }
      else {
        misses++;
        if (misses > STREAK_RECOVERIES) { cur = 0; log.push({ date: d, st: 'reset', c: c.has(d), r: r.has(d) }); }
        else log.push({ date: d, st: 'recovery', c: c.has(d), r: r.has(d) });
      }
      best = Math.max(best, cur);
    }
    d = addDays(d, 1);
  }
  if (monthKey(now) !== month) misses = 0;
  const todayLog = log.length && log[log.length - 1].date === now ? log[log.length - 1] : null;
  return { current: cur, best, missesThisMonth: misses, left: Math.max(0, STREAK_RECOVERIES - misses),
    started: true, log, todayStatus: !isTrainDay(now) ? 'rest' : todayLog?.st || 'pending' };
}

// ---------------- Hábitos ----------------
export function habitOk(h, goals) {
  return {
    protein: (h?.protein || 0) >= goals.protein,
    water: (h?.water || 0) >= goals.water - 0.001,
    sleep: (h?.sleep || 0) >= goals.sleep,
    steps: (h?.steps || 0) >= goals.steps,
  };
}

function maxConsecutive(dates) {
  const s = [...new Set(dates)].sort();
  let best = 0, run = 0, prev = null;
  for (const d of s) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}

export function goalsOf(user, settings) {
  return { ...USERS[user].goals, ...(settings?.[user]?.goals || {}) };
}

// ---------------- Resumen semanal ----------------
export function weekStats(db, user, wk) {
  const end = addDays(wk, 6);
  const inW = d => d >= wk && d <= end;
  const ses = finished(db.sessions, user).filter(s => inW(s.date));
  const goals = goalsOf(user, db.settingsMap);
  const habits = db.habits.filter(h => h.user === user && inW(h.date));
  const oks = habits.map(h => habitOk(h, goals));
  const wts = db.body.filter(b => b.user === user && inW(b.date)).map(b => b.kg);
  return {
    sessions: ses.length,
    sets: ses.reduce((a, s) => a + sessionSets(s), 0),
    volume: Math.round(ses.reduce((a, s) => a + sessionVolume(s), 0)),
    prs: ses.flatMap(s => s.prs || []),
    cardio: ses.filter(s => s.cardio?.done).length,
    proteinDays: oks.filter(o => o.protein).length,
    waterDays: oks.filter(o => o.water).length,
    sleepDays: oks.filter(o => o.sleep).length,
    stepDays: oks.filter(o => o.steps).length,
    avgWeight: wts.length ? round1(wts.reduce((a, b) => a + b, 0) / wts.length) : null,
    weighIns: wts.length,
    sessionsList: ses,
  };
}

// ---------------- Retos ----------------
export function challengeFor(db, wk) {
  const chosen = db.challenges.find(c => c.id === wk);
  return CHALLENGES.find(c => c.id === chosen?.tpl) || CHALLENGES[0];
}
export function challengeProgress(db, wk) {
  const ch = challengeFor(db, wk);
  const val = u => { const st = weekStats(db, u, wk); return ch.metric === 'prs' ? st.prs.length : st[ch.metric]; };
  const [ua, ub] = USER_IDS;
  const out = { ch, [ua]: val(ua), [ub]: val(ub) };
  out.done = out[ua] >= ch.target && out[ub] >= ch.target;
  return out;
}
// Retos completados en semanas ya cerradas (desde que empezaron)
export function completedChallenges(db, now = today()) {
  const all = db.sessions.filter(s => s.finishedAt).map(s => s.date).sort();
  if (!all.length) return [];
  const out = [];
  for (let wk = weekStart(all[0]); addDays(wk, 6) < now; wk = addDays(wk, 7)) {
    const p = challengeProgress(db, wk);
    if (p.done) out.push({ week: wk, ...p });
  }
  return out;
}

// ---------------- Estadísticas para logros ----------------
export function achievementStats(db, user, now = today()) {
  const ses = finished(db.sessions, user);
  const ws = weekStreak(db.sessions, user, now);
  const goals = goalsOf(user, db.settingsMap);
  const habits = db.habits.filter(h => h.user === user);
  const okDates = k => habits.filter(h => habitOk(h, goals)[k]).map(h => h.date);
  const sleepByWeek = {};
  okDates('sleep').forEach(d => { sleepByWeek[weekStart(d)] = (sleepByWeek[weekStart(d)] || 0) + 1; });
  return {
    sessions: ses.length,
    bestWeek: ws.bestWeek,
    prs: ses.reduce((a, s) => a + (s.prs?.length || 0), 0),
    bestWeekStreak: ws.best,
    bestCouple: coupleStreak(db.sessions, now).best,
    waterStreak: maxConsecutive(okDates('water')),
    proteinStreak: maxConsecutive(okDates('protein')),
    bestSleepWeek: Math.max(0, ...Object.values(sleepByWeek)),
    weighIns: db.body.filter(b => b.user === user).length,
    measures: db.measures.filter(m => m.user === user).length,
    challenges: completedChallenges(db, now).length,
    sent: db.messages.filter(m => m.from === user).length,
  };
}

// ---------------- Peso corporal ----------------
export function weightTrend(db, user, now = today()) {
  const thisW = weekStart(now), lastW = addDays(thisW, -7);
  const avg = wk => weekStats(db, user, wk).avgWeight;
  const a = avg(thisW), b = avg(lastW);
  const rate = USERS[user].weightRate;
  let msg = null, tone = 'neutral';
  if (a != null && b != null) {
    const diff = round1(a - b);
    if (-diff >= rate[0] && -diff <= rate[1] + 0.05) { msg = `Bajaste ${-diff} kg: justo en tu meta (${rate[0]}–${rate[1]} kg por semana).`; tone = 'good'; }
    else if (-diff > rate[1]) { msg = `Bajaste ${-diff} kg: más rápido que la meta. Si te sientes sin energía, come un poco más.`; tone = 'warn'; }
    else if (diff <= 0) { msg = `Bajaste ${-diff} kg: un poco más lento que la meta. Dale 2 o 3 semanas antes de ajustar.`; tone = 'neutral'; }
    else { msg = `Subiste ${diff} kg. Una semana sola no dice mucho; si se repite 3 semanas, ajusta la comida.`; tone = 'warn'; }
  }
  return { thisAvg: a, lastAvg: b, msg, tone };
}
