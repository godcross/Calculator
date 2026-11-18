// Safe expression engine: tokenizer -> AST -> evaluator. No eval().
// Supports implicit multiplication, calculator-style percent, factorial,
// functions, constants (#name), Ans and the variable x (for graphing).

import { CONSTANTS } from './units.js';

export class CalcError extends Error {}

const FUNCS = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1,
  sinh: 1, cosh: 1, tanh: 1, asinh: 1, acosh: 1, atanh: 1,
  ln: 1, log: 1, log2: 1, exp: 1, sqrt: 1, cbrt: 1, abs: 1,
  floor: 1, ceil: 1, round: 1, fact: 1,
  nCr: 2, nPr: 2, root: 2, logb: 2, mod: 2,
};
const TRIG = new Set(['sin', 'cos', 'tan']);
const INV_TRIG = new Set(['asin', 'acos', 'atan']);

// Normalise display characters to engine characters.
export function normalize(s) {
  return String(s)
    .replace(/×|·/g, '*')
    .replace(/÷/g, '/')
    .replace(/−|–/g, '-')
    .replace(/π/g, 'pi')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/sin⁻¹/g, 'asin').replace(/cos⁻¹/g, 'acos').replace(/tan⁻¹/g, 'atan')
    .replace(/sinh⁻¹/g, 'asinh').replace(/cosh⁻¹/g, 'acosh').replace(/tanh⁻¹/g, 'atanh')
    .replace(/∛/g, 'cbrt')
    .replace(/,/g, ',');
}

const KNOWN_IDS = () => [...Object.keys(FUNCS), 'pi', 'e', 'x', 'Ans', 'ans'];

// "xsin" -> ["x","sin"], "2pix" handled by number then "pix" -> ["pi","x"]
function splitIdent(word) {
  const known = KNOWN_IDS();
  if (known.includes(word)) return [word];
  const sorted = known.slice().sort((a, b) => b.length - a.length);
  const parts = [];
  let rest = word;
  while (rest.length) {
    const hit = sorted.find((k) => rest.startsWith(k));
    if (!hit) return [word]; // let the parser report the unknown name
    parts.push(hit);
    rest = rest.slice(hit.length);
  }
  return parts;
}

export function tokenize(src) {
  const s = normalize(src);
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    // number: 12, 1.5, .5, 1.2E-3
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?/.exec(s.slice(i));
      if (!m) throw new CalcError('Bad number');
      out.push({ t: 'num', v: parseFloat(m[0]), raw: m[0] });
      i += m[0].length; continue;
    }
    if (c === '#') {
      const m = /^#[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
      if (!m) throw new CalcError('Bad constant');
      out.push({ t: 'const', v: m[0].slice(1) });
      i += m[0].length; continue;
    }
    if (/[A-Za-z]/.test(c)) {
      const m = /^[A-Za-z][A-Za-z0-9]*/.exec(s.slice(i));
      for (const part of splitIdent(m[0])) out.push({ t: 'id', v: part });
      i += m[0].length; continue;
    }
    if (c === '√') { out.push({ t: 'sqrt' }); i++; continue; }
    if ('+-*/^!%(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new CalcError(`Unexpected "${c}"`);
  }
  return out;
}

// ---------- Parser ----------
// add  := mul (('+'|'-') mul)*
// mul  := unary (('*'|'/'|implicit) unary)*
// unary:= ('-'|'+') unary | pow
// pow  := post ('^' unary)?
// post := prim ('!' | '%')*
// prim := num | const | id | func '(' args ')' | '(' add ')' | '√' unary

export function parse(src, { tolerant = true } = {}) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v;
  const eat = (v) => { if (isOp(v)) { p++; return true; } return false; };

  function add() {
    let left = mul();
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v;
      const right = mul();
      left = { k: 'bin', op, a: left, b: right };
    }
    return left;
  }
  function startsPrimary(t) {
    if (!t) return false;
    if (t.t === 'num' || t.t === 'const' || t.t === 'id' || t.t === 'sqrt') return true;
    return t.t === 'op' && t.v === '(';
  }
  function mul() {
    let left = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = toks[p++].v;
        left = { k: 'bin', op, a: left, b: unary() };
      } else if (startsPrimary(peek())) {
        left = { k: 'bin', op: '*', a: left, b: unary(), implicit: true };
      } else break;
    }
    return left;
  }
  function unary() {
    if (eat('-')) return { k: 'neg', a: unary() };
    if (eat('+')) return unary();
    return pow();
  }
  function pow() {
    const base = post();
    if (eat('^')) return { k: 'bin', op: '^', a: base, b: unary() };
    return base;
  }
  function post() {
    let n = prim();
    for (;;) {
      if (eat('!')) n = { k: 'fn', f: 'fact', args: [n] };
      else if (eat('%')) n = { k: 'pct', a: n };
      else break;
    }
    return n;
  }
  function closeParen() {
    if (eat(')')) return;
    if (tolerant && p >= toks.length) return; // auto-close at end
    throw new CalcError('Missing )');
  }
  function prim() {
    const t = toks[p];
    if (!t) throw new CalcError('Incomplete');
    if (t.t === 'num') { p++; return { k: 'num', v: t.v }; }
    if (t.t === 'const') {
      p++;
      if (!CONSTANTS[t.v]) throw new CalcError(`Unknown constant ${t.v}`);
      return { k: 'const', name: t.v };
    }
    if (t.t === 'sqrt') { p++; return { k: 'fn', f: 'sqrt', args: [unary()] }; }
    if (t.t === 'op' && t.v === '(') {
      p++;
      const e = add();
      closeParen();
      return { k: 'group', a: e };
    }
    if (t.t === 'id') {
      p++;
      const name = t.v;
      if (name === 'pi') return { k: 'const', name: 'pi' };
      if (name === 'e') return { k: 'const', name: 'e' };
      if (name === 'Ans' || name === 'ans') return { k: 'ans' };
      if (name === 'x') return { k: 'var' };
      if (FUNCS[name] !== undefined) {
        if (!eat('(')) {
          // allow "sin 30" style: function applied to next unary
          return { k: 'fn', f: name, args: [unary()] };
        }
        const args = [];
        if (!isOp(')') && p < toks.length) {
          args.push(add());
          while (eat(',')) args.push(add());
        }
        closeParen();
        if (args.length !== FUNCS[name]) throw new CalcError(`${name} needs ${FUNCS[name]} value(s)`);
        return { k: 'fn', f: name, args };
      }
      throw new CalcError(`Unknown "${name}"`);
    }
    throw new CalcError(`Unexpected "${t.v || t.t}"`);
  }

  if (!toks.length) throw new CalcError('Empty');
  const ast = add();
  if (p < toks.length) throw new CalcError(`Unexpected "${toks[p].v || toks[p].t}"`);
  return ast;
}

// ---------- Evaluator ----------

export function gamma(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

export function factorial(n) {
  if (n < 0 && Number.isInteger(n)) throw new CalcError('Factorial of negative integer');
  if (Number.isInteger(n)) {
    if (n > 170) return Infinity;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }
  return gamma(n + 1);
}

function nCr(n, r) {
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || n < 0 || r > n) throw new CalcError('nCr needs whole numbers, r ≤ n');
  r = Math.min(r, n - r);
  let x = 1;
  for (let i = 1; i <= r; i++) x = (x * (n - r + i)) / i;
  return Math.round(x);
}
function nPr(n, r) {
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || n < 0 || r > n) throw new CalcError('nPr needs whole numbers, r ≤ n');
  let x = 1;
  for (let i = 0; i < r; i++) x *= n - i;
  return x;
}

const ANGLE = { deg: Math.PI / 180, rad: 1, grad: Math.PI / 200 };

export function evaluate(ast, ctx = {}) {
  const angle = ANGLE[ctx.angle || 'deg'];
  const ans = ctx.ans ?? 0;
  const x = ctx.x ?? 0;

  function ev(n) {
    switch (n.k) {
      case 'num': return n.v;
      case 'const': return CONSTANTS[n.name].value;
      case 'ans': return ans;
      case 'var': return x;
      case 'group': return ev(n.a);
      case 'neg': return -ev(n.a);
      case 'pct': return ev(n.a) / 100;
      case 'bin': {
        // Calculator-style percent: 200 + 10% = 220, 200 - 10% = 180
        if ((n.op === '+' || n.op === '-') && n.b.k === 'pct') {
          const a = ev(n.a);
          const pctv = ev(n.b.a);
          return n.op === '+' ? a + (a * pctv) / 100 : a - (a * pctv) / 100;
        }
        const a = ev(n.a), b = ev(n.b);
        switch (n.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': if (b === 0) throw new CalcError('Divide by zero'); return a / b;
          case '^': return Math.pow(a, b);
        }
        break;
      }
      case 'fn': {
        const v = n.args.map(ev);
        const a = v[0];
        if (TRIG.has(n.f)) {
          const r = Math[n.f](a * angle);
          // clean values like sin(180°)
          return Math.abs(r) < 1e-15 ? 0 : (n.f === 'tan' && Math.abs(r) > 1e15 ? Infinity : r);
        }
        if (INV_TRIG.has(n.f)) {
          if ((n.f === 'asin' || n.f === 'acos') && (a < -1 || a > 1)) throw new CalcError('Out of range (−1 to 1)');
          return Math[n.f](a) / angle;
        }
        switch (n.f) {
          case 'sinh': case 'cosh': case 'tanh': case 'asinh': case 'acosh': case 'atanh':
            return Math[n.f](a);
          case 'ln': if (a <= 0) throw new CalcError('ln needs a positive number'); return Math.log(a);
          case 'log': if (a <= 0) throw new CalcError('log needs a positive number'); return Math.log10(a);
          case 'log2': if (a <= 0) throw new CalcError('log₂ needs a positive number'); return Math.log2(a);
          case 'logb': return Math.log(a) / Math.log(v[1]);
          case 'exp': return Math.exp(a);
          case 'sqrt': if (a < 0) throw new CalcError('√ of a negative number'); return Math.sqrt(a);
          case 'cbrt': return Math.cbrt(a);
          case 'root': {
            const [b, k] = v;
            if (b < 0 && k % 2 === 1) return -Math.pow(-b, 1 / k);
            if (b < 0) throw new CalcError('Even root of a negative number');
            return Math.pow(b, 1 / k);
          }
          case 'abs': return Math.abs(a);
          case 'floor': return Math.floor(a);
          case 'ceil': return Math.ceil(a);
          case 'round': return Math.round(a);
          case 'fact': return factorial(a);
          case 'nCr': return nCr(v[0], v[1]);
          case 'nPr': return nPr(v[0], v[1]);
          case 'mod': return ((v[0] % v[1]) + v[1]) % v[1];
        }
      }
    }
    throw new CalcError('Cannot evaluate');
  }
  const r = ev(ast);
  if (Number.isNaN(r)) throw new CalcError('Not a number');
  return cleanFloat(r);
}

// Trim binary floating noise: 0.1+0.2 -> 0.3
export function cleanFloat(r) {
  if (!Number.isFinite(r) || r === 0) return r;
  return parseFloat(r.toPrecision(14));
}

export function calc(src, ctx) {
  return evaluate(parse(src), ctx);
}

// Compile once for repeated evaluation (graphing).
export function compile(src, ctx = {}) {
  const ast = parse(src);
  return (x) => {
    try { return evaluate(ast, { ...ctx, x }); } catch { return NaN; }
  };
}
