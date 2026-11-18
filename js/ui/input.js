// Expression input made of "pieces" so backspace removes whole tokens like "sin(".
export class ExprInput {
  constructor(onChange) { this.pieces = []; this.onChange = onChange || (() => {}); this.fresh = false; }
  text() { return this.pieces.join(''); }
  set(text) { this.pieces = text ? [...String(text)] : []; this.onChange(); }
  clear() { this.pieces = []; this.fresh = false; this.onChange(); }
  back() { this.pieces.pop(); this.fresh = false; this.onChange(); }
  push(p, { startsValue = false } = {}) {
    // After "=", typing a digit starts a new calculation; an operator continues from the result.
    if (this.fresh && startsValue) this.pieces = [];
    this.fresh = false;
    this.pieces.push(p);
    this.onChange();
  }
  pushResult(value) { this.pieces = [...String(value)]; this.fresh = true; this.onChange(); }
  balance() {
    let b = 0;
    for (const c of this.text()) { if (c === '(') b++; else if (c === ')') b--; }
    return b;
  }
  smartParen() {
    const last = this.pieces[this.pieces.length - 1] || '';
    const opens = this.balance();
    if (opens > 0 && /[\d)πe!%²³.]$/.test(last)) this.push(')');
    else this.push('(', { startsValue: true });
  }
  toggleSign() {
    let i = this.pieces.length - 1;
    while (i >= 0 && /^[\d.E]$/.test(this.pieces[i])) i--;
    const numStart = i + 1;
    if (numStart >= this.pieces.length) { this.push('−', { startsValue: true }); return; }
    if (this.pieces[i] === '−' && (i === 0 || /[+−×÷(^]$/.test(this.pieces[i - 1]))) this.pieces.splice(i, 1);
    else this.pieces.splice(numStart, 0, '−');
    this.fresh = false;
    this.onChange();
  }
}
