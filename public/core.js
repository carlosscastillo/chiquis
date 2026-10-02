// Estado compartido entre módulos
import { USERS } from './data.js';
import { other, today } from './logic.js';

export const state = {
  user: localStorage.getItem('gym.user'),
  tab: 'hoy',
  draft: null,          // sesión en curso (objeto)
  sessionVisible: false,
  tipsOpen: {},
  progView: 'me',
  progSub: 'resumen',
  sumWeek: 0,
  chartEx: null,
  chartRange: '3m',
  chartMetric: 'peso',
  weightRange: '3m',
  habitDate: today(),
  calMonth: null,
  photos: null,
  photoSel: [],
  deferred: false,
};

export const core = {
  store: null,
  db: null,
  render: () => {},
  renderSession: () => {},
};

export const me = () => state.user;
export const partner = () => other(state.user);
export const nameOf = u => USERS[u]?.name || u;

export const DEFAULT_SHARE = { train: true, notes: false, weight: false, measures: false, habits: true };

export function settingsOf(u) {
  const s = core.db?.settingsMap?.[u] || {};
  return { id: u, seenAch: [], goals: {}, ...s, share: { ...DEFAULT_SHARE, ...(s.share || {}) } };
}
export function saveSettings(u, patch) {
  const cur = settingsOf(u);
  core.store.put('settings', { ...cur, ...patch, id: u });
}
// ¿Puede el usuario actual ver esta parte de u?
export const canSee = (u, key) => u === state.user || settingsOf(u).share[key];
