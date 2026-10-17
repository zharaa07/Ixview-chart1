/* =========================================================================
   tv-indicators.js — مؤشرات فنية سببية (causal): قيمة الشمعة i تعتمد فقط على
   الشموع 0..i، لذلك لا تكشف أي بيانات مستقبلية أثناء الريبلاي.
   كل دالة تُرجع مصفوفة بنفس طول المدخلات (null حيث لا تكفي البيانات).
   التعريفات:
   - EMA: alpha=2/(n+1) وتبدأ من SMA لأول n قيمة (نفس أسلوب TradingView).
   - RSI/ATR: تمهيد Wilder (RMA) يبدأ بمتوسط بسيط لأول n قيمة.
   - Bollinger: الانحراف المعياري للمجتمع (population, ddof=0).
   لا يوجد مؤشر حجم: بيانات HistData المتوفرة لا تحتوي حجماً (العمود صفر).
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TVIndicators = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const nulls = n => new Array(n).fill(null);

  function sma(v, n) {
    const out = nulls(v.length); let sum = 0, cnt = 0;
    for (let i = 0; i < v.length; i++) {
      if (v[i] == null) { sum = 0; cnt = 0; continue; }
      sum += v[i]; cnt++;
      if (cnt > n) sum -= v[i - n];
      if (cnt >= n) out[i] = sum / n;
    }
    return out;
  }

  // متوسط متحرك مرجّح خطياً
  function wma(v, n) {
    const out = nulls(v.length), d = n * (n + 1) / 2;
    for (let i = n - 1; i < v.length; i++) {
      let s = 0, ok = true;
      for (let k = 0; k < n; k++) { const x = v[i - n + 1 + k]; if (x == null) { ok = false; break; } s += x * (k + 1); }
      if (ok) out[i] = s / d;
    }
    return out;
  }

  // تمهيد أسّي عام: alpha ثابت، بذرة = SMA لأول n قيمة صالحة
  function smooth(v, n, alpha) {
    const out = nulls(v.length); let prev = null, buf = [], start = -1;
    for (let i = 0; i < v.length; i++) {
      if (v[i] == null) continue;
      if (prev == null) {
        buf.push(v[i]);
        if (buf.length === n) { prev = buf.reduce((a, b) => a + b, 0) / n; out[i] = prev; }
      } else { prev = alpha * v[i] + (1 - alpha) * prev; out[i] = prev; }
    }
    return out;
  }
  const ema = (v, n) => smooth(v, n, 2 / (n + 1));
  const rma = (v, n) => smooth(v, n, 1 / n);

  function rsi(close, n) {
    const gain = nulls(close.length), loss = nulls(close.length);
    for (let i = 1; i < close.length; i++) {
      const ch = close[i] - close[i - 1];
      gain[i] = ch > 0 ? ch : 0; loss[i] = ch < 0 ? -ch : 0;
    }
    const ag = rma(gain, n), al = rma(loss, n), out = nulls(close.length);
    for (let i = 0; i < close.length; i++) {
      if (ag[i] == null) continue;
      out[i] = al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]);
    }
    return out;
  }

  function macd(close, fast, slow, sig) {
    const ef = ema(close, fast), es = ema(close, slow);
    const line = close.map((_, i) => (ef[i] != null && es[i] != null) ? ef[i] - es[i] : null);
    const signal = ema(line, sig);
    const hist = line.map((x, i) => (x != null && signal[i] != null) ? x - signal[i] : null);
    return { macd: line, signal, hist };
  }

  function bollinger(close, n, mult) {
    const mid = sma(close, n), upper = nulls(close.length), lower = nulls(close.length);
    for (let i = n - 1; i < close.length; i++) {
      if (mid[i] == null) continue;
      let s = 0; for (let k = i - n + 1; k <= i; k++) s += (close[k] - mid[i]) ** 2;
      const sd = Math.sqrt(s / n);
      upper[i] = mid[i] + mult * sd; lower[i] = mid[i] - mult * sd;
    }
    return { mid, upper, lower };
  }

  function atr(high, low, close, n) {
    const tr = high.map((h, i) => i === 0 ? h - low[i] :
      Math.max(h - low[i], Math.abs(h - close[i - 1]), Math.abs(low[i] - close[i - 1])));
    return rma(tr, n);
  }

  function stochastic(high, low, close, kLen, dLen) {
    const k = nulls(close.length);
    for (let i = kLen - 1; i < close.length; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let j = i - kLen + 1; j <= i; j++) { if (high[j] > hh) hh = high[j]; if (low[j] < ll) ll = low[j]; }
      k[i] = hh === ll ? 50 : 100 * (close[i] - ll) / (hh - ll);
    }
    return { k, d: sma(k, dLen) };
  }

  // كتالوج المؤشرات المعروضة في الواجهة (يُستخدم لبناء الحوار بدون تكرار)
  const CATALOG = [
    { id: 'sma', name: 'Moving Average (SMA)', pane: 'overlay', params: [{ k: 'length', label: 'Length', def: 20, min: 1, max: 500 }] },
    { id: 'ema', name: 'Exponential Moving Average', pane: 'overlay', params: [{ k: 'length', label: 'Length', def: 20, min: 1, max: 500 }] },
    { id: 'wma', name: 'Weighted Moving Average', pane: 'overlay', params: [{ k: 'length', label: 'Length', def: 20, min: 1, max: 500 }] },
    { id: 'bb', name: 'Bollinger Bands', pane: 'overlay', params: [{ k: 'length', label: 'Length', def: 20, min: 2, max: 500 }, { k: 'mult', label: 'StdDev', def: 2, min: 0.1, max: 10, step: 0.1 }] },
    { id: 'rsi', name: 'Relative Strength Index', pane: 'separate', params: [{ k: 'length', label: 'Length', def: 14, min: 2, max: 500 }] },
    { id: 'macd', name: 'MACD', pane: 'separate', params: [{ k: 'fast', label: 'Fast', def: 12, min: 1, max: 200 }, { k: 'slow', label: 'Slow', def: 26, min: 2, max: 400 }, { k: 'signal', label: 'Signal', def: 9, min: 1, max: 200 }] },
    { id: 'atr', name: 'Average True Range', pane: 'separate', params: [{ k: 'length', label: 'Length', def: 14, min: 1, max: 500 }] },
    { id: 'stoch', name: 'Stochastic', pane: 'separate', params: [{ k: 'k', label: '%K', def: 14, min: 1, max: 200 }, { k: 'd', label: '%D', def: 3, min: 1, max: 100 }] }
  ];

  // يحسب مؤشراً من شموع OHLC → { lines:[{key,color,values,style?}], ... } بنفس طول الشموع
  function compute(id, bars, p) {
    const c = bars.map(b => b.close), h = bars.map(b => b.high), l = bars.map(b => b.low);
    switch (id) {
      case 'sma': return [{ key: 'SMA', values: sma(c, p.length) }];
      case 'ema': return [{ key: 'EMA', values: ema(c, p.length) }];
      case 'wma': return [{ key: 'WMA', values: wma(c, p.length) }];
      case 'bb': { const b = bollinger(c, p.length, p.mult); return [{ key: 'Basis', values: b.mid }, { key: 'Upper', values: b.upper }, { key: 'Lower', values: b.lower }]; }
      case 'rsi': return [{ key: 'RSI', values: rsi(c, p.length) }];
      case 'macd': { const m = macd(c, p.fast, p.slow, p.signal); return [{ key: 'MACD', values: m.macd }, { key: 'Signal', values: m.signal }, { key: 'Hist', values: m.hist, histogram: true }]; }
      case 'atr': return [{ key: 'ATR', values: atr(h, l, c, p.length) }];
      case 'stoch': { const s = stochastic(h, l, c, p.k, p.d); return [{ key: '%K', values: s.k }, { key: '%D', values: s.d }]; }
    }
    return [];
  }

  return { sma, ema, wma, rma, rsi, macd, bollinger, atr, stochastic, CATALOG, compute };
});
