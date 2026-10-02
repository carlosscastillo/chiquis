// ============================================================
//  Almacenamiento: Firebase (sincronizado) o local (solo este teléfono)
// ============================================================
import { USER_IDS } from './data.js';

export const COLLECTIONS = ['sessions', 'body', 'measures', 'habits', 'messages', 'phrases', 'challenges', 'settings'];
const PREFIX = 'gym_';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function clean(obj) { return JSON.parse(JSON.stringify(obj)); }

// ---------------- Local ----------------
class LocalStore {
  constructor() {
    this.mode = 'local';
    this.data = {};
    this.listeners = new Set();
    this.status = 'local';
    for (const c of COLLECTIONS) this.data[c] = this.read(c);
    window.addEventListener('storage', e => {
      if (!e.key || !e.key.startsWith('gym.v1.')) return;
      const c = e.key.slice(7);
      if (COLLECTIONS.includes(c)) { this.data[c] = this.read(c); this.emit(); }
    });
  }
  read(c) { try { return JSON.parse(localStorage.getItem('gym.v1.' + c)) || {}; } catch { return {}; } }
  write(c) { try { localStorage.setItem('gym.v1.' + c, JSON.stringify(this.data[c])); } catch {} }
  async start() { this.emit(); }
  all(c) { return Object.values(this.data[c] || {}); }
  get(c, id) { return this.data[c]?.[id] || null; }
  put(c, doc) { this.data[c][doc.id] = clean(doc); this.write(c); this.emit(); }
  del(c, id) { delete this.data[c][id]; this.write(c); this.emit(); }
  on(fn) { this.listeners.add(fn); }
  emit() { this.listeners.forEach(f => f()); }
}

// ---------------- Firebase ----------------
// Solo entran las cuentas de Google registradas en la colección gym_miembros
// (documento con id = correo y campo user = 'a' o 'b'). Las reglas lo vuelven a revisar en el servidor.
class FirebaseStore extends LocalStore {
  constructor(config) {
    super();
    this.mode = 'firebase';
    this.status = 'iniciando';
    this.config = config;
    this.pending = [];
    this.ready = false;
    this.cacheFlags = {};
    this.pendingFlags = {};
    this.unsubs = [];
    this.userId = null;
    this.email = null;
  }
  // Copia local para abrir rápido y sin internet
  read(c) { try { return JSON.parse(localStorage.getItem('gym.fb.' + c)) || {}; } catch { return {}; } }
  write(c) { try { localStorage.setItem('gym.fb.' + c, JSON.stringify(this.data[c])); } catch {} }

  async start() {
    this.emit();
    try {
      if (!this.fb) {
        const fb = await import('./firebase.js');
        this.fb = fb;
        const app = fb.initializeApp(this.config);
        try {
          this.db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentSingleTabManager() }) });
        } catch (e) {
          this.db = fb.initializeFirestore(app, {});
        }
        this.auth = fb.getAuth(app);
        window.addEventListener('online', () => { this.updateStatus(); this.emit(); });
        window.addEventListener('offline', () => { this.updateStatus(); this.emit(); });
        // Por si el inicio de sesión fue por redirección
        fb.getRedirectResult(this.auth).catch(e => { this.loginError = e.code || e.message; });
      }
      // Si ya habías entrado antes, funciona aunque no haya internet
      await this.auth.authStateReady();
      await this.afterAuth();
    } catch (err) {
      console.error(err);
      this.status = navigator.onLine ? 'error' : 'offline';
      this.errorMsg = err.code || err.message;
      this.emit();
      this.scheduleRetry();
    }
  }
  scheduleRetry() {
    if (this.retrying) return;
    this.retrying = true;
    const retry = () => { window.removeEventListener('online', retry); clearTimeout(t); this.retrying = false; if (!this.ready) this.start(); };
    const t = setTimeout(retry, 20000);
    window.addEventListener('online', retry);
  }
  async afterAuth() {
    const user = this.auth.currentUser;
    if (!user) { this.status = 'login'; this.emit(); return; }
    this.email = (user.email || '').toLowerCase();
    this.userId = user.emailVerified ? await this.lookupMember() : null;
    if (!this.userId) { this.status = 'denied'; this.emit(); return; }
    this.connect();
  }
  // ¿Esta cuenta es miembro? Se guarda en el teléfono para poder abrir sin internet.
  async lookupMember() {
    const fb = this.fb;
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('gym.miembro')); } catch {}
    try {
      const snap = await Promise.race([
        fb.getDoc(fb.doc(this.db, PREFIX + 'miembros', this.email)),
        new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), 8000)),
      ]);
      const u = snap.exists() ? snap.data().user : null;
      if (USER_IDS.includes(u)) { localStorage.setItem('gym.miembro', JSON.stringify({ email: this.email, user: u })); return u; }
      localStorage.removeItem('gym.miembro');
      return null;
    } catch (e) {
      if (e.code === 'permission-denied') return null;
      if (cached && cached.email === this.email && USER_IDS.includes(cached.user)) return cached.user; // sin internet
      throw e;
    }
  }
  connect() {
    const fb = this.fb, db = this.db;
    this.ready = true;
    this.status = 'conectando'; this.errorMsg = null;
    this.unsubs.forEach(u => u()); this.unsubs = [];
    for (const c of COLLECTIONS) {
      this.unsubs.push(fb.onSnapshot(fb.collection(db, PREFIX + c), { includeMetadataChanges: true }, snap => {
        const map = {};
        snap.forEach(d => { map[d.id] = { ...d.data(), id: d.id }; });
        this.data[c] = map;
        this.write(c);
        this.cacheFlags[c] = snap.metadata.fromCache;
        this.pendingFlags[c] = snap.metadata.hasPendingWrites;
        this.updateStatus();
        this.emit();
      }, err => { console.error(err); this.status = 'error'; this.errorMsg = err.code || err.message; this.emit(); }));
    }
    const queued = this.pending; this.pending = [];
    queued.forEach(([op, c, x]) => (op === 'put' ? this.remotePut(c, x) : this.remoteDel(c, x)));
    this.emit();
  }
  async signIn() {
    const fb = this.fb;
    if (!fb) return;
    this.loginError = null;
    const provider = new fb.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await fb.signInWithPopup(this.auth, provider);
      await this.afterAuth();
    } catch (e) {
      const code = e.code || '';
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(code)) {
        await fb.signInWithRedirect(this.auth, provider);
        return;
      }
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') this.loginError = code || e.message;
      this.emit();
    }
  }
  async signOut() {
    try { await this.fb.signOut(this.auth); } catch (e) { console.error(e); }
    for (const c of COLLECTIONS) localStorage.removeItem('gym.fb.' + c);
    localStorage.removeItem('gym.miembro');
    location.reload();
  }
  updateStatus() {
    if (['error', 'login', 'denied', 'iniciando'].includes(this.status) && !this.ready) return;
    if (this.status === 'error') return;
    const offline = !navigator.onLine || Object.values(this.cacheFlags).some(Boolean);
    const pend = Object.values(this.pendingFlags).some(Boolean);
    this.status = offline ? 'offline' : pend ? 'subiendo' : 'ok';
  }
  remotePut(c, doc) { this.fb.setDoc(this.fb.doc(this.db, PREFIX + c, doc.id), doc).catch(e => { console.error(e); this.status = 'error'; this.errorMsg = e.code; this.emit(); }); }
  remoteDel(c, id) { this.fb.deleteDoc(this.fb.doc(this.db, PREFIX + c, id)).catch(e => console.error(e)); }
  put(c, doc) {
    const d = clean(doc);
    this.data[c][d.id] = d; this.write(c); this.emit();
    if (this.ready) this.remotePut(c, d); else this.pending.push(['put', c, d]);
  }
  del(c, id) {
    delete this.data[c][id]; this.write(c); this.emit();
    if (this.ready) this.remoteDel(c, id); else this.pending.push(['del', c, id]);
  }
}

export async function createStore() {
  let config = null;
  try {
    config = (await import('./firebase-config.js')).firebaseConfig;
  } catch (e) { /* sin archivo de configuración: modo local */ }
  const valid = config && config.apiKey && !/PEGA|TU_/i.test(config.apiKey) && config.projectId;
  return valid ? new FirebaseStore(config) : new LocalStore();
}

// ---------------- Fotos (solo en este teléfono) ----------------
const PHOTO_DB = 'gym-fotos';
function openPhotos() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(PHOTO_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fotos', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export const photos = {
  async all(user) {
    const db = await openPhotos();
    return new Promise(res => {
      const out = [];
      const cur = db.transaction('fotos').objectStore('fotos').openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) { if (c.value.user === user) out.push(c.value); c.continue(); }
        else res(out.sort((a, b) => (a.date < b.date ? 1 : -1)));
      };
      cur.onerror = () => res(out);
    });
  },
  async put(foto) {
    const db = await openPhotos();
    return new Promise((res, rej) => {
      const tx = db.transaction('fotos', 'readwrite');
      tx.objectStore('fotos').put(foto);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  },
  async del(id) {
    const db = await openPhotos();
    return new Promise(res => {
      const tx = db.transaction('fotos', 'readwrite');
      tx.objectStore('fotos').delete(id);
      tx.oncomplete = res; tx.onerror = res;
    });
  },
};

// Reduce una foto a 1080 px de lado mayor y la regresa como JPEG (data URL)
export function shrinkImage(file, max = 1080) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = rej;
    img.src = url;
  });
}
