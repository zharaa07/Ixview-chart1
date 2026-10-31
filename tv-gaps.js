/* =========================================================================
   tv-gaps.js — إبقاء الفجوات الزمنية كفراغ على الشارت (لا شمعة = لا رسم في ذلك الوقت)

   مكتبة الشارت تضع الشموع على محور بالفهرس فتلصق الشمعة التالية بما قبل الفجوة.
   لإظهار الفجوة نُضيف نقاط "فراغ" ({time} بلا قيم) في أوقات الشموع المفقودة إلى سلسلة
   مساعدة غير مرئية؛ فتحتل مواضع على المحور دون أن تُرسم، وتبقى الشمعة التالية في وقتها.
   - بيانات الشموع الأصلية (series.data()) لا تتغير إطلاقاً (المؤشرات/الباكتيست تقرؤها كما هي).
   - الفراغ يُضاف فقط بين شمعتين موجودتين، ولا بعد آخر شمعة (لا تسريب مستقبل في الريبلاي).
   - الخطوة = الإطار الزمني الحالي (ثوانٍ). للأسبوعي/الشهري (غير منتظم) لا فراغات.
   - حد أقصى لعدد الفراغات في الفجوة الواحدة (MAX_GAP_BARS) لتفادي ملايين النقاط عند غياب أشهر؛
     الفجوة الأطول تُختصر لهذا الحد (الأوقات المعروضة على المحور تبقى صحيحة لأنها من أوقات الشموع).
   ========================================================================= */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.TVGaps = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const MAX_GAP_BARS = 6000; // ≈ 4 أيام من شموع الدقيقة (أكبر فجوة في ملفات HistData المعتادة ~76 ساعة)

  // أوقات الشموع المفقودة بين شمعتين متتاليتين (بخطوة ثابتة)
  function gapTimes(times, step, cap) {
    const out = []; if (!(step > 0)) return out; cap = cap || MAX_GAP_BARS;
    for (let i = 1; i < times.length; i++) {
      const prev = times[i - 1], next = times[i];
      if (next - prev <= step) continue;
      let n = 0; for (let t = prev + step; t < next && n < cap; t += step, n++) out.push(t);
    }
    return out;
  }

  // مفتاح إيقاف: ?nogaps=1 في الرابط أو tv_gaps_off=1 في التخزين (يضبطه زر الإيقاف في لوحة التشخيص)
  let enabled = true, forcedOff = false; const controllers = [];
  // الإيقاف القسري (رابط/تخزين/خطأ) له الأولوية على إعدادات الشارت: setEnabled(true) لا يعيد التفعيل
  try { if ((root.location && /[?&]nogaps=1/.test(root.location.search)) || (root.localStorage && root.localStorage.getItem('tv_gaps_off') === '1')) { enabled = false; forcedOff = true; } } catch (e) {}
  function reportError(e) { try { console.error('[TVGaps]', e); if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent('tv-health-error', { detail: 'TVGaps: ' + (e && e.message || e) })); } catch (x) {} }
  function lowerBound(arr, v) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; }

  function attach(opts) {
    const { chart, series } = opts, L = root.LightweightCharts;
    if (!chart || !series || !L || series.__tvGaps) return null;
    const getStep = opts.getStepSec || (() => 60);
    const helper = chart.addSeries(L.LineSeries, { color: 'rgba(0,0,0,0)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null });
    let lastTime = null;
    const stepNow = () => { const s = getStep(); return s > 0 && s <= 86400 ? s : 0; };
    const ctrl = {
      helper, chart, series, gaps: [],
      rebuild(data) {
        try {
          const d = data || series.data();
          if (!enabled || !d || d.length < 2 || !stepNow()) { ctrl.gaps = []; helper.setData([]); return; }
          ctrl.gaps = gapTimes(d.map(b => b.time), stepNow());
          helper.setData(ctrl.gaps.map(t => ({ time: t })));
        } catch (e) { reportError(e); enabled = false; forcedOff = true; ctrl.gaps = []; try { helper.setData([]); } catch (x) {} }
      }
    };
    series.__tvGaps = ctrl;
    const origSet = series.setData.bind(series), origUpdate = series.update.bind(series);
    series.setData = function (data) { const r = origSet(data); lastTime = data && data.length ? data[data.length - 1].time : null; ctrl.rebuild(data); return r; };
    series.update = function (bar) {
      const r = origUpdate(bar), step = stepNow();
      try {
        if (enabled && step && lastTime != null && bar.time > lastTime) { let n = 0; for (let t = lastTime + step; t < bar.time && n < MAX_GAP_BARS; t += step, n++) { helper.update({ time: t }); ctrl.gaps.push(t); } }
      } catch (e) { reportError(e); enabled = false; forcedOff = true; ctrl.gaps = []; try { helper.setData([]); } catch (x) {} }
      if (lastTime == null || bar.time > lastTime) lastTime = bar.time;
      return r;
    };
    try { const cur = series.data(); if (cur && cur.length) { lastTime = cur[cur.length - 1].time; ctrl.rebuild(cur); } } catch (e) {}
    controllers.push(ctrl); return ctrl;
  }

  const ctrlOf = chart => controllers.find(c => c.chart === chart) || null;
  // عدد مواضع المحور الزمني لهذه السلسلة = الشموع + مواضع الفراغ (تُستخدم لإزاحة العرض بدقة)
  function points(series) { const c = series && series.__tvGaps; const n = series && series.data ? series.data().length : 0; return enabled && c ? n + c.gaps.length : n; }
  // نطاق العرض الافتراضي (بالفهرس المنطقي) لآخر visibleBars شمعة مع مراعاة مواضع الفراغ؛ null = استعمل الحساب العادي
  function viewRange(chart, totalBars, visibleBars, rightOffset) {
    const c = ctrlOf(chart); if (!enabled || !c || !c.gaps.length) return null;
    const data = c.series.data(); const n = Math.min(totalBars, data.length); if (n < 1) return null;
    const k = Math.max(0, n - visibleBars);
    return { from: k + lowerBound(c.gaps, data[k].time), to: n + lowerBound(c.gaps, data[n - 1].time) + rightOffset };
  }
  function setEnabled(v) { v = !!v; if (forcedOff && v) return; if (v === enabled) return; enabled = v; controllers.forEach(c => c.rebuild()); }

  // يربط الشارت الرئيسي عند جاهزيته (window.chart/candleSeries يُنشآن في backtest.js)
  if (root && root.document) {
    let tries = 0; const w = setInterval(() => {
      if (root.chart && root.candleSeries && root.LightweightCharts) {
        clearInterval(w);
        attach({ chart: root.chart, series: root.candleSeries, getStepSec: () => { const s = document.getElementById('timeframeSelect'); const m = s ? Number(s.value) : 1; return m > 0 && m < 10080 ? m * 60 : 0; } });
      } else if (++tries > 100) clearInterval(w);
    }, 100);
  }
  return { gapTimes, attach, points, viewRange, lowerBound, setEnabled, isEnabled: () => enabled, helperOf: s => s && s.__tvGaps ? s.__tvGaps.helper : null, MAX_GAP_BARS };
});
