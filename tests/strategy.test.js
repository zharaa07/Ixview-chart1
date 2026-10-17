const assert = require('assert'); const S = require('../tv-strategy.js');
let n = 0; const t = (m, f) => { f(); n++; console.log('ok -', m); };
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
const T0 = Date.UTC(2024, 0, 8, 10, 0) / 1000;
const B = (i, o, h, l, c) => ({ time: T0 + i * 60, open: o, high: h, low: l, close: c, volume: 0 });
const sig = map => (i) => map[i] || {};
const run = (bars, signals, extra) => S.run(Object.assign({ bars, strategy: { type: 'custom', signalFn: sig(signals) }, account: { lotSize: 1 }, risk: { sizing: 'fixed', lots: 1, slMode: 'points', slValue: 2, tpR: 2 } }, extra || {}));
const base = [B(0, 100, 100, 100, 100), B(1, 100, 101, 99, 100), B(2, 100, 101, 99.5, 100.5), B(3, 100.5, 104.5, 100, 104), B(4, 104, 105, 103, 103)];

t('long: decision at close of bar 1, fills at open of bar 2, TP hit at 104 → net 4, R=2', () => {
  const r = run(base, { 1: { enterLong: true } }); assert.ok(r.ok); assert.strictEqual(r.trades.length, 1); const x = r.trades[0];
  assert.strictEqual(x.entryTime, base[2].time); near(x.entry, 100); near(x.exit, 104); assert.strictEqual(x.reason, 'tp'); near(x.net, 4); near(x.r, 2); assert.strictEqual(x.bars, 1);
});
t('costs: spread 0.5 + commission 2/lot reduce net exactly (3.5 gross − 2 = 1.5)', () => {
  const r = run(base, { 1: { enterLong: true } }, { account: { lotSize: 1, spread: 0.5, commissionPerLot: 2 } }); near(r.trades[0].entry, 100.5); near(r.trades[0].gross, 3.5); near(r.trades[0].net, 1.5);
});
t('costs default to zero (no hidden commission)', () => { const r = run(base, { 1: { enterLong: true } }); near(r.trades[0].commission, 0); near(r.trades[0].gross, r.trades[0].net); });
t('same-bar SL and TP → stop assumed first (net −2)', () => {
  const bars = base.slice(); bars[3] = B(3, 100.5, 105, 97, 100); const r = run(bars, { 1: { enterLong: true } }); assert.strictEqual(r.trades[0].reason, 'sl'); near(r.trades[0].net, -2);
});
t('short mirrors: TP 96 hit at the low', () => {
  const bars = [B(0, 100, 100, 100, 100), B(1, 100, 101, 99, 100), B(2, 100, 100.5, 99, 99.5), B(3, 99.5, 100, 95, 96), B(4, 96, 97, 95, 96)];
  const r = run(bars, { 1: { enterShort: true } }); near(r.trades[0].entry, 100); near(r.trades[0].exit, 96); near(r.trades[0].net, 4); assert.strictEqual(r.trades[0].side, 'short');
});
t('risk sizing: 1% of 10,000 with 10-point stop and lotSize 100 → 0.1 lots, SL loses exactly 100', () => {
  const bars = [B(0, 100, 100, 100, 100), B(1, 100, 101, 99, 100), B(2, 100, 100, 99, 99.5), B(3, 99.5, 100, 89, 90), B(4, 90, 91, 89, 90)];
  const r = S.run({ bars, strategy: { type: 'custom', signalFn: sig({ 1: { enterLong: true } }) }, account: { lotSize: 100, balance: 10000 }, risk: { sizing: 'risk', riskPct: 1, slMode: 'points', slValue: 10, tpR: 0 } });
  near(r.trades[0].qty, 0.1); near(r.trades[0].net, -100); near(r.trades[0].r, -1);
});
t('signal exit closes at NEXT open with reason signal', () => {
  const bars = [B(0, 100, 100, 100, 100), B(1, 100, 101, 99, 100), B(2, 100, 101, 99.5, 100.5), B(3, 100.5, 101, 100, 101), B(4, 103, 104, 102, 103), B(5, 103, 103, 103, 103)];
  const r = S.run({ bars, strategy: { type: 'custom', signalFn: sig({ 1: { enterLong: true }, 3: { exitLong: true } }) }, account: { lotSize: 1 }, risk: { sizing: 'fixed', lots: 1 } });
  near(r.trades[0].exit, 103); assert.strictEqual(r.trades[0].reason, 'signal'); assert.strictEqual(r.trades[0].exitTime, bars[4].time); near(r.trades[0].net, 3);
});
t('open position at data end is closed at last close with reason end_of_data', () => {
  const bars = [B(0, 100, 100, 100, 100), B(1, 100, 101, 99, 100), B(2, 100, 101, 99.5, 100.5), B(3, 100.5, 102, 100, 101.5)];
  const r = S.run({ bars, strategy: { type: 'custom', signalFn: sig({ 1: { enterLong: true } }) }, account: { lotSize: 1 }, risk: { sizing: 'fixed', lots: 1 } });
  assert.strictEqual(r.trades[0].reason, 'end_of_data'); near(r.trades[0].exit, 101.5);
});
t('no signal is acted on at the last bar (no future bar to fill on)', () => {
  const bars = [B(0, 100, 100, 100, 100), B(1, 100, 100, 100, 100), B(2, 100, 100, 100, 100)];
  assert.strictEqual(S.run({ bars, strategy: { type: 'custom', signalFn: sig({ 2: { enterLong: true } }) }, account: { lotSize: 1 }, risk: { sizing: 'fixed', lots: 1 } }).trades.length, 0);
});
t('reverse: exit+opposite entry at same bar closes then opens', () => {
  const bars = [B(0, 100, 100, 100, 100), B(1, 100, 100, 100, 100), B(2, 100, 100, 100, 100), B(3, 101, 101, 101, 101), B(4, 102, 102, 102, 102), B(5, 102, 102, 102, 102)];
  const r = S.run({ bars, strategy: { type: 'custom', signalFn: sig({ 1: { enterLong: true }, 3: { exitLong: true, enterShort: true } }) }, account: { lotSize: 1 }, risk: { sizing: 'fixed', lots: 1 } });
  assert.strictEqual(r.trades.length, 2); assert.strictEqual(r.trades[0].side, 'long'); assert.strictEqual(r.trades[1].side, 'short'); assert.strictEqual(r.trades[0].exitTime, r.trades[1].entryTime);
});
t('direction=long ignores short signals', () => { const r = run(base, { 1: { enterShort: true } }, { direction: 'long' }); assert.strictEqual(r.trades.length, 0); });
t('insufficient margin is counted as rejected, not silently dropped', () => {
  const r = S.run({ bars: base, strategy: { type: 'custom', signalFn: sig({ 1: { enterLong: true } }) }, account: { lotSize: 100000, balance: 100, leverage: 1 }, risk: { sizing: 'fixed', lots: 1 } }); assert.strictEqual(r.trades.length, 0); assert.strictEqual(r.rejectedOrders, 1);
});
t('date window: signals before `from` are ignored, equity curve starts at `from`', () => {
  const r = run(base, { 1: { enterLong: true } }, { from: base[3].time }); assert.strictEqual(r.trades.length, 0); assert.strictEqual(r.equity[0].time, base[3].time);
});
t('metrics hand-checked: 2 wins/3 losses, PF 1.5, DD 20 (18.18%), streaks', () => {
  const m = S.computeMetrics([10, -5, -5, 20, -10].map(x => ({ net: x, commission: 0, swap: 0, bars: 1 })), [100, 110, 90, 95, 120, 100].map((e, i) => ({ time: i, equity: e })), 100);
  assert.strictEqual(m.wins, 2); assert.strictEqual(m.losses, 3); near(m.winRate, 40); near(m.grossProfit, 30); near(m.grossLoss, 20); near(m.profitFactor, 1.5); near(m.expectancy, 2); near(m.netProfit, 10);
  near(m.maxDrawdown, 20); near(m.maxDrawdownPct, 20 / 110 * 100, 1e-9); assert.strictEqual(m.maxConsecutiveLosses, 2); assert.strictEqual(m.maxConsecutiveWins, 1); near(m.returnPct, 0);
});
t('metrics with no trades: null ratios, no NaN', () => { const m = S.computeMetrics([], [{ time: 0, equity: 100 }], 100); assert.strictEqual(m.winRate, null); assert.strictEqual(m.profitFactor, null); assert.strictEqual(m.maxDrawdown, 0); });
t('config validation reports readable errors', () => {
  const bars = base;
  assert.ok(S.run({ bars, strategy: { type: 'macross', params: { fast: 30, slow: 10, maType: 0 } } }).errors.length > 0);
  assert.ok(S.run({ bars, strategy: { type: 'custom', signalFn: sig({}) }, risk: { sizing: 'risk', slMode: 'none' } }).errors.some(e => e.includes('وقف')));
  assert.ok(S.run({ bars, strategy: { type: 'custom', signalFn: sig({}) }, risk: { sizing: 'fixed', lots: 0 } }).errors.length > 0);
  assert.strictEqual(S.run({ bars, strategy: { type: 'nope' } }).ok, false); assert.strictEqual(S.run({ bars: [], strategy: { type: 'macross', params: {} } }).ok, false);
});
// بيانات اصطناعية حتمية للاختبارات البنيوية (ليست نتائج تُعرض للمستخدم)
function walk(N) { let s = 12345, x = 1900; const out = []; for (let i = 0; i < N; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; const r = (s / 0x7fffffff - 0.5) * 6; const o = x; x += r; out.push({ time: T0 + i * 60, open: o, high: Math.max(o, x) + 0.5, low: Math.min(o, x) - 0.5, close: x, volume: 0 }); } return out; }
const STRATS = [{ type: 'macross', params: { fast: 8, slow: 21, maType: 0 } }, { type: 'macross', params: { fast: 8, slow: 21, maType: 1 } }, { type: 'rsi', params: { length: 14, oversold: 30, overbought: 70 } }];
STRATS.forEach(st => t('NO LOOK-AHEAD: ' + st.type + JSON.stringify(st.params) + ' — truncating future bars never changes earlier entries', () => {
  const bars = walk(3000), cut = 2000; const mkc = b => ({ bars: b, strategy: st, account: { lotSize: 100 }, risk: { sizing: 'risk', riskPct: 1, slMode: 'atr', slValue: 2, atrLen: 14, tpR: 2 } });
  const full = S.run(mkc(bars)), part = S.run(mkc(bars.slice(0, cut))); assert.ok(full.ok && part.ok);
  const key = x => [x.entryTime, x.side, x.entry, x.qty].join('|'), lim = bars[cut - 1].time;
  const a = full.trades.filter(x => x.entryTime <= lim).map(key), b = part.trades.filter(x => x.entryTime <= lim).map(key); assert.deepStrictEqual(a, b); assert.ok(a.length > 3, 'strategy produced too few trades to be meaningful: ' + a.length);
}));
t('deterministic: same data+settings → identical results and hash; hash changes with params', () => {
  const bars = walk(1500), cfg = () => ({ bars, strategy: { type: 'macross', params: { fast: 8, slow: 21, maType: 0 } }, risk: { sizing: 'fixed', lots: 0.1 } });
  const a = S.run(cfg()), b = S.run(cfg()); assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  const c = S.run(Object.assign(cfg(), { strategy: { type: 'macross', params: { fast: 9, slow: 21, maType: 0 } } })); assert.notStrictEqual(a.fingerprint.hash, c.fingerprint.hash);
});
t('single position at a time; trades never overlap', () => {
  const r = S.run({ bars: walk(3000), strategy: STRATS[0], risk: { sizing: 'fixed', lots: 0.1 } }); for (let i = 1; i < r.trades.length; i++) assert.ok(r.trades[i].entryTime >= r.trades[i - 1].exitTime);
});
t('accounting reconciles: initial + Σnet = final equity (spread+swap, zero commission)', () => {
  const r = S.run({ bars: walk(3000), strategy: STRATS[0], account: { lotSize: 100, spread: 0.3, swapLong: -1, swapShort: 0.5, commissionPerLot: 0 }, risk: { sizing: 'fixed', lots: 0.5 } });
  const sum = r.trades.reduce((s, x) => s + x.net, 0); near(r.metrics.initialBalance + sum, r.metrics.finalEquity, 1e-6); near(r.metrics.netProfit, sum);
});
t('CSV export has one row per trade with ISO UTC times', () => { const r = run(base, { 1: { enterLong: true } }); const csv = S.tradesToCSV(r.trades).split('\n'); assert.strictEqual(csv.length, 2); assert.ok(csv[1].includes('2024-01-08T10:02:00.000Z')); });
t('markers: entry and exit marker for each trade, sorted by time', () => { const r = run(base, { 1: { enterLong: true } }); assert.strictEqual(r.markers.length, 2); assert.ok(r.markers[0].time <= r.markers[1].time); });
const real = process.env.XAU_CSV || '/tmp/xau2019.csv';
if (require('fs').existsSync(real)) t('REAL DATA (XAUUSD 2019, 1h): strategies run, reconcile and are reproducible', () => {
  const I = require('../tv-data-import.js'), A = require('../tv-aggregate.js'); const h = A.aggregate(I.parseCSV(require('fs').readFileSync(real, 'utf8')).candles, 60, 60);
  [{ type: 'macross', params: { fast: 10, slow: 30, maType: 0 } }, { type: 'rsi', params: { length: 14, oversold: 30, overbought: 70 } }].forEach(st => {
    const cfg = { bars: h, strategy: st, account: { lotSize: 100, balance: 10000, leverage: 100, spread: 0.3, commissionPerLot: 0 }, risk: { sizing: 'risk', riskPct: 1, slMode: 'atr', slValue: 2, atrLen: 14, tpR: 2 } };
    const r = S.run(cfg), r2 = S.run(cfg); assert.ok(r.ok); assert.strictEqual(r.fingerprint.hash, r2.fingerprint.hash); assert.deepStrictEqual(r.metrics, r2.metrics);
    near(r.metrics.initialBalance + r.metrics.netProfit, r.metrics.finalEquity, 1e-6);
    for (let i = 1; i < r.trades.length; i++) assert.ok(r.trades[i].entryTime >= r.trades[i - 1].exitTime);
    const m = r.metrics; console.log('   ' + st.type + ': trades', m.trades, 'win%', m.winRate && m.winRate.toFixed(1), 'net', m.netProfit.toFixed(2), 'PF', m.profitFactor && m.profitFactor.toFixed(2), 'maxDD', m.maxDrawdown.toFixed(2), '(' + m.maxDrawdownPct.toFixed(1) + '%)', 'hash', r.fingerprint.hash);
  });
});
t('maxPositions=2: third same-side signal is ignored; exit signal closes both', () => {
  const bars = []; for (let i = 0; i < 10; i++) bars.push(B(i, 100 + i, 100 + i, 100 + i, 100 + i));
  const r = S.run({ bars, maxPositions: 2, strategy: { type: 'custom', signalFn: sig({ 1: { enterLong: true }, 2: { enterLong: true }, 3: { enterLong: true }, 6: { exitLong: true } }) }, account: { lotSize: 1 }, risk: { sizing: 'fixed', lots: 1 } });
  assert.strictEqual(r.trades.length, 2); assert.deepStrictEqual(r.trades.map(x => x.entryTime), [bars[2].time, bars[3].time]); assert.ok(r.trades.every(x => x.exitTime === bars[7].time && x.reason === 'signal')); assert.strictEqual(r.maxPositions, 2);
});
t('maxPositions default is 1 (same signals open one position only)', () => {
  const bars = []; for (let i = 0; i < 8; i++) bars.push(B(i, 100, 100, 100, 100));
  assert.strictEqual(S.run({ bars, strategy: { type: 'custom', signalFn: sig({ 1: { enterLong: true }, 2: { enterLong: true }, 3: { enterLong: true } }) }, account: { lotSize: 1 }, risk: { sizing: 'fixed', lots: 1 } }).trades.length, 1);
});
t('no hedging: opposite entry is skipped while another-side position is alive', () => {
  const bars = []; for (let i = 0; i < 8; i++) bars.push(B(i, 100, 100, 100, 100));
  const r = S.run({ bars, maxPositions: 3, strategy: { type: 'custom', signalFn: sig({ 1: { enterLong: true }, 3: { enterShort: true } }) }, account: { lotSize: 1 }, risk: { sizing: 'fixed', lots: 1 } });
  assert.strictEqual(r.trades.length, 1); assert.strictEqual(r.trades[0].side, 'long');
});
t('maxPositions validation', () => { assert.ok(S.run({ bars: base, maxPositions: 0, strategy: { type: 'custom', signalFn: sig({}) } }).errors.some(e => e.includes('متزامنة'))); assert.ok(S.run({ bars: base, maxPositions: 2.5, strategy: { type: 'custom', signalFn: sig({}) } }).errors.length > 0); });
t('maxPositions changes the fingerprint hash', () => { const a = run(base, { 1: { enterLong: true } }), b = run(base, { 1: { enterLong: true } }, { maxPositions: 2 }); assert.notStrictEqual(a.fingerprint.hash, b.fingerprint.hash); });
t('trade records decision time, SL and TP levels', () => {
  const r = run(base, { 1: { enterLong: true } }); const x = r.trades[0]; assert.strictEqual(x.decisionTime, base[1].time); assert.strictEqual(x.entryTime, base[2].time); near(x.sl, 98); near(x.tp, 104);
  const csv = S.tradesToCSV(r.trades).split('\n'); assert.ok(csv[0].includes('decision_time_utc') && csv[0].includes(',sl,tp,')); assert.ok(csv[1].includes('2024-01-08T10:01:00.000Z'));
});
t('data quality report: expected step, gap count and largest gap (gaps are reported, never filled)', () => {
  const bars = []; for (let i = 0; i < 100; i++) bars.push(B(i, 1, 1, 1, 1)); const gap = bars.slice(0, 50).concat(bars.slice(60).map(b => Object.assign({}, b, { time: b.time + 3 * 86400 }))); // فجوة 3 أيام + ساعتان تقريباً
  const q = S.dataQuality(gap); assert.strictEqual(q.expectedStepSec, 60); assert.strictEqual(q.gapCount, 1); assert.strictEqual(q.gapsOverOneDay, 1); assert.ok(q.largestGapSec > 3 * 86400);
  const r = S.run({ bars: gap, strategy: { type: 'custom', signalFn: sig({}) } }); assert.strictEqual(r.dataQuality.gapCount, 1); assert.strictEqual(S.dataQuality(bars).gapCount, 0);
});
t('long/short breakdown, duration and R statistics from hand-made trades', () => {
  const mk2 = (side, net, r, dur) => ({ side, net, r, commission: 0, swap: 0, bars: 1, entryTime: 0, exitTime: dur });
  const m = S.computeMetrics([mk2('long', 10, 2, 600), mk2('long', -5, -1, 300), mk2('short', 20, 4, 900), mk2('short', -10, null, 0)], [{ time: 0, equity: 100 }], 100);
  assert.strictEqual(m.bySide.long.trades, 2); near(m.bySide.long.netProfit, 5); near(m.bySide.long.winRate, 50); near(m.bySide.long.profitFactor, 2); assert.strictEqual(m.bySide.short.trades, 2); near(m.bySide.short.netProfit, 10); near(m.bySide.short.profitFactor, 2);
  near(m.avgDurationSec, 450); near(m.rStats.avgR, (2 - 1 + 4) / 3); assert.strictEqual(m.rStats.tradesWithR, 3); near(m.rStats.avgWinR, 3); near(m.rStats.avgLossR, -1); near(m.payoffRatio, (30 / 2) / (15 / 2));
});
(async () => {
  const bars = walk(9000), cfg = { bars, strategy: STRATS[0], risk: { sizing: 'fixed', lots: 0.1 } };
  const prog = []; const full = await S.runAsync(cfg, { onProgress: p => prog.push(p) });
  assert.ok(prog.length >= 3 && prog.every((p, i) => i === 0 || p >= prog[i - 1]) && prog[prog.length - 1] < 1); n++; console.log('ok - runAsync reports monotonic progress');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(full)), JSON.parse(JSON.stringify(S.run(cfg)))); n++; console.log('ok - runAsync result equals synchronous result');
  let calls = 0; const cancelled = await S.runAsync(cfg, { shouldStop: () => ++calls >= 2 }); assert.strictEqual(cancelled.cancelled, true); assert.strictEqual(cancelled.ok, false); n++; console.log('ok - runAsync can be cancelled (no partial results returned)');
  console.log(`\n${n} tests passed`);
})();
