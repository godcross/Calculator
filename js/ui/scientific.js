// Scientific screen: textbook display, 2nd-function keypad (full layout in landscape),
// graphing, equation solver, unit converter, statistics, number bases, constants.
import { calc, compile, CalcError } from '../engine/expr.js';
import { formatNumber } from '../engine/format.js';
import { CONSTANTS, UNITS, convert } from '../engine/units.js';
import { quadratic, solveLinear, stats, toBase, parseBase } from '../engine/solve.js';
import * as store from '../store.js';
import { h, esc, onPress, toast, copyText, sheet, saveToJobDialog } from './common.js';
import { ExprInput } from './input.js';
import { prettyHTML } from './pretty.js';
import { getAns, setAns, rawStr, logHistory, registerTape } from './basic.js';

const S = () => store.settings();
const fmt = (v) => formatNumber(v, { sep: S().sep });

export function initScientific(root) {
  let angle = localStorage.getItem('angle') || S().angle || 'deg';
  let second = false;
  let hyp = false;

  // top bar: angle mode + sub tabs
  const angleBtn = h('button', { class: 'pill angle', 'aria-label': 'Angle mode (tap to change)' });
  const setAngleLabel = () => { angleBtn.textContent = angle.toUpperCase(); };
  angleBtn.addEventListener('click', () => {
    angle = angle === 'deg' ? 'rad' : angle === 'rad' ? 'grad' : 'deg';
    localStorage.setItem('angle', angle);
    setAngleLabel(); update();
  });
  setAngleLabel();
  const tabNames = [['calc', 'Calc'], ['graph', 'Graph'], ['solve', 'Solve'], ['conv', 'Convert'], ['stats', 'Stats'], ['base', 'Base'], ['const', 'Constants'], ['hist', 'History']];
  const top = h('div', { class: 'sci-top' }, angleBtn);
  const panes = {};
  let current = 'calc';
  const show = (id) => {
    current = id;
    for (const [k, p] of Object.entries(panes)) p.classList.toggle('active', k === id);
    [...top.querySelectorAll('[data-tab]')].forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    if (id === 'graph') graph.draw();
  };
  for (const [id, name] of tabNames) {
    const b = h('button', { class: `pill ${id === 'calc' ? 'on' : ''}`, dataset: { tab: id } }, name);
    b.addEventListener('click', () => show(id));
    top.append(b);
  }

  // ---------- Calc pane ----------
  const calcPane = h('div', { class: 'pane active' });
  const hint = h('div', { class: 'rotate-hint' }, '⟲ Turn your phone sideways for the wide keypad',
    h('button', { 'aria-label': 'Hide hint', onclick: () => { hint.remove(); localStorage.setItem('rotHint', '1'); } }, '✕'));
  if (localStorage.getItem('rotHint')) hint.classList.add('hidden');
  const exprEl = h('div', { class: 'expr pretty' });
  const resEl = h('div', { class: 'result' });
  const display = h('div', { class: 'display', style: 'flex:1;display:flex;flex-direction:column;justify-content:flex-end;min-height:90px' }, exprEl, resEl);
  let last = null;
  let err = '';
  const input = new ExprInput(update);
  function update() {
    const t = input.text();
    exprEl.innerHTML = (t ? prettyHTML(t) : '') + '<span class="cursor"></span>';
    exprEl.scrollLeft = exprEl.scrollWidth;
    resEl.classList.remove('err');
    if (err) { resEl.textContent = err; resEl.classList.add('err'); err = ''; return; }
    if (input.fresh && last) { resEl.textContent = last.text; resEl.style.color = ''; return; }
    if (!t) { resEl.textContent = '0'; resEl.style.color = 'var(--muted)'; return; }
    try { resEl.textContent = fmt(calc(t, { angle, ans: getAns() })); resEl.style.color = 'var(--muted)'; } catch { /* typing */ }
  }
  async function equals() {
    const t = input.text();
    if (!t) return;
    try {
      const v = calc(t, { angle, ans: getAns() });
      const text = fmt(v);
      setAns(v);
      last = { value: v, text, expr: t };
      await logHistory(`Sci ${angle.toUpperCase()}`, t, text, v);
      input.pushResult(rawStr(v));
    } catch (e) { err = e instanceof CalcError ? e.message : 'Error'; update(); }
  }

  // key definitions: [label, insert, class, second-label, second-insert]
  const FN = [
    ['2nd', '@2nd', 'fn'], ['hyp', '@hyp', 'fn'], ['sin', 'sin(', 'fn', 'sin⁻¹', 'asin('], ['cos', 'cos(', 'fn', 'cos⁻¹', 'acos('], ['tan', 'tan(', 'fn', 'tan⁻¹', 'atan('], ['π', 'π', 'fn', 'e', 'e'],
    ['x²', '²', 'fn', 'x³', '³'], ['xʸ', '^', 'fn', 'ʸ√x', '@root'], ['√', '√(', 'fn', '∛', '∛('], ['ln', 'ln(', 'fn', 'eˣ', 'exp('], ['log', 'log(', 'fn', '10ˣ', '10^'], ['1/x', '@inv', 'fn', 'log₂', 'log2('],
    ['(', '(', 'fn'], [')', ')', 'fn'], ['x!', '!', 'fn', '|x|', 'abs('], ['nCr', 'nCr(', 'fn', 'nPr', 'nPr('], [',', ',', 'fn', 'mod', 'mod('], ['EE', 'E', 'fn'],
    ['%', '%', 'fn'], ['Ans', 'Ans', 'fn'], ['const', '@const', 'fn'], ['🎙', '@mic', 'fn'], ['💾', '@save', 'fn'], ['⎘', '@copy', 'fn'],
  ];
  const NUM = [
    ['7'], ['8'], ['9'], ['÷', '÷', 'op'],
    ['4'], ['5'], ['6'], ['×', '×', 'op'],
    ['1'], ['2'], ['3'], ['−', '−', 'op'],
    ['0'], ['.'], ['±', '@neg', 'fn'], ['+', '+', 'op'],
    ['⌫', '@back', 'clr'], ['AC', '@clear', 'clr'], ['( )', '@paren', 'fn'], ['=', '@eq', 'eq'],
  ];
  const fnpad = h('div', { class: 'fnpad' });
  const numpad = h('div', { class: 'numpad' });
  const keyEls = [];
  const mk = (pad, [label, ins, cls, l2, i2]) => {
    const b = h('button', { class: `key ${cls || ''}`, 'aria-label': label, dataset: l2 ? { k2: '1' } : {} }, label);
    b._def = { label, ins: ins ?? label, l2, i2 };
    onPress(b, { tap: () => pressKey(b) });
    keyEls.push(b);
    pad.append(b);
  };
  FN.forEach((k) => mk(fnpad, k));
  NUM.forEach((k) => mk(numpad, k));
  function relabel() {
    for (const b of keyEls) {
      const d = b._def;
      let label = second && d.l2 ? d.l2 : d.label;
      if (hyp && /^(sin|cos|tan)/.test(d.label)) label = label.replace(/^(sin|cos|tan)/, '$1h');
      b.firstChild.textContent = label;
      if (d.label === '2nd') b.classList.toggle('on', second);
      if (d.label === 'hyp') b.classList.toggle('on', hyp);
    }
    keys.classList.toggle('second-on', second);
  }
  async function pressKey(b) {
    const d = b._def;
    let ins = second && d.i2 ? d.i2 : d.ins;
    if (hyp && /^(a?)(sin|cos|tan)\($/.test(ins)) ins = ins.replace(/(sin|cos|tan)\(/, '$1h(');
    const wasSecond = second;
    if (ins !== '@2nd' && ins !== '@hyp') { second = false; hyp = false; }
    if (/^[0-9.]$/.test(ins)) input.push(ins, { startsValue: true });
    else if (ins === '@2nd') second = !second;
    else if (ins === '@hyp') hyp = !hyp;
    else if (ins === '@back') input.back();
    else if (ins === '@clear') { input.clear(); last = null; }
    else if (ins === '@paren') input.smartParen();
    else if (ins === '@neg') input.toggleSign();
    else if (ins === '@eq') await equals();
    else if (ins === '@inv') { const t = input.text(); input.set(t ? `1/(${t})` : '1/'); }
    else if (ins === '@root') { input.push('root('); toast('root(number, n) — e.g. root(27,3)'); }
    else if (ins === '@const') show('const');
    else if (ins === '@copy') copyText(resEl.textContent.replace(/,/g, ''));
    else if (ins === '@mic') { const t = await window.__voice?.listenExpression('math'); if (t) { if (input.fresh) input.clear(); input.set(input.text() + t); } }
    else if (ins === '@save') {
      const t = input.fresh && last ? last.expr : input.text();
      if (!t) toast('Nothing to save yet');
      else { try { const v = calc(t, { angle, ans: getAns() }); saveToJobDialog({ screen: 'Scientific', title: `Scientific (${angle.toUpperCase()})`, expression: t, result: fmt(v), resultValue: v }); } catch (e) { toast(e.message); } }
    } else {
      const startsValue = /^[a-zA-Z√∛π(]/.test(ins) || ins === 'e' || ins === 'Ans';
      input.push(ins, { startsValue });
    }
    void wasSecond;
    relabel();
  }
  const keys = h('div', { class: 'sci-keys mirror' }, fnpad, numpad);
  relabel();
  onPress(resEl, { hold: () => copyText(resEl.textContent.replace(/,/g, '')) });
  calcPane.append(hint, display, keys);
  panes.calc = calcPane;

  // ---------- Graph ----------
  const graph = graphPane(() => 'rad');
  panes.graph = graph.pane;

  // ---------- Solve ----------
  panes.solve = solvePane();
  // ---------- Convert ----------
  panes.conv = convertPane();
  // ---------- Stats ----------
  panes.stats = statsPane();
  // ---------- Base ----------
  panes.base = basePane();
  // ---------- Constants ----------
  panes.const = constPane((name) => { input.push(`#${name}`, { startsValue: true }); show('calc'); });
  // ---------- History ----------
  const histPane = h('div', { class: 'pane' });
  const tape = h('div', { class: 'tape', style: 'flex:1' });
  histPane.append(tape);
  registerTape(tape, (r) => { input.push(rawStr(r.value), { startsValue: true }); show('calc'); });
  panes.hist = histPane;

  const body = h('div', { style: 'flex:1;display:flex;flex-direction:column;min-height:0' }, ...Object.values(panes));
  root.append(top, body);
  update();

  return {
    key(e) {
      if (current !== 'calc') return false;
      const map = { '*': '×', '/': '÷', '-': '−', '^': '^', Enter: '@eq', '=': '@eq', Backspace: '@back', Escape: '@clear' };
      const k = map[e.key] || e.key;
      if (k.startsWith('@')) { pressKey({ _def: { ins: k } }); return true; }
      if (/^[0-9.+×÷−^()!%,]$/.test(k)) { input.push(k, { startsValue: /[0-9.(]/.test(k) }); return true; }
      if (/^[a-z]$/i.test(k)) { input.push(k); return true; }
      return false;
    },
    onShow: () => { if (current === 'graph') graph.draw(); },
  };
}

// ---------- Graph pane ----------
function graphPane(getAngle) {
  const pane = h('div', { class: 'pane' });
  const colors = ['#ff9f1c', '#5cc8ff', '#5bd18b'];
  const fns = ['sin(x)', 'x^2/4', ''];
  const list = h('div', { class: 'fn-list', style: 'padding:4px 12px' });
  const inputs = fns.map((f, i) => {
    const inp = h('input', { type: 'text', value: f, placeholder: `y${i + 1} = f(x)`, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    inp.addEventListener('input', () => draw());
    list.append(h('div', { class: 'fn-row' }, h('span', { class: 'sw', style: `background:${colors[i]}` }), h('span', { class: 'muted' }, `y${i + 1}=`), inp));
    return inp;
  });
  const info = h('div', { class: 'muted small', style: 'padding:2px 12px 6px' }, 'Drag to pan · pinch or zoom buttons · tap to trace. Graphs use radians.');
  const canvas = h('canvas', { class: 'graph', 'aria-label': 'Graph' });
  const zoomRow = h('div', { class: 'actions' },
    h('button', { onclick: () => zoom(0.7) }, '＋ Zoom in'), h('button', { onclick: () => zoom(1 / 0.7) }, '－ Zoom out'),
    h('button', { onclick: () => { view = { cx: 0, cy: 0, scale: 40 }; draw(); } }, 'Reset'));
  pane.append(list, info, zoomRow, canvas);

  let view = { cx: 0, cy: 0, scale: 40 }; // px per unit
  let trace = null;
  function zoom(f) { view.scale /= f; view.scale = Math.min(5000, Math.max(0.5, view.scale)); draw(); }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (!w || !hgt) return;
    canvas.width = w * dpr; canvas.height = hgt * dpr;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0c0e10'; g.fillRect(0, 0, w, hgt);
    const X = (x) => w / 2 + (x - view.cx) * view.scale;
    const Y = (y) => hgt / 2 - (y - view.cy) * view.scale;
    const xmin = view.cx - w / 2 / view.scale, xmax = view.cx + w / 2 / view.scale;
    const ymin = view.cy - hgt / 2 / view.scale, ymax = view.cy + hgt / 2 / view.scale;
    // grid step
    const raw = 80 / view.scale;
    const p10 = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((m) => m * p10).find((s) => s >= raw);
    g.lineWidth = 1; g.font = '11px system-ui'; g.fillStyle = '#6b757d';
    for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) {
      g.strokeStyle = Math.abs(x) < step / 2 ? '#8d979f' : '#1f252a';
      g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), hgt); g.stroke();
      if (Math.abs(x) > step / 2) g.fillText(+x.toPrecision(6), X(x) + 2, Math.min(hgt - 4, Math.max(12, Y(0) + 12)));
    }
    for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) {
      g.strokeStyle = Math.abs(y) < step / 2 ? '#8d979f' : '#1f252a';
      g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(w, Y(y)); g.stroke();
      if (Math.abs(y) > step / 2) g.fillText(+y.toPrecision(6), Math.min(w - 30, Math.max(2, X(0) + 4)), Y(y) - 2);
    }
    inputs.forEach((inp, i) => {
      inp.style.borderColor = '';
      if (!inp.value.trim()) return;
      let f;
      try { f = compile(inp.value, { angle: getAngle() }); f(1); } catch { inp.style.borderColor = 'var(--red)'; return; }
      g.strokeStyle = colors[i]; g.lineWidth = 2.2; g.beginPath();
      let pen = false, prevY = null;
      for (let px = 0; px <= w; px += 1) {
        const x = xmin + px / view.scale;
        const y = f(x);
        if (!Number.isFinite(y)) { pen = false; continue; }
        const py = Y(y);
        if (pen && prevY != null && Math.abs(py - prevY) > hgt * 2) pen = false; // asymptote
        if (!pen) { g.moveTo(px, py); pen = true; } else g.lineTo(px, py);
        prevY = py;
      }
      g.stroke();
    });
    if (trace) {
      g.fillStyle = '#fff';
      inputs.forEach((inp, i) => {
        if (!inp.value.trim()) return;
        try {
          const y = compile(inp.value, { angle: getAngle() })(trace);
          if (!Number.isFinite(y)) return;
          g.fillStyle = colors[i];
          g.beginPath(); g.arc(X(trace), Y(y), 5, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff';
          g.fillText(`(${+trace.toPrecision(5)}, ${+y.toPrecision(5)})`, X(trace) + 8, Y(y) - 8 - i * 14);
        } catch { /* ignore */ }
      });
    }
  }

  // pan / pinch / tap-trace
  const pts = new Map();
  let startView = null, startDist = 0, moved = false, startMid = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startView = { ...view }; moved = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; startDist = Math.hypot(a.x - b.x, a.y - b.y); startMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    canvas._start = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      const dx = e.clientX - canvas._start.x, dy = e.clientY - canvas._start.y;
      if (Math.hypot(dx, dy) > 6) moved = true;
      view.cx = startView.cx - dx / view.scale; view.cy = startView.cy + dy / view.scale;
      draw();
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      view.scale = Math.min(5000, Math.max(0.5, startView.scale * (d / startDist)));
      void startMid;
      moved = true; draw();
    }
  });
  const up = (e) => {
    if (pts.size === 1 && !moved) {
      const r = canvas.getBoundingClientRect();
      trace = view.cx + (e.clientX - r.left - r.width / 2) / view.scale;
      draw();
    }
    pts.delete(e.pointerId);
    startView = { ...view };
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  window.addEventListener('resize', () => { if (pane.classList.contains('active')) draw(); });
  return { pane, draw };
}

// ---------- helpers for tool panes ----------
const fld = (label, el) => h('div', { class: 'fld' }, h('label', {}, label), el);
const numIn = (v = '', ph = '') => h('input', { type: 'text', inputmode: 'decimal', value: v, placeholder: ph, autocomplete: 'off' });
const val = (el) => { try { return el.value.trim() ? calc(el.value) : NaN; } catch { return NaN; } };
function resultBox(rows, warn) {
  const box = h('div', { class: 'results' });
  if (warn) box.append(h('div', { class: 'warn' }, warn));
  for (const [k, v, big] of rows) {
    const r = h('div', { class: `r${big ? ' big' : ''}` }, h('span', {}, k), h('b', {}, v));
    onPress(r, { hold: () => copyText(String(v)) });
    box.append(r);
  }
  return box;
}
function saveBtn(getEntry) {
  return h('div', { class: 'form-actions' }, h('button', { class: 'btn primary', onclick: () => { const e = getEntry(); if (e) saveToJobDialog(e); else toast('Nothing to save yet'); } }, '💾 Save to job'));
}

function solvePane() {
  const pane = h('div', { class: 'pane' });
  const wrap = h('div', { class: 'tool-pane' });
  const mode = h('div', { class: 'seg' });
  const area = h('div', {});
  const out = h('div', {});
  let cur = 'quad', lastRows = null, lastInputs = [];
  [['quad', 'ax² + bx + c = 0'], ['lin2', '2×2 system'], ['lin3', '3×3 system']].forEach(([id, t]) => {
    const b = h('button', { class: id === cur ? 'on' : '' }, t);
    b.addEventListener('click', () => { cur = id; [...mode.children].forEach((c) => c.classList.toggle('on', c === b)); build(); });
    mode.append(b);
  });
  function build() {
    area.innerHTML = ''; out.innerHTML = '';
    if (cur === 'quad') {
      const a = numIn('1'), b = numIn('-3'), c = numIn('2');
      area.append(h('div', { class: 'grid3' }, fld('a', a), fld('b', b), fld('c', c)));
      const run = () => {
        out.innerHTML = '';
        try {
          const r = quadratic(val(a), val(b), val(c));
          lastInputs = [['a', a.value], ['b', b.value], ['c', c.value]];
          lastRows = r.complex
            ? [['x₁', `${fmt(r.re)} + ${fmt(r.im)}i`, true], ['x₂', `${fmt(r.re)} − ${fmt(r.im)}i`, true], ['Discriminant', fmt(r.disc)]]
            : r.roots.map((x, i) => [`x${i ? '₂' : '₁'}`, fmt(x), true]).concat([['Discriminant', fmt(r.disc)], ['Vertex', `(${fmt(r.vx)}, ${fmt(r.vy)})`]]);
          out.append(resultBox(lastRows, r.note));
        } catch (e) { lastRows = null; out.append(resultBox([], e.message)); }
      };
      [a, b, c].forEach((x) => x.addEventListener('input', run));
      run();
    } else {
      const nDim = cur === 'lin2' ? 2 : 3;
      const vars = ['x', 'y', 'z'].slice(0, nDim);
      const defaults = nDim === 2 ? [[2, 1, 5], [1, -1, 1]] : [[1, 1, 1, 6], [0, 2, 5, -4], [2, 5, -1, 27]];
      const cells = [];
      const grid = h('div', { class: 'matrix', style: `grid-template-columns: repeat(${nDim}, 1fr) 20px 1fr` });
      for (let r = 0; r < nDim; r++) {
        cells[r] = [];
        for (let c = 0; c <= nDim; c++) {
          if (c === nDim) grid.append(h('div', { style: 'align-self:center;text-align:center' }, '='));
          const inp = numIn(String(defaults[r][c]));
          inp.setAttribute('aria-label', c < nDim ? `row ${r + 1} ${vars[c]}` : `row ${r + 1} constant`);
          cells[r][c] = inp; grid.append(inp);
        }
      }
      area.append(h('p', { class: 'muted small' }, `Coefficients of ${vars.join(', ')} and the constant on the right.`), grid);
      const run = () => {
        out.innerHTML = '';
        const A = cells.map((row) => row.slice(0, nDim).map(val));
        const B = cells.map((row) => val(row[nDim]));
        try {
          const sol = solveLinear(A, B);
          lastInputs = cells.map((row, i) => [`Eq ${i + 1}`, row.slice(0, nDim).map((c, j) => `${c.value}${vars[j]}`).join(' + ') + ` = ${row[nDim].value}`]);
          lastRows = sol.map((v, i) => [vars[i], fmt(v), true]);
          out.append(resultBox(lastRows));
        } catch (e) { lastRows = null; out.append(resultBox([], e.message)); }
      };
      cells.flat().forEach((x) => x.addEventListener('input', run));
      run();
    }
  }
  wrap.append(mode, area, out, saveBtn(() => lastRows && { screen: 'Scientific', title: 'Equation solver', inputs: lastInputs, outputs: lastRows.map(([k, v]) => [k, v]) }));
  pane.append(wrap);
  build();
  return pane;
}

function convertPane() {
  const pane = h('div', { class: 'pane' });
  const wrap = h('div', { class: 'tool-pane' });
  const cat = h('select', {}, ...Object.keys(UNITS).map((k) => h('option', { value: k }, k)));
  const from = h('select', {}), to = h('select', {});
  const v = numIn('1');
  const out = h('div', {});
  let last = null;
  const DEF = { Length: ['ft', 'm'], Area: ['ft²', 'm²'], Volume: ['yd³', 'm³'], Weight: ['lb', 'kg'], Temperature: ['°F', '°C'] };
  function fillUnits() {
    const us = Object.keys(UNITS[cat.value].units);
    from.innerHTML = ''; to.innerHTML = '';
    us.forEach((u) => { from.append(h('option', { value: u }, u)); to.append(h('option', { value: u }, u)); });
    [from.value, to.value] = DEF[cat.value];
    run();
  }
  function run() {
    out.innerHTML = '';
    const x = val(v);
    if (!Number.isFinite(x)) return;
    const r = convert(cat.value, x, from.value, to.value);
    const all = Object.keys(UNITS[cat.value].units).filter((u) => u !== from.value && u !== to.value)
      .map((u) => [u, formatNumber(convert(cat.value, x, from.value, u), { maxDec: 6, sep: S().sep })]);
    last = { x, r };
    out.append(resultBox([[`${v.value} ${from.value} =`, `${formatNumber(r, { maxDec: 8, sep: S().sep })} ${to.value}`, true], ...all]));
  }
  cat.addEventListener('change', fillUnits);
  [from, to].forEach((s) => s.addEventListener('change', run));
  v.addEventListener('input', run);
  const swap = h('button', { class: 'btn small', style: 'margin-top:10px', onclick: () => { [from.value, to.value] = [to.value, from.value]; run(); } }, '⇄ Swap');
  wrap.append(fld('Category', cat), h('div', { class: 'grid2' }, fld('Value', v), h('div', {}, swap)), h('div', { class: 'grid2' }, fld('From', from), fld('To', to)), out,
    saveBtn(() => last && { screen: 'Scientific', title: `Convert ${cat.value}`, expression: `${v.value} ${from.value} → ${to.value}`, result: `${formatNumber(last.r, { maxDec: 8 })} ${to.value}`, resultValue: last.r }));
  pane.append(wrap);
  fillUnits();
  return pane;
}

function statsPane() {
  const pane = h('div', { class: 'pane' });
  const wrap = h('div', { class: 'tool-pane' });
  const ta = h('textarea', { rows: 4, placeholder: 'Numbers separated by commas, spaces or new lines', inputmode: 'decimal' }, '12, 15, 11, 18, 15, 14');
  const n1 = numIn('', 'n'), r1 = numIn('', 'r');
  const out = h('div', {}), out2 = h('div', {});
  let last = null;
  const run = () => {
    out.innerHTML = '';
    const nums = ta.value.split(/[\s,;]+/).filter(Boolean).map(Number).filter(Number.isFinite);
    if (!nums.length) return;
    const s = stats(nums);
    last = s;
    out.append(resultBox([
      ['Count (n)', String(s.n)], ['Sum', fmt(s.sum)], ['Mean', fmt(s.mean), true], ['Median', fmt(s.median)],
      ['Mode', s.mode.length ? s.mode.map(fmt).join(', ') : 'none'], ['Min / Max', `${fmt(s.min)} / ${fmt(s.max)}`], ['Range', fmt(s.range)],
      ['Std dev (sample, s)', Number.isFinite(s.sdSample) ? fmt(s.sdSample) : '—', true], ['Std dev (population, σ)', fmt(s.sdPop)],
      ['Variance (sample)', Number.isFinite(s.varSample) ? fmt(s.varSample) : '—'],
    ]));
  };
  const run2 = () => {
    out2.innerHTML = '';
    const a = val(n1), b = val(r1);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    try { out2.append(resultBox([['nCr (combinations)', fmt(calc(`nCr(${a},${b})`)), true], ['nPr (permutations)', fmt(calc(`nPr(${a},${b})`))]])); } catch (e) { out2.append(resultBox([], e.message)); }
  };
  ta.addEventListener('input', run);
  [n1, r1].forEach((x) => x.addEventListener('input', run2));
  wrap.append(h('div', { class: 'field-row' }, ta, h('button', { class: 'icon-btn mic-inline', 'aria-label': 'Dictate numbers', onclick: async () => { const t = await window.__voice?.listenExpression('math'); if (t) { ta.value += (ta.value ? ', ' : '') + t.replace(/\+/g, ', '); run(); } } }, '🎙')),
    out, h('h3', { style: 'color:var(--accent-2);font-size:1rem' }, 'Combinations'), h('div', { class: 'grid2' }, fld('n', n1), fld('r', r1)), out2,
    saveBtn(() => last && { screen: 'Scientific', title: 'Statistics', inputs: [['Data', ta.value.trim()]], outputs: [['n', String(last.n)], ['Mean', fmt(last.mean)], ['Median', fmt(last.median)], ['Std dev (s)', fmt(last.sdSample)], ['Std dev (σ)', fmt(last.sdPop)], ['Sum', fmt(last.sum)]] }));
  pane.append(wrap);
  run();
  return pane;
}

function basePane() {
  const pane = h('div', { class: 'pane' });
  const wrap = h('div', { class: 'tool-pane' });
  const inp = h('input', { type: 'text', value: '255', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  const base = h('select', {}, h('option', { value: '10' }, 'Decimal (10)'), h('option', { value: '16' }, 'Hex (16)'), h('option', { value: '8' }, 'Octal (8)'), h('option', { value: '2' }, 'Binary (2)'));
  const out = h('div', {});
  let last = null;
  const run = () => {
    out.innerHTML = '';
    try {
      const v = parseBase(inp.value, +base.value);
      last = v;
      out.append(resultBox([['Decimal', toBase(v, 10), true], ['Hex', toBase(v, 16), true], ['Octal', toBase(v, 8)], ['Binary', toBase(v, 2)]]));
    } catch (e) { last = null; out.append(resultBox([], e.message)); }
  };
  inp.addEventListener('input', run); base.addEventListener('change', run);
  wrap.append(h('div', { class: 'grid2' }, fld('Number', inp), fld('Entered in', base)), out,
    h('p', { class: 'note' }, 'Whole numbers only (negative allowed). Hex digits A–F.'),
    saveBtn(() => last != null && { screen: 'Scientific', title: 'Number bases', expression: `${inp.value} (base ${base.value})`, result: `DEC ${toBase(last, 10)} | HEX ${toBase(last, 16)} | OCT ${toBase(last, 8)} | BIN ${toBase(last, 2)}`, resultValue: Number(last) }));
  pane.append(wrap);
  run();
  return pane;
}

function constPane(onPick) {
  const pane = h('div', { class: 'pane' });
  const wrap = h('div', { class: 'tool-pane const-list' });
  const groups = {};
  for (const [k, c] of Object.entries(CONSTANTS)) (groups[c.group || 'Math'] ||= []).push([k, c]);
  for (const [g, items] of Object.entries(groups)) {
    wrap.append(h('h3', { style: 'color:var(--accent-2);font-size:.95rem;margin:14px 0 2px' }, g));
    for (const [k, c] of items) {
      const row = h('div', { class: 'c-row', tabindex: 0, role: 'button', 'aria-label': `Insert ${c.name}` },
        h('div', {}, h('b', {}, c.sym), ' ', c.name),
        h('div', { class: 'v' }, `${c.value.toPrecision(10).replace(/\.?0+(e|$)/, '$1')}`, h('br'), c.unit));
      onPress(row, { tap: () => onPick(k), hold: () => copyText(String(c.value)) });
      wrap.append(row);
    }
  }
  wrap.append(h('p', { class: 'note' }, 'Tap to insert into the calculator, hold to copy. CODATA 2018 values (SI-exact where defined).'));
  pane.append(wrap);
  return pane;
}

export { esc, sheet };
