/* =========================================================================
   tv-compare.js — حسابات المقارنة بين سلاسل تاريخية (دوال نقية)

   التعريفات (صريحة):
   - المحاذاة بالطابع الزمني الفعلي فقط (تطابق تام). لا تُنشأ نقاط مفقودة ولا
     تُطابَق أوقات غير متطابقة. الفجوات تبقى فجوات.
   - الأساس (baseline): أول طابع زمني t ≥ بداية النطاق المرئي يوجد في السلسلتين
     (الرئيسية والمقارَنة) معاً. قيمة الأساس لكل سلسلة = قيمتها (close) عند t.
   - نسبة مئوية: v% = (value / base − 1) × 100  → 0% عند الأساس.
   - مفهرس (Indexed 100): v = (value / base) × 100 → 100 عند الأساس.
   - كل سلسلة تُحسب بأساسها الخاص، لذلك تتقارن أسعار مختلفة الحجم (ذهب 1900 مقابل
     يورو 1.10) على نفس المحور بلا تشويه. القيم الأصلية لا تُعدَّل (تُنتج مصفوفات جديدة).
   - قيمة عند وقت (للتحويم): آخر نقطة عند/قبل الوقت بشرط ألا تتجاوز الفجوة maxGapSec،
     وإلا null (لا نمرّر قيمة قديمة على أنها حالية).
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TVCompare = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // مجموعة أوقات للبحث السريع
  const toSet = arr => { const s = new Set(); for (let i = 0; i < arr.length; i++) s.add(arr[i]); return s; };

  // أول وقت مشترك بالتطابق التام ≥ fromTime (null إن لم يوجد)
  function firstCommon(mainTimes, otherTimes, fromTime) {
    const other = toSet(otherTimes), from = fromTime == null ? -Infinity : fromTime;
    for (let i = 0; i < mainTimes.length; i++) { const t = mainTimes[i]; if (t >= from && other.has(t)) return t; }
    return null;
  }

  // أول وقت ≥ fromTime موجود في كل المصفوفات (تطابق تام)؛ الأولى هي مرجع المسح
  function firstCommonAll(arrays, fromTime) {
    if (!arrays.length) return null;
    const sets = arrays.slice(1).map(toSet), from = fromTime == null ? -Infinity : fromTime, a = arrays[0];
    for (let i = 0; i < a.length; i++) { const t = a[i]; if (t < from) continue; let ok = true; for (let k = 0; k < sets.length; k++) if (!sets[k].has(t)) { ok = false; break; } if (ok) return t; }
    return null;
  }

  // تغطية: مدى كل سلسلة والتقاطع وعدد النقاط المتطابقة
  function coverage(mainTimes, otherTimes) {
    const r = { mainCount: mainTimes.length, otherCount: otherTimes.length, common: 0, overlapFrom: null, overlapTo: null, mainFrom: null, mainTo: null, otherFrom: null, otherTo: null, overlap: false, mainBarsInOtherRange: 0, matchRatio: 0 };
    if (!mainTimes.length || !otherTimes.length) return r;
    r.mainFrom = mainTimes[0]; r.mainTo = mainTimes[mainTimes.length - 1]; r.otherFrom = otherTimes[0]; r.otherTo = otherTimes[otherTimes.length - 1];
    const from = Math.max(r.mainFrom, r.otherFrom), to = Math.min(r.mainTo, r.otherTo);
    if (from > to) return r;
    r.overlapFrom = from; r.overlapTo = to; r.overlap = true;
    const other = toSet(otherTimes);
    for (let i = 0; i < mainTimes.length; i++) { const t = mainTimes[i]; if (t < from) continue; if (t > to) break; r.mainBarsInOtherRange++; if (other.has(t)) r.common++; }
    r.matchRatio = r.mainBarsInOtherRange ? r.common / r.mainBarsInOtherRange : 0;
    return r;
  }

  function baseValue(points, baseTime) {
    // بحث ثنائي عن تطابق تام
    let lo = 0, hi = points.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1, t = points[mid].time; if (t === baseTime) return points[mid].value; if (t < baseTime) lo = mid + 1; else hi = mid - 1; }
    return null;
  }

  // يعيد مصفوفة جديدة؛ فارغة إن لم يوجد أساس صالح (غير صفري/منتهٍ)
  function rebase(points, mode, baseTime) {
    if (mode !== 'percent' && mode !== 'index100') throw new Error('unknown_mode');
    const b = baseValue(points, baseTime);
    if (b == null || !isFinite(b) || b === 0) return [];
    const out = new Array(points.length);
    for (let i = 0; i < points.length; i++) { const v = points[i].value; out[i] = { time: points[i].time, value: mode === 'percent' ? (v / b - 1) * 100 : (v / b) * 100 }; }
    return out;
  }

  function valueAtOrBefore(points, time, maxGapSec) {
    if (!points.length || time < points[0].time) return null;
    let lo = 0, hi = points.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (points[mid].time <= time) lo = mid; else hi = mid - 1; }
    const p = points[lo]; return (time - p.time) <= maxGapSec ? p : null;
  }

  // نسبة نطاقي سعر (وسيط الإغلاق) — لتحذير "نفس المحور" عند اختلاف الحجم كثيراً
  function medianRatio(a, b) {
    const med = arr => { if (!arr.length) return null; const s = arr.map(x => x.value).sort((x, y) => x - y); return s[s.length >> 1]; };
    const ma = med(a), mb = med(b); if (!ma || !mb) return null; return Math.max(ma, mb) / Math.min(ma, mb);
  }

  return { firstCommon, firstCommonAll, coverage, rebase, valueAtOrBefore, medianRatio, baseValue };
});
