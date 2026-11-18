// Number and dimension formatting.

export const DEFAULT_FMT = { sep: ',', maxDec: 10, sciAbove: 1e15, sciBelow: 1e-9 };

function groupInt(intStr, sep) {
  if (!sep) return intStr;
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

// Auto decimals (up to maxDec), thousands separator, auto scientific when huge/tiny.
export function formatNumber(n, opts = {}) {
  const o = { ...DEFAULT_FMT, ...opts };
  if (n === Infinity) return '∞';
  if (n === -Infinity) return '−∞';
  if (Number.isNaN(n)) return 'Error';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (o.fixed != null) {
    const [i, d] = abs.toFixed(o.fixed).split('.');
    return sign + groupInt(i, o.sep) + (d ? '.' + d : '');
  }
  if (abs >= o.sciAbove || abs < o.sciBelow) {
    const [m, ex] = abs.toExponential(9).split('e');
    const mant = parseFloat(m).toString();
    return `${sign}${mant}×10${superscript(parseInt(ex, 10))}`;
  }
  let s = parseFloat(abs.toFixed(o.maxDec)).toString();
  if (s.includes('e')) s = abs.toFixed(o.maxDec).replace(/\.?0+$/, '');
  const [i, d] = s.split('.');
  return sign + groupInt(i, o.sep) + (d ? '.' + d : '');
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export function superscript(n) {
  return String(n).split('').map((c) => SUP[c] ?? c).join('');
}

// Plain machine-readable number for exports (no separators).
export function plainNumber(n, maxDec = 10) {
  if (!Number.isFinite(n)) return String(n);
  return String(parseFloat(n.toFixed(maxDec)));
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

// Round inches to nearest 1/denom and return parts.
export function inchFraction(inches, denom = 16) {
  const sign = inches < 0 ? -1 : 1;
  const total = Math.round(Math.abs(inches) * denom);
  const whole = Math.floor(total / denom);
  let num = total % denom;
  let den = denom;
  if (num) { const g = gcd(num, den); num /= g; den /= g; }
  const exact = Math.abs(Math.abs(inches) * denom - total) < 1e-6;
  return { sign, whole, num, den, exact };
}

// 150.375 -> 12' 6-3/8"
export function formatFtIn(inches, denom = 16, { feet = true } = {}) {
  if (!Number.isFinite(inches)) return '—';
  const f = inchFraction(inches, denom);
  const ft = feet ? Math.floor(f.whole / 12) : 0;
  const inch = feet ? f.whole % 12 : f.whole;
  const frac = f.num ? `${f.num}/${f.den}` : '';
  let s;
  if (feet && ft) {
    s = `${ft}' ${inch}${frac ? '-' + frac : ''}"`;
  } else {
    s = `${inch || !frac ? inch : ''}${inch && frac ? '-' : ''}${frac}"`;
  }
  return (f.sign < 0 && (f.whole || f.num) ? '−' : '') + (f.exact ? '' : '≈ ') + s;
}

export function formatMetricLength(inches) {
  const mm = inches * 25.4;
  if (Math.abs(mm) >= 1000) return `${formatNumber(mm / 1000, { maxDec: 3 })} m`;
  return `${formatNumber(mm, { maxDec: 1 })} mm`;
}

// Parse a human length into inches. Accepts:
// 12' 6-3/8"   12'6"   12 ft 6 in   6 3/8   3/8"   150.5 (as default unit)  3.2m  450mm  12.5cm
export function parseLength(text, defaultUnit = 'in') {
  if (text == null) return NaN;
  let s = String(text).trim().toLowerCase()
    .replace(/⁄/g, '/').replace(/[’′]/g, "'").replace(/[”″]/g, '"')
    .replace(/\bfeet\b|\bfoot\b|\bft\b/g, "'")
    .replace(/\binches\b|\binch\b|\bin\b/g, '"')
    .replace(/,/g, '');
  if (!s) return NaN;
  const metric = /^(-?\d*\.?\d+)\s*(mm|cm|m)$/.exec(s);
  if (metric) {
    const v = parseFloat(metric[1]);
    return v * { mm: 1 / 25.4, cm: 10 / 25.4, m: 1000 / 25.4 }[metric[2]];
  }
  let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1).trim(); }
  let inches = 0;
  let any = false;
  const ftm = /^(\d*\.?\d+)\s*'\s*-?\s*/.exec(s);
  if (ftm) { inches += parseFloat(ftm[1]) * 12; s = s.slice(ftm[0].length); any = true; }
  const hasInchMark = s.includes('"');
  s = s.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
  if (s) {
    // whole + fraction: "6 3/8" or "6-3/8"
    const wf = /^(\d*\.?\d+)?\s*-?\s*(?:(\d+)\/(\d+))?$/.exec(s);
    if (!wf) return NaN;
    const whole = wf[1] ? parseFloat(wf[1]) : 0;
    const frac = wf[2] ? parseInt(wf[2], 10) / parseInt(wf[3], 10) : 0;
    if (wf[2] && parseInt(wf[3], 10) === 0) return NaN;
    if (!wf[1] && !wf[2]) return NaN;
    let v = whole + frac;
    if (!ftm && !hasInchMark) {
      // bare number -> default unit
      v *= { in: 1, ft: 12, mm: 1 / 25.4, cm: 10 / 25.4, m: 1000 / 25.4 }[defaultUnit] ?? 1;
    }
    inches += v;
    any = true;
  }
  if (!any) return NaN;
  return neg ? -inches : inches;
}
