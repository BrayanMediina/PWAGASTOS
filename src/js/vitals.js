/**
 * AUDITORÍA 4 – MEDICIÓN EN TIEMPO REAL DE CORE WEB VITALS
 * Captura LCP, CLS e INP usando PerformanceObserver nativo.
 * Los resultados se imprimen en consola (con código de color) y se
 * persisten en IndexedDB simulando un sistema RUM (Real User Monitoring).
 *
 * Umbrales oficiales de Google:
 *   LCP  ≤ 2 500 ms  → bueno  |  ≤ 4 000 ms → necesita mejora  | > 4 000 ms → deficiente
 *   CLS  ≤ 0.1       → bueno  |  ≤ 0.25      → necesita mejora  | > 0.25      → deficiente
 *   INP  ≤ 200 ms    → bueno  |  ≤ 500 ms    → necesita mejora  | > 500 ms    → deficiente
 */

// ─── IndexedDB ────────────────────────────────────────────────────────────────
const DB_NAME    = 'web-vitals-rum';
const DB_VERSION = 1;
const STORE      = 'vitals';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = ({ target: { result: db } }) => {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('name',      'name',      { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function saveVital({ name, value, rating }) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({ name, value, rating, timestamp: Date.now(), url: location.href });
  } catch {
    /* IndexedDB no disponible en este contexto */
  }
}

/** Leer todos los registros guardados (útil desde la consola del navegador) */
export async function getStoredVitals() {
  const db = await openDB();
  return new Promise((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

// ─── Consola ──────────────────────────────────────────────────────────────────
const COLORS = { good: '#10b981', 'needs-improvement': '#f59e0b', poor: '#ef4444' };

function logVital({ name, value, rating }) {
  const color   = COLORS[rating] ?? '#6366f1';
  const unit    = name === 'CLS' ? '' : ' ms';
  const display = name === 'CLS' ? value.toFixed(4) : Math.round(value);
  console.log(
    `%c[Web Vitals] ${name}: ${display}${unit}  →  ${rating.toUpperCase()}`,
    `color:${color}; font-weight:bold; font-size:13px;`
  );
}

// ─── Panel visual ──────────────────────────────────────────────────────────────
function updatePanel(name, value, rating) {
  const el = document.getElementById(`vp-${name.toLowerCase()}`);
  if (!el) return;
  const unit    = name === 'CLS' ? '' : 'ms';
  const display = name === 'CLS' ? value.toFixed(3) : Math.round(value);
  el.textContent    = `${display}${unit}`;
  el.dataset.rating = rating;
}

// ─── Reporter central ─────────────────────────────────────────────────────────
function report(metric) {
  logVital(metric);
  saveVital(metric);
  updatePanel(metric.name, metric.value, metric.rating);
  // Mostrar el panel al recibir el primer dato
  const panel = document.getElementById('vitalsPanel');
  if (panel?.hidden) panel.hidden = false;
}

function getRating(name, value) {
  if (name === 'LCP') return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
  if (name === 'CLS') return value <= 0.1  ? 'good' : value <= 0.25  ? 'needs-improvement' : 'poor';
  if (name === 'INP') return value <= 200  ? 'good' : value <= 500   ? 'needs-improvement' : 'poor';
  return 'good';
}

// ─── LCP – Largest Contentful Paint ──────────────────────────────────────────
function measureLCP() {
  if (!PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')) return;
  let lcpValue = 0;
  const po = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    lcpValue = entries[entries.length - 1].startTime;
  });
  po.observe({ type: 'largest-contentful-paint', buffered: true });

  const finalize = () => {
    po.disconnect();
    if (lcpValue > 0) report({ name: 'LCP', value: lcpValue, rating: getRating('LCP', lcpValue) });
  };
  ['visibilitychange', 'pointerdown', 'keydown'].forEach(
    (evt) => document.addEventListener(evt, finalize, { once: true, capture: true })
  );
}

// ─── CLS – Cumulative Layout Shift ───────────────────────────────────────────
function measureCLS() {
  if (!PerformanceObserver.supportedEntryTypes?.includes('layout-shift')) return;
  let clsValue = 0, sessionValue = 0, sessionEntries = [];

  const po = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      const first = sessionEntries[0]?.startTime ?? 0;
      const last  = sessionEntries.at(-1)?.startTime ?? 0;
      if (entry.startTime - first < 5000 && entry.startTime - last < 1000) {
        sessionValue += entry.value;
        sessionEntries.push(entry);
      } else {
        if (sessionValue > clsValue) clsValue = sessionValue;
        sessionValue = entry.value;
        sessionEntries = [entry];
      }
    }
    if (sessionValue > clsValue) clsValue = sessionValue;
  });
  po.observe({ type: 'layout-shift', buffered: true });

  document.addEventListener('visibilitychange', () => {
    po.disconnect();
    report({ name: 'CLS', value: clsValue, rating: getRating('CLS', clsValue) });
  }, { once: true });
}

// ─── INP – Interaction to Next Paint ─────────────────────────────────────────
function measureINP() {
  if (!PerformanceObserver.supportedEntryTypes?.includes('event')) return;
  const durations = [];

  const po = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.interactionId) durations.push(entry.duration);
    }
  });
  po.observe({ type: 'event', durationThreshold: 16, buffered: true });

  document.addEventListener('visibilitychange', () => {
    po.disconnect();
    if (!durations.length) return;
    durations.sort((a, b) => b - a);
    const idx = Math.min(Math.ceil(durations.length * 0.02), durations.length - 1);
    const inp = durations[idx] ?? durations[0];
    report({ name: 'INP', value: inp, rating: getRating('INP', inp) });
  }, { once: true });
}

// ─── Panel UI handlers ────────────────────────────────────────────────────────
function setupPanelToggle() {
  const panel  = document.getElementById('vitalsPanel');
  const toggle = document.getElementById('vitalsToggle');
  if (!panel || !toggle) return;

  // Mostrar panel después de que haya al menos un dato
  const showPanel = () => { panel.hidden = false; };
  const origUpdate = updatePanel;
  // Override updatePanel to reveal panel on first data
  window.__vitalsFirstData = showPanel;

  toggle.addEventListener('click', () => {
    const content = document.getElementById('vitalsContent');
    if (!content) return;
    const collapsed = content.hidden;
    content.hidden = !collapsed;
    toggle.setAttribute('aria-expanded', String(collapsed));
  });
}

// ─── Inicialización pública ───────────────────────────────────────────────────
export function initVitals() {
  measureLCP();
  measureCLS();
  measureINP();
  setupPanelToggle();
  console.log(
    '%c[Web Vitals] Monitoreo activo: LCP · CLS · INP  |  getStoredVitals() para ver historial',
    'color:#6366f1; font-weight:bold; font-size:13px;'
  );
}

// Exponer en window para acceso fácil desde DevTools
if (typeof window !== 'undefined') {
  window.getStoredVitals = () => getStoredVitals().then(console.table);
}
