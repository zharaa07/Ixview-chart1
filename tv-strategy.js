/* =========================================================================
   tv-strategy.js — محرك باكتيست آلي على الشموع التاريخية المحلية (منفصل عن الريبلاي اليدوي)

   قواعد التنفيذ (كلها تعتمد على tv-trading-sim.js):
   - القرار يُتخذ عند إغلاق الشمعة i باستخدام الشموع 0..i فقط (مؤشرات سببية).
   - التنفيذ دائماً عند افتتاح الشمعة i+1 (دخول وخروج بالإشارة).
   - SL/TP تُحسب من سعر إغلاق شمعة القرار؛ إن لمست شمعة واحدة الوقف والهدف يُفترض الوقف أولاً.
   - صفقة واحدة مفتوحة كحد أقصى؛ الانعكاس (reverse) يغلق ثم يفتح عند نفس الافتتاح.
   - التكاليف (سبريد/عمولة/انزلاق/سواب) تساوي صفراً ما لم يضبطها المستخدم.
   - ما يتبقى مفتوحاً عند نهاية البيانات يُغلق عند آخر إغلاق بسبب 'end_of_data'.
   - النتائج حتمية: نفس البيانات + نفس الإعدادات = نفس النتيجة (بصمة fingerprint ترافقها).
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./tv-trading-sim.js'), require('./tv-indicators.js'), require('./tv-position-calc.js'));
  else root.TVStrategy = factory(root.TVTradingSim, root.TVIndicators, root.TVPositionCalc);
})(typeof self !== 'undefined' ? self : this, function (SimMod, Ind, PC) {
  'use strict';
  const Sim = SimMod.Sim;

  const DEFAULT_ACCOUNT = { balance: 10000, leverage: 100, lotSize: 100, spread: 0, commissionPerLot: 0, slippage: 0, swapLong: 0, swapShort: 0, stopOutLevel: 50 };
  const DEFAULT_RISK = { sizing: 'fixed', lots: 0.1, riskPct: 1, slMode: 'none', slValue: 0, atrLen: 14, tpR: 0, qtyPrecision: 2, minLots: 0.01 };

  // ---------- تعريفات الاستراتيجيات: تُحسب المؤشرات مرة واحدة (سببية) ثم تُعاد إشارات كل شمعة ----------
  const STRATEGIES = {
    macross: {
      name: 'تقاطع متوسطين متحركين',
      params: [{ k: 'fast', label: 'سريع', def: 10, min: 1, max: 500 }, { k: 'slow', label: 'بطيء', def: 30, min: 2, max: 1000 }, { k: 'maType', label: 'النوع (0=SMA 1=EMA)', def: 0, min: 0, max: 1 }],
      validate: p => p.fast >= p.slow ? 'السريع يجب أن يكون أقل من البطيء' : null,
      prepare(bars, p) {
        const c = bars.map(b => b.close), f = p.maType === 1 ? Ind.ema : Ind.sma;
        const fast = f(c, p.fast), slow = f(c, p.slow);
        return i => {
          if (i < 1 || fast[i] == null || slow[i] == null || fast[i - 1] == null || slow[i - 1] == null) return {};
          const up = fast[i] > slow[i] && fast[i - 1] <= slow[i - 1], down = fast[i] < slow[i] && fast[i - 1] >= slow[i - 1];
          return { enterLong: up, enterShort: down, exitLong: down, exitShort: up };
        };
      }
    },
    rsi: {
      name: 'RSI (ارتداد من التشبع)',
      params: [{ k: 'length', label: 'الفترة', def: 14, min: 2, max: 200 }, { k: 'oversold', label: 'تشبع بيعي', def: 30, min: 1, max: 49 }, { k: 'overbought', label: 'تشبع شرائي', def: 70, min: 51, max: 99 }],
      validate: p => p.oversold >= p.overbought ? 'مستوى التشبع البيعي يجب أن يكون أقل من الشرائي' : null,
      prepare(bars, p) {
        const r = Ind.rsi(bars.map(b => b.close), p.length);
        return i => {
          if (i < 1 || r[i] == null || r[i - 1] == null) return {};
          return { enterLong: r[i - 1] < p.oversold && r[i] >= p.oversold, enterShort: r[i - 1] > p.overbought && r[i] <= p.overbought, exitLong: r[i] >= p.overbought, exitShort: r[i] <= p.oversold };
        };
      }
    }
  };

  // جودة البيانات: الخطوة المتوقعة = المنوال بين الفروق؛ الفجوة = فرق > 1.5× الخطوة (لا تُملأ ولا تُخترع شموع)
  function dataQuality(bars) {
    const out = { bars: bars.length, expectedStepSec: 0, gapCount: 0, largestGapSec: 0, gapsOverOneDay: 0, partialLastBar: !!(bars.length && bars[bars.length - 1].partial) };
    if (bars.length < 3) return out;
    const counts = new Map(); const n = Math.min(bars.length - 1, 5000);
    for (let i = 0; i < n; i++) { const d = bars[i + 1].time - bars[i].time; counts.set(d, (counts.get(d) || 0) + 1); }
    let best = 0, bc = 0; counts.forEach((c, d) => { if (c > bc) { bc = c; best = d; } }); out.expectedStepSec = best;
    for (let i = 1; i < bars.length; i++) { const d = bars[i].time - bars[i - 1].time; if (d > best * 1.5) { out.gapCount++; if (d > out.largestGapSec) out.largestGapSec = d; if (d >= 86400) out.gapsOverOneDay++; } }
    return out;
  }

  function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(16); }

  function computeMetrics(trades, equity, initial) {
    const n = trades.length; const wins = trades.filter(t => t.net > 0), losses = trades.filter(t => t.net < 0);
    const gp = wins.reduce((s, t) => s + t.net, 0), gl = -losses.reduce((s, t) => s + t.net, 0);
    let peak = -Infinity, maxDD = 0, maxDDPct = 0;
    equity.forEach(p => { if (p.equity > peak) peak = p.equity; const dd = peak - p.equity; if (dd > maxDD) maxDD = dd; const pct = peak > 0 ? dd / peak * 100 : 0; if (pct > maxDDPct) maxDDPct = pct; });
    let cl = 0, cw = 0, mcl = 0, mcw = 0;
    trades.forEach(t => { if (t.net < 0) { cl++; cw = 0; } else if (t.net > 0) { cw++; cl = 0; } else { cl = 0; cw = 0; } if (cl > mcl) mcl = cl; if (cw > mcw) mcw = cw; });
    const net = trades.reduce((s, t) => s + t.net, 0);
    const final = equity.length ? equity[equity.length - 1].equity : initial;
    const side = sd => { const x = trades.filter(t => t.side === sd), w = x.filter(t => t.net > 0), l = x.filter(t => t.net < 0), gpS = w.reduce((a, t) => a + t.net, 0), glS = -l.reduce((a, t) => a + t.net, 0); return { trades: x.length, wins: w.length, losses: l.length, winRate: x.length ? w.length / x.length * 100 : null, netProfit: x.reduce((a, t) => a + t.net, 0), profitFactor: glS > 0 ? gpS / glS : null }; };
    const withR = trades.filter(t => t.r != null), rw = withR.filter(t => t.r > 0), rl = withR.filter(t => t.r < 0);
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    return {
      trades: n, wins: wins.length, losses: losses.length, breakeven: n - wins.length - losses.length,
      winRate: n ? wins.length / n * 100 : null,
      netProfit: net, grossProfit: gp, grossLoss: gl, profitFactor: gl > 0 ? gp / gl : null, // null = لا خسائر (غير معرّف)
      avgWin: wins.length ? gp / wins.length : null, avgLoss: losses.length ? -gl / losses.length : null,
      expectancy: n ? net / n : null, largestWin: wins.length ? Math.max.apply(null, wins.map(t => t.net)) : null, largestLoss: losses.length ? Math.min.apply(null, losses.map(t => t.net)) : null,
      maxDrawdown: maxDD, maxDrawdownPct: maxDDPct, maxConsecutiveLosses: mcl, maxConsecutiveWins: mcw,
      commissionTotal: trades.reduce((s, t) => s + t.commission, 0), swapTotal: trades.reduce((s, t) => s + t.swap, 0),
      initialBalance: initial, finalEquity: final, returnPct: initial ? (final - initial) / initial * 100 : null,
      avgBarsInTrade: n ? trades.reduce((s, t) => s + t.bars, 0) / n : null,
      avgDurationSec: n ? trades.reduce((s, t) => s + (t.exitTime - t.entryTime), 0) / n : null,
      bySide: { long: side('long'), short: side('short') },
      // إحصاءات R (الربح/الخسارة مقسومة على المخاطرة الأولية المحددة بالوقف) — فقط للصفقات التي لها وقف
      rStats: { tradesWithR: withR.length, avgR: mean(withR.map(t => t.r)), avgWinR: mean(rw.map(t => t.r)), avgLossR: mean(rl.map(t => t.r)), expectancyR: mean(withR.map(t => t.r)) },
      payoffRatio: (wins.length && losses.length) ? (gp / wins.length) / (gl / losses.length) : null
    };
  }

  function validateConfig(cfg) {
    const errs = [];
    if (!cfg.bars || cfg.bars.length < 2) errs.push('بيانات غير كافية');
    const st = cfg.strategy && (cfg.strategy.type === 'custom' ? { validate: () => null } : STRATEGIES[cfg.strategy.type]);
    if (!st) errs.push('استراتيجية غير معروفة');
    else if (st.params) { st.params.forEach(q => { const v = cfg.strategy.params[q.k]; if (!isFinite(v) || v < q.min || v > q.max) errs.push(q.label + ': يجب أن تكون بين ' + q.min + ' و ' + q.max); }); const m = st.validate && st.validate(cfg.strategy.params); if (m) errs.push(m); }
    const r = Object.assign({}, DEFAULT_RISK, cfg.risk);
    if (r.sizing === 'risk' && r.slMode === 'none') errs.push('الحجم بنسبة المخاطرة يتطلب وقف خسارة');
    if (r.sizing === 'risk' && !(r.riskPct > 0 && r.riskPct <= 100)) errs.push('نسبة المخاطرة بين 0 و100');
    if (r.sizing === 'fixed' && !(r.lots > 0)) errs.push('حجم اللوت يجب أن يكون موجباً');
    if (r.slMode !== 'none' && !(r.slValue > 0)) errs.push('قيمة الوقف يجب أن تكون موجبة');
    if (r.tpR < 0) errs.push('نسبة الهدف لا يمكن أن تكون سالبة');
    if (cfg.maxPositions != null && !(Number.isInteger(cfg.maxPositions) && cfg.maxPositions >= 1 && cfg.maxPositions <= 20)) errs.push('أقصى عدد صفقات متزامنة: عدد صحيح بين 1 و20');
    const a = Object.assign({}, DEFAULT_ACCOUNT, cfg.account);
    if (!(a.balance > 0) || !(a.leverage >= 1) || !(a.lotSize > 0) || a.spread < 0 || a.commissionPerLot < 0 || a.slippage < 0) errs.push('إعدادات الحساب/التكاليف غير صالحة');
    return errs;
  }

  const CHUNK = 2000;
  function* runGen(cfg, opts) {
    const errors = validateConfig(cfg); if (errors.length) return { ok: false, errors };
    const maxPos = cfg.maxPositions == null ? 1 : cfg.maxPositions;
    const bars = cfg.bars, risk = Object.assign({}, DEFAULT_RISK, cfg.risk), account = Object.assign({}, DEFAULT_ACCOUNT, cfg.account);
    const dir = cfg.direction || 'both', from = cfg.from == null ? -Infinity : cfg.from, to = cfg.to == null ? Infinity : cfg.to;
    const signalAt = cfg.strategy.type === 'custom' ? cfg.strategy.signalFn.bind(null) : STRATEGIES[cfg.strategy.type].prepare(bars, cfg.strategy.params);
    const atr = risk.slMode === 'atr' ? Ind.atr(bars.map(b => b.high), bars.map(b => b.low), bars.map(b => b.close), risk.atrLen) : null;
    const sim = new Sim(account); const equity = [], meta = new Map(); const idxOf = new Map(); bars.forEach((b, i) => idxOf.set(b.time, i));
    let rejected = 0, skippedSize = 0, last = -1;
    for (let i = 0; i < bars.length; i++) {
      if (i % CHUNK === 0) { yield i / bars.length; if (opts && opts.shouldStop && opts.shouldStop()) return { ok: false, cancelled: true }; }
      const bar = bars[i]; if (bar.time > to) break;
      sim.onBar(bar); last = i;
      const inWin = bar.time >= from; if (inWin) equity.push({ time: bar.time, equity: sim.equity() });
      if (!inWin || i === bars.length - 1) continue;
      const sig = signalAt(i, bars) || {};
      // الخروج بالإشارة: يُغلق كل مركز من الجهة المعنية عند الافتتاح التالي
      const closing = new Set(sim.orders.filter(o => o.type === 'close').map(o => o.positionId));
      sim.positions.forEach(p => { if (!closing.has(p.id) && ((p.side === 'long' && sig.exitLong) || (p.side === 'short' && sig.exitShort))) { sim.closeAtOpen(p.id); closing.add(p.id); } });
      const wantLong = sig.enterLong && dir !== 'short', wantShort = sig.enterShort && dir !== 'long';
      const side = wantLong ? 'long' : wantShort ? 'short' : null; if (!side) continue;
      const alive = sim.positions.filter(p => !closing.has(p.id));
      if (alive.some(p => p.side !== side)) continue;                       // لا تحوّط: لا فتح عكسي قبل إغلاق المراكز الحالية
      const pendingEntries = sim.orders.filter(o => o.type !== 'close').length;
      if (alive.length + pendingEntries >= maxPos) continue;                // الحد الأقصى للصفقات المتزامنة
      const ref = bar.close; let slDist = null;
      if (risk.slMode === 'points') slDist = risk.slValue; else if (risk.slMode === 'atr') { if (atr[i] == null) continue; slDist = atr[i] * risk.slValue; }
      let qty = risk.lots;
      if (risk.sizing === 'risk') {
        qty = PC.sizeFromRisk({ entry: ref, stop: side === 'long' ? ref - slDist : ref + slDist, accountSize: sim.balance, riskPct: risk.riskPct, lotSize: account.lotSize, qtyPrecision: risk.qtyPrecision });
        if (qty < risk.minLots) { skippedSize++; continue; }
      }
      const order = { type: 'market', side, qty };
      if (slDist) { order.sl = side === 'long' ? ref - slDist : ref + slDist; if (risk.tpR > 0) order.tp = side === 'long' ? ref + slDist * risk.tpR : ref - slDist * risk.tpR; }
      const res = sim.placeOrder(order);
      if (!res.ok) { rejected++; continue; }
      meta.set(res.order.id, { riskAmount: slDist ? slDist * qty * account.lotSize : null, decisionBar: i, decisionTime: bar.time, sl: order.sl == null ? null : order.sl, tp: order.tp == null ? null : order.tp });
    }
    // إغلاق ما تبقى عند آخر إغلاق (نهاية البيانات) — قبل ذلك تُلغى أوامر الإغلاق المعلّقة غير المنفّذة
    if (last >= 0) sim.positions.slice().forEach(p => { const r = sim.closePosition(p.id); if (r.ok) r.trade.reason = 'end_of_data'; });
    const trades = sim.history.map(h => {
      const m = meta.get(h.id) || {}; const ei = idxOf.get(h.entryTime), xi = idxOf.get(h.exitTime);
      return Object.assign({}, h, { bars: (xi != null && ei != null) ? xi - ei : 0, r: m.riskAmount ? h.net / m.riskAmount : null, sl: m.sl == null ? null : m.sl, tp: m.tp == null ? null : m.tp, decisionTime: m.decisionTime == null ? null : m.decisionTime });
    });
    const metrics = computeMetrics(trades, equity, account.balance);
    const markers = []; trades.forEach((t, k) => {
      markers.push({ time: t.entryTime, position: t.side === 'long' ? 'belowBar' : 'aboveBar', color: t.side === 'long' ? '#26A69A' : '#EF5350', shape: t.side === 'long' ? 'arrowUp' : 'arrowDown', text: '#' + (k + 1) });
      markers.push({ time: t.exitTime, position: t.side === 'long' ? 'aboveBar' : 'belowBar', color: t.net >= 0 ? '#26A69A' : '#EF5350', shape: 'circle', text: t.reason });
    });
    markers.sort((a, b) => a.time - b.time);
    const dq = dataQuality(bars);
    const fp = { bars: bars.length, first: bars[0].time, last: bars[bars.length - 1].time, closeSum: Math.round(bars.reduce((s, b) => s + b.close, 0) * 1e6) / 1e6 };
    const confStr = JSON.stringify({ s: cfg.strategy.type === 'custom' ? 'custom' : cfg.strategy, risk, account, dir, maxPos, from: cfg.from, to: cfg.to, fp });
    return { ok: true, dataQuality: dq, maxPositions: maxPos, trades, equity, metrics, markers, rejectedOrders: rejected, skippedZeroSize: skippedSize, fingerprint: { data: fp, hash: hash(confStr) },
      assumptions: ['القرار عند إغلاق الشمعة والتنفيذ عند افتتاح التالية', 'عند لمس الوقف والهدف في نفس الشمعة يُفترض الوقف أولاً', 'التكاليف صفر ما لم تُضبط', 'الربح بعملة التسعير بلا تحويل عملات'] };
  }

  function run(cfg) { const g = runGen(cfg); let r = g.next(); while (!r.done) r = g.next(); return r.value; }
  // نسخة غير حاجبة: تُرجع الوعد وتدعم onProgress(0..1) وshouldStop() للإيقاف
  async function runAsync(cfg, opts) {
    const g = runGen(cfg, opts); let r = g.next();
    while (!r.done) { if (opts && opts.onProgress) opts.onProgress(r.value); await new Promise(res => setTimeout(res, 0)); r = g.next(); }
    return r.value;
  }

  function tradesToCSV(trades) {
    const head = 'id,side,qty,decision_time_utc,entry_time_utc,entry,sl,tp,exit_time_utc,exit,reason,gross,commission,swap,net,bars,r';
    const iso = t => new Date(t * 1000).toISOString();
    return head + '\n' + trades.map(t => [t.id, t.side, t.qty, t.decisionTime == null ? '' : iso(t.decisionTime), iso(t.entryTime), t.entry, t.sl == null ? '' : t.sl, t.tp == null ? '' : t.tp, iso(t.exitTime), t.exit, t.reason, t.gross, t.commission, t.swap, t.net, t.bars, t.r == null ? '' : t.r].join(',')).join('\n');
  }

  return { run, runAsync, computeMetrics, validateConfig, dataQuality, tradesToCSV, STRATEGIES, DEFAULT_ACCOUNT, DEFAULT_RISK };
});
