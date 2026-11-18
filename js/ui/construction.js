// Construction screen: ft-in-fraction dimension keypad + job-site calculators.
import { dimEvaluate, formatQty } from '../engine/dim.js';
import { CalcError, calc } from '../engine/expr.js';
import { formatFtIn, formatMetricLength, formatNumber, parseLength } from '../engine/format.js';
import * as C from '../engine/construction.js';
import * as store from '../store.js';
import { h, esc, onPress, toast, copyText, sheet, saveToJobDialog } from './common.js';
import { ExprInput } from './input.js';
import { logHistory } from './basic.js';

const S = () => store.settings();
const metric = () => S().units === 'metric';
const denom = () => S().denom || 16;
const n = (v, d = 2) => (Number.isFinite(v) ? formatNumber(v, { maxDec: d, sep: S().sep }) : '—');
const L = (inches) => {
  if (!Number.isFinite(inches)) return '—';
  return metric() ? `${formatMetricLength(inches)}  (${formatFtIn(inches, denom())})` : `${formatFtIn(inches, denom())}  (${formatMetricLength(inches)})`;
};
const LShort = (inches) => (metric() ? formatMetricLength(inches) : formatFtIn(inches, denom()));
const A = (sqin) => (metric() ? `${n(sqin * 0.00064516, 2)} m²  (${n(sqin / 144, 1)} sq ft)` : `${n(sqin / 144, 1)} sq ft  (${n(sqin * 0.00064516, 2)} m²)`);
const deg = (d) => `${n(d, 1)}°`;

// ---------- Dimension pad (bottom sheet keypad for length fields) ----------
export function openDimPad(inputEl, { title = 'Enter length', unit = 'in' } = {}) {
  const bareUnit = metric() ? (unit === 'ft' ? 'm' : 'mm') : unit;
  const tidy = (t) => t.replace(/(\d)"\s*(\d+\/\d+)"?/g, '$1 $2"');
  let text = inputEl.value || '';
  const prev = h('div', { class: 'preview-line' });
  const conv = h('div', { class: 'muted small', style: 'text-align:right;min-height:1.2em' });
  const render = () => {
    prev.innerHTML = `${esc(text)}<span class="cursor"></span>`;
    const v = parseLength(text, bareUnit);
    conv.textContent = Number.isFinite(v) ? `${formatFtIn(v, denom())}  ·  ${formatMetricLength(v)}` : '';
  };
  const unitKeys = metric() ? [['m', 'm'], ['cm', 'cm'], ['mm', 'mm']] : [["ft '", "'"], ['in "', '"'], ['⁄', '/']];
  const K = [
    ['7'], ['8'], ['9'], unitKeys[0],
    ['4'], ['5'], ['6'], unitKeys[1],
    ['1'], ['2'], ['3'], unitKeys[2],
    ['0'], ['.'], ['space', ' '], ['⌫', 'back'],
  ];
  const keys = h('div', { class: 'keys k4' });
  for (const [label, val] of K) {
    const isUnit = unitKeys.some((u) => u[0] === label);
    const b = h('button', { class: `key ${isUnit ? 'unit' : ''} ${label === '⌫' ? 'clr' : ''}` }, label === 'space' ? '␣' : label);
    onPress(b, {
      tap: () => {
        const v = val ?? label;
        if (v === 'back') text = text.slice(0, -1);
        else if (v === "'" || v === '"') text = text.replace(/\s+$/, '') + v + (v === "'" ? ' ' : '');
        else if (v === '/') text = text.replace(/\s+$/, '') + '/';
        else text += v;
        render();
      },
      hold: label === '⌫' ? () => { text = ''; render(); } : null,
    });
    keys.append(b);
  }
  const body = h('div', { class: 'dimpad' }, prev, conv, keys,
    h('p', { class: 'note' }, metric() ? `Example: 3.2 m, 450 mm, 12.5 cm. A bare number counts as ${bareUnit}.` : `Example: 12 ft 6 in 3 ⁄ 8  →  12' 6 3/8". A bare number counts as ${bareUnit === 'ft' ? 'feet' : 'inches'}.`));
  render();
  sheet(title, body, {
    actions: [
      { label: '🎙', onClick: async () => { const t = await window.__voice?.listenExpression('dim'); if (t) { text = t.replace(/⁄/g, '/'); render(); } return true; } },
      { label: 'Clear', onClick: () => { text = ''; render(); return true; } },
      { label: 'Done', primary: true, onClick: () => { inputEl.value = tidy(text.trim()); inputEl.dispatchEvent(new Event('input', { bubbles: true })); } },
    ],
  });
}

const coarse = () => window.matchMedia('(pointer: coarse)').matches;

// ---------- Generic calculator form ----------
// spec: { id, name, fields:[...], compute(v) -> { rows:[[label,text,raw,big]], warn:[], ok, svg } }
function buildForm(spec) {
  const pane = h('div', { class: 'pane', dataset: { id: spec.id } });
  const form = h('div', { class: 'form' });
  const fieldsWrap = h('div', {});
  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const state = {};
  const controls = {};
  let last = null;
  let ready = false; // skip computing until every field exists

  function makeField(f, container, bag, key) {
    let el, get;
    const id = `f-${spec.id}-${key}-${Math.random().toString(36).slice(2, 6)}`;
    if (f.type === 'len') {
      el = h('input', { id, class: 'len', type: 'text', value: f.def ?? '', placeholder: f.ph || (metric() ? 'mm / m' : `ft ' in "`), autocomplete: 'off', inputmode: coarse() ? 'none' : 'text', dataset: { kind: 'len', unit: f.unit || 'in' } });
      el.addEventListener('click', () => { if (coarse()) openDimPad(el, { title: f.label, unit: f.unit || 'in' }); });
      get = () => {
        if (!el.value.trim()) return f.optional ? NaN : NaN;
        const unit = metric() ? (f.unit === 'ft' ? 'm' : 'mm') : f.unit || 'in';
        return parseLength(el.value, unit);
      };
    } else if (f.type === 'num') {
      el = h('input', { id, type: 'text', inputmode: 'decimal', value: f.def ?? '', placeholder: f.ph || '', autocomplete: 'off', dataset: { kind: 'num' } });
      get = () => { if (!el.value.trim()) return NaN; try { return calc(el.value); } catch { return NaN; } };
    } else if (f.type === 'select') {
      el = h('select', { id }, ...f.options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(f.def) }, t)));
      get = () => el.value;
    } else if (f.type === 'seg') {
      el = h('div', { class: 'seg', role: 'group', 'aria-label': f.label });
      let val = String(f.def);
      for (const [v, t] of f.options) {
        const b = h('button', { class: String(v) === val ? 'on' : '', type: 'button' }, t);
        b.addEventListener('click', () => { val = String(v); [...el.children].forEach((c) => c.classList.toggle('on', c === b)); run(); });
        el.append(b);
      }
      get = () => val;
    }
    const wrap = h('div', { class: 'fld', dataset: { key } },
      f.type === 'seg' ? h('label', {}, f.label) : h('label', { for: id }, f.label), el);
    if (f.span) wrap.style.gridColumn = '1 / -1';
    container.append(wrap);
    el.addEventListener('input', run);
    el.addEventListener('change', run);
    bag[key] = { f, el, get, wrap };
  }

  function makeRows(f, container) {
    const list = h('div', { class: 'rowlist' });
    const rows = [];
    const addRow = (defs = {}) => {
      const bag = {};
      const item = h('div', { class: 'rowitem', style: `grid-template-columns: ${f.cols || `repeat(${f.fields.length}, 1fr) 46px`}` });
      f.fields.forEach((sf) => makeField({ ...sf, def: defs[sf.k] ?? sf.def }, item, bag, sf.k));
      const del = h('button', { class: 'btn small', 'aria-label': 'Remove row', type: 'button' }, '✕');
      del.addEventListener('click', () => { const i = rows.indexOf(bag); if (i >= 0) rows.splice(i, 1); item.remove(); run(); });
      item.append(del);
      list.append(item);
      rows.push(bag);
      run();
    };
    (f.initial || [{}]).forEach((d) => addRow(d));
    const addBtn = h('button', { class: 'btn small', type: 'button', style: 'margin-top:8px' }, `+ ${f.addLabel || 'Add row'}`);
    addBtn.addEventListener('click', () => addRow());
    container.append(h('div', { class: 'fld', style: 'grid-column:1/-1' }, h('label', {}, f.label), list, addBtn));
    controls[f.k] = { f, rows, wrap: list.parentElement, get: () => rows.map((b) => Object.fromEntries(Object.entries(b).map(([k, c]) => [k, c.get()]))) };
  }

  const grid = h('div', { class: 'grid2' });
  for (const f of spec.fields) {
    if (f.type === 'rows') makeRows(f, grid);
    else if (f.type === 'heading') grid.append(h('h3', { style: 'grid-column:1/-1' }, f.label));
    else makeField(f, grid, controls, f.k);
  }
  fieldsWrap.append(grid);

  function run() {
    if (!ready) return;
    const v = {};
    for (const [k, c] of Object.entries(controls)) v[k] = c.get();
    // conditional fields
    for (const c of Object.values(controls)) if (c.f.show) c.wrap.classList.toggle('hidden', !c.f.show(v));
    // mark bad length/number inputs
    for (const c of Object.values(controls)) {
      if (c.el && (c.f.type === 'len' || c.f.type === 'num')) c.el.classList.toggle('bad', !!c.el.value.trim() && !Number.isFinite(c.get()));
    }
    results.innerHTML = '';
    try {
      last = spec.compute(v);
      for (const w of last.warn || []) results.append(h('div', { class: 'warn' }, `⚠ ${w}`));
      if (last.ok) results.append(h('div', { class: 'ok' }, `✓ ${last.ok}`));
      for (const [k, txt, , big] of last.rows) {
        const row = h('div', { class: `r${big ? ' big' : ''}` }, h('span', {}, k), h('b', {}, txt));
        onPress(row, { hold: () => copyText(txt.split('  (')[0]) });
        results.append(row);
      }
      if (last.svg) results.append(h('div', { html: last.svg }));
    } catch (e) {
      last = null;
      results.append(h('div', { class: 'warn' }, e.message || 'Check the values'));
    }
    Object.assign(state, v);
  }

  const actions = h('div', { class: 'form-actions' },
    h('button', { class: 'btn', type: 'button', onclick: () => fillFocused() }, '🎙 Speak value'),
    h('button', { class: 'btn primary', type: 'button', onclick: () => save() }, '💾 Save to job'));

  async function fillFocused() {
    const target = document.activeElement && form.contains(document.activeElement) && document.activeElement.matches('input')
      ? document.activeElement : form.querySelector('input');
    if (!target) return;
    const mode = target.dataset.kind === 'len' ? 'dim' : 'math';
    const t = await window.__voice?.listenExpression(mode);
    if (t) { target.value = t.replace(/⁄/g, '/'); target.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  function save() {
    if (!last || !last.rows.length) return toast('Nothing to save yet');
    const inputs = [];
    for (const c of Object.values(controls)) {
      if (c.wrap.classList.contains('hidden')) continue;
      if (c.rows) {
        c.rows.forEach((b, i) => inputs.push([`${c.f.label} ${i + 1}`, Object.values(b).map((x) => (x.el.value ?? '')).join(' × ')]));
      } else if (c.f.type === 'seg' || c.f.type === 'select') {
        const opt = c.f.options.find(([val]) => String(val) === String(c.get()));
        inputs.push([c.f.label, opt ? opt[1] : c.get()]);
      } else if (c.el.value.trim()) inputs.push([c.f.label, c.el.value.trim(), c.get()]);
    }
    saveToJobDialog({ screen: 'Construction', title: spec.name, inputs, outputs: last.rows.map(([k, t, raw]) => [k, t, raw]) });
  }

  form.append(fieldsWrap, results, actions, spec.note ? h('p', { class: 'note', html: spec.note }) : '');
  pane.append(form);
  ready = true;
  run();
  pane._rerun = run;
  return pane;
}

const wasteField = () => ({ k: 'waste', label: 'Waste %', type: 'num', def: S().waste });
const must = (...vals) => { if (vals.some((v) => !Number.isFinite(v) || v <= 0)) throw new Error('Fill in the measurements'); };

// ---------- Calculator specs ----------
function specs() {
  return [
    {
      id: 'roof', name: 'Roof pitch / rafter',
      fields: [
        { k: 'pitch', label: 'Pitch (rise per 12")', type: 'num', def: 6, ph: '6' },
        { k: 'span', label: 'Span (wall to wall)', type: 'len', def: "24'", unit: 'ft' },
        { k: 'overhang', label: 'Overhang (level)', type: 'len', def: '12"' },
        { k: 'ridge', label: 'Ridge board thickness', type: 'len', def: '1 1/2"' },
        { k: 'length', label: 'Building length (for roof area)', type: 'len', def: '', unit: 'ft', span: true },
      ],
      compute: (v) => {
        must(v.pitch, v.span);
        const r = C.roof({ pitch: v.pitch, span: v.span, overhang: v.overhang || 0, ridge: v.ridge || 0, length: v.length || 0 });
        const rows = [
          ['Pitch', `${n(v.pitch, 2)}/12  =  ${deg(r.angle)}`, r.angle],
          ['Common rafter (to ridge)', L(r.rafter), r.rafter, true],
          ['Rafter incl. overhang', L(r.rafterTotal), r.rafterTotal, true],
          ['Total rise', L(r.rise), r.rise],
          ['Run (½ span − ½ ridge)', L(r.run), r.run],
          ['Hip / valley rafter', L(r.hip), r.hip],
          ['Plumb cut', deg(r.plumbCut), r.plumbCut],
          ['Seat cut', deg(r.seatCut), r.seatCut],
          ['Slope factor', n(r.factor, 4), r.factor],
        ];
        if (r.roofArea) rows.push(['Roof area (incl. overhang)', A(r.roofArea), r.roofArea / 144], ['Roofing squares', n(r.squares, 2), r.squares]);
        return { rows, svg: roofSvg(r.angle) };
      },
      note: 'Lengths are line lengths along the top edge of the rafter, before any plumb-cut adjustment. Hip/valley uses 16.97" of run per 12" of common run.',
    },
    {
      id: 'stairs', name: 'Stairs',
      fields: [
        { k: 'rise', label: 'Total rise (floor to floor)', type: 'len', def: '108"', span: true },
        { k: 'target', label: 'Preferred riser', type: 'len', def: '7 1/4"' },
        { k: 'run', label: 'Tread run (nosing to nosing)', type: 'len', def: '10 1/4"' },
        { k: 'type', label: 'Stair type (BC Building Code)', type: 'seg', def: S().stairType, options: [['private', 'Private (in a home)'], ['public', 'Public / shared']], span: true },
      ],
      compute: (v) => {
        must(v.rise, v.target, v.run);
        const r = C.stairs({ totalRise: v.rise, targetRise: v.target, run: v.run, type: v.type, code: { ...C.BC_STAIR_CODE, ...(S().code || {}) } });
        const lim = r.limits;
        return {
          rows: [
            ['Risers', String(r.risers), r.risers, true],
            ['Rise each', `${LShort(r.riseEach)}  (${n(r.riseEach * 25.4, 1)} mm)`, r.riseEach, true],
            ['Treads', String(r.treads), r.treads],
            ['Total run', L(r.totalRun), r.totalRun],
            ['Stringer length (approx.)', L(r.stringer), r.stringer],
            ['Stair angle', deg(r.angle), r.angle],
            ['Min. headroom', `${LShort(r.headroomIn)}  (${lim.headroom} mm)`, r.headroomIn],
            ['Min. width', `${LShort(lim.widthMin / 25.4)}  (${lim.widthMin} mm)`, lim.widthMin / 25.4],
          ],
          warn: r.issues,
          ok: r.issues.length ? null : `Rise ${lim.riseMin}–${lim.riseMax} mm and run ${lim.runMin}${Number.isFinite(lim.runMax) ? `–${lim.runMax}` : '+'} mm: within BC Building Code limits`,
          svg: stairSvg(Math.min(r.risers, 14)),
        };
      },
      note: 'Limits from the BC Building Code 2024, Division B, Part 9: rise Table 9.8.4.1, run Table 9.8.4.2, headroom 9.8.2.2, width 9.8.2.1. Tread depth must be at least the run and no more than run + 25 mm. Always confirm with your local authority.',
    },
    {
      id: 'walls', name: 'Wall framing',
      fields: [
        { k: 'length', label: 'Wall length', type: 'len', def: "12'", unit: 'ft' },
        { k: 'height', label: 'Wall height (plates incl.)', type: 'len', def: '97 1/8"' },
        { k: 'spacing', label: 'Stud spacing (O.C.)', type: 'seg', def: '16', options: [['12', '12"'], ['16', '16"'], ['19.2', '19.2"'], ['24', '24"']], span: true },
        { k: 'plates', label: 'Plates', type: 'seg', def: '3', options: [['2', 'Single top'], ['3', 'Double top']] },
        { k: 'stock', label: 'Plate stock', type: 'select', def: '16', options: [['8', "8'"], ['10', "10'"], ['12', "12'"], ['14', "14'"], ['16', "16'"], ['20', "20'"]] },
        { k: 'corners', label: 'Corners / T-walls', type: 'num', def: 0 },
        wasteField(),
        { k: 'openings', label: 'Openings (rough opening width)', type: 'rows', addLabel: 'Add opening', initial: [], fields: [{ k: 'width', label: 'Width', type: 'len', def: "3'" }], cols: '1fr 46px' },
      ],
      compute: (v) => {
        must(v.length);
        const r = C.wall({ length: v.length, height: v.height, spacing: +v.spacing, corners: v.corners || 0, plates: +v.plates, plateStock: +v.stock * 12, wastePct: v.waste || 0, openings: (v.openings || []).filter((o) => o.width > 0) });
        const rows = [
          ['Studs (incl. waste)', `${r.studsWithWaste}  (${r.studs} before waste)`, r.studsWithWaste, true],
          ['Stud length', L(r.studLength), r.studLength],
          ['Plate lineal feet', `${n(r.plateLf, 1)} ft`, r.plateLf],
          [`Plate pieces (${v.stock}')`, String(r.platePieces), r.platePieces, true],
        ];
        r.headers.forEach((hd, i) => rows.push([`Header ${i + 1} (RO ${LShort(hd.width)})`, LShort(hd.header), hd.header]));
        return { rows };
      },
      note: 'Studs = one per spacing plus an end stud, 2 extra per corner/T, and 2 per opening (kings + jacks less the layout studs they replace). Header = rough opening + 3" (1-1/2" bearing each side). Stud length = wall height − plates.',
    },
    {
      id: 'tri', name: 'Right triangle / square',
      fields: [
        { k: 'mode', label: 'Mode', type: 'seg', def: 'tri', options: [['tri', 'Right triangle'], ['sq', 'Check square'], ['345', '3-4-5']], span: true },
        { k: 'a', label: 'Rise / side a', type: 'len', def: '', show: (v) => v.mode === 'tri' },
        { k: 'b', label: 'Run / side b', type: 'len', def: '', show: (v) => v.mode === 'tri' },
        { k: 'c', label: 'Diagonal / hypotenuse', type: 'len', def: '', show: (v) => v.mode === 'tri' },
        { k: 'ang', label: 'Angle A (°)', type: 'num', def: '', show: (v) => v.mode === 'tri' },
        { k: 'sl', label: 'Length', type: 'len', def: "20'", unit: 'ft', show: (v) => v.mode === 'sq' },
        { k: 'sw', label: 'Width', type: 'len', def: "12'", unit: 'ft', show: (v) => v.mode === 'sq' },
        { k: 'mult', label: 'Base unit', type: 'select', def: '36', show: (v) => v.mode === '345', options: [['12', '1 ft (3-4-5 ft)'], ['24', '2 ft (6-8-10 ft)'], ['36', '3 ft (9-12-15 ft)'], ['48', '4 ft (12-16-20 ft)'], ['300', '300 mm (0.9-1.2-1.5 m)'], ['1000', '1 m (3-4-5 m)']] },
      ],
      compute: (v) => {
        if (v.mode === 'sq') {
          must(v.sl, v.sw);
          const r = C.squareCheck({ length: v.sl, width: v.sw });
          return { rows: [['Diagonal when square', L(r.diagonal), r.diagonal, true]] };
        }
        if (v.mode === '345') {
          const u = +v.mult;
          const base = u >= 300 ? u / 25.4 : u; // mm options -> inches
          return { rows: [['Side 1 (3 units)', L(3 * base), 3 * base, true], ['Side 2 (4 units)', L(4 * base), 4 * base, true], ['Diagonal (5 units)', L(5 * base), 5 * base, true]] };
        }
        const r = C.rightTriangle({ a: v.a, b: v.b, c: v.c, angleA: v.ang });
        return {
          rows: [
            ['Side a (rise)', L(r.a), r.a, true], ['Side b (run)', L(r.b), r.b, true], ['Hypotenuse', L(r.c), r.c, true],
            ['Angle A', deg(r.angleA), r.angleA], ['Angle B', deg(r.angleB), r.angleB],
            ['As pitch', `${n(r.pitch, 2)}/12`, r.pitch], ['Area', A(r.area), r.area / 144],
          ],
        };
      },
      note: 'Right triangle: enter any two values (two sides, or one side and angle A). Angle A is opposite side a (the rise).',
    },
    {
      id: 'bf', name: 'Board feet',
      fields: [
        { k: 'rows', label: 'Lumber (qty × nominal T × W × length ft)', type: 'rows', addLabel: 'Add size', initial: [{ qty: 10, t: '2', w: '10', len: 12 }],
          cols: '0.8fr 1fr 1fr 0.9fr 46px',
          fields: [
            { k: 'qty', label: 'Qty', type: 'num', def: 1 },
            { k: 't', label: 'T', type: 'select', def: '2', options: [1, 2, 3, 4, 6, 8, 10, 12].map((x) => [String(x), `${x}"`]) },
            { k: 'w', label: 'W', type: 'select', def: '6', options: [2, 3, 4, 6, 8, 10, 12].map((x) => [String(x), `${x}"`]) },
            { k: 'len', label: "Len (ft)", type: 'num', def: 8 },
          ] },
        wasteField(),
      ],
      compute: (v) => {
        const rows = (v.rows || []).filter((r) => r.qty > 0 && r.len > 0).map((r) => ({ qty: r.qty, t: +r.t, w: +r.w, lenFt: r.len }));
        if (!rows.length) throw new Error('Add at least one piece of lumber');
        const r = C.boardFeet(rows, v.waste || 0);
        const out = r.detail.map((d) => [
          `${d.qty} × ${d.t}×${d.w} × ${n(d.lenFt, 2)}'  (actual ${formatFtIn(d.actualT, 16, { feet: false })} × ${formatFtIn(d.actualW, 16, { feet: false })})`,
          `${n(d.bf, 2)} bf`, d.bf]);
        out.push(['Total board feet', `${n(r.total, 2)} bf`, r.total, true], ['With waste', `${n(r.totalWithWaste, 2)} bf`, r.totalWithWaste, true],
          ['Lineal feet', `${n(r.lineal, 1)} ft`, r.lineal], ['Pieces', String(r.pieces), r.pieces]);
        return { rows: out };
      },
      note: 'Board feet use nominal size (T × W × L ÷ 12), as lumber is sold. Actual dressed sizes are shown for reference.',
    },
    {
      id: 'concrete', name: 'Concrete',
      fields: [
        { k: 'shape', label: 'Pour', type: 'seg', def: 'slab', options: [['slab', 'Slab'], ['footing', 'Footing / wall'], ['column', 'Column / tube']], span: true },
        { k: 'l', label: 'Length', type: 'len', def: "20'", unit: 'ft', show: (v) => v.shape !== 'column' },
        { k: 'w', label: 'Width', type: 'len', def: "10'", unit: 'ft', show: (v) => v.shape !== 'column' },
        { k: 'd', label: 'Thickness / depth', type: 'len', def: '4"', show: (v) => v.shape !== 'column' },
        { k: 'dia', label: 'Diameter', type: 'len', def: '10"', show: (v) => v.shape === 'column' },
        { k: 'ht', label: 'Height / depth', type: 'len', def: "4'", unit: 'ft', show: (v) => v.shape === 'column' },
        { k: 'qty', label: 'How many', type: 'num', def: 1 },
        wasteField(),
        { k: 'bag', label: 'Bag yield (cu ft per bag)', type: 'num', def: 0.5 },
      ],
      compute: (v) => {
        const cuin = C.concreteVolume({ shape: v.shape, length: v.l, width: v.w, depth: v.d, diameter: v.dia, height: v.ht, qty: v.qty || 1 });
        if (!(cuin > 0)) throw new Error('Fill in the measurements');
        const r = C.concrete({ cuin, wastePct: v.waste || 0, bagYieldCuFt: v.bag || 0.5 });
        return {
          rows: [
            ['Ready-mix (order)', `${n(r.m3, 2)} m³`, r.m3, true], ['Cubic yards', `${n(r.cuyd, 2)} yd³`, r.cuyd, true],
            ['Cubic feet', `${n(r.cuft, 1)} ft³`, r.cuft], ['Bags (premix)', String(r.bags), r.bags],
          ],
        };
      },
      note: 'Includes the waste %. Bag yield varies by brand — a 30 kg bag is about 0.5 cu ft (0.014 m³). Check the bag label.',
    },
    {
      id: 'sheets', name: 'Drywall / sheathing',
      fields: [
        { k: 'mode', label: 'Measure by', type: 'seg', def: 'room', options: [['room', 'Room'], ['area', 'Area']], span: true },
        { k: 'l', label: 'Room length', type: 'len', def: "12'", unit: 'ft', show: (v) => v.mode === 'room' },
        { k: 'w', label: 'Room width', type: 'len', def: "10'", unit: 'ft', show: (v) => v.mode === 'room' },
        { k: 'h', label: 'Wall height', type: 'len', def: "8'", unit: 'ft', show: (v) => v.mode === 'room' },
        { k: 'ceil', label: 'Ceiling', type: 'seg', def: 'yes', options: [['yes', 'Include'], ['no', 'Walls only']], show: (v) => v.mode === 'room' },
        { k: 'open', label: 'Openings to deduct (sq ft)', type: 'num', def: 0, show: (v) => v.mode === 'room' },
        { k: 'area', label: 'Area (sq ft)', type: 'num', def: '', show: (v) => v.mode === 'area' },
        { k: 'size', label: 'Sheet size', type: 'select', def: '96', options: [['96', "4' × 8'"], ['108', "4' × 9'"], ['120', "4' × 10'"], ['144', "4' × 12'"]] },
        wasteField(),
      ],
      compute: (v) => {
        let area;
        if (v.mode === 'room') { must(v.l, v.w, v.h); area = C.roomSurfaces({ length: v.l, width: v.w, height: v.h, includeCeiling: v.ceil === 'yes', openingsSqIn: (v.open || 0) * 144 }).total; } else { must(v.area); area = v.area * 144; }
        const r = C.sheets({ areaSqIn: area, sheetW: 48, sheetL: +v.size, wastePct: v.waste || 0 });
        return { rows: [['Area to cover', A(area), area / 144], ['Sheets (incl. waste)', String(r.sheets), r.sheets, true], ['Sheets before waste', n(r.sheetsRaw, 1), r.sheetsRaw]] };
      },
    },
    {
      id: 'fill', name: 'Gravel / fill / topsoil',
      fields: [
        { k: 'l', label: 'Length', type: 'len', def: "20'", unit: 'ft' },
        { k: 'w', label: 'Width', type: 'len', def: "10'", unit: 'ft' },
        { k: 'd', label: 'Depth', type: 'len', def: '4"' },
        { k: 'mat', label: 'Material', type: 'select', def: '1.6|Gravel / crushed rock', options: Object.entries(C.BULK_DENSITY).map(([k, d]) => [String(d) + '|' + k, `${k} (~${d} t/m³)`]) },
        wasteField(),
      ],
      compute: (v) => {
        must(v.l, v.w, v.d);
        const density = parseFloat(String(v.mat).split('|')[0]) || 1.6;
        const r = C.fill({ length: v.l, width: v.w, depth: v.d, density, wastePct: v.waste || 0 });
        return { rows: [['Volume', `${n(r.m3, 2)} m³`, r.m3, true], ['Cubic yards', `${n(r.cuyd, 2)} yd³`, r.cuyd, true], ['Weight (approx.)', `${n(r.tonnes, 2)} tonnes`, r.tonnes], ['Short tons', n(r.shortTons, 2), r.shortTons]] };
      },
      note: 'Densities are typical loose values; moisture and compaction change weight a lot. Confirm with your supplier.',
    },
    {
      id: 'area', name: 'Area & perimeter',
      fields: [
        { k: 'shapes', label: 'Shapes (add or subtract)', type: 'rows', addLabel: 'Add shape', initial: [{ type: 'rect', a: "12'", b: "10'" }],
          cols: '1.1fr 1fr 1fr 0.9fr 46px',
          fields: [
            { k: 'type', label: 'Shape', type: 'select', def: 'rect', options: [['rect', 'Rectangle L×W'], ['tri', 'Triangle base×ht'], ['circle', 'Circle (diam.)'], ['trap', 'Trapezoid a,b,ht'], ['-rect', '− Rectangle'], ['-circle', '− Circle']] },
            { k: 'a', label: 'A', type: 'len', def: '', unit: 'ft' },
            { k: 'b', label: 'B', type: 'len', def: '', unit: 'ft' },
            { k: 'c', label: 'C (ht)', type: 'len', def: '', unit: 'ft' },
          ] },
      ],
      compute: (v) => {
        const shapes = (v.shapes || []).map((s) => ({ type: s.type.replace('-', ''), sign: s.type.startsWith('-') ? -1 : 1, a: s.a || 0, b: s.b || 0, c: s.c || 0 }))
          .filter((s) => s.a > 0);
        if (!shapes.length) throw new Error('Enter at least one shape');
        const r = C.areaTotal(shapes);
        return {
          rows: [['Area', A(r.areaSqIn), r.sqft, true], ['Square yards', n(r.sqft / 9, 2), r.sqft / 9], ['Acres', n(r.sqft / 43560, 4), r.sqft / 43560],
            ['Perimeter (added shapes)', Number.isFinite(r.perimIn) ? L(r.perimIn) : '— (trapezoid)', r.perimIn]],
        };
      },
      note: 'Bare numbers are feet. Rectangle: A = length, B = width. Triangle: A = base, B = height. Circle: A = diameter. Trapezoid: A and B = parallel sides, C = height.',
    },
    {
      id: 'deck', name: 'Decking & joists',
      fields: [
        { k: 'l', label: 'Deck length (board direction)', type: 'len', def: "16'", unit: 'ft' },
        { k: 'w', label: 'Deck width (joist direction)', type: 'len', def: "12'", unit: 'ft' },
        { k: 'bw', label: 'Board', type: 'select', def: '5.5', options: [['5.5', '5/4×6 or 2×6 (5-1/2")'], ['3.5', '2×4 (3-1/2")'], ['5.375', 'Composite (5-3/8")']] },
        { k: 'gap', label: 'Gap', type: 'len', def: '3/16"' },
        { k: 'blen', label: 'Board length', type: 'select', def: '16', options: [8, 10, 12, 14, 16, 18, 20].map((x) => [String(x), `${x}'`]) },
        { k: 'js', label: 'Joist spacing', type: 'seg', def: '16', options: [['12', '12"'], ['16', '16"'], ['24', '24"']] },
        wasteField(),
      ],
      compute: (v) => {
        must(v.l, v.w);
        const r = C.deck({ length: v.l, width: v.w, boardW: +v.bw, gap: Number.isFinite(v.gap) ? v.gap : 0.1875, boardLenFt: +v.blen, joistSpacing: +v.js, wastePct: v.waste || 0 });
        return {
          rows: [['Deck area', A(r.areaSqFt * 144), r.areaSqFt], ['Rows of boards', String(r.rows), r.rows], [`Boards (${v.blen}', incl. waste)`, String(r.boards), r.boards, true],
            ['Decking lineal feet', `${n(r.lineal, 1)} ft`, r.lineal], ['Joists', `${r.joists} @ ${LShort(r.joistLength)}`, r.joists, true], ['Deck screws (approx.)', String(r.screws), r.screws]],
        };
      },
      note: 'Joist count is for the deck length at the chosen spacing plus an end joist. Joist sizing/span must be checked against the span tables for your species and load.',
    },
    {
      id: 'paint', name: 'Paint',
      fields: [
        { k: 'mode', label: 'Measure by', type: 'seg', def: 'room', options: [['room', 'Room'], ['area', 'Area']], span: true },
        { k: 'l', label: 'Room length', type: 'len', def: "12'", unit: 'ft', show: (v) => v.mode === 'room' },
        { k: 'w', label: 'Room width', type: 'len', def: "10'", unit: 'ft', show: (v) => v.mode === 'room' },
        { k: 'h', label: 'Wall height', type: 'len', def: "8'", unit: 'ft', show: (v) => v.mode === 'room' },
        { k: 'ceil', label: 'Ceiling', type: 'seg', def: 'no', options: [['no', 'Walls only'], ['yes', 'Include']], show: (v) => v.mode === 'room' },
        { k: 'doors', label: 'Doors (−21 sq ft each)', type: 'num', def: 1, show: (v) => v.mode === 'room' },
        { k: 'wins', label: 'Windows (−15 sq ft each)', type: 'num', def: 1, show: (v) => v.mode === 'room' },
        { k: 'area', label: 'Area (sq ft)', type: 'num', def: '', show: (v) => v.mode === 'area' },
        { k: 'coats', label: 'Coats', type: 'num', def: 2 },
        { k: 'cov', label: 'Coverage per can (sq ft)', type: 'num', def: 375 },
        { k: 'can', label: 'Can size (L)', type: 'select', def: '3.78', options: [['3.78', '3.78 L (gallon)'], ['18.9', '18.9 L (pail)'], ['0.946', '946 mL (quart)']] },
        { k: 'waste', label: 'Extra %', type: 'num', def: 0 },
      ],
      compute: (v) => {
        let area;
        if (v.mode === 'room') {
          must(v.l, v.w, v.h);
          area = C.roomSurfaces({ length: v.l, width: v.w, height: v.h, includeCeiling: v.ceil === 'yes', openingsSqIn: ((v.doors || 0) * 21 + (v.wins || 0) * 15) * 144 }).total / 144;
        } else { must(v.area); area = v.area; }
        const can = +v.can;
        const cov = (v.cov || 375) * (can / 3.78);
        const r = C.paint({ areaSqFt: area, coats: v.coats || 1, coveragePerCan: cov, canLitres: can, wastePct: v.waste || 0 });
        return { rows: [['Paintable area', `${n(area, 1)} sq ft`, area], ['Total to cover (all coats)', `${n(r.paintArea, 0)} sq ft`, r.paintArea], ['Cans', `${r.cans} × ${v.can} L`, r.cans, true], ['Litres', `${n(r.litres, 1)} L`, r.litres]] };
      },
      note: 'Most paints cover 350–400 sq ft per 3.78 L can per coat on smooth walls. Check the can.',
    },
    {
      id: 'floor', name: 'Flooring / tile',
      fields: [
        { k: 'mode', label: 'Measure by', type: 'seg', def: 'room', options: [['room', 'Room'], ['area', 'Area']], span: true },
        { k: 'l', label: 'Room length', type: 'len', def: "12'", unit: 'ft', show: (v) => v.mode === 'room' },
        { k: 'w', label: 'Room width', type: 'len', def: "10'", unit: 'ft', show: (v) => v.mode === 'room' },
        { k: 'area', label: 'Area (sq ft)', type: 'num', def: '', show: (v) => v.mode === 'area' },
        { k: 'box', label: 'Box covers (sq ft)', type: 'num', def: 20 },
        wasteField(),
        { k: 'tw', label: 'Tile width (in, optional)', type: 'num', def: '' },
        { k: 'tl', label: 'Tile length (in, optional)', type: 'num', def: '' },
      ],
      compute: (v) => {
        let area;
        if (v.mode === 'room') { must(v.l, v.w); area = (v.l * v.w) / 144; } else { must(v.area); area = v.area; }
        const r = C.flooring({ areaSqFt: area, boxSqFt: v.box || 20, tileW: v.tw || 0, tileL: v.tl || 0, wastePct: v.waste || 0 });
        const rows = [['Floor area', `${n(area, 1)} sq ft`, area], ['With waste', `${n(r.needSqFt, 1)} sq ft`, r.needSqFt], ['Boxes', String(r.boxes), r.boxes, true]];
        if (r.tiles) rows.push(['Tiles', String(r.tiles), r.tiles, true]);
        return { rows };
      },
      note: 'Use 10% waste for straight lay, 15% or more for diagonal or herringbone.',
    },
  ];
}

function roofSvg(angle) {
  const w = 220, base = 180, hgt = Math.min(110, Math.tan((angle * Math.PI) / 180) * (base / 2));
  return `<svg class="diagram" viewBox="0 0 ${w} ${hgt + 30}" width="220" aria-hidden="true">
  <polygon points="20,${hgt + 10} ${20 + base / 2},10 ${20 + base},${hgt + 10}" fill="none" stroke="#ff9f1c" stroke-width="2"/>
  <line x1="${20 + base / 2}" y1="10" x2="${20 + base / 2}" y2="${hgt + 10}" stroke="#8d979f" stroke-dasharray="4 3"/>
  <text x="${20 + base / 2 + 4}" y="${hgt / 2 + 14}" fill="#8d979f" font-size="10">rise</text>
  <text x="${20 + base / 4 - 10}" y="${hgt + 24}" fill="#8d979f" font-size="10">run</text>
  <text x="${20 + base / 4 - 26}" y="${hgt / 2 + 4}" fill="#ffbf5e" font-size="10">rafter</text></svg>`;
}
function stairSvg(risers) {
  const s = 14, w = s * risers + 20, ht = s * risers + 10;
  let d = `M10 ${ht}`;
  for (let i = 0; i < risers; i++) d += ` v-${s} h${s}`;
  return `<svg class="diagram" viewBox="0 0 ${w} ${ht + 4}" width="${Math.min(240, w)}" aria-hidden="true"><path d="${d}" fill="none" stroke="#ff9f1c" stroke-width="2"/><line x1="10" y1="${ht}" x2="${10 + s * (risers - 1)}" y2="${ht - s * risers + s}" stroke="#8d979f" stroke-dasharray="4 3"/></svg>`;
}

// ---------- Keypad pane (dimension calculator) ----------
function keypadPane() {
  const pane = h('div', { class: 'pane active', dataset: { id: 'keypad' } });
  const exprEl = h('div', { class: 'expr' });
  const resEl = h('div', { class: 'result' });
  const extras = h('div', { class: 'extras' });
  const display = h('div', { class: 'display', style: 'flex:1;display:flex;flex-direction:column;justify-content:flex-end' }, exprEl, resEl, extras);
  let last = null;
  let errorMsg = '';
  const input = new ExprInput(update);

  function update() {
    exprEl.innerHTML = `${esc(input.text())}<span class="cursor"></span>`;
    exprEl.scrollLeft = exprEl.scrollWidth;
    resEl.classList.remove('err');
    extras.innerHTML = '';
    if (errorMsg) { resEl.textContent = errorMsg; resEl.classList.add('err'); errorMsg = ''; return; }
    const t = input.text();
    if (!t) { resEl.textContent = '0"'; resEl.style.color = 'var(--muted)'; return; }
    try {
      const q = dimEvaluate(t);
      const f = formatQty(q, { metric: metric(), denom: denom(), sep: S().sep });
      resEl.textContent = f.main;
      resEl.style.color = input.fresh ? '' : 'var(--muted)';
      for (const x of f.extra) {
        const sp = h('span', {}, x);
        onPress(sp, { tap: () => copyText(x) });
        extras.append(sp);
      }
    } catch { /* incomplete while typing */ }
  }
  async function equals() {
    const t = input.text();
    if (!t) return;
    try {
      const q = dimEvaluate(t);
      const f = formatQty(q, { metric: metric(), denom: denom(), sep: S().sep });
      last = { q, f, t };
      await logHistory('Build', t, f.main, q.p === 1 ? q.v : q.p === 2 ? q.v / 144 : q.p === 3 ? q.v / 1728 : q.v);
      // keep the result as a re-usable dimension
      input.pushResult(resultToInput(q));
      update();
    } catch (e) {
      errorMsg = e instanceof CalcError ? e.message : 'Check the entry';
      update();
    }
  }
  function resultToInput(q) {
    if (q.p !== 1) return t2(q);
    if (metric()) return `${parseFloat((q.v * 25.4).toFixed(2))}mm`;
    return formatFtIn(q.v, 64).replace('≈ ', '').replace(/(\d+)-(\d+)\/(\d+)/, '$1 $2⁄$3').replace(/(\d+)\/(\d+)/, '$1⁄$2').replace('−', '-');
  }
  // areas/volumes can't be re-entered as a single literal; keep the expression
  function t2() { return `(${input.text()})`; }

  const unitKeys = () => (metric() ? [['m', 'm', 'unit'], ['cm', 'cm', 'unit'], ['mm', 'mm', 'unit']] : [["ft '", "'", 'unit'], ['in "', '"', 'unit'], ['⁄', '⁄', 'unit']]);
  const keys = h('div', { class: 'keys k4 mirror' });
  function buildKeys() {
    keys.innerHTML = '';
    const [u1, u2, u3] = unitKeys();
    const K = [
      u1, u2, u3, ['⌫', 'back', 'clr'],
      ['7'], ['8'], ['9'], ['÷', '÷', 'op'],
      ['4'], ['5'], ['6'], ['×', '×', 'op'],
      ['1'], ['2'], ['3'], ['−', '−', 'op'],
      ['0'], ['.'], ['( )', 'paren', 'fn'], ['+', '+', 'op'],
      ['🎙', 'mic', 'fn'], [metric() ? 'Metric' : 'Imperial', 'units', 'fn'], ['💾', 'save', 'fn'], ['=', '=', 'eq'],
    ];
    for (const [label, val, cls] of K) {
      const b = h('button', { class: `key ${cls || ''}`, 'aria-label': label }, label);
      if (val === 'back') b.append(h('small', {}, 'hold AC'));
      if (val === 'units') b.style.fontSize = '0.95rem';
      onPress(b, { tap: () => press(val ?? label), hold: val === 'back' ? () => { input.clear(); last = null; } : null });
      keys.append(b);
    }
  }
  async function press(v) {
    if (/^[0-9.]$/.test(v)) return input.push(v, { startsValue: true });
    switch (v) {
      case 'back': return input.back();
      case '=': return equals();
      case 'paren': return input.smartParen();
      case "'": return input.push("' ");
      case '"': return input.push('" ');
      case '⁄': return input.push('⁄');
      case 'm': case 'cm': case 'mm': return input.push(`${v} `);
      case 'mic': {
        const t = await window.__voice?.listenExpression('dim');
        if (t) { if (input.fresh) input.clear(); input.set(input.text() + t); }
        return;
      }
      case 'units':
        await store.saveSettings({ units: metric() ? 'imperial' : 'metric' });
        document.dispatchEvent(new CustomEvent('units-changed'));
        return;
      case 'save': {
        const t = input.fresh && last ? last.t : input.text();
        if (!t) return toast('Nothing to save yet');
        try {
          const q = dimEvaluate(t);
          const f = formatQty(q, { metric: metric(), denom: denom(), sep: S().sep });
          saveToJobDialog({ screen: 'Construction', title: 'Dimension calc', expression: t, result: [f.main, ...f.extra].join(' | '), resultValue: q.v });
        } catch (e) { toast(e.message); }
        return;
      }
      default: return input.push(v);
    }
  }
  buildKeys();
  onPress(resEl, { hold: () => copyText(resEl.textContent) });
  pane.append(display, keys);
  pane._rebuild = () => { buildKeys(); update(); };
  pane._key = (e) => {
    const map = { '*': '×', '/': '÷', '-': '−', Enter: '=', '=': '=', Backspace: 'back', "'": "'", '"': '"', '\\': '⁄', '|': '⁄' };
    const k = map[e.key] || e.key;
    if (e.key === 'Escape') { input.clear(); return true; }
    if (e.key === ' ') { input.push(' '); return true; }
    if (e.key === '(' || e.key === ')') { input.push(e.key); return true; }
    if (/^[0-9.+×÷−=]$/.test(k) || ['back', "'", '"', '⁄'].includes(k)) { press(k); return true; }
    return false;
  };
  update();
  return pane;
}

// ---------- Screen ----------
export function initConstruction(root) {
  const tabs = h('div', { class: 'subtabs', role: 'tablist' });
  const panes = h('div', { style: 'flex:1;display:flex;flex-direction:column;min-height:0' });
  let kp = keypadPane();
  let calcPanes = specs().map(buildForm);
  const all = () => [kp, ...calcPanes];
  const names = [['keypad', 'Keypad'], ...specs().map((s) => [s.id, s.name])];
  let current = 'keypad';
  function show(id) {
    current = id;
    for (const p of all()) p.classList.toggle('active', p.dataset.id === id);
    [...tabs.children].forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  }
  for (const [id, name] of names) {
    const b = h('button', { role: 'tab', dataset: { id }, class: id === 'keypad' ? 'active' : '' }, name);
    b.addEventListener('click', () => show(id));
    tabs.append(b);
  }
  panes.append(...all());
  root.append(tabs, panes);

  document.addEventListener('units-changed', () => {
    kp._rebuild();
    // rebuild forms so placeholders/defaults follow the unit system; keep current tab
    const fresh = specs().map(buildForm);
    calcPanes.forEach((p) => p.remove());
    calcPanes = fresh;
    panes.append(...calcPanes);
    show(current);
    toast(metric() ? 'Metric units' : 'Imperial units');
  });
  document.addEventListener('settings-changed', () => { kp._rebuild(); calcPanes.forEach((p) => p._rerun?.()); });

  return { key: (e) => (current === 'keypad' ? kp._key(e) : false) };
}
