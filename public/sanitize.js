// ============================================================
//  Limpieza de datos: todo lo que viene de la base se valida y se
//  convierte al tipo correcto ANTES de mostrarse. Si algo no tiene la
//  forma esperada, se descarta. Así ningún dato raro puede romper la
//  app ni meter código en la pantalla.
// ============================================================
import { USERS, EXERCISES, ROUTINES, STICKERS, CHALLENGES, ACHIEVEMENTS } from './data.js';

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isUser = u => Object.prototype.hasOwnProperty.call(USERS, u);
const n = (v, min = -1e9, max = 1e9) => { const x = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(x) && x >= min && x <= max ? x : null; };
const str = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const bool = v => v === true;
const opt = (v, min, max) => (v === '' || v == null ? '' : (n(v, min, max) ?? ''));

function session(d) {
  if (!isUser(d.user) || !DATE.test(d.date || '')) return null;
  if (!ROUTINES[d.user].some(r => r.id === d.routine)) return null;
  const items = Array.isArray(d.items) ? d.items.slice(0, 20).map(it => {
    if (!it || !EXERCISES[it.ex]) return null;
    return {
      slot: Math.max(0, Math.min(19, Math.round(n(it.slot) ?? 0))),
      ex: it.ex,
      base: EXERCISES[it.base] ? it.base : it.ex,
      sets: Array.isArray(it.sets) ? it.sets.slice(0, 12).map(x => ({ w: opt(x?.w, 0, 1000), r: opt(x?.r, 0, 200), done: bool(x?.done) })) : [],
    };
  }).filter(Boolean) : [];
  const routine = ROUTINES[d.user].find(r => r.id === d.routine);
  items.forEach(it => { if (!routine.items[it.slot]) it.slot = 0; });
  return {
    id: d.id, user: d.user, date: d.date, routine: d.routine,
    startedAt: n(d.startedAt, 0, 1e14) ?? 0, finishedAt: n(d.finishedAt, 0, 1e14),
    items,
    cardio: { min: n(d.cardio?.min, 0, 300) ?? 0, done: bool(d.cardio?.done) },
    notes: str(d.notes, 2000),
    energy: n(d.energy, 1, 5),
    prs: Array.isArray(d.prs) ? d.prs.slice(0, 20).filter(p => EXERCISES[p?.ex]).map(p => ({ ex: p.ex, name: EXERCISES[p.ex].name, text: str(p.text, 120) })) : [],
  };
}
function body(d) {
  const kg = n(d.kg, 20, 400);
  return isUser(d.user) && DATE.test(d.date || '') && kg != null ? { id: d.id, user: d.user, date: d.date, kg } : null;
}
const MEASURE_KEYS = ['cintura', 'cadera', 'pecho', 'brazo', 'pierna'];
function measures(d) {
  if (!isUser(d.user) || !DATE.test(d.date || '')) return null;
  const out = { id: d.id, user: d.user, date: d.date };
  MEASURE_KEYS.forEach(k => { const v = n(d[k], 1, 400); if (v != null) out[k] = v; });
  return out;
}
function habits(d) {
  if (!isUser(d.user) || !DATE.test(d.date || '')) return null;
  return { id: d.id, user: d.user, date: d.date,
    protein: n(d.protein, 0, 1000) ?? 0, water: n(d.water, 0, 20) ?? 0, sleep: n(d.sleep, 0, 24) ?? 0, steps: Math.round(n(d.steps, 0, 200000) ?? 0) };
}
function messages(d) {
  if (!isUser(d.from) || !isUser(d.to)) return null;
  const kind = d.kind === 'sticker' ? 'sticker' : d.kind === 'text' ? 'text' : null;
  if (!kind) return null;
  const sticker = STICKERS.some(s => s.id === d.sticker) ? d.sticker : null;
  if (kind === 'sticker' && !sticker) return null;
  return { id: d.id, from: d.from, to: d.to, kind, sticker, text: str(d.text, 300), at: n(d.at, 0, 1e14) ?? 0, read: bool(d.read) };
}
function phrases(d) {
  if (!isUser(d.from) || !isUser(d.to)) return null;
  const text = str(d.text, 200).trim();
  return text ? { id: d.id, from: d.from, to: d.to, text, at: n(d.at, 0, 1e14) ?? 0 } : null;
}
function challenges(d) {
  if (!DATE.test(d.id || '') || !CHALLENGES.some(c => c.id === d.tpl)) return null;
  return { id: d.id, week: d.id, tpl: d.tpl, by: isUser(d.by) ? d.by : null, at: n(d.at, 0, 1e14) ?? 0 };
}
function settings(d) {
  if (!isUser(d.id)) return null;
  const share = {};
  ['train', 'notes', 'weight', 'measures', 'habits'].forEach(k => { if (typeof d.share?.[k] === 'boolean') share[k] = d.share[k]; });
  const goals = {};
  const lim = { protein: [10, 500], water: [0.5, 10], sleep: [3, 12], steps: [500, 100000] };
  Object.entries(lim).forEach(([k, [a, b]]) => { const v = n(d.goals?.[k], a, b); if (v != null) goals[k] = v; });
  const ach = new Set(ACHIEVEMENTS.map(a => a.id));
  return { id: d.id, share, goals, seenAch: Array.isArray(d.seenAch) ? d.seenAch.filter(x => ach.has(x)) : [] };
}

const CLEANERS = { sessions: session, body, measures, habits, messages, phrases, challenges, settings };

export function cleanList(collection, docs) {
  const f = CLEANERS[collection];
  const out = [];
  for (const d of docs) {
    if (!d || typeof d !== 'object' || !ID.test(d.id || '')) continue;
    try { const c = f(d); if (c) out.push(c); } catch (e) { /* documento inválido: se ignora */ }
  }
  return out;
}
