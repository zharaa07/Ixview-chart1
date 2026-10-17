const assert = require('assert'); const A = require('../tv-aggregate.js');
let n = 0; const t = (m, f) => { f(); n++; console.log('ok -', m); };
const U = (d, h, m) => Date.UTC(2024, 0, d, h, m) / 1000;
const mk = (time, o, h, l, c, v) => ({ time, open: o, high: h, low: l, close: c, volume: v || 0 });
t('5m: first open, max high, min low, last close, summed volume', () => {
  const bars = [mk(U(8, 10, 0), 1, 5, 0.5, 2, 10), mk(U(8, 10, 1), 2, 9, 1, 3, 20), mk(U(8, 10, 2), 3, 4, 0.2, 1, 30), mk(U(8, 10, 3), 1, 2, 0.8, 1.5, 40), mk(U(8, 10, 4), 1.5, 3, 1, 2.5, 50)];
  const r = A.aggregate(bars, 5); assert.strictEqual(r.length, 1);
  assert.deepStrictEqual([r[0].time, r[0].open, r[0].high, r[0].low, r[0].close, r[0].volume], [U(8, 10, 0), 1, 9, 0.2, 2.5, 150]); assert.strictEqual(r[0].partial, false);
});
t('no invented candles for gaps: empty buckets are skipped', () => {
  const r = A.aggregate([mk(U(8, 10, 0), 1, 1, 1, 1), mk(U(8, 12, 0), 2, 2, 2, 2)], 15); assert.deepStrictEqual(r.map(c => c.time), [U(8, 10, 0), U(8, 12, 0)]);
});
t('volume stays 0 when source has none (not fabricated)', () => { const r = A.aggregate([mk(U(8, 10, 0), 1, 2, 1, 1), mk(U(8, 10, 1), 1, 2, 1, 1)], 5); assert.strictEqual(r[0].volume, 0); });
t('incomplete last interval is flagged partial', () => {
  const r = A.aggregate([mk(U(8, 10, 0), 1, 1, 1, 1), mk(U(8, 10, 1), 1, 1, 1, 1)], 5); assert.strictEqual(r[0].partial, true);
  const r2 = A.aggregate([mk(U(8, 10, 0), 1, 1, 1, 1), mk(U(8, 10, 4), 1, 1, 1, 1)], 5); assert.strictEqual(r2[0].partial, false);
});
t('1h and 4h buckets align to UTC multiples', () => {
  const bars = []; for (let m = 0; m < 600; m++) bars.push(mk(U(8, 0, 0) + m * 60, 1, 1, 1, 1));
  assert.ok(A.aggregate(bars, 60).every(c => c.time % 3600 === 0)); assert.ok(A.aggregate(bars, 240).every(c => c.time % 14400 === 0));
});
t('daily buckets split at UTC midnight', () => {
  const r = A.aggregate([mk(U(8, 23, 59), 1, 1, 1, 1), mk(U(9, 0, 0), 2, 2, 2, 2)], 1440); assert.deepStrictEqual(r.map(c => c.time), [U(8, 0, 0), U(9, 0, 0)]);
});
t('weekly buckets start on Monday; monthly on day 1', () => {
  const r = A.aggregate([mk(U(7, 12, 0), 1, 1, 1, 1), mk(U(8, 12, 0), 2, 2, 2, 2), mk(U(14, 12, 0), 3, 3, 3, 3)], 10080); // Sun Jan 7, Mon Jan 8, Sun Jan 14
  assert.deepStrictEqual(r.map(c => c.time), [U(1, 0, 0), U(8, 0, 0)]);
  const m = A.aggregate([mk(U(8, 12, 0), 1, 1, 1, 1), mk(Date.UTC(2024, 1, 3) / 1000, 2, 2, 2, 2)], 43200); assert.deepStrictEqual(m.map(c => c.time), [Date.UTC(2024, 0, 1) / 1000, Date.UTC(2024, 1, 1) / 1000]);
});
t('aggregation does not mutate the source dataset', () => {
  const bars = [mk(U(8, 10, 0), 1, 5, 0.5, 2), mk(U(8, 10, 1), 2, 9, 1, 3)]; const snap = JSON.stringify(bars); A.aggregate(bars, 5); assert.strictEqual(JSON.stringify(bars), snap);
});
t('15m aggregate of 5m source uses baseSec for partial detection', () => {
  const r = A.aggregate([mk(U(8, 10, 0), 1, 1, 1, 1), mk(U(8, 10, 5), 1, 1, 1, 1), mk(U(8, 10, 10), 1, 1, 1, 1)], 15, 300); assert.strictEqual(r[0].partial, false);
  const r2 = A.aggregate([mk(U(8, 10, 0), 1, 1, 1, 1), mk(U(8, 10, 5), 1, 1, 1, 1)], 15, 300); assert.strictEqual(r2[0].partial, true);
});
if (require('fs').existsSync(process.env.XAU_CSV || '/tmp/xau2019.csv')) t('REAL DATA: 1h from 2019 M1 keeps OHLC invariants and totals', () => {
  const I = require('../tv-data-import.js'); const r = I.parseCSV(require('fs').readFileSync(process.env.XAU_CSV || '/tmp/xau2019.csv', 'utf8')); const h = A.aggregate(r.candles, 60, 60);
  assert.ok(h.every(c => c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close)));
  assert.ok(h.every((c, i) => i === 0 || c.time > h[i - 1].time));
  const mx = a => a.reduce((m, x) => x > m ? x : m, -Infinity), mn = a => a.reduce((m, x) => x < m ? x : m, Infinity);
  assert.strictEqual(mx(h.map(c => c.high)), mx(r.candles.map(c => c.high))); assert.strictEqual(mn(h.map(c => c.low)), mn(r.candles.map(c => c.low)));
  assert.strictEqual(h[0].open, r.candles[0].open); assert.strictEqual(h[h.length - 1].close, r.candles[r.candles.length - 1].close);
  console.log('   M1', r.candles.length, '→ 1h', h.length, '| 4h', A.aggregate(r.candles, 240).length, '| D1', A.aggregate(r.candles, 1440).length);
});
console.log(`\n${n} tests passed`);
