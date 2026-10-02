// ============================================================
//  Utilidades de interfaz: escape, toast, modales, confeti, gráficas
// ============================================================
import { STICKERS } from './data.js';
import { icon } from './icons.js';
import { parseD, MESES_CORTOS, fmtShort, fmtKg } from './logic.js';

export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastT = null;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------------- Modales ----------------
let onCloseModal = null;
export function openModal(html, { centered = false, onClose = null } = {}) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet" role="dialog">${html}</div>`;
  m.classList.toggle('centered', centered);
  m.classList.remove('hidden');
  onCloseModal = onClose;
}
export function closeModal() {
  const m = $('#modal');
  if (m.classList.contains('hidden')) return;
  m.classList.add('hidden');
  m.innerHTML = '';
  const f = onCloseModal; onCloseModal = null;
  if (f) f();
}
export const modalOpen = () => !$('#modal').classList.contains('hidden');
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

export function confirmBox(html, yes, onYes, { danger = false } = {}) {
  openModal(`<div class="quote" style="font-size:18px">${html}</div>
    <div class="row"><button class="btn grow" data-act="modal-close">Cancelar</button>
    <button class="btn grow ${danger ? 'danger' : 'primary'}" id="confirmYes">${esc(yes)}</button></div>`, { centered: true });
  $('#confirmYes').addEventListener('click', () => { closeModal(); onYes(); });
}

// ---------------- Stickers ----------------
export const stickerById = id => STICKERS.find(s => s.id === id) || STICKERS[0];
export function stickerHtml(id, cls = '') {
  const s = stickerById(id);
  return `<div class="sticker ${cls}" style="--bg:${s.bg}"><span class="e">${icon(s.icon, { size: 32, stroke: 2.25 })}</span><span>${esc(s.text)}</span></div>`;
}

// ---------------- Confeti ----------------
export function confetti(colors = ['#FF7A3D', '#FF5C8A', '#F2B33D', '#3DBE7A', '#6C9BFF', '#F3F0EA']) {
  const c = $('#confetti');
  c.classList.remove('hidden');
  const ctx = c.getContext('2d');
  const W = c.width = innerWidth * devicePixelRatio, H = c.height = innerHeight * devicePixelRatio;
  const parts = Array.from({ length: 160 }, () => ({
    x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35,
    vx: (Math.random() - .5) * 26 * devicePixelRatio, vy: (-Math.random() * 22 - 8) * devicePixelRatio,
    s: (6 + Math.random() * 8) * devicePixelRatio, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += .7 * devicePixelRatio; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (t - t0 < 3200) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, W, H); c.classList.add('hidden'); }
  })(t0);
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
}

// ---------------- Gráfica de líneas (SVG) ----------------
// series: [{ name, color, points: [{d:'YYYY-MM-DD', y, label}], line, dots, dash }]
export function lineChart(series, { height = 220, unit = '', invert = false } = {}) {
  const pts = series.flatMap(s => s.points);
  if (!pts.length) return '<div class="empty">Todavía no hay datos en este periodo.</div>';
  const W = 340, H = height, L = 38, R = 10, T = 14, B = 26;
  const xs = pts.map(p => parseD(p.d).getTime());
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 3 * 864e5; x1 += 3 * 864e5; }
  let y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
  const pad = Math.max((y1 - y0) * .15, y1 === y0 ? Math.max(1, Math.abs(y1) * .05) : 0);
  y0 -= pad; y1 += pad;
  const step = niceStep((y1 - y0) / 4);
  y0 = Math.floor(y0 / step) * step; y1 = Math.ceil(y1 / step) * step;
  const X = t => L + (t - x0) / (x1 - x0) * (W - L - R);
  const Y = v => invert ? T + (v - y0) / (y1 - y0) * (H - T - B) : H - B - (v - y0) / (y1 - y0) * (H - T - B);
  let g = '';
  for (let v = y0; v <= y1 + 1e-9; v += step) {
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--line)" stroke-width="1"/>`;
    g += `<text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="10" style="fill:var(--faint)">${fmtKg(Math.round(v * 10) / 10)}</text>`;
  }
  // etiquetas de fecha (máx 4)
  const span = x1 - x0, nT = 4;
  for (let i = 0; i <= nT; i++) {
    const t = x0 + span * i / nT, d = new Date(t);
    const anchor = i === 0 ? 'start' : i === nT ? 'end' : 'middle';
    g += `<text x="${X(t)}" y="${H - 6}" text-anchor="${anchor}" font-size="10" style="fill:var(--faint)">${d.getDate()} ${MESES_CORTOS[d.getMonth()]}</text>`;
  }
  let marks = '', hits = '';
  for (const s of series) {
    const ps = s.points.slice().sort((a, b) => (a.d < b.d ? -1 : 1));
    if (s.line !== false && ps.length > 1) {
      const dpath = ps.map((p, i) => `${i ? 'L' : 'M'}${X(parseD(p.d).getTime()).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
      marks += `<path d="${dpath}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''} opacity="${s.opacity ?? 1}"/>`;
    }
    if (s.dots !== false) {
      for (const p of ps) {
        const cx = X(parseD(p.d).getTime()), cy = Y(p.y);
        marks += `<circle cx="${cx}" cy="${cy}" r="${s.r || 4.5}" fill="${s.color}" style="stroke:var(--card)" stroke-width="2" opacity="${s.opacity ?? 1}"/>`;
      }
    }
    for (const p of ps) {
      const cx = X(parseD(p.d).getTime()), cy = Y(p.y);
      const tip = `${fmtShort(p.d)} · ${p.label ?? fmtKg(p.y) + (unit ? ' ' + unit : '')}`;
      hits += `<circle cx="${cx}" cy="${cy}" r="14" fill="transparent" data-tip="${esc(tip)}" data-x="${cx / W}" data-y="${cy / H}"/>`;
    }
  }
  return `<div class="chart" data-chart><svg viewBox="0 0 ${W} ${H}" role="img">${g}${marks}${hits}</svg><div class="tip hidden"></div></div>`;
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
// Tooltip al tocar un punto
document.addEventListener('click', e => {
  const hit = e.target.closest('[data-tip]');
  document.querySelectorAll('.chart .tip').forEach(t => t.classList.add('hidden'));
  if (!hit) return;
  const chart = hit.closest('[data-chart]');
  const tip = chart.querySelector('.tip');
  tip.textContent = hit.dataset.tip;
  const x = parseFloat(hit.dataset.x);
  tip.style.left = (x * 100) + '%';
  tip.style.transform = `translate(${x > 0.7 ? '-100%' : x < 0.3 ? '0' : '-50%'}, -120%)`;
  tip.style.top = (parseFloat(hit.dataset.y) * 100) + '%';
  tip.classList.remove('hidden');
});
