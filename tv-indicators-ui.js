/* =========================================================================
   tv-indicators-ui.js — واجهة المؤشرات (تفعّل زر Indicators الموجود)
   - المؤشرات تُحسب من الشموع المعروضة فعلياً على الشارت (candleSeries.data())
     وهي سببية، فلا تكشف مستقبلاً أثناء الريبلاي.
   - تعمل على الشارت الرئيسي فقط (ليس شاشات المقارنة).
   - لا مؤشر حجم: بيانات HistData المتوفرة بلا حجم.
   ========================================================================= */
(function (global) {
  'use strict';
  const KEY = 'tv_indicators_v1';
  const COLORS = ['#2962FF', '#FF6D00', '#9C27B0', '#26A69A', '#E91E63', '#795548'];
  const state = { items: [], seq: 1, raf: 0 };

  const LW = () => global.LightweightCharts;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state.items.map(i => ({ id: i.id, params: i.params, colors: i.colors, width: i.width, visible: i.visible })))); } catch (e) {} };
  const def = id => TVIndicators.CATALOG.find(d => d.id === id);

  function label(it) { return def(it.id).name.replace(/\(.*\)/, '').trim() + ' (' + def(it.id).params.map(p => it.params[p.k]).join(', ') + ')'; }

  function createSeries(it) {
    const chart = global.chart, L = LW(); if (!chart || !L) return;
    const d = def(it.id), lines = TVIndicators.compute(it.id, [], it.params);
    const keys = d.id === 'bb' ? ['Basis', 'Upper', 'Lower'] : d.id === 'macd' ? ['MACD', 'Signal', 'Hist'] : d.id === 'stoch' ? ['%K', '%D'] : [d.id.toUpperCase()];
    const pane = d.pane === 'separate' ? (chart.panes ? chart.panes().length : 1) : 0;
    it.series = keys.map((k, i) => {
      const color = it.colors[i] || COLORS[i % COLORS.length];
      const hist = k === 'Hist';
      const s = chart.addSeries(hist ? L.HistogramSeries : L.LineSeries,
        hist ? { color, priceLineVisible: false, lastValueVisible: false } : { color, lineWidth: it.width, priceLineVisible: false, lastValueVisible: i === 0 }, pane);
      return { key: k, s };
    });
    if (d.id === 'rsi') { [30, 70].forEach(p => it.series[0].s.createPriceLine({ price: p, color: '#9aa0aa', lineWidth: 1, lineStyle: 2, axisLabelVisible: false })); }
    it.paneIndex = pane;
  }

  function removeSeries(it) {
    const chart = global.chart; if (!chart || !it.series) return;
    it.series.forEach(x => { try { chart.removeSeries(x.s); } catch (e) {} });
    if (it.paneIndex > 0 && chart.removePane) { try { if (chart.panes()[it.paneIndex] && chart.panes()[it.paneIndex].getSeries().length === 0) chart.removePane(it.paneIndex); } catch (e) {} }
    it.series = null;
  }

  function recompute() {
    state.raf = 0;
    if (!global.candleSeries || !state.items.length) { renderLegend(); return; }
    const bars = global.candleSeries.data();
    state.items.forEach(it => {
      if (!it.series) return;
      const res = TVIndicators.compute(it.id, bars, it.params);
      it.last = {};
      res.forEach((line, i) => {
        const target = it.series[i]; if (!target) return;
        const out = [];
        for (let k = 0; k < bars.length; k++) {
          const v = line.values[k]; if (v == null) continue;
          out.push(line.histogram ? { time: bars[k].time, value: v, color: v >= 0 ? '#26A69A' : '#EF5350' } : { time: bars[k].time, value: v });
        }
        target.s.setData(it.visible ? out : []);
        it.last[line.key] = out.length ? out[out.length - 1].value : null;
      });
    });
    renderLegend();
  }
  const schedule = () => { if (!state.raf) state.raf = requestAnimationFrame(recompute); };

  function hookSeries() {
    const s = global.candleSeries; if (!s || s.__tvIndHooked) return !!s;
    s.__tvIndHooked = true;
    ['update', 'setData'].forEach(fn => { const o = s[fn].bind(s); s[fn] = function () { const r = o.apply(null, arguments); schedule(); return r; }; });
    return true;
  }

  function add(id, opts) {
    const d = def(id); const params = {}; d.params.forEach(p => params[p.k] = p.def);
    const it = Object.assign({ uid: state.seq++, id, params, colors: [], width: 2, visible: true }, opts || {});
    d.params.forEach(p => { if (it.params[p.k] === undefined) it.params[p.k] = p.def; });
    state.items.push(it); createSeries(it); save(); schedule(); return it;
  }
  function remove(uid) { const i = state.items.findIndex(x => x.uid === uid); if (i < 0) return; removeSeries(state.items[i]); state.items.splice(i, 1); save(); renderLegend(); }

  // ---------- واجهة ----------
  function renderLegend() {
    const host = document.getElementById('chart'); if (!host) return;
    let box = document.getElementById('tvIndLegend');
    if (!box) { box = document.createElement('div'); box.id = 'tvIndLegend'; host.appendChild(box); }
    box.innerHTML = '';
    state.items.forEach(it => {
      const row = document.createElement('div'); row.className = 'tvx-leg' + (it.visible ? '' : ' off');
      // خيارات خط الحالة (من نافذة الإعدادات): العناوين / المدخلات / القيم / الخلفية
      const sl = (global.TVSettings && global.TVSettings.getState().statusLine) || {};
      const showTitle = sl.indTitles !== false, showInputs = !!sl.indInputs, showVals = sl.indicatorValues !== false;
      const vals = showVals && it.last ? Object.values(it.last).map(v => v == null ? '–' : (Math.abs(v) >= 100 ? v.toFixed(2) : v.toFixed(4))).join(' ') : '';
      const parts = [];
      if (showTitle) parts.push(def(it.id).name.replace(/\(.*\)/, '').trim());
      if (showInputs) parts.push('(' + def(it.id).params.map(p => it.params[p.k]).join(', ') + ')');
      if (vals) parts.push(vals);
      if (sl.indBackground === false) row.style.background = 'transparent';
      const t = document.createElement('span'); t.textContent = parts.join(' ') || '•'; row.appendChild(t);
      const mk = (txt, title, fn) => { const b = document.createElement('button'); b.textContent = txt; b.title = title; b.addEventListener('click', e => { e.stopPropagation(); fn(); }); row.appendChild(b); };
      mk(it.visible ? '👁' : '🚫', 'إظهار/إخفاء', () => { it.visible = !it.visible; save(); schedule(); });
      mk('⚙', 'إعدادات', () => openSettings(it));
      mk('✕', 'حذف', () => remove(it.uid));
      box.appendChild(row);
    });
  }

  function modal(title) {
    const back = document.createElement('div'); back.className = 'tvx-modal-back';
    const m = document.createElement('div'); m.className = 'tvx-modal';
    m.innerHTML = '<header><span></span><button class="tvx-x" aria-label="إغلاق">✕</button></header><div class="tvx-body"></div>';
    m.querySelector('span').textContent = title;
    const close = () => back.remove();
    m.querySelector('.tvx-x').addEventListener('click', close);
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    back.appendChild(m); document.body.appendChild(back);
    return { back, m, body: m.querySelector('.tvx-body'), close };
  }

  function openPicker() {
    const { body, close } = modal('المؤشرات');
    const inp = document.createElement('input'); inp.className = 'tvx-search'; inp.placeholder = 'ابحث في المؤشرات (مثل RSI أو EMA أو MACD)...'; body.appendChild(inp);
    const list = document.createElement('div'); body.appendChild(list);
    const draw = () => {
      const q = inp.value.trim().toLowerCase(); list.innerHTML = '';
      const hits = TVIndicators.CATALOG.filter(d => !q || d.name.toLowerCase().includes(q) || d.id.includes(q));
      if (!hits.length) { list.innerHTML = '<div class="tvx-tag" style="padding:14px;text-align:center">لا توجد نتائج</div>'; return; }
      hits.forEach(d => {
        const r = document.createElement('div'); r.className = 'tvx-row';
        r.innerHTML = '<span></span><span class="tvx-tag"></span>'; r.children[0].textContent = d.name; r.children[1].textContent = d.pane === 'overlay' ? 'على الشارت' : 'لوحة منفصلة';
        r.addEventListener('click', () => { add(d.id); close(); });
        list.appendChild(r);
      });
    };
    inp.addEventListener('input', draw); draw(); inp.focus();
  }

  function openSettings(it) {
    const d = def(it.id), { body, m, close } = modal(label(it));
    const err = document.createElement('div'); err.className = 'tvx-err';
    const inputs = {};
    d.params.forEach(p => {
      const f = document.createElement('div'); f.className = 'tvx-field'; f.innerHTML = '<span></span>'; f.firstChild.textContent = p.label;
      const i = document.createElement('input'); i.type = 'number'; i.value = it.params[p.k]; i.min = p.min; i.max = p.max; i.step = p.step || 1; inputs[p.k] = i; f.appendChild(i); body.appendChild(f);
    });
    const keys = it.series ? it.series.map(x => x.key) : [];
    const colorInputs = keys.map((k, idx) => {
      const f = document.createElement('div'); f.className = 'tvx-field'; f.innerHTML = '<span></span>'; f.firstChild.textContent = 'لون ' + k;
      const c = document.createElement('input'); c.type = 'color'; c.value = it.colors[idx] || COLORS[idx % COLORS.length]; f.appendChild(c); body.appendChild(f); return c;
    });
    const wf = document.createElement('div'); wf.className = 'tvx-field'; wf.innerHTML = '<span>سماكة الخط</span>';
    const w = document.createElement('input'); w.type = 'number'; w.min = 1; w.max = 4; w.value = it.width; wf.appendChild(w); body.appendChild(wf); body.appendChild(err);
    const act = document.createElement('div'); act.className = 'tvx-actions';
    act.innerHTML = '<button class="tvx-btn primary">موافق</button><button class="tvx-btn">إلغاء</button>';
    m.appendChild(act);
    act.children[1].addEventListener('click', close);
    act.children[0].addEventListener('click', () => {
      const np = {};
      for (const p of d.params) {
        const v = Number(inputs[p.k].value);
        if (!isFinite(v) || v < p.min || v > p.max || (p.step == null && !Number.isInteger(v))) { err.textContent = p.label + ': القيمة يجب أن تكون بين ' + p.min + ' و ' + p.max; return; }
        np[p.k] = v;
      }
      if (it.id === 'macd' && np.fast >= np.slow) { err.textContent = 'Fast يجب أن يكون أصغر من Slow'; return; }
      removeSeries(it); it.params = np; it.colors = colorInputs.map(c => c.value); it.width = Math.min(4, Math.max(1, Number(w.value) || 2));
      createSeries(it); save(); schedule(); close();
    });
  }

  function init() {
    if (!global.TVIndicators) return console.error('tv-indicators.js غير محمّل');
    const btn = document.getElementById('tvIndicatorsBtn'); if (btn) {
      btn.classList.remove('tv-disabled'); btn.title = 'المؤشرات'; btn.textContent = 'المؤشرات ▾';
      btn.addEventListener('click', e => { e.stopPropagation(); openPicker(); });
    }
    let tries = 0;
    const wait = setInterval(() => {
      if (hookSeries() || ++tries > 50) {
        clearInterval(wait);
        if (global.candleSeries) { load().forEach(s => { if (def(s.id)) add(s.id, s); }); }
      }
    }, 100);
  }
  global.addEventListener('tvCloneChartSettingsChanged', () => renderLegend());
  global.TVIndicatorsUI = { add, remove, items: () => state.items, openPicker, recompute };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 600)); else setTimeout(init, 600);
})(window);
