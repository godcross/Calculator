// Turn spoken words into calculator input.
// "twelve feet six and three eighths inches times four" -> 12' 6 3⁄8" × 4
// "square root of sixteen plus two point five" -> √(16)+2.5   (math mode)

const ONES = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, a: 1, an: 1,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { hundred: 100, thousand: 1000, million: 1e6, billion: 1e9 };
const DENOMS = {
  half: 2, halves: 2, quarter: 4, quarters: 4, third: 3, thirds: 3, fourth: 4, fourths: 4,
  eighth: 8, eighths: 8, sixteenth: 16, sixteenths: 16, thirty_second: 32, thirty_seconds: 32,
  sixty_fourth: 64, sixty_fourths: 64,
};

// Vocabulary list for constrained offline recognition (Vosk grammar).
export const MATH_VOCAB = [
  ...Object.keys(ONES), ...Object.keys(TENS), ...Object.keys(SCALES),
  'half', 'halves', 'quarter', 'quarters', 'third', 'thirds', 'fourth', 'fourths', 'eighth', 'eighths',
  'sixteenth', 'sixteenths', 'second', 'seconds',
  'point', 'and', 'plus', 'add', 'minus', 'subtract', 'less', 'take', 'away', 'times', 'multiplied', 'by',
  'x', 'divided', 'over', 'into', 'equals', 'percent', 'of', 'squared', 'cubed', 'to', 'the', 'power',
  'square', 'root', 'cube', 'open', 'close', 'bracket', 'brackets', 'parenthesis', 'feet', 'foot', 'ft',
  'inch', 'inches', 'meter', 'meters', 'metre', 'metres', 'millimeter', 'millimeters', 'millimetre',
  'millimetres', 'centimeter', 'centimeters', 'centimetre', 'centimetres', 'negative', 'pi', 'clear',
  'sine', 'cosine', 'tangent', 'log', 'natural', 'and', '[unk]',
];

function tokenizeWords(text) {
  return String(text).toLowerCase()
    .replace(/thirty[- ]seconds?/g, (m) => m.replace(/[- ]/, '_'))
    .replace(/sixty[- ]fourths?/g, (m) => m.replace(/[- ]/, '_'))
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9_.\s/]/g, ' ')
    .split(/\s+/).filter(Boolean);
}

// Read a spoken number starting at i. Returns { value, next } or null.
function readNumber(w, i) {
  if (i >= w.length) return null;
  if (/^\d+(\.\d+)?$/.test(w[i])) {
    // digits already, maybe "1/2"
    let value = parseFloat(w[i]);
    let next = i + 1;
    if (w[next] === 'point' && /^\d+$/.test(w[next + 1] || '')) { value = parseFloat(`${w[i]}.${w[next + 1]}`); next += 2; }
    return { value, next, words: false };
  }
  if (/^\d+\/\d+$/.test(w[i])) return null;
  let total = 0, current = 0, j = i, any = false;
  let last = ''; // 'one' | 'teen' | 'ten' | 'scale' — stops "seven five" adding up
  if (w[i] === 'point') {
    let digits = '';
    let k = i + 1;
    while (k < w.length && ONES[w[k]] != null && ONES[w[k]] < 10 && w[k] !== 'a' && w[k] !== 'an') { digits += ONES[w[k]]; k++; }
    if (digits) return { value: parseFloat(`0.${digits}`), next: k, words: true };
    return null;
  }
  while (j < w.length) {
    const t = w[j];
    if ((t === 'a' || t === 'an')) {
      // only "a hundred", "a half" style
      if (SCALES[w[j + 1]]) { current = 1; any = true; j++; continue; }
      break;
    }
    if (ONES[t] != null) {
      if (last === 'one' || last === 'teen' || (last === 'ten' && ONES[t] >= 10)) break;
      current += ONES[t]; any = true; last = ONES[t] >= 10 ? 'teen' : 'one'; j++; continue;
    }
    if (TENS[t] != null) {
      if (last === 'one' || last === 'teen' || last === 'ten') break;
      current += TENS[t]; any = true; last = 'ten'; j++; continue;
    }
    if (t === 'hundred' && any) { current *= 100; last = 'scale'; j++; continue; }
    if ((t === 'thousand' || t === 'million' || t === 'billion') && any) { total += current * SCALES[t]; current = 0; last = 'scale'; j++; continue; }
    if (t === 'and' && any && (ONES[w[j + 1]] != null || TENS[w[j + 1]] != null) && !isFractionAhead(w, j + 1)) {
      // "one hundred and five"
      if (w[j - 1] === 'hundred' || w[j - 1] === 'thousand') { j++; continue; }
      break;
    }
    break;
  }
  if (!any) return null;
  let value = total + current;
  // decimal: "two point five", "point seven five"
  if (w[j] === 'point') {
    let digits = '';
    let k = j + 1;
    while (k < w.length && (ONES[w[k]] != null && ONES[w[k]] < 10 && w[k] !== 'a' && w[k] !== 'an' || /^\d$/.test(w[k]))) {
      digits += ONES[w[k]] != null ? ONES[w[k]] : w[k];
      k++;
    }
    if (digits) { value = parseFloat(`${value}.${digits}`); j = k; }
  }
  return { value, next: j, words: true };
}

function isFractionAhead(w, i) {
  const n = readNumberSimple(w, i);
  return n && DENOMS[w[n.next]] != null;
}
function readNumberSimple(w, i) {
  if (ONES[w[i]] != null) return { value: ONES[w[i]], next: i + 1 };
  if (TENS[w[i]] != null) {
    if (ONES[w[i + 1]] != null && ONES[w[i + 1]] < 10) return { value: TENS[w[i]] + ONES[w[i + 1]], next: i + 2 };
    return { value: TENS[w[i]], next: i + 1 };
  }
  if (/^\d+$/.test(w[i] || '')) return { value: parseInt(w[i], 10), next: i + 1 };
  return null;
}

// Try to read "three eighths", "a half", "one sixteenth", "5/8"
function readFraction(w, i) {
  if (/^\d+\/\d+$/.test(w[i] || '')) { const [n, d] = w[i].split('/'); return { n: +n, d: +d, next: i + 1 }; }
  if ((w[i] === 'a' || w[i] === 'an' || w[i] === 'one') && DENOMS[w[i + 1]]) return { n: 1, d: DENOMS[w[i + 1]], next: i + 2 };
  if (DENOMS[w[i]] && (w[i] === 'half')) return { n: 1, d: 2, next: i + 1 };
  const n = readNumberSimple(w, i);
  if (n && DENOMS[w[n.next]]) {
    let d = DENOMS[w[n.next]];
    // "three over eight"
    return { n: n.value, d, next: n.next + 1 };
  }
  if (n && w[n.next] === 'over') {
    const d = readNumberSimple(w, n.next + 1);
    if (d) return { n: n.value, d: d.value, next: d.next };
  }
  return null;
}

const UNIT_WORDS = {
  feet: "'", foot: "'", ft: "'",
  inch: '"', inches: '"',
  meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  millimeter: 'mm', millimeters: 'mm', millimetre: 'mm', millimetres: 'mm',
  centimeter: 'cm', centimeters: 'cm', centimetre: 'cm', centimetres: 'cm',
};

const OPS = [
  [['multiplied', 'by'], '×'], [['divided', 'by'], '÷'], [['take', 'away'], '−'],
  [['to', 'the', 'power', 'of'], '^'], [['to', 'the', 'power'], '^'], [['square', 'root', 'of'], '√('],
  [['square', 'root'], '√('], [['cube', 'root', 'of'], '∛('], [['open', 'bracket'], '('],
  [['close', 'bracket'], ')'], [['open', 'parenthesis'], '('], [['close', 'parenthesis'], ')'],
  [['natural', 'log', 'of'], 'ln('], [['log', 'of'], 'log('], [['sine', 'of'], 'sin('], [['cosine', 'of'], 'cos('],
  [['tangent', 'of'], 'tan('], [['percent', 'of'], '%×'],
  [['plus'], '+'], [['add'], '+'], [['and'], '+'], [['minus'], '−'], [['subtract'], '−'], [['less'], '−'],
  [['times'], '×'], [['x'], '×'], [['by'], '×'], [['over'], '÷'], [['divided'], '÷'], [['into'], '÷'],
  [['percent'], '%'], [['squared'], '²'], [['cubed'], '³'], [['negative'], '−'], [['pi'], 'π'],
  [['sine'], 'sin('], [['cosine'], 'cos('], [['tangent'], 'tan('], [['equals'], '='],
];

// Convert words to a calculator expression string.
// mode: 'math' (Basic/Scientific) or 'dim' (Construction keypad, units allowed)
export function wordsToExpression(text, mode = 'math') {
  const w = tokenizeWords(text);
  let out = '';
  let i = 0;
  let openFn = 0;
  const closeFns = () => { while (openFn > 0) { out += ')'; openFn--; } };
  while (i < w.length) {
    // number (+ optional fraction + optional unit)
    const num = readNumber(w, i);
    const frac0 = !num ? readFraction(w, i) : null;
    if (num || frac0) {
      let val = '';
      let j;
      if (num) {
        val = formatNum(num.value);
        j = num.next;
        // "six and three eighths" / "six three eighths"
        let k = j;
        if (w[k] === 'and') k++;
        const f = readFraction(w, k);
        if (f && (w[j] === 'and' || /^(\d+\/\d+)$/.test(w[k]) || DENOMS[w[f.next - 1]])) {
          val += mode === 'dim' ? ` ${f.n}⁄${f.d}` : `+${f.n}/${f.d}`;
          if (mode !== 'dim') val = `(${val})`;
          j = f.next;
        } else if (w[j] && DENOMS[w[j]] && num.value < 64) {
          // "three eighths" read as number + denom
          val = mode === 'dim' ? `${num.value}⁄${DENOMS[w[j]]}` : `(${num.value}/${DENOMS[w[j]]})`;
          j++;
        }
      } else {
        val = mode === 'dim' ? `${frac0.n}⁄${frac0.d}` : `(${frac0.n}/${frac0.d})`;
        j = frac0.next;
      }
      const unit = UNIT_WORDS[w[j]];
      if (unit && mode === 'dim') {
        val += unit;
        j++;
        // "twelve feet six inches": following number without operator joins as inches
        if (unit === "'") {
          const n2 = readNumber(w, j);
          const f2 = !n2 ? readFraction(w, j) : null;
          if (n2 || f2) {
            const sub = wordsToExpression(w.slice(j).join(' '), 'dim');
            const m = /^([\d.]+(?: \d+⁄\d+)?|\d+⁄\d+)"?/.exec(sub);
            if (m) {
              const consumed = countConsumed(w, j);
              val += ` ${m[1]}"`;
              j = consumed;
            }
          }
        }
      } else if (unit) j++; // ignore units in math mode
      out += val;
      i = j;
      continue;
    }
    // operators (longest first)
    let matched = false;
    for (const [seq, sym] of OPS) {
      if (seq.every((s, k) => w[i + k] === s)) {
        if (sym === '=') { i += seq.length; matched = true; break; }
        if (sym.endsWith('(') && sym !== '(') openFn++;
        if ('+−×÷^%'.includes(sym[0]) || sym === ')') {
          if (sym !== '%' && sym !== '²' && sym !== '³') closeFns();
        }
        out += sym;
        i += seq.length;
        matched = true;
        break;
      }
    }
    if (!matched) i++; // skip filler words like "the", "um"
  }
  closeFns();
  return out.replace(/\s+/g, ' ').trim();
}

// How far a "<number> [and fraction] [inches]" run extends from j.
function countConsumed(w, j) {
  const n = readNumber(w, j);
  let k = n ? n.next : j;
  if (!n) { const f = readFraction(w, j); if (f) k = f.next; }
  else {
    let k2 = k;
    if (w[k2] === 'and') k2++;
    const f = readFraction(w, k2);
    if (f) k = f.next;
    else if (DENOMS[w[k]]) k++;
  }
  if (w[k] === 'inch' || w[k] === 'inches') k++;
  return k;
}

function formatNum(v) {
  return String(parseFloat(v.toPrecision(12)));
}

// Plain number from speech, for filling a single field: "twelve point five" -> "12.5"
// In dim mode returns a length string "12' 6 3⁄8\"".
export function wordsToFieldValue(text, mode = 'math') {
  const e = wordsToExpression(text, mode);
  return e.replace(/⁄/g, '/');
}
