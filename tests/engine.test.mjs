import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calc, CalcError } from '../js/engine/expr.js';
import { formatNumber, formatFtIn, parseLength } from '../js/engine/format.js';
import { dimEvaluate, formatQty } from '../js/engine/dim.js';
import { convert } from '../js/engine/units.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('basic arithmetic and precedence', () => {
  assert.equal(calc('12+4×3'), 24);
  assert.equal(calc('0.1+0.2'), 0.3);
  assert.equal(calc('-2^2'), -4);
  assert.equal(calc('2^-1'), 0.5);
  assert.equal(calc('2^3^2'), 512);
  assert.equal(calc('(1+2)(3+4)'), 21);
  assert.equal(calc('2π'), calc('2*pi'));
  assert.equal(calc('10÷4'), 2.5);
  assert.equal(calc('(2+3'), 5); // auto-close
});

test('calculator percent', () => {
  assert.equal(calc('200+10%'), 220);
  assert.equal(calc('200-10%'), 180);
  assert.equal(calc('200×10%'), 20);
  assert.equal(calc('50%'), 0.5);
});

test('scientific functions', () => {
  near(calc('sin(30)', { angle: 'deg' }), 0.5);
  assert.equal(calc('sin(180)', { angle: 'deg' }), 0);
  near(calc('cos(pi)', { angle: 'rad' }), -1);
  near(calc('asin(1)', { angle: 'deg' }), 90);
  near(calc('sin⁻¹(0.5)'), 30);
  assert.equal(calc('5!'), 120);
  near(calc('0.5!'), Math.sqrt(Math.PI) / 2, 1e-9);
  assert.equal(calc('nCr(5,2)'), 10);
  assert.equal(calc('nPr(5,2)'), 20);
  assert.equal(calc('log(1000)'), 3);
  near(calc('ln(e)'), 1);
  assert.equal(calc('√16+1'), 5);
  assert.equal(calc('root(27,3)'), 3);
  assert.equal(calc('root(-8,3)'), -2);
  assert.equal(calc('3²'), 9);
  near(calc('#c'), 299792458);
  assert.equal(calc('Ans×2', { ans: 21 }), 42);
  assert.equal(calc('x^2+3x', { x: 2 }), 10);
  assert.equal(calc('xsin(90)', { x: 3 }), 3);
  near(calc('tanh(0.5)'), Math.tanh(0.5));
});

test('errors are friendly', () => {
  assert.throws(() => calc('5/0'), CalcError);
  assert.throws(() => calc('ln(-1)'), CalcError);
  assert.throws(() => calc('foo(2)'), CalcError);
  assert.throws(() => calc('2+'), CalcError);
});

test('number format', () => {
  assert.equal(formatNumber(1234567.891), '1,234,567.891');
  assert.equal(formatNumber(-0.5), '−0.5');
  assert.equal(formatNumber(1 / 3), '0.3333333333');
  assert.equal(formatNumber(2e20), '2×10²⁰');
  assert.equal(formatNumber(1234.5, { sep: ' ' }), '1 234.5');
});

test('feet-inch formatting and parsing', () => {
  assert.equal(formatFtIn(150.375), `12' 6-3/8"`);
  assert.equal(formatFtIn(0.375), `3/8"`);
  assert.equal(formatFtIn(144), `12' 0"`);
  assert.equal(formatFtIn(10.03), `≈ 10"`);
  assert.equal(parseLength(`12' 6-3/8"`), 150.375);
  assert.equal(parseLength(`12'6"`), 150);
  assert.equal(parseLength('12 ft 6 in'), 150);
  assert.equal(parseLength('6 3/8'), 6.375);
  assert.equal(parseLength('12', 'ft'), 144);
  near(parseLength('1m'), 39.37007874, 1e-6);
  near(parseLength('450mm'), 17.71653543, 1e-6);
  assert.ok(Number.isNaN(parseLength('abc')));
  assert.equal(parseLength(`1"15/16`), 1.9375); // keypad order: inch mark then fraction
  assert.equal(parseLength(`9' 1"1/8`), 109.125);
});

test('dimension calculator', () => {
  assert.equal(dimEvaluate(`12' 6"+3' 6"`).v, 192);
  assert.deepEqual(dimEvaluate(`12'×10'`), { v: 144 * 120, p: 2 });
  assert.equal(formatQty(dimEvaluate(`12'×10'`)).main, '120 sq ft');
  assert.equal(dimEvaluate(`6 3⁄8"`).v, 6.375);
  assert.equal(dimEvaluate(`6" 3⁄8`).v, 6.375); // keypad order
  assert.equal(dimEvaluate(`12' 6" 3⁄8`).v, 150.375);
  assert.equal(dimEvaluate(`12'-6"`).v, 150); // carpenter notation 12'-6"
  assert.equal(dimEvaluate(`12' - 6"`).v, 138);
  assert.equal(dimEvaluate(`12'-3'`).v, 108); // minus
  assert.equal(dimEvaluate(`10'÷4`).v, 30);
  assert.equal(dimEvaluate(`63⁄8`).v, 7.875);
  assert.equal(dimEvaluate(`10 - 1⁄2`).v, 9.5);
  const vol = dimEvaluate(`20'×10'×4"`);
  assert.equal(vol.p, 3);
  assert.equal(formatQty(vol).extra[1], '2.47 cu yd');
  near(dimEvaluate('1m+500mm').v, 1500 / 25.4, 1e-9);
  assert.throws(() => dimEvaluate(`12'+6`), CalcError);
  assert.equal(formatQty(dimEvaluate(`25' 3-1/16"`.replace('/', '⁄'))).main, `25' 3-1/16"`);
});

test('unit conversion', () => {
  near(convert('Length', 1, 'ft', 'in'), 12);
  near(convert('Temperature', 100, '°C', '°F'), 212);
  near(convert('Temperature', -40, '°F', '°C'), -40);
  near(convert('Area', 1, 'acre', 'ft²'), 43560, 1e-6);
  near(convert('Volume', 1, 'yd³', 'ft³'), 27, 1e-9);
});

import { wordsToExpression as W } from '../js/engine/words.js';
import { quadratic, solveLinear, stats, parseBase, toBase } from '../js/engine/solve.js';
import * as C from '../js/engine/construction.js';

test('speech to calculator input', () => {
  assert.equal(W('twelve feet six and three eighths inches times four', 'dim'), `12' 6 3⁄8"×4`);
  assert.equal(W('eight feet one and a half inches', 'dim'), `8' 1 1⁄2"`);
  assert.equal(W('ten feet by twelve feet', 'dim'), `10'×12'`);
  assert.equal(W('two point five plus three'), '2.5+3');
  assert.equal(W('point seven five times eight'), '0.75×8');
  assert.equal(W('one hundred and five divided by five'), '105÷5');
  assert.equal(W('square root of sixteen plus two'), '√(16)+2');
  assert.equal(W('one thousand two hundred thirty four'), '1234');
  assert.equal(calc(W('two hundred plus ten percent')), 220);
  assert.equal(dimEvaluate(W('twelve feet six and three eighths inches times four', 'dim')).v, 150.375 * 4);
});

test('solvers, stats, bases', () => {
  assert.deepEqual(quadratic(1, -3, 2).roots, [1, 2]);
  assert.ok(quadratic(1, 0, 1).complex);
  assert.deepEqual(solveLinear([[2, 1], [1, -1]], [5, 1]), [2, 1]);
  assert.deepEqual(solveLinear([[1, 1, 1], [0, 2, 5], [2, 5, -1]], [6, -4, 27]), [5, 3, -2]);
  assert.throws(() => solveLinear([[1, 2], [2, 4]], [1, 2]));
  const s = stats([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(s.mean, 5); assert.equal(s.sdPop, 2); assert.deepEqual(s.mode, [4]);
  assert.equal(toBase(parseBase('ff', 16), 2), '1111 1111');
  assert.equal(toBase(parseBase('255', 10), 16), 'FF');
});

test('construction formulas', () => {
  const r = C.roof({ pitch: 12, span: 288, overhang: 0, ridge: 0 });
  near(r.angle, 45); near(r.rafter, 144 * Math.SQRT2, 1e-9);
  near(r.hip, 144 * Math.sqrt(3), 1e-9); // 12/12 hip = run × √(1+1+1)
  const st = C.stairs({ totalRise: 108, targetRise: 7.25, run: 10.25 });
  assert.equal(st.risers, 15); near(st.riseEach, 7.2); assert.equal(st.issues.length, 0);
  assert.ok(C.stairs({ totalRise: 108, targetRise: 7.25, run: 10.25, type: 'public' }).issues.some((m) => m.includes('280')));
  assert.equal(C.stairs({ totalRise: 108, targetRise: 9, run: 10.25 }).risers, 14); // 9" target forced under 200 mm
  assert.equal(C.boardFeet([{ qty: 10, t: 2, w: 10, lenFt: 12 }]).total, 200);
  near(C.concrete({ cuin: C.concreteVolume({ shape: 'slab', length: 240, width: 120, depth: 4 }) }).cuyd, 2.469, 1e-3);
  assert.equal(C.wall({ length: 144, spacing: 16 }).studs, 10);
  assert.equal(C.deck({ length: 192, width: 144 }).joists, 13);
  const t = C.rightTriangle({ a: 36, b: 48 });
  assert.equal(t.c, 60);
  assert.equal(C.sheets({ areaSqIn: 32 * 144 * 10, wastePct: 0 }).sheets, 10);
});
