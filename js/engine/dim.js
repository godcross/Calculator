// Dimensional calculator for the Construction keypad.
// Values carry a length power: 0 = plain number, 1 = length, 2 = area, 3 = volume.
// Internally lengths are inches. Fraction key uses "⁄" (U+2044) so it never
// collides with the divide key "÷".

import { formatFtIn, formatNumber, formatMetricLength } from './format.js';
import { CalcError } from './expr.js';

const MM = 1 / 25.4;
const METRIC = { mm: MM, cm: 10 * MM, m: 1000 * MM };

const RE_NUM = String.raw`(\d+\.?\d*|\.\d+)`;
const RE_FRAC = String.raw`(\d+)\s*⁄\s*(\d+)`;
// whole-to-fraction joiner: "6-3⁄8" or "6 3⁄8" (a spaced " - " is subtraction)
const J = String.raw`(?:-|\s+)`;
// inch part: "6", "6 3⁄8", "6-3⁄8" or "3⁄8"  -> groups: whole | fracN fracD | fracN2 fracD2
const INCHPART = String.raw`(?:${RE_NUM}(?:${J}${RE_FRAC})?|${RE_FRAC})`;
// feet [inch part] ["]
const RE_FEET = new RegExp(String.raw`^${RE_NUM}\s*'(?:(?:-|\s*)${INCHPART}\s*"?)?`);
const RE_FEET_ONLY = new RegExp(String.raw`^${RE_NUM}\s*'`);
// inch part "
const RE_INCH = new RegExp(String.raw`^${INCHPART}\s*"`);
const RE_METRIC = new RegExp(String.raw`^${RE_NUM}\s*(mm|cm|m)(?![a-z])`);
const RE_PLAINFRAC = new RegExp(String.raw`^(?:${RE_NUM}${J}${RE_FRAC}|${RE_FRAC})`);

// Sum the inch-part capture groups starting at index k (whole, n, d, n2, d2)
function inchGroups(m, k) {
  let v = 0;
  if (m[k]) v += parseFloat(m[k]);
  if (m[k + 1]) v += fr(m[k + 1], m[k + 2]);
  if (m[k + 3]) v += fr(m[k + 3], m[k + 4]);
  return v;
}
const RE_PLAIN = new RegExp(String.raw`^${RE_NUM}`);

function fr(n, d) {
  const dd = parseInt(d, 10);
  if (!dd) throw new CalcError('Fraction with zero bottom');
  return parseInt(n, 10) / dd;
}

export function dimTokenize(input) {
  const s = String(input).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    .replace(/[’′]/g, "'").replace(/[”″]/g, '"')
    // keypad order 6 [in] 3⁄8  ->  6 3⁄8"
    .replace(/(\d)\s*"\s*(\d+\s*⁄\s*\d+)\s*"?/g, '$1 $2"');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    const rest = s.slice(i);
    if (/[0-9.]/.test(c)) {
      let m;
      if ((m = RE_FEET.exec(rest))) {
        // "12'-3'" : the 3 is really a second feet value, so take feet only
        if (/^\s*'/.test(rest.slice(m[0].length))) m = RE_FEET_ONLY.exec(rest);
        const inches = parseFloat(m[1]) * 12 + inchGroups(m, 2);
        out.push({ t: 'q', v: inches, p: 1 }); i += m[0].length; continue;
      }
      if ((m = RE_INCH.exec(rest))) {
        out.push({ t: 'q', v: inchGroups(m, 1), p: 1 }); i += m[0].length; continue;
      }
      if ((m = RE_METRIC.exec(rest))) {
        out.push({ t: 'q', v: parseFloat(m[1]) * METRIC[m[2]], p: 1 }); i += m[0].length; continue;
      }
      if ((m = RE_PLAINFRAC.exec(rest))) {
        out.push({ t: 'q', v: inchGroups(m, 1), p: 0 }); i += m[0].length; continue;
      }
      m = RE_PLAIN.exec(rest);
      out.push({ t: 'q', v: parseFloat(m[0]), p: 0 }); i += m[0].length; continue;
    }
    if (c === '⁄') {
      const m = new RegExp(String.raw`^⁄\s*(\d+)\s*(")?`).exec(rest);
      throw new CalcError(m ? 'Put a number before the fraction' : 'Incomplete fraction');
    }
    if ('+-*/()'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === "'" || c === '"') throw new CalcError('Unit mark needs a number first');
    throw new CalcError(`Unexpected "${c}"`);
  }
  return out;
}

export function dimEvaluate(input) {
  const toks = dimTokenize(input);
  let p = 0;
  const isOp = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v;

  function add() {
    let a = mul();
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v;
      const b = mul();
      if (a.p !== b.p) throw new CalcError(mismatchMsg(a, b));
      a = { v: op === '+' ? a.v + b.v : a.v - b.v, p: a.p };
    }
    return a;
  }
  function mul() {
    let a = unary();
    while (isOp('*') || isOp('/')) {
      const op = toks[p++].v;
      const b = unary();
      if (op === '*') a = { v: a.v * b.v, p: a.p + b.p };
      else {
        if (b.v === 0) throw new CalcError('Divide by zero');
        a = { v: a.v / b.v, p: a.p - b.p };
      }
    }
    return a;
  }
  function unary() {
    if (isOp('-')) { p++; const a = unary(); return { v: -a.v, p: a.p }; }
    if (isOp('+')) { p++; return unary(); }
    return prim();
  }
  function prim() {
    const t = toks[p];
    if (!t) throw new CalcError('Incomplete');
    if (t.t === 'q') { p++; return { v: t.v, p: t.p }; }
    if (isOp('(')) {
      p++;
      const e = add();
      if (isOp(')')) p++;
      else if (p < toks.length) throw new CalcError('Missing )');
      return e;
    }
    throw new CalcError(`Unexpected "${t.v}"`);
  }
  if (!toks.length) throw new CalcError('Empty');
  const r = add();
  if (p < toks.length) throw new CalcError(`Unexpected "${toks[p].v}"`);
  if (r.p < 0 || r.p > 3) throw new CalcError('That result has no building unit (try another order)');
  return r;
}

function mismatchMsg(a, b) {
  const name = (q) => ['a plain number', 'a length', 'an area', 'a volume'][q.p] || 'that';
  return `Can't add ${name(b)} to ${name(a)} — add ft or in to every number`;
}

// Format a quantity for display. Returns { main, extra: [..] }
export function formatQty(q, { metric = false, denom = 16, sep = ',' } = {}) {
  const n = (v, d = 4) => formatNumber(v, { maxDec: d, sep });
  if (q.p === 0) return { main: n(q.v, 10), extra: [] };
  if (q.p === 1) {
    const imp = formatFtIn(q.v, denom);
    const met = formatMetricLength(q.v);
    const extra = [`${n(q.v / 12, 4)} ft`, `${n(q.v, 4)} in`];
    return metric
      ? { main: met, extra: [imp, ...extra] }
      : { main: imp, extra: [...extra, met] };
  }
  if (q.p === 2) {
    const sqft = q.v / 144;
    const m2 = q.v * 0.00064516;
    const imp = `${n(sqft, 2)} sq ft`;
    const met = `${n(m2, 3)} m²`;
    const extra = [`${n(q.v, 2)} sq in`, `${n(sqft / 9, 2)} sq yd`];
    return metric ? { main: met, extra: [imp, ...extra] } : { main: imp, extra: [met, ...extra] };
  }
  const cuft = q.v / 1728;
  const m3 = q.v * 1.6387064e-5;
  const imp = `${n(cuft, 2)} cu ft`;
  const met = `${n(m3, 3)} m³`;
  const extra = [`${n(cuft / 27, 2)} cu yd`];
  return metric ? { main: met, extra: [imp, ...extra] } : { main: imp, extra: [met, ...extra] };
}
