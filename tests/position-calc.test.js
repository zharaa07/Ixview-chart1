const assert = require('assert');
const C = require('../tv-position-calc.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);

t('long R:R and ticks (XAU-like)', () => {
  const r = C.compute({ side:'long', entry:2000, stop:1990, target:2030, qty:1, lotSize:100, tickSize:0.01, leverage:100, accountSize:10000 });
  near(r.rr, 3); near(r.riskTicks, 1000); near(r.rewardTicks, 3000);
  near(r.riskAmount, 1000);   // 10 * 100 units
  near(r.rewardAmount, 3000);
  near(r.margin, 2000);       // 200000 / 100
  assert.ok(r.validDirection);
});
t('short direction validity', () => {
  const ok = C.compute({ side:'short', entry:100, stop:105, target:90, qty:1, lotSize:1 });
  assert.ok(ok.validDirection);
  const bad = C.compute({ side:'short', entry:100, stop:95, target:90, qty:1, lotSize:1 });
  assert.ok(!bad.validDirection);
});
t('sizeFromRisk floors so risk never exceeds target', () => {
  // risk $100 (1% of 10000), dist 10, lotSize 100 -> 0.1 lots
  near(C.sizeFromRisk({ entry:2000, stop:1990, accountSize:10000, riskPct:1, lotSize:100, qtyPrecision:2 }), 0.1);
  // dist 7 -> 100/(7*100)=0.142857 -> floor 0.14
  near(C.sizeFromRisk({ entry:2000, stop:1993, accountSize:10000, riskPct:1, lotSize:100, qtyPrecision:2 }), 0.14);
  const q = C.sizeFromRisk({ entry:2000, stop:1993, accountSize:10000, riskPct:1, lotSize:100, qtyPrecision:2 });
  assert.ok(q * 7 * 100 <= 100);
});
t('sizeFromRisk returns 0 for invalid input', () => {
  assert.strictEqual(C.sizeFromRisk({ entry:100, stop:100, accountSize:1000, riskPct:1, lotSize:1 }), 0);
  assert.strictEqual(C.sizeFromRisk({ entry:100, stop:99, accountSize:0, riskPct:1, lotSize:1 }), 0);
});
t('open PnL long and short', () => {
  near(C.compute({ side:'long', entry:100, stop:95, target:110, qty:2, lotSize:1, currentPrice:103 }).openPnl, 6);
  near(C.compute({ side:'short', entry:100, stop:105, target:90, qty:2, lotSize:1, currentPrice:103 }).openPnl, -6);
});
t('RR lock moves target when stop moves (long/short)', () => {
  const l = C.applyRRLock({ side:'long', entry:100, stop:98, target:110 }, 'stop', 3);
  near(l.target, 106);
  const s = C.applyRRLock({ side:'short', entry:100, stop:102, target:90 }, 'stop', 3);
  near(s.target, 94);
});
t('RR lock moves stop when target moves', () => {
  const l = C.applyRRLock({ side:'long', entry:100, stop:95, target:106 }, 'target', 3);
  near(l.stop, 98);
});
t('margin warning when exceeding account', () => {
  const r = C.compute({ side:'long', entry:2000, stop:1990, target:2030, qty:10, lotSize:100, leverage:10, accountSize:10000 });
  assert.ok(r.marginExceedsAccount); // 2,000,000/10 = 200,000 > 10,000
});
t('priceFromTicks round trip', () => {
  near(C.priceFromTicks(2000, 50, 0.01, -1), 1999.5);
  near(C.ticksBetween(2000, 1999.5, 0.01), 50);
});
t('roundToTick removes float noise and snaps to tick', () => {
  near(C.roundToTick(2000.0999999999, 0.01), 2000.1); near(C.roundToTick(1.123456, 0.0001), 1.1235);
  near(C.roundToTick(C.priceFromTicks(2000, 3, 0.01, -1), 0.01), 1999.97);
});
console.log(`\n${n} tests passed`);
