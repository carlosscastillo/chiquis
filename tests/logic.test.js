// Pruebas de la lógica de la app (sin navegador): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.js';
import { cleanList } from '../public/sanitize.js';

let n = 0;
const ses = (user, date, routine, items) => ({ id: 's' + (++n), user, date, routine, startedAt: 1, finishedAt: Date.parse(date) + 3600e3, items });
const sets = (k, w, r) => Array.from({ length: k }, () => ({ w, r, done: true }));
const banca = { ex: 'press_banca', sets: 4, lo: 6, hi: 8 };

test('sugiere subir peso solo cuando completas todas las series en el tope del rango', () => {
  const db = [ses('a', '2026-10-05', 'TA', [{ ex: 'press_banca', sets: sets(4, 30, 8) }])];
  const s = L.suggestion(db, 'a', 'TA', banca);
  assert.equal(s.type, 'up');
  assert.equal(s.weight, 32.5);

  db.push(ses('a', '2026-10-12', 'TA', [{ ex: 'press_banca', sets: sets(4, 32.5, 6) }]));
  assert.equal(L.suggestion(db, 'a', 'TA', banca).type, 'keep');
});

test('la progresión se compara contra la misma rutina (una vez por semana)', () => {
  const db = [ses('a', '2026-10-05', 'TB', [{ ex: 'press_banca', sets: sets(4, 40, 8) }])];
  assert.equal(L.suggestion(db, 'a', 'TA', banca).type, 'new');
});

test('detecta estancamiento: 4 semanas con el mismo peso', () => {
  const db = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']
    .map(d => ses('a', d, 'TA', [{ ex: 'press_banca', sets: sets(4, 32.5, 6) }]));
  const s = L.suggestion(db, 'a', 'TA', banca);
  assert.ok(s.alert);
  assert.equal(s.alert.weeks, 4);
});

test('detecta récords de peso y de repeticiones', () => {
  const a = ses('a', '2026-10-05', 'TA', [{ ex: 'press_banca', sets: sets(4, 30, 8) }]);
  const b = ses('a', '2026-10-12', 'TA', [{ ex: 'press_banca', sets: sets(4, 32.5, 6) }]);
  assert.equal(L.detectPRs([a, b], b).length, 1);
  const c = ses('a', '2026-10-19', 'TA', [{ ex: 'press_banca', sets: [{ w: 32.5, r: 7, done: true }] }]);
  assert.match(L.detectPRs([a, b, c], c)[0].text, /7 reps/);
});

test('la semana se recorre: toca la rutina que sigue a la última hecha', () => {
  const db = [ses('a', '2026-10-05', 'TA', [])];
  assert.equal(L.nextRoutine(db, 'a').id, 'PA');
  assert.equal(L.nextRoutine([], 'a').id, 'TA');
});

test('racha juntos: 3 recuperaciones al mes y la 4ª falta la reinicia', () => {
  const db = [];
  const both = d => { db.push(ses('a', d, 'TA', [])); db.push(ses('b', d, 'TA', [])); };
  ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09', '2026-10-13'].forEach(both);
  db.push(ses('b', '2026-10-12', 'TA', [])); // solo uno: gasta recuperación
  let r = L.coupleStreak(db, '2026-10-13');
  assert.equal(r.current, 5);
  assert.equal(r.left, 2);
  r = L.coupleStreak(db, '2026-10-20'); // faltan 14, 16 y 19: 4ª falta del mes
  assert.equal(r.current, 0);
  assert.equal(r.best, 5);
  r = L.coupleStreak(db, '2026-11-02'); // mes nuevo: recuperaciones completas
  assert.equal(r.left, 3);
});

test('los jueves, sábados y domingos no cuentan para la racha juntos', () => {
  assert.equal(L.isTrainDay('2026-10-08'), false); // jueves
  assert.equal(L.isTrainDay('2026-10-09'), true);  // viernes
});

test('limpieza de datos: descarta o convierte datos maliciosos', () => {
  const x = '"><img src=x onerror="alert(1)">';
  const habits = cleanList('habits', [{ id: 'a_2026-10-02', user: 'a', date: '2026-10-02', steps: x, protein: x }]);
  assert.equal(habits[0].steps, 0);
  assert.equal(habits[0].protein, 0);
  assert.equal(cleanList('body', [{ id: 'b1', user: 'a', date: x, kg: 80 }]).length, 0);
  assert.equal(cleanList('messages', [{ id: 'bad"id', from: 'b', to: 'a', kind: 'text', text: 'hola' }]).length, 0);
  assert.equal(cleanList('messages', [{ id: 'm1', from: 'b', to: 'a', kind: 'sticker', sticker: x }]).length, 0);
  assert.equal(cleanList('sessions', [{ id: 's1', user: 'zzz', date: '2026-10-02', routine: 'TA' }]).length, 0);
});
