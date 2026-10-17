/* =========================================================================
   tv-trade-ui.js — لوحة التداول الورقي مرتبطة بالريبلاي (محاكاة فقط)
   - تعمل فقط أثناء الريبلاي (isBacktest). لا تتلقى المحاكاة إلا الشموع التي
     كُشفت فعلاً عبر candleSeries.update، فلا تعرف المستقبل أبداً.
   - إعادة الضبط تلقائياً عند بدء ريبلاي جديد أو تغيير الرمز.
   - القواعد التنفيذية موثّقة أعلى tv-trading-sim.js.
   - المواصفات الافتراضية (السبريد/العمولة/حجم اللوت) افتراضات قابلة للتعديل
     وليست أسعار وسيط حقيقي.
   ========================================================================= */
(function (global) {
  'use strict';
  const CFG_KEY = 'tv_sim_cfg_v1';
  const FX = { lotSize: 100000, spread: 0.0001 };
  const SPECS = {
    XAUUSD: { lotSize: 100, spread: 0.30 }, XAGUSD: { lotSize: 5000, spread: 0.03 },
    USDJPY: { lotSize: 100000, spread: 0.010 }, BTCUSD: { lotSize: 1, spread: 20 },
    NASDAQ: { lotSize: 1, spread: 1.0 }, OIL: { lotSize: 1000, spread: 0.03 }, DXY: { lotSize: 1000, spread: 0.02 }
  };
  const specFor = sym => SPECS[sym] || FX;
  const fmt = (v, d) => (v == null || !isFinite(v)) ? '–' : Number(v).toFixed(d == null ? 2 : d);
  const T = { sim: null, symbol: null, tab: 'pos', open: false, lines: [], raf: 0, savedCfg: {} };

  function precision() { const p = global.SYMBOL_PRECISION && global.SYMBOL_PRECISION[T.symbol]; return p == null ? 5 : p; }
  function curSymbol() { const s = document.getElementById('pairSelect'); return s ? s.value : 'XAUUSD'; }
  function inReplay() { try { return !!global.getBacktestState().isBacktest; } catch (e) { return false; } }

  function loadCfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { return {}; } }
  function saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {} }

  function newSim() {
    T.symbol = curSymbol();
    const saved = loadCfg()[T.symbol] || {};
    T.sim = new TVTradingSim.Sim(Object.assign({ balance: 10000, leverage: 100, commissionPerLot: 7 }, specFor(T.symbol), saved));
    const st = global.getBacktestState && global.getBacktestState();
    if (st && st.isBacktest && global.candleSeries) { const d = global.candleSeries.data(); if (d.length) T.sim.onBar(d[d.length - 1]); }
    clearLines(); schedule();
  }

  // ---------- خطوط الصفقات على الشارت ----------
  function clearLines() { T.lines.forEach(l => { try { global.candleSeries.removePriceLine(l); } catch (e) {} }); T.lines = []; }
  function drawLines() {
    clearLines(); if (!global.candleSeries || !T.sim) return;
    const add = (price, color, title, style) => { if (price != null) T.lines.push(global.candleSeries.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title })); };
    T.sim.positions.forEach(p => { add(p.entry, p.side === 'long' ? '#26A69A' : '#EF5350', (p.side === 'long' ? 'Buy ' : 'Sell ') + p.qty, 0); add(p.sl, '#EF5350', 'SL', 2); add(p.tp, '#26A69A', 'TP', 2); });
    T.sim.orders.forEach(o => { if (o.price != null) add(o.price, '#FF9800', o.type + ' ' + o.qty, 1); });
  }

  // ---------- ربط البيانات (الشموع المكشوفة فقط) ----------
  function hook() {
    const s = global.candleSeries; if (!s || s.__tvTradeHooked) return !!s; s.__tvTradeHooked = true;
    const origUpdate = s.update.bind(s), origSet = s.setData.bind(s);
    s.update = function (bar) { const r = origUpdate(bar); if (inReplay() && T.sim) { T.sim.onBar(bar); schedule(); } return r; };
    s.setData = function (data) {
      const r = origSet(data);
      // setData = قفز/إعادة رسم وليس تقدماً: لا تُغذّى منه الشموع (حتى لا تُتخطّى أوامر/وقف).
      // عند عدم وجود أي صفقة/أمر نُعيد فقط تثبيت مرجع السعر على آخر شمعة معروضة.
      if (inReplay() && T.sim && data && data.length) T.sim.rebase(data[data.length - 1]);
      schedule();
      return r;
    };
    return true;
  }

  // ---------- واجهة ----------
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  let panel, ui = {};

  function build() {
    panel = el('div'); panel.id = 'tvTradePanel';
    panel.innerHTML =
      '<div class="tvt-head"><span>التداول الورقي — محاكاة</span><button class="tvx-x" id="tvtClose" aria-label="إغلاق">✕</button></div>' +
      '<div class="tvt-note" id="tvtNote"></div><div class="tvt-warn" id="tvtWarn" style="display:none"></div>' +
      '<div class="tvt-acct" id="tvtAcct"></div>' +
      '<div class="tvt-form">' +
      '<label>النوع<select id="tvtType"><option value="market">سوق</option><option value="limit">Limit</option><option value="stop">Stop</option></select></label>' +
      '<label>الحجم (لوت)<input id="tvtQty" type="number" step="0.01" min="0.01" value="0.10"></label>' +
      '<label>السعر (للمعلّق)<input id="tvtPrice" type="number" step="any" disabled></label>' +
      '<label>وقف الخسارة<input id="tvtSL" type="number" step="any"></label>' +
      '<label>جني الربح<input id="tvtTP" type="number" step="any"></label></div>' +
      '<div class="tvt-note" id="tvtMsg"></div>' +
      '<div class="tvt-go"><button class="tvx-btn sell" id="tvtSell">بيع</button><button class="tvx-btn buy" id="tvtBuy">شراء</button></div>' +
      '<div class="tvt-tabs"><button data-t="pos" class="on">الصفقات</button><button data-t="ord">الأوامر</button><button data-t="his">السجل</button><button data-t="cfg">الإعدادات</button></div>' +
      '<div class="tvt-list" id="tvtList"></div>';
    document.body.appendChild(panel);
    ['Type', 'Qty', 'Price', 'SL', 'TP', 'Msg', 'List', 'Acct', 'Note', 'Warn', 'Buy', 'Sell'].forEach(k => ui[k] = panel.querySelector('#tvt' + k));
    panel.querySelector('#tvtClose').addEventListener('click', () => toggle(false));
    ui.Type.addEventListener('change', () => { ui.Price.disabled = ui.Type.value === 'market'; });
    ui.Buy.addEventListener('click', () => submit('long')); ui.Sell.addEventListener('click', () => submit('short'));
    panel.querySelectorAll('.tvt-tabs button').forEach(b => b.addEventListener('click', () => { T.tab = b.dataset.t; panel.querySelectorAll('.tvt-tabs button').forEach(x => x.classList.toggle('on', x === b)); render(); }));
  }

  const ERR = {
    invalid_qty: 'الحجم غير صالح', invalid_price: 'السعر غير صالح', invalid_sl: 'وقف الخسارة غير صالح', invalid_tp: 'جني الربح غير صالح',
    sl_must_be_below_entry: 'وقف الخسارة يجب أن يكون أسفل سعر الدخول', sl_must_be_above_entry: 'وقف الخسارة يجب أن يكون أعلى سعر الدخول',
    tp_must_be_above_entry: 'جني الربح يجب أن يكون أعلى سعر الدخول', tp_must_be_below_entry: 'جني الربح يجب أن يكون أسفل سعر الدخول',
    pending_price_wrong_side_of_market: 'سعر الأمر المعلّق في الجهة الخاطئة من السوق', insufficient_margin: 'الهامش غير كافٍ'
  };

  function submit(side) {
    if (!inReplay()) { ui.Msg.textContent = 'ابدأ الريبلاي أولاً.'; return; }
    const num = e => e.value === '' ? null : Number(e.value);
    const type = ui.Type.value;
    const res = T.sim.placeOrder({ type, side, qty: num(ui.Qty), price: type === 'market' ? null : num(ui.Price), sl: num(ui.SL), tp: num(ui.TP) });
    if (!res.ok) { ui.Msg.className = 'tvt-note neg'; ui.Msg.textContent = (ERR[res.error] || res.error) + (res.required ? ' (المطلوب ' + fmt(res.required) + ' ، الحر ' + fmt(res.free) + ')' : ''); return; }
    ui.Msg.className = 'tvt-note'; ui.Msg.textContent = type === 'market' ? 'سيُنفَّذ عند افتتاح الشمعة التالية.' : 'تم وضع الأمر المعلّق.';
    render();
  }

  function pnlCls(v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; }

  function render() {
    T.raf = 0; if (!panel || !T.open) return;
    const replay = inReplay(); const s = T.sim, st = s.getState(), d = precision();
    ui.Note.textContent = replay ? 'الرمز: ' + T.symbol + ' — محاكاة فقط وليست أوامر وسيط حقيقي. أمر السوق يُنفَّذ عند افتتاح الشمعة التالية.' : 'ابدأ وضع الريبلاي لتفعيل التداول.';
    ui.Buy.disabled = ui.Sell.disabled = !replay;
    ui.Acct.innerHTML = '<span>الرصيد</span><b>' + fmt(st.balance) + '</b><span>القيمة (Equity)</span><b>' + fmt(st.equity) + '</b>' +
      '<span>الهامش المستخدم</span><b>' + fmt(st.usedMargin) + '</b><span>الهامش الحر</span><b>' + fmt(st.freeMargin) + '</b>' +
      '<span>مستوى الهامش</span><b>' + (st.marginLevel == null ? '–' : fmt(st.marginLevel, 0) + '%') + '</b>';
    const stopped = st.history.length && st.history[st.history.length - 1].reason === 'stop_out';
    ui.Warn.style.display = stopped ? 'block' : 'none'; ui.Warn.textContent = stopped ? 'تم إغلاق صفقة بسبب Stop-out (انخفاض مستوى الهامش).' : '';
    const L = ui.List; L.innerHTML = '';
    if (T.tab === 'pos') {
      if (!st.positions.length) L.appendChild(el('div', 'tvt-note', 'لا توجد صفقات مفتوحة'));
      st.positions.forEach(p => {
        const r = el('div', 'tvt-item', '<span>' + (p.side === 'long' ? 'شراء' : 'بيع') + ' ' + p.qty + ' @ ' + fmt(p.entry, d) + '<br><small>SL ' + fmt(p.sl, d) + ' / TP ' + fmt(p.tp, d) + ' / swap ' + fmt(p.swap) + '</small></span><b class="' + pnlCls(p.unrealized) + '" style="direction:ltr">' + fmt(p.unrealized) + '</b>');
        const b = el('button', 'tvx-btn', 'إغلاق'); b.addEventListener('click', () => { s.closePosition(p.id); render(); }); r.appendChild(b); L.appendChild(r);
      });
    } else if (T.tab === 'ord') {
      if (!st.orders.length) L.appendChild(el('div', 'tvt-note', 'لا توجد أوامر معلّقة'));
      st.orders.forEach(o => { const r = el('div', 'tvt-item', '<span>' + o.type + ' ' + (o.side === 'long' ? 'شراء' : 'بيع') + ' ' + o.qty + (o.price != null ? ' @ ' + fmt(o.price, d) : '') + '</span>'); const b = el('button', 'tvx-btn', 'إلغاء'); b.addEventListener('click', () => { s.cancelOrder(o.id); render(); }); r.appendChild(b); L.appendChild(r); });
    } else if (T.tab === 'his') {
      if (!st.history.length) L.appendChild(el('div', 'tvt-note', 'لا توجد صفقات مغلقة'));
      st.history.slice().reverse().forEach(h => L.appendChild(el('div', 'tvt-item', '<span>' + (h.side === 'long' ? 'شراء' : 'بيع') + ' ' + h.qty + ' ' + fmt(h.entry, d) + ' → ' + fmt(h.exit, d) + '<br><small>' + h.reason + ' | عمولة ' + fmt(h.commission) + ' | swap ' + fmt(h.swap) + '</small></span><b class="' + pnlCls(h.net) + '" style="direction:ltr">' + fmt(h.net) + '</b>')));
    } else renderCfg(L);
    drawLines();
  }

  function renderCfg(L) {
    const c = T.sim.cfg; const fields = [['leverage', 'الرافعة', 1, 1000], ['balance', 'الرصيد الابتدائي', 1, 1e9], ['lotSize', 'وحدات/لوت', 0.0001, 1e9], ['spread', 'السبريد (سعر)', 0, 1e6], ['commissionPerLot', 'عمولة/لوت (دورة كاملة)', 0, 1e6], ['swapLong', 'Swap شراء/لوت/ليلة', -1e6, 1e6], ['swapShort', 'Swap بيع/لوت/ليلة', -1e6, 1e6], ['stopOutLevel', 'Stop-out %', 0, 100]];
    const g = el('div', 'tvt-cfg'); const inputs = {};
    fields.forEach(([k, lab]) => { const l = el('label', null, '<span>' + lab + '</span>'); const i = document.createElement('input'); i.type = 'number'; i.step = 'any'; i.value = c[k]; inputs[k] = i; l.appendChild(i); g.appendChild(l); });
    const msg = el('div', 'tvt-note'); const row = el('div', 'tvt-go');
    const ok = el('button', 'tvx-btn primary', 'حفظ وإعادة ضبط الحساب'), note = el('button', 'tvx-btn', 'إعادة الضبط فقط');
    ok.addEventListener('click', () => {
      const nc = {}; for (const [k, lab, mn, mx] of fields) { const v = Number(inputs[k].value); if (!isFinite(v) || v < mn || v > mx) { msg.className = 'tvt-note neg'; msg.textContent = lab + ': قيمة غير صالحة'; return; } nc[k] = v; }
      const all = loadCfg(); all[T.symbol] = nc; saveCfg(all); T.sim = new TVTradingSim.Sim(Object.assign({}, T.sim.cfg, nc)); seedSim(); render();
    });
    note.addEventListener('click', () => { T.sim.reset(); seedSim(); render(); });
    row.appendChild(ok); row.appendChild(note); L.appendChild(g); L.appendChild(msg); L.appendChild(row);
  }
  function seedSim() { if (global.candleSeries && inReplay()) { const d = global.candleSeries.data(); if (d.length) T.sim.onBar(d[d.length - 1]); } }

  function schedule() { if (!T.raf && T.open) T.raf = requestAnimationFrame(render); }
  function toggle(force) { T.open = force == null ? !T.open : force; if (!panel) build(); panel.classList.toggle('open', T.open); if (T.open) render(); else clearLines(); }

  function init() {
    if (!global.TVTradingSim) return console.error('tv-trading-sim.js غير محمّل');
    newSim();
    const bar = document.getElementById('tvTopBar') || document.getElementById('controls');
    if (bar && !document.getElementById('tvTradeBtn')) {
      const b = el('button', 'tv-topbar-btn', 'تداول'); b.id = 'tvTradeBtn'; b.title = 'التداول الورقي (محاكاة)';
      b.addEventListener('click', e => { e.stopPropagation(); toggle(); }); bar.appendChild(b);
    }
    let tries = 0; const w = setInterval(() => { if (hook() || ++tries > 50) clearInterval(w); }, 100);
    const resetOn = () => setTimeout(() => { newSim(); if (T.open) render(); }, 50);
    const sb = document.getElementById('startBacktest'); if (sb) sb.addEventListener('click', resetOn);
    const eb = document.getElementById('exitBacktestBtn'); if (eb) eb.addEventListener('click', resetOn);
    const ps = document.getElementById('pairSelect'); if (ps) ps.addEventListener('change', resetOn);
  }
  global.TVTradeUI = { toggle, state: T, submit, render, newSim };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 700)); else setTimeout(init, 700);
})(window);
