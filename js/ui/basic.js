// Basic screen: expression entry, shared history tape, memories, BC tax / markup / % change / tip tools.
import { calc, CalcError } from '../engine/expr.js';
import { formatNumber } from '../engine/format.js';
import * as store from '../store.js';
import { $, h, esc, onPress, toast, copyText, sheet, promptBox, saveToJobDialog } from './common.js';
import { ExprInput } from './input.js';

export const rawStr = (n) => {
  if (!Number.isFinite(n)) return '';
  let s = String(n);
  if (s.includes('e')) s = s.replace('e+', 'E').replace('e-', 'E-');
  return s.replace(/^-/, '−');
};

let ans = 0;
export function getAns() { return ans; }
export function setAns(v) { ans = v; }

const fmt = (n) => formatNumber(n, { sep: store.settings().sep });

// ---------- shared history tape (used by Basic and Scientific) ----------
const tapes = new Set();
export function registerTape(el, onPick) { tapes.add({ el, onPick }); renderTapes(); }
export async function renderTapes() {
  const rows = await store.listHistory();
  for (const { el, onPick } of tapes) {
    el.innerHTML = '';
    if (!rows.length) { el.append(h('div', { class: 'tape-empty' }, 'Your calculations will show here. Tap one to reuse it, hold to save or copy.')); continue; }
    for (const r of rows.slice(0, 120)) {
      const item = h('div', { class: 'tape-item', tabindex: 0 },
        h('span', { class: 'tag' }, r.screen),
        h('div', { class: 'te', html: esc(r.expr) }),
        h('div', { class: 'tr' }, `= ${r.result}`));
      onPress(item, {
        tap: () => onPick(r),
        hold: () => historyMenu(r),
      });
      el.append(item);
    }
  }
}
async function historyMenu(r) {
  const s = sheet('History item', h('div', { class: 'save-summary' }, h('div', { class: 'muted' }, r.expr), h('b', {}, `= ${r.result}`)), {
    actions: [
      { label: 'Copy', onClick: () => copyText(r.result) },
      { label: 'Delete', onClick: async () => { await store.del('history', r.id); renderTapes(); } },
      { label: 'Save to job', primary: true, onClick: () => { saveToJobDialog({ screen: r.screen, title: r.screen, expression: r.expr, result: r.result, resultValue: r.value }); } },
    ],
  });
  void s;
}

export async function logHistory(screen, expr, result, value) {
  await store.addHistory({ screen, expr, result, value });
  renderTapes();
}

// ---------- Basic screen ----------
export function initBasic(root) {
  const tape = h('div', { class: 'tape', 'aria-label': 'History' });
  const exprEl = h('div', { class: 'expr', 'aria-live': 'polite' });
  const resEl = h('div', { class: 'result', title: 'Hold to copy' });
  const display = h('div', { class: 'display' }, exprEl, resEl);
  let lastResult = null; // { value, text }
  let error = '';

  const input = new ExprInput(update);

  function currentValue() {
    if (lastResult && input.fresh) return lastResult.value;
    try { return calc(input.text(), { ans }); } catch { return lastResult ? lastResult.value : 0; }
  }

  function update() {
    const t = input.text();
    exprEl.innerHTML = `${esc(t)}<span class="cursor"></span>`;
    exprEl.scrollLeft = exprEl.scrollWidth;
    resEl.classList.remove('err');
    if (error) { resEl.textContent = error; resEl.classList.add('err'); error = ''; return; }
    if (input.fresh && lastResult) { resEl.textContent = lastResult.text; resEl.style.color = ''; return; }
    if (!t) { resEl.textContent = '0'; resEl.style.color = 'var(--muted)'; return; }
    try {
      const v = calc(t, { ans });
      resEl.textContent = fmt(v);
      resEl.style.color = 'var(--muted)';
    } catch {
      resEl.textContent = resEl.textContent || '';
      resEl.style.color = 'var(--muted)';
    }
  }

  async function equals() {
    const t = input.text();
    if (!t) return;
    try {
      const v = calc(t, { ans });
      const text = fmt(v);
      ans = v;
      lastResult = { value: v, text, expr: t };
      await logHistory('Basic', t, text, v);
      input.pushResult(rawStr(v));
      resEl.style.color = '';
    } catch (e) {
      error = e instanceof CalcError ? e.message : 'Error';
      update();
    }
  }

  // memory
  let mem = parseFloat(localStorage.getItem('mem') || '0') || 0;
  const memBtns = {};
  const memRow = h('div', { class: 'mem-row' });
  const refreshMem = () => memBtns.MR.classList.toggle('has', mem !== 0);
  const memActions = {
    MC: () => { mem = 0; localStorage.setItem('mem', '0'); refreshMem(); toast('Memory cleared'); },
    MR: () => input.push(rawStr(mem), { startsValue: true }),
    'M+': () => { mem += currentValue(); localStorage.setItem('mem', String(mem)); refreshMem(); toast(`M = ${fmt(mem)}`); },
    'M−': () => { mem -= currentValue(); localStorage.setItem('mem', String(mem)); refreshMem(); toast(`M = ${fmt(mem)}`); },
    'M ▾': () => namedMemories(),
  };
  for (const [k, fn] of Object.entries(memActions)) {
    const b = h('button', { 'aria-label': k === 'M ▾' ? 'Named memories' : `Memory ${k}` }, k);
    b.addEventListener('click', fn);
    memBtns[k] = b;
    memRow.append(b);
  }
  refreshMem();

  async function namedMemories() {
    const list = h('div', {});
    const render = async () => {
      const rows = (await store.all('memories')).sort((a, b) => a.name.localeCompare(b.name));
      list.innerHTML = '';
      if (!rows.length) list.append(h('p', { class: 'muted' }, 'No named memories yet. Save the current value with a name like "Wall A".'));
      for (const m of rows) {
        list.append(h('div', { class: 'card' },
          h('div', { class: 'et', style: 'display:flex;justify-content:space-between' }, h('b', {}, m.name), h('span', { style: 'font-family:var(--mono)' }, fmt(m.value))),
          h('div', { class: 'row' },
            h('button', { class: 'btn small', onclick: () => { input.push(rawStr(m.value), { startsValue: true }); s.close(); } }, 'Insert'),
            h('button', { class: 'btn small', onclick: async () => { m.value += currentValue(); await store.put('memories', m); render(); } }, '+ Add current'),
            h('button', { class: 'btn small', onclick: async () => { m.value = currentValue(); await store.put('memories', m); render(); } }, 'Replace'),
            h('button', { class: 'btn small danger', onclick: async () => { await store.del('memories', m.id); render(); } }, 'Delete'))));
      }
    };
    const s = sheet('Named memories', list, {
      actions: [{
        label: `Save ${fmt(currentValue())} as…`, primary: true, onClick: async () => {
          const name = await promptBox('Memory name', { placeholder: 'e.g. Wall A', voice: true });
          if (name && name.trim()) { await store.put('memories', { id: store.uid(), name: name.trim(), value: currentValue() }); toast(`Saved ${name.trim()}`); }
        },
      }],
    });
    render();
  }

  // tools
  const tools = h('div', { class: 'actions' },
    h('button', { onclick: () => taxTool(currentValue(), input) }, 'Tax'),
    h('button', { onclick: () => markupTool(currentValue(), input) }, 'Markup'),
    h('button', { onclick: () => pctChangeTool(currentValue(), input) }, '%Δ'),
    h('button', { onclick: () => tipTool(currentValue(), input) }, 'Tip'),
    h('span', { class: 'sp' }),
    h('button', { 'aria-label': 'Dictate', onclick: async () => { const t = await window.__voice?.listenExpression('math'); if (t) { if (input.fresh && /^[\d(√−]/.test(t)) input.clear(); input.set(input.text() + t); } } }, '🎙'),
    h('button', { onclick: () => {
      const t = input.fresh && lastResult ? lastResult.expr : input.text();
      if (!t) return toast('Nothing to save yet');
      let v; try { v = calc(t, { ans }); } catch { return toast('Fix the calculation first'); }
      saveToJobDialog({ screen: 'Basic', title: 'Calculation', expression: t, result: fmt(v), resultValue: v });
    }, 'aria-label': 'Save to job' }, '💾'));

  // keypad (4 columns, glove-friendly)
  const K = [
    ['⌫', 'clr'], ['( )', 'fn'], ['%', 'op'], ['÷', 'op'],
    ['7'], ['8'], ['9'], ['×', 'op'],
    ['4'], ['5'], ['6'], ['−', 'op'],
    ['1'], ['2'], ['3'], ['+', 'op'],
    ['±', 'fn'], ['0'], ['.'], ['=', 'eq'],
  ];
  const keys = h('div', { class: 'keys k4 mirror' });
  for (const [label, cls] of K) {
    const b = h('button', { class: `key ${cls || ''}`, 'aria-label': label === '⌫' ? 'Backspace (hold to clear)' : label }, label);
    if (label === '⌫') b.append(h('small', {}, 'hold AC'));
    onPress(b, {
      tap: () => press(label),
      hold: label === '⌫' ? () => { input.clear(); lastResult = null; navigator.vibrate?.(0); } : null,
    });
    keys.append(b);
  }
  function press(k) {
    if (/^[0-9.]$/.test(k)) return input.push(k, { startsValue: true });
    if (k === '⌫') return input.back();
    if (k === '( )') return input.smartParen();
    if (k === '±') return input.toggleSign();
    if (k === '=') return equals();
    return input.push(k);
  }

  onPress(resEl, { hold: () => copyText(resEl.textContent.replace(/,/g, '')) });

  root.append(tape, display, memRow, tools, keys);
  registerTape(tape, (r) => { input.push(rawStr(r.value), { startsValue: true }); });
  update();

  return {
    key(e) {
      const map = { '*': '×', '/': '÷', '-': '−', Enter: '=', '=': '=', Backspace: '⌫' };
      const k = map[e.key] || e.key;
      if (e.key === 'Escape') { input.clear(); return true; }
      if (e.key === '(' || e.key === ')') { input.push(e.key, { startsValue: e.key === '(' }); return true; }
      if (/^[0-9.+%×÷−=⌫]$/.test(k)) { press(k); return true; }
      return false;
    },
  };
}

// ---------- Tools ----------
function numField(label, value, attrs = {}) {
  const input = h('input', { type: 'text', inputmode: 'decimal', value: value ?? '', ...attrs });
  const row = h('div', { class: 'fld' }, h('label', {}, label), input);
  return { row, input, get: () => { try { return calc(input.value || '0'); } catch { return NaN; } } };
}
function resultsBox() { return h('div', { class: 'results' }); }
function fillResults(box, rows) {
  box.innerHTML = '';
  for (const [k, v, big] of rows) box.append(h('div', { class: `r${big ? ' big' : ''}` }, h('span', {}, k), h('b', {}, v)));
}
function toolSheet(title, fields, compute, input, saveTitle) {
  const box = resultsBox();
  let last = null;
  const run = () => { last = compute(); fillResults(box, last.rows); };
  fields.forEach((f) => f.input.addEventListener('input', run));
  const body = h('div', {}, h('div', { class: 'grid2' }, ...fields.map((f) => f.row)), box);
  run();
  sheet(title, body, {
    actions: [
      { label: 'Save', onClick: () => { saveToJobDialog({ screen: 'Basic', title: saveTitle, inputs: fields.map((f) => [f.row.firstChild.textContent, f.input.value, f.get()]), outputs: last.rows.map(([k, v, , n]) => [k, v, n]) }); } },
      { label: 'Use result', primary: true, onClick: () => { if (Number.isFinite(last.value)) input.pushResult(rawStr(last.value)); } },
    ],
  });
}
const money = (n) => (Number.isFinite(n) ? `$${formatNumber(n, { fixed: 2, sep: store.settings().sep })}` : '—');
const pctf = (n) => (Number.isFinite(n) ? `${formatNumber(n, { maxDec: 2 })}%` : '—');

function taxTool(v, input) {
  const s = store.settings();
  const amt = numField('Amount ($)', v || '');
  const gst = numField('GST %', s.gst);
  const pst = numField('PST %', s.pst);
  const mode = h('select', {}, h('option', { value: 'add' }, 'Add tax to amount'), h('option', { value: 'remove' }, 'Amount already includes tax'));
  const modeRow = { row: h('div', { class: 'fld' }, h('label', {}, 'Mode'), mode), input: mode, get: () => 0 };
  toolSheet('BC sales tax', [amt, modeRow, gst, pst], () => {
    const a = amt.get(), g = gst.get() / 100, p = pst.get() / 100;
    if (mode.value === 'add') {
      const gv = a * g, pv = a * p, t = a + gv + pv;
      return { value: t, rows: [['GST', money(gv), false, gv], ['PST', money(pv), false, pv], ['Total', money(t), true, t]] };
    }
    const pre = a / (1 + g + p);
    return { value: pre, rows: [['Before tax', money(pre), true, pre], ['GST', money(pre * g), false, pre * g], ['PST', money(pre * p), false, pre * p]] };
  }, input, 'Sales tax');
}

function markupTool(v, input) {
  const cost = numField('Cost ($)', v || '');
  const pct = numField('Markup or margin %', 20);
  const mode = h('select', {}, h('option', { value: 'markup' }, 'Markup on cost'), h('option', { value: 'margin' }, 'Margin on price'));
  const modeRow = { row: h('div', { class: 'fld' }, h('label', {}, 'Type'), mode), input: mode, get: () => 0 };
  toolSheet('Markup / margin', [cost, pct, modeRow], () => {
    const c = cost.get(), p = pct.get() / 100;
    const price = mode.value === 'markup' ? c * (1 + p) : c / (1 - p);
    const profit = price - c;
    return {
      value: price,
      rows: [['Sell price', money(price), true, price], ['Profit', money(profit), false, profit],
        ['Markup', pctf((profit / c) * 100), false, (profit / c) * 100], ['Margin', pctf((profit / price) * 100), false, (profit / price) * 100]],
    };
  }, input, 'Markup / margin');
}

function pctChangeTool(v, input) {
  const from = numField('From', v || '');
  const to = numField('To', '');
  toolSheet('Percent change', [from, to], () => {
    const a = from.get(), b = to.get();
    const ch = ((b - a) / Math.abs(a)) * 100;
    return {
      value: ch,
      rows: [['Change', pctf(ch), true, ch], ['Difference', formatNumber(b - a), false, b - a], ['"To" as % of "From"', pctf((b / a) * 100), false, (b / a) * 100]],
    };
  }, input, 'Percent change');
}

function tipTool(v, input) {
  const bill = numField('Bill ($)', v || '');
  const tip = numField('Tip %', 18);
  const ppl = numField('People', 1);
  toolSheet('Tip / split bill', [bill, tip, ppl], () => {
    const b = bill.get(), t = (b * tip.get()) / 100, n = Math.max(1, Math.round(ppl.get()) || 1);
    return { value: (b + t) / n, rows: [['Tip', money(t), false, t], ['Total', money(b + t), false, b + t], ['Each person', money((b + t) / n), true, (b + t) / n]] };
  }, input, 'Tip / split');
}

export { $ };
