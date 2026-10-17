/* =========================================================================
   tv-backtest-ui.js — واجهة الباكتيست الآلي (تستخدم tv-strategy.js)
   تقرأ بيانات الرمز الحالي من محرك البيانات (المحلي أولاً)، تجمّعها بـ tv-aggregate.js
   وتشغّل الاستراتيجية، ثم تعرض المقاييس والمنحنى والصفقات. لا نتائج تُختلق:
   كل رقم يأتي من تشغيل فعلي على الشموع المحمّلة.
   ========================================================================= */
(function (global) {
  'use strict';
  const KEY = 'tv_bt_cfg_v1';
  const TFS = [[1, '1m'], [5, '5m'], [15, '15m'], [30, '30m'], [60, '1h'], [240, '4h'], [1440, '1D']];
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, d) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d });
  const iso = t => new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16);
  const dateStr = t => new Date(t * 1000).toISOString().slice(0, 10);
  const PKEY = 'tv_bt_presets_v1';
  const loadPresets = () => { try { return JSON.parse(localStorage.getItem(PKEY) || '{}'); } catch (e) { return {}; } };
  const savePresets = p => { try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) {} };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const save = c => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} };
  let last = null; // آخر نتيجة

  async function loadBars(symbol, fromSec, toSec) {
    const E = global.TVDataEngine; if (!E) throw new Error('محرك البيانات غير محمّل');
    const loc = global.TVLocalData && (await global.TVLocalData.ready, global.TVLocalData.range(symbol));
    const y0 = Math.max(E.MIN_YEAR, (loc ? Math.min(loc.from, 2011) : 2011), new Date(fromSec * 1000).getUTCFullYear() - 1), y1 = Math.min(E.MAX_YEAR, new Date(toSec * 1000).getUTCFullYear());
    let raw = []; for (let y = y0; y <= y1; y++) { const c = await E.fetchYearChunk(symbol, y); if (c.length) raw = raw.concat(c); }
    return raw;
  }

  function setMarkers(markers) {
    const s = global.candleSeries, L = global.LightweightCharts; if (!s) return;
    try {
      if (L && L.createSeriesMarkers) { if (!s.__tvBtMk) s.__tvBtMk = L.createSeriesMarkers(s, markers); else s.__tvBtMk.setMarkers(markers); }
      else if (s.setMarkers) s.setMarkers(markers);
    } catch (e) { console.warn('markers', e); }
  }

  function drawEquity(canvas, curve, initial) {
    const dpr = global.devicePixelRatio || 1, w = canvas.clientWidth || 600, h = 130; canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    if (curve.length < 2) return;
    let mn = Infinity, mx = -Infinity; curve.forEach(p => { if (p.equity < mn) mn = p.equity; if (p.equity > mx) mx = p.equity; }); if (initial < mn) mn = initial; if (initial > mx) mx = initial; if (mx === mn) { mx += 1; mn -= 1; }
    const X = i => 4 + i / (curve.length - 1) * (w - 8), Y = v => h - 6 - (v - mn) / (mx - mn) * (h - 12);
    ctx.strokeStyle = 'rgba(150,150,150,.5)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(0, Y(initial)); ctx.lineTo(w, Y(initial)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = curve[curve.length - 1].equity >= initial ? '#26A69A' : '#EF5350'; ctx.lineWidth = 1.5; ctx.beginPath();
    const step = Math.max(1, Math.floor(curve.length / (w * 2))); // تخفيف النقاط للعرض فقط
    curve.forEach((p, i) => { if (i % step && i !== curve.length - 1) return; i === 0 ? ctx.moveTo(X(i), Y(p.equity)) : ctx.lineTo(X(i), Y(p.equity)); }); ctx.stroke();
    ctx.fillStyle = 'rgba(150,150,150,.9)'; ctx.font = '10px sans-serif'; ctx.fillText(num(mx, 0), 4, 10); ctx.fillText(num(mn, 0), 4, h - 8);
  }

  function open() {
    if (!global.TVStrategy) return alert('tv-strategy.js غير محمّل');
    const symbol = (document.getElementById('pairSelect') || {}).value || 'XAUUSD';
    const meta = global.TVLocalData && global.TVLocalData.meta(symbol), baseMin = global.TVLocalData ? global.TVLocalData.baseMinutes(symbol) : 1;
    const cfg = Object.assign({ strategy: 'macross', tf: 60, direction: 'both', sizing: 'fixed', lots: 0.1, riskPct: 1, slMode: 'atr', slValue: 2, atrLen: 14, tpR: 2, balance: 10000, leverage: 100, lotSize: 100, spread: 0, commissionPerLot: 0, slippage: 0, maxPositions: 1, params: {} }, load());
    const back = el('div', 'tvx-modal-back'); back.id = 'tvBtPanel'; const m = el('div', 'tvx-modal'); m.style.maxHeight = '92vh';
    m.innerHTML = '<header><span>باكتيست استراتيجية — ' + esc(symbol) + '</span><button class="tvx-x" aria-label="إغلاق">✕</button></header><div class="tvx-body"></div>';
    const body = m.querySelector('.tvx-body'), close = () => back.remove(); m.querySelector('.tvx-x').addEventListener('click', close); back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    const fld = (label, input) => { const l = el('label', null, '<span>' + label + '</span>'); l.appendChild(input); return l; };
    const inp = (id, v, type, extra) => { const i = el('input'); i.id = id; i.type = type || 'number'; i.value = v; if (type !== 'date') i.step = 'any'; if (extra) Object.assign(i, extra); return i; };
    const sel = (id, opts, v) => { const s = el('select'); s.id = id; opts.forEach(([val, lab]) => { const o = el('option'); o.value = val; o.textContent = lab; s.appendChild(o); }); s.value = v; return s; };
    const defFrom = meta ? dateStr(meta.from) : '2019-01-01', defTo = meta ? dateStr(meta.to) : '2019-12-31';

    const g1 = el('div', 'tvb-grid');
    const stSel = sel('tvbStrat', Object.keys(TVStrategy.STRATEGIES).map(k => [k, TVStrategy.STRATEGIES[k].name]), cfg.strategy); g1.appendChild(fld('الاستراتيجية', stSel));
    g1.appendChild(fld('الإطار الزمني', sel('tvbTf', TFS.filter(([mi]) => global.TVLocalData ? global.TVLocalData.timeframeAllowed(symbol, mi).ok : true), String(cfg.tf))));
    g1.appendChild(fld('من (UTC)', inp('tvbFrom', cfg.from || defFrom, 'date'))); g1.appendChild(fld('إلى (UTC)', inp('tvbTo', cfg.to || defTo, 'date')));
    g1.appendChild(fld('الاتجاه', sel('tvbDir', [['both', 'شراء وبيع'], ['long', 'شراء فقط'], ['short', 'بيع فقط']], cfg.direction)));
    const pr = el('div', 'tvb-grid'); pr.style.marginBottom = '8px';
    pr.innerHTML = '<label><span>إعدادات محفوظة</span><select id="tvbPreset"></select></label><label><span>اسم الإعداد</span><input id="tvbPresetName" type="text" placeholder="مثال: تقاطع 10/30 على 1h"></label><label><span>&nbsp;</span><span><button class="tvx-btn" id="tvbPSave">حفظ</button> <button class="tvx-btn" id="tvbPLoad">تحميل</button> <button class="tvx-btn" id="tvbPDel">حذف</button></span></label>';
    body.appendChild(pr);
    body.appendChild(el('div', 'tvb-sec', 'الاستراتيجية')); body.appendChild(g1);
    const pBox = el('div', 'tvb-grid'); pBox.style.marginTop = '6px'; body.appendChild(pBox);
    const renderParams = () => { pBox.innerHTML = ''; TVStrategy.STRATEGIES[stSel.value].params.forEach(q => { const v = (cfg.params[stSel.value] || {})[q.k]; pBox.appendChild(fld(q.label, inp('tvbp_' + q.k, v == null ? q.def : v))); }); };
    stSel.addEventListener('change', renderParams); renderParams();
    body.appendChild(el('div', 'tvb-sec', 'المخاطرة والحجم'));
    const g2 = el('div', 'tvb-grid');
    g2.appendChild(fld('طريقة الحجم', sel('tvbSizing', [['fixed', 'لوت ثابت'], ['risk', 'نسبة مخاطرة %']], cfg.sizing))); g2.appendChild(fld('اللوت', inp('tvbLots', cfg.lots))); g2.appendChild(fld('المخاطرة %', inp('tvbRisk', cfg.riskPct)));
    g2.appendChild(fld('وقف الخسارة', sel('tvbSl', [['none', 'بلا'], ['points', 'نقاط سعرية'], ['atr', 'مضاعف ATR']], cfg.slMode))); g2.appendChild(fld('قيمة الوقف', inp('tvbSlV', cfg.slValue))); g2.appendChild(fld('فترة ATR', inp('tvbAtr', cfg.atrLen)));
    g2.appendChild(fld('الهدف (مضاعف R، 0=بلا)', inp('tvbTp', cfg.tpR))); g2.appendChild(fld('أقصى صفقات متزامنة', inp('tvbMaxPos', cfg.maxPositions))); body.appendChild(g2);
    body.appendChild(el('div', 'tvb-sec', 'الحساب والتكاليف (صفر ما لم تُحدّدها)'));
    const g3 = el('div', 'tvb-grid');
    [['tvbBal', 'الرصيد', cfg.balance], ['tvbLev', 'الرافعة', cfg.leverage], ['tvbLot', 'وحدات/لوت', cfg.lotSize], ['tvbSpread', 'السبريد (سعر)', cfg.spread], ['tvbComm', 'عمولة/لوت (دورة)', cfg.commissionPerLot], ['tvbSlip', 'الانزلاق (سعر)', cfg.slippage]].forEach(([id, l, v]) => g3.appendChild(fld(l, inp(id, v)))); body.appendChild(g3);
    body.appendChild(el('div', 'tvb-note', 'القرار يُتخذ عند إغلاق الشمعة ويُنفَّذ عند افتتاح التالية. عند لمس الوقف والهدف في نفس الشمعة يُفترض الوقف أولاً. هذا اختبار تاريخي وليس تداولاً حقيقياً.'));
    const err = el('div', 'tvx-err'); body.appendChild(err); const out = el('div'); body.appendChild(out);
    const act = el('div', 'tvx-actions', '<button class="tvx-btn primary" id="tvbRun">تشغيل الباكتيست</button><button class="tvx-btn" id="tvbStop" style="display:none">إيقاف</button><button class="tvx-btn" id="tvbClear">مسح العلامات</button><button class="tvx-btn" id="tvbCsv" disabled>تصدير الصفقات CSV</button>');
    m.appendChild(act); back.appendChild(m); document.body.appendChild(back);
    const $ = id => m.querySelector('#' + id), v = id => Number($(id).value);

    // قراءة النموذج كاملاً إلى كائن إعدادات (يُستخدم للحفظ والإعدادات المحفوظة)
    const collect = () => { const st = stSel.value, params = {}; TVStrategy.STRATEGIES[st].params.forEach(q => params[q.k] = v('tvbp_' + q.k));
      return { strategy: st, tf: v('tvbTf'), from: $('tvbFrom').value, to: $('tvbTo').value, direction: $('tvbDir').value, sizing: $('tvbSizing').value, lots: v('tvbLots'), riskPct: v('tvbRisk'), slMode: $('tvbSl').value, slValue: v('tvbSlV'), atrLen: v('tvbAtr'), tpR: v('tvbTp'), maxPositions: v('tvbMaxPos'), balance: v('tvbBal'), leverage: v('tvbLev'), lotSize: v('tvbLot'), spread: v('tvbSpread'), commissionPerLot: v('tvbComm'), slippage: v('tvbSlip'), params: Object.assign({}, cfg.params, { [st]: params }) }; };
    const applyCfg = c => {
      stSel.value = c.strategy; renderParamsFrom(c.params || {});
      const set = (id, val) => { if (val != null && $(id)) $(id).value = val; };
      set('tvbTf', String(c.tf)); set('tvbFrom', c.from); set('tvbTo', c.to); set('tvbDir', c.direction); set('tvbSizing', c.sizing); set('tvbLots', c.lots); set('tvbRisk', c.riskPct); set('tvbSl', c.slMode); set('tvbSlV', c.slValue); set('tvbAtr', c.atrLen); set('tvbTp', c.tpR); set('tvbMaxPos', c.maxPositions); set('tvbBal', c.balance); set('tvbLev', c.leverage); set('tvbLot', c.lotSize); set('tvbSpread', c.spread); set('tvbComm', c.commissionPerLot); set('tvbSlip', c.slippage);
    };
    const renderParamsFrom = ps => { pBox.innerHTML = ''; TVStrategy.STRATEGIES[stSel.value].params.forEach(q => { const val = (ps[stSel.value] || {})[q.k]; pBox.appendChild(fld(q.label, inp('tvbp_' + q.k, val == null ? q.def : val))); }); };
    const refreshPresets = () => { const P = loadPresets(), sel = $('tvbPreset'); sel.innerHTML = ''; const o0 = el('option'); o0.value = ''; o0.textContent = Object.keys(P).length ? '— اختر —' : 'لا توجد إعدادات محفوظة'; sel.appendChild(o0); Object.keys(P).forEach(k => { const o = el('option'); o.value = k; o.textContent = k; sel.appendChild(o); }); };
    refreshPresets();
    $('tvbPSave').addEventListener('click', () => { const name = $('tvbPresetName').value.trim(); if (!name) { err.textContent = 'اكتب اسماً للإعداد'; return; } const P = loadPresets(); P[name] = collect(); savePresets(P); refreshPresets(); $('tvbPreset').value = name; err.textContent = ''; });
    $('tvbPLoad').addEventListener('click', () => { const P = loadPresets(), k = $('tvbPreset').value; if (!k || !P[k]) { err.textContent = 'اختر إعداداً محفوظاً'; return; } applyCfg(P[k]); $('tvbPresetName').value = k; err.textContent = ''; });
    $('tvbPDel').addEventListener('click', () => { const P = loadPresets(), k = $('tvbPreset').value; if (k && P[k]) { delete P[k]; savePresets(P); refreshPresets(); } });
    let stopFlag = false; $('tvbStop').addEventListener('click', () => { stopFlag = true; });

    $('tvbClear').addEventListener('click', () => setMarkers([]));
    $('tvbCsv').addEventListener('click', () => {
      if (!last) return; const blob = new Blob([TVStrategy.tradesToCSV(last.trades)], { type: 'text/csv' }), a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'backtest_' + symbol + '_' + last.fingerprint.hash + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    $('tvbRun').addEventListener('click', async () => {
      err.textContent = ''; out.innerHTML = ''; const btn = $('tvbRun'), stopBtn = $('tvbStop'); btn.disabled = true; btn.textContent = 'جارٍ التحميل…'; stopFlag = false;
      try {
        const c = collect(), st = c.strategy, params = c.params[st];
        const fromSec = Date.parse(c.from + 'T00:00:00Z') / 1000, toSec = Date.parse(c.to + 'T23:59:59Z') / 1000;
        if (!isFinite(fromSec) || !isFinite(toSec) || fromSec >= toSec) throw new Error('نطاق التاريخ غير صالح');
        const tf = c.tf; const chk = global.TVLocalData ? global.TVLocalData.timeframeAllowed(symbol, tf) : { ok: true }; if (!chk.ok) throw new Error('الإطار الزمني غير ممكن لدقة هذه البيانات');
        const raw = await loadBars(symbol, fromSec, toSec); if (raw.length < 2) throw new Error('لا توجد بيانات محلية لهذا الرمز في النطاق المختار — استورد ملفاً أولاً');
        await new Promise(r => setTimeout(r, 0));
        const bars = TVAggregate.aggregate(raw, tf, (meta && meta.baseSec) || 60).filter(b => b.time <= toSec);
        stopBtn.style.display = ''; btn.textContent = 'جارٍ التشغيل 0%';
        const res = await TVStrategy.runAsync({ bars, strategy: { type: st, params }, from: fromSec, to: toSec, direction: c.direction, maxPositions: c.maxPositions,
          risk: { sizing: c.sizing, lots: c.lots, riskPct: c.riskPct, slMode: c.slMode, slValue: c.slValue, atrLen: c.atrLen, tpR: c.tpR },
          account: { balance: c.balance, leverage: c.leverage, lotSize: c.lotSize, spread: c.spread, commissionPerLot: c.commissionPerLot, slippage: c.slippage } },
          { onProgress: p => { btn.textContent = 'جارٍ التشغيل ' + Math.round(p * 100) + '%'; }, shouldStop: () => stopFlag });
        if (res.cancelled) throw new Error('أُوقف التشغيل — لا نتائج');
        if (!res.ok) throw new Error(res.errors.join(' — '));
        res.symbol = symbol; res.tf = tf; res.config = c; res.range = { from: fromSec, to: toSec }; res.datasetMeta = meta ? { count: meta.count, from: meta.from, to: meta.to, files: (meta.files || []).length } : null; last = res;
        save(c); render(res, out, bars.length); $('tvbCsv').disabled = false; setMarkers(res.markers);
      } catch (e) { err.textContent = e.message || String(e); }
      stopBtn.style.display = 'none'; btn.disabled = false; btn.textContent = 'تشغيل الباكتيست';
    });
  }

  function render(res, out, nBars) {
    const M = res.metrics, cls = x => x > 0 ? 'pos' : x < 0 ? 'neg' : '';
    const cell = (l, val, c) => '<div class="' + (c || '') + '"><span>' + l + '</span><b>' + val + '</b></div>';
    out.innerHTML = '<div class="tvb-sec">النتائج (' + nBars.toLocaleString() + ' شمعة)</div><div class="tvb-metrics">' +
      cell('صافي الربح', num(M.netProfit), cls(M.netProfit)) + cell('العائد %', num(M.returnPct) + '%', cls(M.returnPct)) + cell('عدد الصفقات', M.trades) +
      cell('نسبة الربح', M.winRate == null ? '–' : num(M.winRate, 1) + '%') + cell('عامل الربح', M.profitFactor == null ? (M.grossProfit > 0 ? '∞ (بلا خسائر)' : '–') : num(M.profitFactor)) +
      cell('أقصى تراجع', num(M.maxDrawdown) + ' (' + num(M.maxDrawdownPct, 1) + '%)', 'neg') + cell('متوسط الربح', num(M.avgWin), 'pos') + cell('متوسط الخسارة', num(M.avgLoss), 'neg') +
      cell('التوقع/صفقة', num(M.expectancy), cls(M.expectancy)) + cell('أكبر ربح', num(M.largestWin), 'pos') + cell('أكبر خسارة', num(M.largestLoss), 'neg') +
      cell('أطول سلسلة خسائر', M.maxConsecutiveLosses) + cell('متوسط المدة', dur(M.avgDurationSec)) + cell('متوسط R', num(M.rStats.avgR)) + cell('نسبة متوسط الربح/الخسارة', num(M.payoffRatio)) + cell('العمولات', num(M.commissionTotal)) + cell('السواب', num(M.swapTotal)) + cell('الرصيد النهائي', num(M.finalEquity)) + '</div>' +
      (res.rejectedOrders ? '<div class="tvx-err">أوامر رُفضت لنقص الهامش: ' + res.rejectedOrders + '</div>' : '') +
      (res.skippedZeroSize ? '<div class="tvb-note">إشارات تُجوهلت لأن حجم المخاطرة < 0.01 لوت: ' + res.skippedZeroSize + '</div>' : '') +
      '<div class="tvb-sec">الشراء مقابل البيع</div><table class="tvb-table"><thead><tr><th></th><th>الصفقات</th><th>نسبة الربح</th><th>الصافي</th><th>عامل الربح</th></tr></thead><tbody>' +
        ['long', 'short'].map(k => { const x = M.bySide[k]; return '<tr><td>' + (k === 'long' ? 'شراء' : 'بيع') + '</td><td>' + x.trades + '</td><td>' + (x.winRate == null ? '–' : num(x.winRate, 1) + '%') + '</td><td class="' + cls(x.netProfit) + '">' + num(x.netProfit) + '</td><td>' + (x.profitFactor == null ? '–' : num(x.profitFactor)) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<div class="tvb-sec">منحنى الرصيد (Equity)</div><canvas style="width:100%"></canvas>' +
      '<div class="tvb-note"><b>هوية الاختبار:</b> ' + esc(res.symbol) + ' | إطار ' + res.tf + ' دقيقة | ' + iso(res.range.from) + ' → ' + iso(res.range.to) + ' UTC | الشموع المستخدمة ' + res.dataQuality.bars.toLocaleString() + (res.datasetMeta ? ' | بيانات محلية: ' + res.datasetMeta.count.toLocaleString() + ' شمعة M1 (' + res.datasetMeta.files + ' ملف)' : ' | بيانات data/') + ' | أقصى صفقات متزامنة ' + res.maxPositions + '</div>' +
      (function () { const q = res.dataQuality; return '<div class="tvb-note">' + (q.gapCount ? 'فجوات زمنية في البيانات: ' + q.gapCount + ' (أكبرها ' + dur(q.largestGapSec) + '، منها ' + q.gapsOverOneDay + ' فوق يوم) — تُترك كما هي ولا تُملأ؛ أي وقف/هدف داخل فجوة يُنفَّذ عند أول شمعة بعدها.' : 'لا فجوات زمنية غير متوقعة في الشموع المستخدمة.') + (q.partialLastBar ? ' آخر شمعة غير مكتملة.' : '') + '</div>'; })() +
      '<div class="tvb-note">البصمة: <b dir="ltr">' + res.fingerprint.hash + '</b> — نفس البيانات والإعدادات تعطي نفس النتيجة. ' + esc(res.assumptions.join(' • ')) + '</div>' +
      '<div class="tvb-sec">الصفقات (' + res.trades.length + ') — انقر صفقة لفحصها</div><div id="tvbDetail" class="tvb-note" style="display:none;background:var(--tv-bg,#131722);border:1px solid var(--tv-border,#2A2E39);border-radius:5px;padding:8px"></div><div class="tvb-scroll"><table class="tvb-table"><thead><tr><th>#</th><th>الاتجاه</th><th>الدخول</th><th>الخروج</th><th>السبب</th><th>الصافي</th><th>R</th></tr></thead><tbody></tbody></table></div>';
    const tb = out.querySelector('tbody');
    res.trades.forEach((t, i) => { const tr = el('tr', 'tvb-row'); tr.innerHTML = '<td>' + (i + 1) + '</td><td>' + (t.side === 'long' ? 'شراء' : 'بيع') + ' ' + t.qty + '</td><td>' + iso(t.entryTime) + ' @ ' + num(t.entry, 3) + '</td><td>' + iso(t.exitTime) + ' @ ' + num(t.exit, 3) + '</td><td>' + t.reason + '</td><td class="' + cls(t.net) + '">' + num(t.net) + '</td><td>' + (t.r == null ? '–' : num(t.r)) + '</td>'; tr.addEventListener('click', () => { inspect(t, i, res, out); focusTrade(t); }); tb.appendChild(tr); });
    drawEquity(out.querySelector('canvas'), res.equity, M.initialBalance);
  }

  const dur = sec => { if (sec == null || !isFinite(sec)) return '–'; if (sec < 3600) return Math.round(sec / 60) + ' د'; if (sec < 86400) return num(sec / 3600, 1) + ' س'; return num(sec / 86400, 1) + ' يوم'; };
  // فحص صفقة واحدة: مدخلاتها ونتيجتها كما سُجّلت في التشغيل نفسه
  function inspect(t, i, res, out) {
    const box = out.querySelector('#tvbDetail'); if (!box) return; box.style.display = '';
    const ps = res.config ? res.config.params[res.config.strategy] : {}, rc = res.config || {};
    box.innerHTML = '<b>صفقة #' + (i + 1) + ' — ' + (t.side === 'long' ? 'شراء' : 'بيع') + ' ' + t.qty + ' لوت</b><br>' +
      'الإشارة عند إغلاق شمعة: ' + (t.decisionTime == null ? '–' : iso(t.decisionTime)) + ' ← التنفيذ عند افتتاح: ' + iso(t.entryTime) + ' @ ' + num(t.entry, 5) + '<br>' +
      'الوقف: ' + (t.sl == null ? 'بلا' : num(t.sl, 5)) + ' | الهدف: ' + (t.tp == null ? 'بلا' : num(t.tp, 5)) + '<br>' +
      'الخروج: ' + iso(t.exitTime) + ' @ ' + num(t.exit, 5) + ' (' + t.reason + ') | المدة ' + dur(t.exitTime - t.entryTime) + ' (' + t.bars + ' شمعة)<br>' +
      'الربح الإجمالي ' + num(t.gross) + ' − عمولة ' + num(t.commission) + ' + سواب ' + num(t.swap) + ' = <b>' + num(t.net) + '</b>' + (t.r == null ? '' : ' | R = ' + num(t.r)) + '<br>' +
      '<span class="tvb-note">الاستراتيجية: ' + esc(rc.strategy || '') + ' ' + esc(JSON.stringify(ps)) + ' | حجم: ' + esc(rc.sizing || '') + ' | وقف: ' + esc(rc.slMode || '') + ' ' + (rc.slValue || '') + ' | هدف R: ' + (rc.tpR || 0) + '</span>';
  }

  function focusTrade(t) {
    const ch = global.chart; if (!ch) return; const span = Math.max((t.exitTime - t.entryTime) * 2, 3600 * 4);
    try { ch.timeScale().setVisibleRange({ from: t.entryTime - span, to: t.exitTime + span }); } catch (e) { alert('هذه الصفقة خارج النطاق المحمّل حالياً في الشارت (على إطار ' + (last ? last.tf : '') + ' دقيقة). غيّر الإطار/التاريخ في الشارت لرؤيتها.'); }
  }

  function init() {
    const bar = document.getElementById('tvTopBar') || document.getElementById('controls'); if (!bar || document.getElementById('tvBtBtn')) return;
    const b = el('button', 'tv-topbar-btn', 'باكتيست'); b.id = 'tvBtBtn'; b.title = 'باكتيست استراتيجية على البيانات المحلية'; b.addEventListener('click', e => { e.stopPropagation(); open(); }); bar.appendChild(b);
  }
  global.TVBacktestUI = { open, render, last: () => last };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 800)); else setTimeout(init, 800);
})(window);
