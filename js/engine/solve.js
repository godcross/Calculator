// Equation solvers, statistics and number-base conversion.

export function quadratic(a, b, c) {
  if (![a, b, c].every(Number.isFinite)) throw new Error('Enter a, b and c');
  if (a === 0) {
    if (b === 0) throw new Error(c === 0 ? 'Every x works (0 = 0)' : 'No solution');
    return { roots: [-c / b], disc: NaN, vx: NaN, vy: NaN, note: 'a = 0, so this is linear: one root' };
  }
  const disc = b * b - 4 * a * c;
  const vx = -b / (2 * a);
  const vy = a * vx * vx + b * vx + c;
  if (disc < 0) return { complex: true, re: vx, im: Math.sqrt(-disc) / (2 * Math.abs(a)), disc, vx, vy };
  // numerically stable form
  const q = -0.5 * (b + Math.sign(b || 1) * Math.sqrt(disc));
  const r1 = q / a;
  const r2 = q !== 0 ? c / q : -r1;
  const roots = disc === 0 ? [vx] : [r1, r2].sort((x, y) => x - y);
  return { roots: roots.map(clean), disc, vx, vy };
}

const clean = (x) => (Math.abs(x) < 1e-13 ? 0 : parseFloat(x.toPrecision(14)));

// Gaussian elimination with partial pivoting.
export function solveLinear(A, B) {
  const n = A.length;
  if (A.flat().some((v) => !Number.isFinite(v)) || B.some((v) => !Number.isFinite(v))) throw new Error('Fill in every box');
  const M = A.map((row, i) => [...row, B[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) throw new Error('No single solution (equations are parallel or dependent)');
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => clean(row[n] / row[i]));
}

export function stats(nums) {
  const n = nums.length;
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((s, x) => s + x, 0);
  const mean = sum / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const ss = nums.reduce((s, x) => s + (x - mean) ** 2, 0);
  const counts = new Map();
  for (const x of nums) counts.set(x, (counts.get(x) || 0) + 1);
  const maxC = Math.max(...counts.values());
  const mode = maxC > 1 ? [...counts].filter(([, c]) => c === maxC).map(([x]) => x) : [];
  return {
    n, sum: clean(sum), mean: clean(mean), median, mode,
    min: sorted[0], max: sorted[n - 1], range: clean(sorted[n - 1] - sorted[0]),
    varPop: clean(ss / n), varSample: n > 1 ? clean(ss / (n - 1)) : NaN,
    sdPop: clean(Math.sqrt(ss / n)), sdSample: n > 1 ? clean(Math.sqrt(ss / (n - 1))) : NaN,
  };
}

const DIGITS = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i };
export function parseBase(text, base) {
  let s = String(text).trim().replace(/[\s_,]/g, '');
  let neg = false;
  if (s.startsWith('-') || s.startsWith('−')) { neg = true; s = s.slice(1); }
  if (base === 16) s = s.replace(/^0x/i, '');
  if (base === 2) s = s.replace(/^0b/i, '');
  if (!s || !DIGITS[base].test(s)) throw new Error(`Not a valid base-${base} whole number`);
  let v = 0n;
  const B = BigInt(base);
  for (const ch of s.toLowerCase()) v = v * B + BigInt(parseInt(ch, 16));
  return neg ? -v : v;
}
export function toBase(v, base) {
  const big = typeof v === 'bigint' ? v : BigInt(v);
  const s = (big < 0n ? -big : big).toString(base).toUpperCase();
  const grouped = base === 2 ? s.replace(/\B(?=(\d{4})+(?!\d))/g, ' ') : base === 10 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : s;
  return (big < 0n ? '−' : '') + grouped;
}
