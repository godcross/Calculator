// On-device storage (IndexedDB). Nothing leaves the phone.
const DB_NAME = 'build-calc';
const DB_VERSION = 1;
const STORES = {
  jobs: { keyPath: 'id' },
  entries: { keyPath: 'id', indexes: ['jobId'] },
  sketches: { keyPath: 'id', indexes: ['jobId'] },
  history: { keyPath: 'id' },
  memories: { keyPath: 'id' },
  kv: { keyPath: 'k' },
};

let dbp;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const [name, cfg] of Object.entries(STORES)) {
        if (d.objectStoreNames.contains(name)) continue;
        const os = d.createObjectStore(name, { keyPath: cfg.keyPath });
        for (const ix of cfg.indexes || []) os.createIndex(ix, ix);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const os = t.objectStore(store);
    let result;
    const r = fn(os);
    if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const put = (store, obj) => tx(store, 'readwrite', (os) => os.put(obj)).then(() => obj);
export const get = (store, key) => tx(store, 'readonly', (os) => os.get(key));
export const del = (store, key) => tx(store, 'readwrite', (os) => os.delete(key));
export const all = (store) => tx(store, 'readonly', (os) => os.getAll()).then((r) => r || []);
export const clear = (store) => tx(store, 'readwrite', (os) => os.clear());
export const byIndex = (store, index, value) =>
  tx(store, 'readonly', (os) => os.index(index).getAll(value)).then((r) => r || []);

// ---- settings ----
export const DEFAULT_SETTINGS = {
  sep: ',',
  angle: 'deg',
  units: 'imperial',
  denom: 16,
  waste: 10,
  gst: 5,
  pst: 7,
  stairType: 'private',
  hand: 'right',
  voiceModelUrl: 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz',
  voiceConsent: false,
  code: null, // custom stair code overrides
};
let settingsCache = null;
export async function loadSettings() {
  const row = await get('kv', 'settings');
  settingsCache = { ...DEFAULT_SETTINGS, ...(row ? row.v : {}) };
  return settingsCache;
}
export function settings() { return settingsCache || { ...DEFAULT_SETTINGS }; }
export async function saveSettings(patch) {
  settingsCache = { ...settings(), ...patch };
  await put('kv', { k: 'settings', v: settingsCache });
  return settingsCache;
}

// ---- history (shared across screens, capped) ----
const HISTORY_MAX = 300;
export async function addHistory(item) {
  const row = { id: uid(), ts: Date.now(), ...item };
  await put('history', row);
  const rows = await all('history');
  if (rows.length > HISTORY_MAX) {
    rows.sort((a, b) => a.ts - b.ts);
    for (const r of rows.slice(0, rows.length - HISTORY_MAX)) await del('history', r.id);
  }
  return row;
}
export async function listHistory() {
  return (await all('history')).sort((a, b) => b.ts - a.ts);
}

// ---- jobs ----
export async function listJobs() {
  return (await all('jobs')).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
export async function createJob(name) {
  const job = { id: uid(), name: name.trim() || 'Untitled job', created: Date.now(), updated: Date.now() };
  return put('jobs', job);
}
export async function touchJob(id) {
  const j = await get('jobs', id);
  if (j) { j.updated = Date.now(); await put('jobs', j); }
}
export async function deleteJob(id) {
  for (const e of await byIndex('entries', 'jobId', id)) await del('entries', e.id);
  for (const s of await byIndex('sketches', 'jobId', id)) await del('sketches', s.id);
  await del('jobs', id);
}
export async function saveEntry(entry) {
  const e = { id: uid(), ts: Date.now(), ...entry };
  await put('entries', e);
  await touchJob(e.jobId);
  return e;
}
export async function jobContents(jobId) {
  const entries = (await byIndex('entries', 'jobId', jobId)).sort((a, b) => a.ts - b.ts);
  const sketches = (await byIndex('sketches', 'jobId', jobId)).sort((a, b) => a.ts - b.ts);
  return { entries, sketches };
}

export async function wipeEverything() {
  for (const s of Object.keys(STORES)) await clear(s);
  settingsCache = { ...DEFAULT_SETTINGS };
}
