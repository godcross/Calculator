// Settings sheet.
import * as store from '../store.js';
import { BC_STAIR_CODE } from '../engine/construction.js';
import { h, sheet, toast, confirmBox } from './common.js';

export function openSettings() {
  const s = store.settings();
  const sel = (key, options) => {
    const el = h('select', {}, ...options.map(([v, t]) => h('option', { value: v, selected: String(s[key]) === String(v) }, t)));
    el.addEventListener('change', async () => { await store.saveSettings({ [key]: /^\d+(\.\d+)?$/.test(el.value) ? +el.value : el.value }); changed(key); });
    return el;
  };
  const num = (key) => {
    const el = h('input', { type: 'text', inputmode: 'decimal', value: s[key] });
    el.addEventListener('change', async () => { const v = parseFloat(el.value); if (Number.isFinite(v)) { await store.saveSettings({ [key]: v }); changed(key); } });
    return el;
  };
  const row = (label, el, help) => h('div', { class: 'fld' }, h('label', {}, label), el, help ? h('div', { class: 'note', style: 'margin-top:4px' }, help) : null);
  const lim = BC_STAIR_CODE;
  const body = h('div', {},
    h('h3', { style: 'color:var(--accent-2);margin:4px 0' }, 'Display'),
    h('div', { class: 'grid2' },
      row('Number format', sel('sep', [[',', '1,234.56'], [' ', '1 234.56'], ['', '1234.56']])),
      row('Keypad hand', sel('hand', [['right', 'Right-handed'], ['left', 'Left-handed']]))),
    h('h3', { style: 'color:var(--accent-2);margin:14px 0 4px' }, 'Construction'),
    h('div', { class: 'grid2' },
      row('Units', sel('units', [['imperial', "Imperial (ft-in)"], ['metric', 'Metric']])),
      row('Fraction precision', sel('denom', [[8, '1/8"'], [16, '1/16"'], [32, '1/32"'], [64, '1/64"']])),
      row('Default waste %', num('waste')),
      row('Stair type default', sel('stairType', [['private', 'Private'], ['public', 'Public']]))),
    h('p', { class: 'note' }, `Stair limits (BC Building Code 2024, Part 9): private rise ${lim.private.riseMin}–${lim.private.riseMax} mm, run ${lim.private.runMin}–${lim.private.runMax} mm; public rise ${lim.public.riseMin}–${lim.public.riseMax} mm, run ≥ ${lim.public.runMin} mm.`),
    h('h3', { style: 'color:var(--accent-2);margin:14px 0 4px' }, 'Tax (Basic → Tax)'),
    h('div', { class: 'grid2' }, row('GST %', num('gst')), row('PST %', num('pst'))),
    h('h3', { style: 'color:var(--accent-2);margin:14px 0 4px' }, 'Scientific'),
    row('Default angle mode', sel('angle', [['deg', 'Degrees'], ['rad', 'Radians'], ['grad', 'Gradians']])),
    h('h3', { style: 'color:var(--accent-2);margin:14px 0 4px' }, 'Offline voice'),
    h('p', { class: 'note' }, s.voiceConsent ? 'The speech model is on this device. Audio is processed on the phone only.' : 'Not set up yet. Tap any 🎙 button to download the speech model once (~40 MB).'),
    h('div', { class: 'row', style: 'display:flex;gap:8px;flex-wrap:wrap' },
      h('button', { class: 'btn small', onclick: async () => { await window.__voice.forget(); toast('Speech model removed from this device'); } }, 'Remove speech model')),
    h('h3', { style: 'color:var(--accent-2);margin:14px 0 4px' }, 'Privacy & data'),
    h('p', { class: 'note' }, 'No accounts, no ads, no tracking. Everything is saved only in this browser on this device. Exports are files you choose to share. Clearing the browser\'s site data deletes your jobs.'),
    h('button', { class: 'btn danger', style: 'width:100%;margin-top:6px', onclick: async () => {
      if (await confirmBox('Delete all data', 'Delete every job, calculation, sketch, memory and setting on this device? This cannot be undone.', { okLabel: 'Delete everything', danger: true })) {
        await store.wipeEverything(); localStorage.clear(); location.reload();
      }
    } }, 'Delete all data'),
    h('p', { class: 'note', style: 'text-align:center;margin-top:16px' }, 'Build Calc · works offline · v1.0'));
  sheet('Settings', body);

  function changed(key) {
    if (key === 'hand') document.body.className = `hand-${store.settings().hand}`;
    if (key === 'units') document.dispatchEvent(new CustomEvent('units-changed'));
    else document.dispatchEvent(new CustomEvent('settings-changed'));
  }
}
