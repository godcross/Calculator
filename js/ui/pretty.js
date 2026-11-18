// Textbook-style rendering of an expression: stacked fractions, superscripts, radicals.
import { parse } from '../engine/expr.js';
import { CONSTANTS } from '../engine/units.js';
import { esc } from './common.js';

const FN_LABEL = {
  asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹', asinh: 'sinh⁻¹', acosh: 'cosh⁻¹', atanh: 'tanh⁻¹',
  log2: 'log₂', abs: '', fact: '',
};

function numText(v) {
  const s = String(v);
  return s.replace('e+', 'E').replace('e-', 'E-');
}

function render(n, parentPrec = 0) {
  switch (n.k) {
    case 'num': return `<span class="n">${esc(numText(n.v))}</span>`;
    case 'const': return `<i class="c">${esc(CONSTANTS[n.name]?.sym || n.name)}</i>`;
    case 'ans': return '<span class="c">Ans</span>';
    case 'var': return '<i class="c">x</i>';
    case 'group': return `<span class="paren">(</span>${render(n.a)}<span class="paren">)</span>`;
    case 'neg': return `−${render(n.a, 3)}`;
    case 'pct': return `${render(n.a, 5)}%`;
    case 'bin': {
      if (n.op === '/') {
        return `<span class="frac"><span class="fn">${render(strip(n.a))}</span><span class="fd">${render(strip(n.b))}</span></span>`;
      }
      if (n.op === '^') return `${render(n.a, 5)}<sup>${render(strip(n.b))}</sup>`;
      const sym = n.op === '*' ? (n.implicit ? '' : '×') : n.op === '-' ? '−' : '+';
      const prec = n.op === '*' ? 2 : 1;
      const inner = `${render(n.a, prec)}${sym ? `<span class="op">${sym}</span>` : ''}${render(n.b, prec + 0.5)}`;
      return parentPrec > prec && n.op !== '*' ? `(${inner})` : inner;
    }
    case 'fn': {
      const a = n.args;
      if (n.f === 'sqrt') return `<span class="rad">√<span class="radicand">${render(strip(a[0]))}</span></span>`;
      if (n.f === 'cbrt') return `<span class="rad"><sup class="idx">3</sup>√<span class="radicand">${render(strip(a[0]))}</span></span>`;
      if (n.f === 'root') return `<span class="rad"><sup class="idx">${render(strip(a[1]))}</sup>√<span class="radicand">${render(strip(a[0]))}</span></span>`;
      if (n.f === 'abs') return `|${render(strip(a[0]))}|`;
      if (n.f === 'fact') return `${render(a[0], 5)}!`;
      if (n.f === 'exp') return `<i class="c">e</i><sup>${render(strip(a[0]))}</sup>`;
      const label = FN_LABEL[n.f] ?? n.f;
      return `<span class="f">${esc(label)}</span>(${a.map((x) => render(x)).join(', ')})`;
    }
  }
  return '';
}
const strip = (n) => (n.k === 'group' ? n.a : n);

// Returns HTML; falls back to the raw text while the expression is incomplete.
export function prettyHTML(text) {
  if (!text) return '';
  try {
    return render(parse(text));
  } catch {
    // render the longest prefix that parses, then the unfinished tail as typed
    for (let cut = 1; cut <= Math.min(text.length - 1, 12); cut++) {
      try {
        return render(parse(text.slice(0, -cut))) + `<span class="op">${esc(text.slice(-cut))}</span>`;
      } catch { /* keep trimming */ }
    }
    return esc(text);
  }
}
