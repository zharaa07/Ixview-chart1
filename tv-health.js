/* =========================================================================
   tv-health.js — تشخيص ذاتي يظهر على الشاشة (للجوال: لا حاجة لوحدة التحكم)
   - يلتقط أخطاء الصفحة غير المعالَجة ويعرضها.
   - بعد التحميل يفحص: هل اللوحة مرسومة؟ هل توجد شموع؟ هل العرض الحالي يحتوي شموعاً؟
     وإن كان العرض فارغاً رغم وجود بيانات يعيده تلقائياً إلى آخر الشموع.
   - الزر ⚠ يظهر فقط عند وجود مشكلة (أو ?debug=1). فيه: نسخ التقرير، إيقاف الفجوات الزمنية،
     مسح إعدادات الشارت المحفوظة، وعرض آخر الشموع.
   ========================================================================= */
(function (global) {
  'use strict';
  const errors = []; let btn = null, panel = null;
  const SETTINGS_KEYS = ['chartSettings_v1'];
  function add(msg) { msg = String(msg).slice(0, 300); if (errors.indexOf(msg) < 0) { errors.push(msg); if (errors.length > 8) errors.shift(); showBtn(); } }
  global.addEventListener('error', e => add((e.message || 'خطأ') + (e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + e.lineno : '')));
  global.addEventListener('unhandledrejection', e => add('Promise: ' + (e.reason && (e.reason.message || e.reason))));
  global.addEventListener('tv-health-error', e => add(e.detail));

  function report() {
    const L = [], s = global.candleSeries, c = global.chart;
    const el = document.getElementById('chart'), cv = el && el.querySelector('canvas');
    L.push('الصفحة: ' + location.href); L.push('المتصفح: ' + navigator.userAgent.slice(0, 120));
    L.push('الأصل: ' + ((document.getElementById('pairSelect') || {}).value) + ' | الإطار: ' + ((document.getElementById('timeframeSelect') || {}).value));
    L.push('اللوحة: ' + (cv ? cv.width + '×' + cv.height + ' (عنصر #chart ' + el.clientWidth + '×' + el.clientHeight + ')' : 'غير موجودة'));
    try {
      if (el) {
        const r = el.getBoundingClientRect(), st = getComputedStyle(el), p = el.parentElement, ps = p ? getComputedStyle(p) : null;
        const loading = document.getElementById('loading');
        L.push('CSS #chart: ' + JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: st.display, position: st.position, visibility: st.visibility, opacity: st.opacity, zIndex: st.zIndex }));
        L.push('CSS parent: ' + JSON.stringify(p ? { tag: p.tagName, id: p.id, className: String(p.className), display: ps.display, position: ps.position, overflow: ps.overflow } : null));
        L.push('شاشة التحميل: ' + (loading ? getComputedStyle(loading).display : 'غير موجودة'));
        L.push('Canvas count: ' + el.querySelectorAll('canvas').length);
      }
    } catch (e) { L.push('CSS diagnostic: ' + e.message); }
    try { L.push('عدد الشموع: ' + (s ? s.data().length : '؟')); } catch (e) { L.push('عدد الشموع: خطأ ' + e.message); }
    try {
      if (s && s.options) {
        const o = s.options();
        L.push('خيارات سلسلة الشموع: ' + JSON.stringify({ visible: o.visible, priceScaleId: o.priceScaleId, upColor: o.upColor, downColor: o.downColor, borderVisible: o.borderVisible, borderUpColor: o.borderUpColor, borderDownColor: o.borderDownColor, wickVisible: o.wickVisible, wickUpColor: o.wickUpColor, wickDownColor: o.wickDownColor }));
      }
    } catch (e) { L.push('Series options: ' + e.message); }
    try {
      if (c && c.options) {
        const o = c.options();
        L.push('خيارات المحاور: ' + JSON.stringify({ rightPriceScale: o.rightPriceScale && { visible: o.rightPriceScale.visible, autoScale: o.rightPriceScale.autoScale }, leftPriceScale: o.leftPriceScale && { visible: o.leftPriceScale.visible }, timeScale: o.timeScale && { visible: o.timeScale.visible } }));
      }
    } catch (e) { L.push('Chart options: ' + e.message); }
    try { const r = c.timeScale().getVisibleLogicalRange(); L.push('النطاق المرئي: ' + (r ? r.from.toFixed(0) + ' → ' + r.to.toFixed(0) : 'لا شيء')); const b = s.barsInLogicalRange(r); const iso = t => (typeof t === 'number' ? new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') : t); L.push('شموع داخل العرض: ' + (b ? 'من ' + iso(b.from) + ' إلى ' + iso(b.to) + ' UTC' : 'لا شيء ⚠')); } catch (e) { L.push('العرض: ' + e.message); }
    L.push('الفجوات الزمنية: ' + (global.TVGaps ? (global.TVGaps.isEnabled() ? 'مفعّلة' : 'متوقفة') : 'غير محمّلة'));
    L.push('محرك البيانات: ' + (global.TVDataEngine ? 'نعم، سنوات الأصل: ' + JSON.stringify(global.TVDataEngine.yearsOf((document.getElementById('pairSelect') || {}).value)) : 'غير محمّل'));
    try { // سجل تحميل ملفات البيانات: لكل ملف حالته (ok / missing / empty / error) وعدد الشموع
      const lg = global.TVDataEngine.loadLog(); L.push('سجل تحميل الملفات (' + lg.length + '):');
      lg.slice(-14).forEach(e => L.push('  ' + e.symbol + ' ' + e.year + ' → ' + e.status + (e.accepted ? ' ' + e.accepted + ' شمعة' : '') + (e.rejected ? ' (مرفوض ' + e.rejected + ')' : '') + (e.dupIdentical ? ' (مكرر محذوف ' + e.dupIdentical + ')' : '') + (e.ms ? ' ' + e.ms + 'ms' : '') + (e.note ? ' — ' + e.note : '')));
    } catch (e) {}
    L.push('أخطاء الصفحة (' + errors.length + '):'); errors.forEach(x => L.push('  - ' + x));
    return L.join('\n');
  }

  // يعيد العرض إلى آخر الشموع (مع مراعاة مواضع الفراغ)
  function healView() {
    const s = global.candleSeries, c = global.chart; if (!s || !c) return false;
    try {
      const n = s.data().length; if (!n) return false;
      const g = global.TVGaps && global.TVGaps.viewRange(c, n, 120, 20);
      if (g) c.timeScale().setVisibleLogicalRange(g); else c.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 120), to: n + 20 });
      if (!s.barsInLogicalRange(c.timeScale().getVisibleLogicalRange())) c.timeScale().fitContent();
      return true;
    } catch (e) { add('healView: ' + e.message); return false; }
  }

  function check(auto) {
    const s = global.candleSeries, c = global.chart; if (!s || !c) { add('الشارت غير مُنشأ (chart/candleSeries)'); return report(); }
    try {
      const n = s.data().length;
      if (n > 0) {
        const r = c.timeScale().getVisibleLogicalRange();
        if (!r || !s.barsInLogicalRange(r)) { const healed = auto !== false && healView(); add(healed ? 'كان العرض فارغاً رغم وجود ' + n + ' شمعة — أُعيد تلقائياً إلى آخر الشموع' : 'العرض الحالي لا يحتوي شموعاً رغم وجود ' + n + ' شمعة'); }
      }
      try { global.TVDataEngine.loadLog().forEach(e => { if (e.status === 'error' || e.status === 'empty') add('ملف ' + (e.file || e.symbol + ' ' + e.year) + ': ' + (e.note || e.status)); }); } catch (e) {}
      const el = document.getElementById('chart'), cv = el && el.querySelector('canvas');
      if (n > 0 && (!cv || cv.width === 0 || cv.height === 0)) add('لوحة الرسم غير مرسومة (حجمها صفر) — قد يكون حاوي الشارت بلا أبعاد');
    } catch (e) { add('الفحص: ' + e.message); }
    return report();
  }

  function css(el, t) { el.style.cssText = t; return el; }
  function showBtn() {
    if (btn || !document.body) return;
    btn = css(document.createElement('button'), 'position:fixed;left:8px;bottom:8px;z-index:99999;width:36px;height:36px;border-radius:18px;border:1px solid #ffb74d;background:#1e222d;color:#ffb74d;font-size:18px;cursor:pointer');
    btn.textContent = '⚠'; btn.title = 'تشخيص الشارت'; btn.addEventListener('click', openPanel); document.body.appendChild(btn);
  }
  function openPanel() {
    if (panel) { panel.remove(); panel = null; return; }
    panel = css(document.createElement('div'), 'position:fixed;left:8px;bottom:52px;z-index:99999;width:min(420px,calc(100vw - 16px));max-height:70vh;overflow:auto;background:#1e222d;color:#d1d4dc;border:1px solid #2a2e39;border-radius:8px;padding:10px;font:12px/1.5 sans-serif;direction:rtl');
    const pre = css(document.createElement('pre'), 'white-space:pre-wrap;word-break:break-all;direction:ltr;text-align:left;margin:0 0 8px'); pre.textContent = report(); panel.appendChild(pre);
    const mk = (t, fn) => { const b = css(document.createElement('button'), 'margin:2px;padding:6px 10px;border-radius:5px;border:1px solid #2a2e39;background:#2a2e39;color:#d1d4dc;cursor:pointer'); b.textContent = t; b.addEventListener('click', fn); panel.appendChild(b); };
    mk('نسخ التقرير', () => { try { navigator.clipboard.writeText(pre.textContent); } catch (e) {} });
    mk('إصلاح ظهور الشموع والمحاور', () => {
      try {
        if (global.TVSettings && global.TVSettings.repairVisuals) global.TVSettings.repairVisuals();
        else { const s = global.candleSeries, c = global.chart; if (s) s.applyOptions({ visible: true, priceScaleId: 'right' }); if (c) c.applyOptions({ rightPriceScale: { visible: true, autoScale: true }, timeScale: { visible: true } }); }
        setTimeout(() => { healView(); pre.textContent = report(); }, 180);
      } catch (e) { add('إصلاح العرض: ' + e.message); pre.textContent = report(); }
    });
    mk('عرض آخر الشموع', () => { healView(); pre.textContent = report(); });
    mk(global.TVGaps && global.TVGaps.isEnabled() ? 'إيقاف الفجوات وإعادة التحميل' : 'تفعيل الفجوات وإعادة التحميل', () => { try { if (global.TVGaps && global.TVGaps.isEnabled()) localStorage.setItem('tv_gaps_off', '1'); else localStorage.removeItem('tv_gaps_off'); } catch (e) {} location.reload(); });
    mk('مسح إعدادات الشارت المحفوظة', () => { try { SETTINGS_KEYS.forEach(k => localStorage.removeItem(k)); } catch (e) {} location.reload(); });
    mk('إغلاق', () => { panel.remove(); panel = null; });
    document.body.appendChild(panel);
  }

  function boot() { if (/[?&]debug=1/.test(location.search)) showBtn(); setTimeout(() => check(true), 5000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  global.TVHealth = { check, healView, report, errors, open: openPanel };
})(window);
