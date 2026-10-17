const assert = require('assert'); const C = require('../tv-compare.js');
let n = 0; const t = (m, f) => { f(); n++; console.log('ok -', m); };
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
const S = (times, vals) => times.map((x, i) => ({ time: x, value: vals[i] }));
t('firstCommon: exact timestamp match only, honours the lower bound', () => {
  assert.strictEqual(C.firstCommon([10, 20, 30, 40], [20, 30, 45], 0), 20); assert.strictEqual(C.firstCommon([10, 20, 30, 40], [20, 30, 45], 25), 30);
  assert.strictEqual(C.firstCommon([10, 20], [11, 21], 0), null); // أوقات متقاربة لا تُطابَق
});
t('firstCommonAll: intersection of several series, lower bound respected, null when empty', () => {
  assert.strictEqual(C.firstCommonAll([[1, 2, 3, 4], [2, 3, 4], [3, 4, 9]], 0), 3); assert.strictEqual(C.firstCommonAll([[1, 2, 3, 4], [2, 3, 4], [3, 4, 9]], 4), 4);
  assert.strictEqual(C.firstCommonAll([[1, 2], [3, 4]], 0), null); assert.strictEqual(C.firstCommonAll([], 0), null); assert.strictEqual(C.firstCommonAll([[5, 6]], 0), 5);
});
t('coverage: different start/end dates → overlap window and match ratio', () => {
  const c = C.coverage([10, 20, 30, 40, 50], [30, 40, 50, 60, 70]); assert.strictEqual(c.overlapFrom, 30); assert.strictEqual(c.overlapTo, 50); assert.strictEqual(c.common, 3); assert.strictEqual(c.mainBarsInOtherRange, 3); near(c.matchRatio, 1);
});
t('coverage: missing timestamps lower the match ratio, none are invented', () => {
  const c = C.coverage([10, 20, 30, 40], [10, 40]); assert.strictEqual(c.common, 2); near(c.matchRatio, 0.5);
});
t('coverage: no overlap is reported explicitly', () => { const c = C.coverage([10, 20], [30, 40]); assert.strictEqual(c.overlap, false); assert.strictEqual(c.common, 0); });
t('coverage: empty inputs are safe', () => { assert.strictEqual(C.coverage([], [1]).overlap, false); assert.strictEqual(C.coverage([1], []).overlap, false); });
t('percent: 0% at baseline; 110 vs base 100 = +10%; 90 = −10%', () => {
  const r = C.rebase(S([1, 2, 3], [100, 110, 90]), 'percent', 1); near(r[0].value, 0); near(r[1].value, 10); near(r[2].value, -10);
});
t('index100: 100 at baseline; 110 → 110; 50 → 50', () => { const r = C.rebase(S([1, 2, 3], [100, 110, 50]), 'index100', 1); near(r[0].value, 100); near(r[1].value, 110); near(r[2].value, 50); });
t('instruments with different scales are comparable (gold 1900 vs EURUSD 1.10)', () => {
  const g = C.rebase(S([1, 2], [1900, 1995]), 'percent', 1), e = C.rebase(S([1, 2], [1.10, 1.155]), 'percent', 1);
  near(g[1].value, 5); near(e[1].value, 5); // كلاهما +5%
});
t('baseline taken at a later common time (not the first bar of each series)', () => {
  const main = S([1, 2, 3, 4], [100, 102, 104, 106]), other = S([2, 3, 4], [50, 55, 60]); const bt = C.firstCommon(main.map(p => p.time), other.map(p => p.time), 0); assert.strictEqual(bt, 2);
  near(C.rebase(main, 'percent', bt)[3].value, (106 / 102 - 1) * 100); near(C.rebase(other, 'percent', bt)[2].value, 20);
});
t('missing baseline or zero baseline → empty (no fabricated values)', () => {
  assert.deepStrictEqual(C.rebase(S([1, 2], [100, 110]), 'percent', 5), []); assert.deepStrictEqual(C.rebase(S([1, 2], [0, 110]), 'index100', 1), []);
});
t('rebase never mutates the source and preserves timestamps/length', () => {
  const src = S([1, 2, 3], [100, 110, 90]), snap = JSON.stringify(src); const r = C.rebase(src, 'index100', 1); assert.strictEqual(JSON.stringify(src), snap); assert.deepStrictEqual(r.map(p => p.time), [1, 2, 3]);
});
t('rebase rejects unknown mode', () => { assert.throws(() => C.rebase(S([1], [1]), 'weird', 1)); });
t('valueAtOrBefore: within tolerance returns the bar, beyond returns null (no stale values)', () => {
  const s = S([100, 160, 400], [1, 2, 3]); assert.strictEqual(C.valueAtOrBefore(s, 160, 60).value, 2); assert.strictEqual(C.valueAtOrBefore(s, 200, 60).value, 2); assert.strictEqual(C.valueAtOrBefore(s, 300, 60), null); assert.strictEqual(C.valueAtOrBefore(s, 50, 60), null); assert.strictEqual(C.valueAtOrBefore(s, 999, 60), null);
});
t('medianRatio flags materially different price ranges', () => { assert.ok(C.medianRatio(S([1, 2], [1900, 1905]), S([1, 2], [1.1, 1.11])) > 1000); assert.ok(C.medianRatio(S([1], [100]), S([1], [105])) < 1.2); assert.strictEqual(C.medianRatio([], S([1], [1])), null); });
if (require('fs').existsSync(process.env.XAU_CSV || '/tmp/xau2019.csv')) t('REAL DATA: XAUUSD vs a derived series — percent baseline and alignment on 1h bars', () => {
  const I = require('../tv-data-import.js'), A = require('../tv-aggregate.js'); const h = A.aggregate(I.parseCSV(require('fs').readFileSync(process.env.XAU_CSV || '/tmp/xau2019.csv', 'utf8')).candles, 60, 60);
  const main = h.map(b => ({ time: b.time, value: b.close })); const other = main.filter((_, i) => i % 3 !== 1).map(p => ({ time: p.time, value: p.value / 1000 })); // نفس السلوك مع ثقوب وبمقياس مختلف
  const cov = C.coverage(main.map(p => p.time), other.map(p => p.time)); assert.ok(cov.overlap && cov.matchRatio > 0.6 && cov.matchRatio < 0.7);
  const bt = C.firstCommon(main.map(p => p.time), other.map(p => p.time), main[100].time); const a = C.rebase(main, 'percent', bt), b = C.rebase(other, 'percent', bt);
  const t0 = main.findIndex(p => p.time === bt); near(a[t0].value, 0); near(b.find(p => p.time === bt).value, 0);
  const tt = other[500].time; near(a.find(p => p.time === tt).value, b.find(p => p.time === tt).value, 1e-9); // نفس الحركة النسبية رغم اختلاف المقياس 1000×
  console.log('   bars', main.length, 'matchRatio', cov.matchRatio.toFixed(3));
});
console.log(`\n${n} tests passed`);
