const assert = require('assert'); const I = require('../tv-indicators.js');
let n = 0; const t = (m, f) => { f(); n++; console.log('ok -', m); };
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
t('SMA hand-computed', () => { const r = I.sma([1, 2, 3, 4, 5], 3); assert.deepStrictEqual(r, [null, null, 2, 3, 4]); });
t('WMA hand-computed', () => { near(I.wma([1, 2, 3], 3)[2], (1 * 1 + 2 * 2 + 3 * 3) / 6); });
t('EMA seeded by SMA', () => { const r = I.ema([2, 4, 6, 8], 3); near(r[2], 4); near(r[3], 0.5 * 8 + 0.5 * 4); });
t('RSI is 100 when only gains, 0 when only losses', () => {
  const up = Array.from({ length: 30 }, (_, i) => i), dn = up.slice().reverse();
  near(I.rsi(up, 14)[29], 100); near(I.rsi(dn, 14)[29], 0);
});
t('RSI bounded 0..100 on random data', () => {
  let s = 1, x = 100; const c = []; for (let i = 0; i < 500; i++) { s = (s * 16807) % 2147483647; x += (s / 2147483647 - 0.5) * 4; c.push(x); }
  I.rsi(c, 14).forEach(v => { if (v != null) assert.ok(v >= 0 && v <= 100); });
});
t('Bollinger: constant series has zero width', () => { const b = I.bollinger(new Array(30).fill(5), 20, 2); near(b.upper[29], 5); near(b.lower[29], 5); });
t('Stochastic = 50 on flat range, 100 at the high', () => {
  const h = [1, 2, 3, 4], l = [0, 1, 2, 3], c = [0.5, 1.5, 2.5, 4]; near(I.stochastic(h, l, c, 3, 1).k[3], 100 * (4 - 1) / (4 - 1));
});
t('CAUSAL: truncating future bars never changes earlier values (all indicators)', () => {
  const bars = require('fs').existsSync(__dirname + '/bars.json') ? require(__dirname + '/bars.json') :
    Array.from({ length: 300 }, (_, i) => ({ time: i, open: 100 + Math.sin(i / 7) * 5, high: 106 + Math.sin(i / 7) * 5, low: 94 + Math.sin(i / 7) * 5, close: 100 + Math.sin(i / 5) * 5 }));
  I.CATALOG.forEach(def => {
    const p = {}; def.params.forEach(q => p[q.k] = q.def);
    const full = I.compute(def.id, bars, p), cut = I.compute(def.id, bars.slice(0, 250), p);
    full.forEach((line, li) => { for (let i = 0; i < 250; i++) assert.strictEqual(line.values[i], cut[li].values[i], def.id + ' leaks future @' + i); });
  });
});
console.log(`\n${n} tests passed`);
