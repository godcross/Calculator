// Shared UI helpers: DOM, toasts, modals, long-press, save dialog, downloads.
import * as store from '../store.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
export function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// Tap vs long-press on one element.
export function onPress(el, { tap, hold, holdMs = 550 }) {
  let timer = null, held = false, sx = 0, sy = 0;
  el.addEventListener('pointerdown', (e) => {
    held = false; sx = e.clientX; sy = e.clientY;
    if (hold) timer = setTimeout(() => { held = true; hold(e); }, holdMs);
  });
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 12) cancel(); });
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerup', (e) => { cancel(); if (!held && tap) tap(e); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && tap) { e.preventDefault(); tap(e); } });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${text}`);
  } catch {
    const ta = h('textarea', {}, text);
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast(`Copied ${text}`); } catch { toast('Copy not allowed here'); }
    ta.remove();
  }
}

// ---------- Modal / bottom sheet ----------
export function sheet(title, body, { actions = [], onClose, wide = false } = {}) {
  const backdrop = h('div', { class: 'backdrop' });
  const panel = h('div', { class: `sheet${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const close = () => { backdrop.remove(); onClose && onClose(); };
  const head = h('div', { class: 'sheet-head' },
    h('h2', {}, title),
    h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕'));
  const foot = actions.length ? h('div', { class: 'sheet-foot' },
    ...actions.map((a) => h('button', { class: `btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}`, onclick: async () => { const keep = await a.onClick?.(); if (keep !== true) close(); } }, a.label))) : null;
  panel.append(head, h('div', { class: 'sheet-body' }, body), foot || '');
  backdrop.append(panel);
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  const first = panel.querySelector('input, select, textarea');
  if (first && !first.hasAttribute('data-nofocus')) setTimeout(() => first.focus(), 50);
  return { close, panel };
}

export function confirmBox(title, message, { okLabel = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    sheet(title, h('p', { class: 'muted' }, message), {
      actions: [
        { label: 'Cancel', onClick: () => { answered = true; resolve(false); } },
        { label: okLabel, primary: !danger, danger, onClick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

export function promptBox(title, { label = '', value = '', placeholder = '', okLabel = 'OK', voice = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input', { type: 'text', value, placeholder, 'aria-label': label || title });
    const row = h('div', { class: 'field-row' }, input,
      voice ? h('button', { class: 'icon-btn mic-inline', 'aria-label': 'Dictate', onclick: () => window.__voice?.dictateInto(input) }, '🎙') : null);
    const body = h('div', {}, label ? h('label', { class: 'lbl' }, label) : null, row);
    const s = sheet(title, body, {
      actions: [
        { label: 'Cancel', onClick: () => { done = true; resolve(null); } },
        { label: okLabel, primary: true, onClick: () => { done = true; resolve(input.value); } },
      ],
      onClose: () => { if (!done) resolve(null); },
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { done = true; resolve(input.value); s.close(); } });
  });
}

// ---------- Save to job ----------
// entry: { screen, title, expression?, result?, resultValue?, inputs?, outputs? }
export async function saveToJobDialog(entry) {
  const jobs = await store.listJobs();
  const active = localStorage.getItem('activeJob');
  const sel = h('select', { 'aria-label': 'Job' },
    ...jobs.map((j) => h('option', { value: j.id, selected: j.id === active }, j.name)),
    h('option', { value: '__new' }, '+ New job…'));
  const newName = h('input', { type: 'text', placeholder: 'New job name (e.g. Smith reno)', class: jobs.length ? 'hidden' : '' });
  if (!jobs.length) sel.value = '__new';
  sel.addEventListener('change', () => newName.classList.toggle('hidden', sel.value !== '__new'));
  const title = h('input', { type: 'text', value: entry.title || '', placeholder: 'Title (optional)' });
  const note = h('textarea', { rows: 2, placeholder: 'Note (optional) — e.g. Kitchen subfloor' });
  const summary = h('div', { class: 'save-summary' },
    entry.expression ? h('div', {}, h('span', { class: 'muted' }, entry.expression), ' = ', h('b', {}, entry.result)) : null,
    ...(entry.outputs || []).slice(0, 4).map(([k, v]) => h('div', {}, h('span', { class: 'muted' }, `${k}: `), h('b', {}, v))));
  const body = h('div', { class: 'stack' }, summary,
    h('label', { class: 'lbl' }, 'Job'), sel, newName,
    h('label', { class: 'lbl' }, 'Title'), title,
    h('label', { class: 'lbl' }, 'Note'),
    h('div', { class: 'field-row' }, note, h('button', { class: 'icon-btn mic-inline', 'aria-label': 'Dictate note', onclick: () => window.__voice?.dictateInto(note) }, '🎙')));
  return new Promise((resolve) => {
    sheet('Save to job', body, {
      actions: [
        { label: 'Cancel', onClick: () => resolve(null) },
        {
          label: 'Save', primary: true, onClick: async () => {
            let jobId = sel.value;
            if (jobId === '__new') {
              if (!newName.value.trim()) { toast('Give the job a name'); newName.focus(); return true; }
              jobId = (await store.createJob(newName.value)).id;
            }
            localStorage.setItem('activeJob', jobId);
            const saved = await store.saveEntry({ ...entry, jobId, title: title.value.trim() || entry.title || entry.screen, note: note.value.trim() });
            toast('Saved to job');
            document.dispatchEvent(new CustomEvent('jobs-changed'));
            resolve(saved);
          },
        },
      ],
    });
  });
}

// ---------- Files ----------
export function downloadBytes(bytes, filename, mime) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Share a file to another app (e.g. Google Drive / Sheets / Docs) via the phone's share sheet.
export async function shareFile(bytes, filename, mime) {
  const file = new File([bytes], filename, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return true; } catch (e) { if (e.name === 'AbortError') return true; }
  }
  downloadBytes(bytes, filename, mime);
  toast('Sharing not supported here — file downloaded instead');
  return false;
}

export const safeName = (s) => String(s || 'export').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'export';
