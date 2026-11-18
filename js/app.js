// App bootstrap: screens, navigation, keyboard, offline service worker.
import * as store from './store.js';
import { $, $$, h } from './ui/common.js';
import { initBasic } from './ui/basic.js';
import { initConstruction } from './ui/construction.js';
import { initScientific } from './ui/scientific.js';
import { initSketch } from './ui/sketch.js';
import { initJobs } from './ui/jobs.js';
import { openSettings } from './ui/settings.js';
import { voice } from './voice.js';

window.__voice = voice;

const TITLES = { basic: 'Basic', build: 'Construction', sci: 'Scientific', sketch: 'Sketch pad', jobs: 'Jobs' };
const screens = {};
let current = 'basic';

function show(name) {
  current = name;
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.screen === name));
  $('#screen-title').textContent = TITLES[name];
  localStorage.setItem('screen', name);
  screens[name]?.onShow?.();
}

async function refreshJobChip() {
  const id = localStorage.getItem('activeJob');
  const chip = $('#job-chip');
  const job = id ? await store.get('jobs', id) : null;
  chip.textContent = job ? `📁 ${job.name}` : 'No job';
  chip.classList.toggle('on', !!job);
}

async function main() {
  await store.loadSettings();
  document.body.className = `hand-${store.settings().hand}`;

  screens.basic = initBasic($('#screen-basic'));
  screens.build = initConstruction($('#screen-build'));
  screens.sci = initScientific($('#screen-sci'));
  screens.sketch = initSketch($('#screen-sketch'));
  screens.jobs = initJobs($('#screen-jobs'), {
    openSketch: (rec) => { show('sketch'); screens.sketch.load(rec); },
    onActiveChange: refreshJobChip,
  });

  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => show(b.dataset.screen)));
  $('#btn-settings').addEventListener('click', openSettings);
  $('#job-chip').addEventListener('click', () => show('jobs'));
  refreshJobChip();

  // physical keyboard (tablets / desktop)
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select') || document.querySelector('.backdrop')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (screens[current]?.key?.(e)) e.preventDefault();
  });

  show(localStorage.getItem('screen') || 'basic');

  // offline: cache the app on first visit
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

main().catch((e) => {
  document.body.append(h('pre', { style: 'color:#f88;padding:16px;white-space:pre-wrap' }, `Startup error: ${e.stack || e}`));
});
