/* =========================================================================
   tv-aggregate.js — تجميع شموع الدقيقة (أو أي دقة أساسية) إلى إطار أكبر
   القواعد: open = أول شمعة في الفترة، high = الأعلى، low = الأدنى،
   close = آخر شمعة، volume = مجموع الأحجام فقط إن كانت موجودة (>0)، وإلا 0.
   الفترات تُقاس بالتوقيت UTC (نفس اتفاقية وقت الملف): اليوم 00:00، الأسبوع
   يبدأ الاثنين، الشهر يبدأ اليوم 1. لا تُنشأ شموع للفجوات (عطل/جلسات مغلقة).
   الشمعة الأخيرة قد تكون ناقصة؛ تُعاد مع علامة partial=true (تُحسب بحسب
   baseSec: اكتملت إن كانت آخر شمعة أساسية هي آخر شريحة ممكنة في الفترة).
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TVAggregate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function bucketStart(time, minutes) {
    const d = new Date(time * 1000);
    if (minutes === 1440) return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
    if (minutes === 10080) { const diff = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff) / 1000; }
    if (minutes === 43200) return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
    const s = minutes * 60; return Math.floor(time / s) * s;
  }

  function bucketEnd(start, minutes) {
    if (minutes === 10080) return start + 7 * 86400;
    if (minutes === 43200) { const d = new Date(start * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000; }
    return start + minutes * 60;
  }

  function aggregate(bars, minutes, baseSec) {
    if (minutes === 1 && (!baseSec || baseSec <= 60)) return bars.map(b => Object.assign({}, b));
    const out = []; let cur = null, key = null;
    for (const b of bars) {
      const k = bucketStart(b.time, minutes);
      if (k !== key) {
        if (cur) out.push(cur);
        cur = { time: k, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0, _last: b.time };
        key = k;
      } else {
        if (b.high > cur.high) cur.high = b.high;
        if (b.low < cur.low) cur.low = b.low;
        cur.close = b.close; cur.volume += b.volume || 0; cur._last = b.time;
      }
    }
    if (cur) out.push(cur);
    const step = baseSec || 60;
    out.forEach(c => { c.partial = (c._last + step) < bucketEnd(c.time, minutes); delete c._last; });
    return out;
  }

  return { aggregate, bucketStart, bucketEnd };
});
