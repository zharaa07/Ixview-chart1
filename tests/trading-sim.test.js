const assert = require('assert');
const { Sim } = require('../tv-trading-sim.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
const T0 = Date.UTC(2024, 0, 8, 10, 0) / 1000; // Monday 10:00 UTC
const bar = (i, o, h, l, c, t0 = T0) => ({ time: t0 + i * 60, open: o, high: h, low: l, close: c });
const mk = (cfg) => new Sim(Object.assign({ balance: 10000, leverage: 100, lotSize: 100, spread: 0, commissionPerLot: 0 }, cfg));

t('market order fills at NEXT bar open, not current close (no look-ahead)', () => {
  const s = mk(); s.onBar(bar(0, 100, 101, 99, 100));
  assert.ok(s.placeOrder({ type: 'market', side: 'long', qty: 1 }).ok);
  assert.strictEqual(s.positions.length, 0);
  s.onBar(bar(1, 102, 103, 101, 102));
  assert.strictEqual(s.positions.length, 1); near(s.positions[0].entry, 102);
});
t('spread: long buys at ask, closes at bid; short mirror', () => {
  const s = mk({ spread: 0.5 }); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'market', side: 'long', qty: 1 }); s.onBar(bar(1, 100, 100, 100, 100));
  near(s.positions[0].entry, 100.5);
  const r = s.closePosition(s.positions[0].id); near(r.trade.exit, 100); near(r.trade.gross, -50); // 0.5*100 units
  s.placeOrder({ type: 'market', side: 'short', qty: 1 }); s.onBar(bar(2, 100, 100, 100, 100));
  near(s.positions[0].entry, 100);
  const r2 = s.closePosition(s.positions[0].id); near(r2.trade.exit, 100.5); near(r2.trade.gross, -50);
});
t('commission is per round turn, half each side', () => {
  const s = mk({ commissionPerLot: 7 }); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'market', side: 'long', qty: 2 }); s.onBar(bar(1, 100, 100, 100, 100));
  near(s.balance, 10000 - 7); // open half = 7*2/2
  const r = s.closePosition(s.positions[0].id); near(r.trade.commission, 14); near(s.balance, 10000 - 14); near(r.trade.net, -14);
});
t('SL hit at level; TP hit at level', () => {
  let s = mk(); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'market', side: 'long', qty: 1, sl: 98, tp: 105 }); s.onBar(bar(1, 100, 101, 100, 100));
  s.onBar(bar(2, 100, 101, 97, 99)); assert.strictEqual(s.history[0].reason, 'sl'); near(s.history[0].exit, 98); near(s.history[0].gross, -200);
  s = mk(); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'market', side: 'long', qty: 1, sl: 98, tp: 105 }); s.onBar(bar(1, 100, 100, 100, 100));
  s.onBar(bar(2, 100, 106, 99, 105)); assert.strictEqual(s.history[0].reason, 'tp'); near(s.history[0].exit, 105);
});
t('gap through SL fills at open (worse than level)', () => {
  const s = mk(); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'market', side: 'long', qty: 1, sl: 98 }); s.onBar(bar(1, 100, 100, 100, 100));
  s.onBar(bar(2, 95, 96, 94, 95)); near(s.history[0].exit, 95); near(s.history[0].gross, -500);
});
t('gap through TP fills at open (better than level)', () => {
  const s = mk(); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'market', side: 'long', qty: 1, tp: 105 }); s.onBar(bar(1, 100, 100, 100, 100));
  s.onBar(bar(2, 108, 109, 107, 108)); near(s.history[0].exit, 108);
});
t('SL and TP in same bar -> SL assumed first', () => {
  const s = mk(); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'market', side: 'long', qty: 1, sl: 98, tp: 105 }); s.onBar(bar(1, 100, 100, 100, 100));
  s.onBar(bar(2, 100, 110, 90, 100)); assert.strictEqual(s.history[0].reason, 'sl');
});
t('short SL/TP use ask side (spread)', () => {
  const s = mk({ spread: 1 }); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'market', side: 'short', qty: 1, sl: 102, tp: 95 }); s.onBar(bar(1, 100, 100, 100, 100));
  s.onBar(bar(2, 100, 101.5, 99, 100)); // ask high = 102.5 >= 102 -> SL
  assert.strictEqual(s.history[0].reason, 'sl'); near(s.history[0].exit, 102);
});
t('buy limit: touch fills at limit; gap-down fills at open', () => {
  let s = mk(); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'limit', side: 'long', qty: 1, price: 98 }); s.onBar(bar(1, 100, 100, 97, 99));
  near(s.positions[0].entry, 98);
  s = mk(); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'limit', side: 'long', qty: 1, price: 98 }); s.onBar(bar(1, 96, 97, 95, 96));
  near(s.positions[0].entry, 96);
});
t('buy stop and sell stop trigger correctly', () => {
  let s = mk(); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'stop', side: 'long', qty: 1, price: 103 }); s.onBar(bar(1, 100, 104, 100, 103));
  near(s.positions[0].entry, 103);
  s = mk(); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'stop', side: 'short', qty: 1, price: 97 }); s.onBar(bar(1, 100, 100, 96, 97));
  near(s.positions[0].entry, 97);
});
t('pending order on wrong side of market is rejected', () => {
  const s = mk(); s.onBar(bar(0, 100, 100, 100, 100));
  assert.strictEqual(s.placeOrder({ type: 'limit', side: 'long', qty: 1, price: 105 }).error, 'pending_price_wrong_side_of_market');
  assert.strictEqual(s.placeOrder({ type: 'stop', side: 'long', qty: 1, price: 95 }).error, 'pending_price_wrong_side_of_market');
});
t('validation: bad qty, sl on wrong side', () => {
  const s = mk(); s.onBar(bar(0, 100, 100, 100, 100));
  assert.strictEqual(s.placeOrder({ type: 'market', side: 'long', qty: 0 }).error, 'invalid_qty');
  assert.strictEqual(s.placeOrder({ type: 'market', side: 'long', qty: 1, sl: 101 }).error, 'sl_must_be_below_entry');
  assert.strictEqual(s.placeOrder({ type: 'market', side: 'short', qty: 1, tp: 101 }).error, 'tp_must_be_below_entry');
});
t('insufficient margin rejects order', () => {
  const s = mk({ balance: 1000, leverage: 10, lotSize: 100 }); s.onBar(bar(0, 100, 100, 100, 100));
  // 1 lot = 100 units * 100 = 10000 notional / 10 = 1000 margin -> exactly allowed ; 1.01 lots rejected
  assert.ok(s.placeOrder({ type: 'market', side: 'long', qty: 1 }).ok);
  s.reset();
  s.onBar(bar(0, 100, 100, 100, 100));
  assert.strictEqual(s.placeOrder({ type: 'market', side: 'long', qty: 1.01 }).error, 'insufficient_margin');
});
t('equity/margin level reflect unrealized PnL', () => {
  const s = mk({ balance: 10000, leverage: 100 }); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'market', side: 'long', qty: 10 }); s.onBar(bar(1, 100, 100, 100, 100));
  near(s.usedMargin(), 1000 * 10 / 10 * 1 / 1 * 1 * 1 / 1); // 10 lots*100*100/100 = 1000
  s.onBar(bar(2, 100, 101, 100, 101)); near(s.equity(), 10000 + 1 * 1000);
  near(s.marginLevel(), 11000 / 1000 * 100);
});
t('stop-out closes the worst position when margin level <= 50%', () => {
  const s = mk({ balance: 2000, leverage: 100, lotSize: 100, stopOutLevel: 50 }); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'market', side: 'long', qty: 10 }); s.onBar(bar(1, 100, 100, 100, 100)); // margin 1000
  s.onBar(bar(2, 100, 100, 98.6, 98.6)); // equity 600 -> level 60% : still open
  assert.strictEqual(s.positions.length, 1);
  s.onBar(bar(3, 98.6, 98.6, 98.4, 98.4)); // equity 400 -> level 40% : stop-out
  assert.strictEqual(s.positions.length, 0); assert.strictEqual(s.history[0].reason, 'stop_out');
  near(s.balance, 2000 - 1600);
});
const at = (d, h, m, p) => ({ time: Date.UTC(2024, 0, d, h, m) / 1000, open: p, high: p, low: p, close: p });
t('swap: charged per night crossed; Wednesday night triple', () => {
  const s = mk({ swapLong: -5 }); // Mon Jan 8 2024
  s.onBar(at(8, 10, 0, 100)); s.placeOrder({ type: 'market', side: 'long', qty: 1 });
  s.onBar(at(8, 10, 1, 100)); near(s.positions[0].swap, 0);
  s.onBar(at(9, 10, 0, 100));  near(s.positions[0].swap, -5);          // crossed Mon night (x1)
  s.onBar(at(11, 10, 0, 100)); near(s.positions[0].swap, -5 - 5 - 15); // Tue (x1) + Wed (x3)
});
t('swap: weekend nights skipped, Friday night charged once', () => {
  const s = mk({ swapLong: -5 }); // Fri Jan 12 2024
  s.onBar(at(12, 10, 0, 100)); s.placeOrder({ type: 'market', side: 'long', qty: 2 });
  s.onBar(at(12, 10, 1, 100));
  s.onBar(at(15, 10, 0, 100)); // Mon: crossed Fri night(x1), Sat+Sun skipped
  near(s.positions[0].swap, -5 * 2);
});
t('swap settles into balance on close', () => {
  const s = mk({ swapLong: -5 }); s.onBar(at(8, 10, 0, 100)); s.placeOrder({ type: 'market', side: 'long', qty: 1 });
  s.onBar(at(8, 10, 1, 100)); s.onBar(at(9, 10, 0, 100));
  const r = s.closePosition(s.positions[0].id); near(r.trade.swap, -5); near(s.balance, 9995);
});
t('bars with old/duplicate timestamps are ignored (replay rewind safe)', () => {
  const s = mk(); s.onBar(bar(5, 100, 100, 100, 100)); s.onBar(bar(3, 1, 1, 1, 1)); near(s.lastBar.close, 100);
});
t('toJSON/fromJSON round-trip keeps state', () => {
  const s = mk(); s.onBar(bar(0, 100, 100, 100, 100)); s.placeOrder({ type: 'market', side: 'long', qty: 1 }); s.onBar(bar(1, 100, 100, 100, 100));
  const r = Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON()))); assert.strictEqual(r.positions.length, 1); near(r.balance, s.balance);
});
t('rebase: allowed only with no trades/orders; blocked otherwise', () => {
  const s = mk(); s.onBar(bar(5, 100, 100, 100, 100));
  assert.ok(s.rebase(bar(1, 50, 50, 50, 50))); near(s.lastBar.close, 50);       // rewind with empty account
  s.placeOrder({ type: 'market', side: 'long', qty: 1 });
  assert.strictEqual(s.rebase(bar(9, 70, 70, 70, 70)), false); near(s.lastBar.close, 50); // has pending order
});
t('slippage hurts market entries and SL exits (long & short), not TP', () => {
  let s = mk({ slippage: 0.5 }); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'market', side: 'long', qty: 1, sl: 98, tp: 105 }); s.onBar(bar(1, 100, 100, 100, 100)); near(s.positions[0].entry, 100.5);
  s.onBar(bar(2, 100, 101, 97, 99)); near(s.history[0].exit, 97.5); // SL 98 - 0.5
  s = mk({ slippage: 0.5 }); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'market', side: 'short', qty: 1, sl: 102, tp: 95 }); s.onBar(bar(1, 100, 100, 100, 100)); near(s.positions[0].entry, 99.5);
  s.onBar(bar(2, 100, 103, 99, 100)); near(s.history[0].exit, 102.5);
  s = mk({ slippage: 0.5 }); s.onBar(bar(0, 100, 100, 100, 100));
  s.placeOrder({ type: 'market', side: 'long', qty: 1, tp: 105 }); s.onBar(bar(1, 100, 100, 100, 100)); s.onBar(bar(2, 100, 106, 100, 105)); near(s.history[0].exit, 105); // TP بلا انزلاق
});
t('default slippage is 0 (costs only when configured)', () => { const s = mk(); s.onBar(bar(0, 100, 100, 100, 100)); s.placeOrder({ type: 'market', side: 'long', qty: 1 }); s.onBar(bar(1, 100, 100, 100, 100)); near(s.positions[0].entry, 100); });
t('closeAtOpen closes at NEXT bar open (bid for long, ask for short)', () => {
  let s = mk({ spread: 0.4 }); s.onBar(bar(0, 100, 100, 100, 100)); s.placeOrder({ type: 'market', side: 'long', qty: 1 }); s.onBar(bar(1, 100, 100, 100, 100));
  const id = s.positions[0].id; assert.ok(s.closeAtOpen(id)); assert.strictEqual(s.positions.length, 1); // لم يُغلق بعد
  s.onBar(bar(2, 103, 104, 102, 103.5)); near(s.history[0].exit, 103); assert.strictEqual(s.history[0].reason, 'signal');
  s = mk({ spread: 0.4 }); s.onBar(bar(0, 100, 100, 100, 100)); s.placeOrder({ type: 'market', side: 'short', qty: 1 }); s.onBar(bar(1, 100, 100, 100, 100));
  s.closeAtOpen(s.positions[0].id); s.onBar(bar(2, 97, 98, 96, 97)); near(s.history[0].exit, 97.4);
});
t('closeAtOpen rejects unknown ids and duplicates', () => {
  const s = mk(); s.onBar(bar(0, 100, 100, 100, 100)); assert.strictEqual(s.closeAtOpen(999), false);
  s.placeOrder({ type: 'market', side: 'long', qty: 1 }); s.onBar(bar(1, 100, 100, 100, 100)); const id = s.positions[0].id; assert.ok(s.closeAtOpen(id)); assert.strictEqual(s.closeAtOpen(id), false);
});
console.log(`\n${n} tests passed`);
