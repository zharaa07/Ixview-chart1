/* =========================================================================
   tv-session-breaks.js — فواصل الجلسات: خط رأسي عند بداية كل يوم (بحسب المنطقة
   الزمنية المختارة في الإعدادات). يقرأ الحالة من TVSettings ويُعاد رسمه عند
   تغيّر الإعدادات أو النطاق المرئي أو البيانات.
   ========================================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.TVSessionBreaks = api; api.install(root); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // أوقات (ثوانٍ) لأول شمعة في كل يوم محلي؛ الشمعة الأولى في المصفوفة لا تُعدّ فاصلاً.
  function breakTimes(times, offsetSeconds) {
    const out = []; let prevDay = null;
    for (let i = 0; i < times.length; i++) {
      const day = Math.floor((times[i] + (offsetSeconds || 0)) / 86400);
      if (prevDay !== null && day !== prevDay) out.push(times[i]);
      prevDay = day;
    }
    return out;
  }

  function install(global) {
    let canvas = null, raf = 0;
    const host = () => document.getElementById('chart');
    function ensureCanvas() {
      const h = host(); if (!h) return null;
      if (!canvas || !canvas.isConnected) {
        canvas = document.createElement('canvas'); canvas.id = 'tvSessionBreaks';
        canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1';
        h.appendChild(canvas);
      }
      return canvas;
    }
    function draw() {
      raf = 0;
      const st = global.TVSettings && global.TVSettings.getState(); const chart = global.chart, series = global.candleSeries;
      const c = ensureCanvas(); if (!c || !chart || !series) return;
      const h = host(), dpr = global.devicePixelRatio || 1, w = h.clientWidth, ht = h.clientHeight;
      if (c.width !== w * dpr || c.height !== ht * dpr) { c.width = w * dpr; c.height = ht * dpr; }
      const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, ht);
      if (!st || !st.sessionBreaks) return;
      const off = global.TVSettings.tzOffsetHours(st.timezone) * 3600;
      const times = series.data().map(b => b.time);
      const maxX = chart.timeScale().width ? chart.timeScale().width() : w;
      ctx.strokeStyle = st.sessionBreakColor || '#2962FF'; ctx.lineWidth = 1;
      ctx.setLineDash(st.sessionBreakStyle === 'dotted' ? [2, 3] : st.sessionBreakStyle === 'solid' ? [] : [6, 4]);
      breakTimes(times, off).forEach(t => {
        const x = chart.timeScale().timeToCoordinate(t);
        if (x == null || x < 0 || x > maxX) return;
        ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, ht); ctx.stroke();
      });
    }
    const schedule = () => { if (!raf) raf = global.requestAnimationFrame(draw); };
    function hook() {
      const s = global.candleSeries, ch = global.chart; if (!s || !ch) return false;
      if (!s.__tvSbHooked) {
        s.__tvSbHooked = true;
        ['update', 'setData'].forEach(fn => { const o = s[fn].bind(s); s[fn] = function () { const r = o.apply(null, arguments); schedule(); return r; }; });
        ch.timeScale().subscribeVisibleLogicalRangeChange(schedule);
      }
      return true;
    }
    global.addEventListener('tvCloneChartSettingsChanged', schedule);
    global.addEventListener('resize', schedule);
    let tries = 0; const w = setInterval(() => { if (hook() || ++tries > 60) { clearInterval(w); schedule(); } }, 150);
    global.TVSessionBreaks.redraw = draw;
  }
  return { breakTimes, install };
});
