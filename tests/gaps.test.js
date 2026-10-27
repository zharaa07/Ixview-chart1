const assert = require('assert'); const G = require('../tv-gaps.js'); let n = 0; const t = (m, f) => { f(); n++; console.log('ok -', m); };
t('no gap → no filler', () => assert.deepStrictEqual(G.gapTimes([0, 60, 120, 180], 60), []));
t('one missing minute → exactly that time', () => assert.deepStrictEqual(G.gapTimes([0, 60, 180, 240], 60), [120]));
t('three missing minutes', () => assert.deepStrictEqual(G.gapTimes([0, 300], 60), [60, 120, 180, 240]));
t('filler never includes existing candle times or times after the last candle', () => { const ts = [0, 60, 300, 360]; const g = G.gapTimes(ts, 60); assert.ok(g.every(x => !ts.includes(x))); assert.ok(g.every(x => x < ts[ts.length - 1])); assert.deepStrictEqual(g, [120, 180, 240]); });
t('weekend-sized gap on M1 (48h) = 2879 filler bars', () => assert.strictEqual(G.gapTimes([0, 48 * 3600], 60).length, 2879));
t('hourly step: weekend 48h gap = 47 filler bars', () => assert.strictEqual(G.gapTimes([0, 48 * 3600], 3600).length, 47));
t('daily step: Fri→Mon = 2 filler days', () => assert.deepStrictEqual(G.gapTimes([0, 3 * 86400], 86400), [86400, 2 * 86400]));
t('cap protects against huge gaps', () => assert.strictEqual(G.gapTimes([0, 1e9], 60).length, G.MAX_GAP_BARS));
t('non-multiple gap does not overshoot the next candle', () => { const g = G.gapTimes([0, 150], 60); assert.deepStrictEqual(g, [60, 120]); });
t('invalid step (weekly/monthly or 0) → no filler', () => { assert.deepStrictEqual(G.gapTimes([0, 999], 0), []); assert.deepStrictEqual(G.gapTimes([], 60), []); assert.deepStrictEqual(G.gapTimes([5], 60), []); });
t('input is not mutated', () => { const a = [0, 180]; G.gapTimes(a, 60); assert.deepStrictEqual(a, [0, 180]); });
if (require('fs').existsSync(process.env.XAU_CSV || '/tmp/xau2019.csv')) t('REAL FILE: filler count equals missing minutes computed independently', () => {
  const I = require('../tv-data-import.js'); const c = I.parseCSV(require('fs').readFileSync(process.env.XAU_CSV || '/tmp/xau2019.csv', 'utf8')).candles;
  let missing = 0, capped = 0; for (let i = 1; i < c.length; i++) { const d = c[i].time - c[i - 1].time; if (d > 60) { const m = d / 60 - 1; missing += Math.min(m, G.MAX_GAP_BARS); if (m > G.MAX_GAP_BARS) capped++; } }
  const g = G.gapTimes(c.map(x => x.time), 60); assert.strictEqual(g.length, missing); const set = new Set(c.map(x => x.time)); assert.ok(g.every(x => !set.has(x)));
  console.log('   candles', c.length, 'filler', g.length, 'capped gaps', capped);
});
console.log(`\n${n} tests passed`);
