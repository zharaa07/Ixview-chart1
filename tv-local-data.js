/* =========================================================================
   tv-local-data.js — استيراد وتخزين ملفات الأسعار التاريخية المحلية
   - التخزين: IndexedDB (قاعدة ixview_local_data): datasets (بيانات وصفية لكل رمز)
     و chunks (شموع كل سنة UTC كمصفوفة Float64Array [t,o,h,l,c,v,...]).
   - الأولوية: إن وُجدت سنة محلية لرمز ما تُستخدم بدل ملف data/، وإلا يُجلب من data/.
   - الدمج: عند استيراد ملف يتقاطع مع بيانات محلية سابقة لنفس الرمز تُدمج الشموع
     بالطابع الزمني وتفوز الشموع الجديدة عند التطابق (يُبلَّغ بعددها).
   - لا اتصال خارجي إطلاقاً: كل المعالجة داخل المتصفح.
   ========================================================================= */
(function (global) {
  'use strict';
  const DB_NAME = 'ixview_local_data', DB_VER = 1;
  const registry = new Map(); // symbol -> meta
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error('indexeddb_unavailable'));
      const rq = indexedDB.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = () => { const d = rq.result; if (!d.objectStoreNames.contains('datasets')) d.createObjectStore('datasets', { keyPath: 'symbol' }); if (!d.objectStoreNames.contains('chunks')) d.createObjectStore('chunks'); };
      rq.onsuccess = () => resolve(rq.result); rq.onerror = () => reject(rq.error);
    });
    return dbPromise;
  }
  function req(store, mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode), os = tx.objectStore(store); const r = fn(os);
      tx.oncomplete = () => resolve(r && r.result !== undefined ? r.result : undefined); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    }));
  }

  const toFlat = arr => { const f = new Float64Array(arr.length * 6); arr.forEach((c, i) => { const o = i * 6; f[o] = c.time; f[o + 1] = c.open; f[o + 2] = c.high; f[o + 3] = c.low; f[o + 4] = c.close; f[o + 5] = c.volume || 0; }); return f; };
  const fromFlat = f => { const n = f.length / 6, out = new Array(n); for (let i = 0; i < n; i++) { const o = i * 6; out[i] = { time: f[o], open: f[o + 1], high: f[o + 2], low: f[o + 3], close: f[o + 4], volume: f[o + 5] }; } return out; };
  const yearOf = t => new Date(t * 1000).getUTCFullYear();

  async function getChunk(symbol, year) {
    if (!registry.has(symbol)) return null;
    const flat = await req('chunks', 'readonly', os => os.get(symbol + '|' + year));
    return flat ? fromFlat(flat) : null;
  }

  // يستورد شموعاً محلّلة ومتحقَّقاً منها؛ يُرجع ملخصاً
  async function importCandles(symbol, candles, info) {
    if (!/^[A-Z0-9._-]{2,20}$/.test(symbol)) throw new Error('invalid_symbol');
    if (!candles.length) throw new Error('no_candles');
    const byYear = new Map();
    candles.forEach(c => { const y = yearOf(c.time); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(c); });
    const meta = registry.get(symbol) || { symbol, from: null, to: null, count: 0, hasVolume: false, precision: 0, baseSec: 0, files: [] };
    let added = 0, replaced = 0;
    for (const [year, rows] of byYear) {
      const existing = (await getChunk(symbol, year)) || [];
      const map = new Map(); existing.forEach(c => map.set(c.time, c));
      rows.forEach(c => { if (map.has(c.time)) replaced++; else added++; map.set(c.time, c); });
      const merged = Array.from(map.values()).sort((a, b) => a.time - b.time);
      await req('chunks', 'readwrite', os => os.put(toFlat(merged), symbol + '|' + year));
      meta.count += merged.length - existing.length;
    }
    meta.from = meta.from == null ? candles[0].time : Math.min(meta.from, candles[0].time);
    meta.to = meta.to == null ? candles[candles.length - 1].time : Math.max(meta.to, candles[candles.length - 1].time);
    meta.hasVolume = meta.hasVolume || !!(info && info.hasVolume);
    meta.precision = Math.max(meta.precision || 0, (info && info.precision) || 0);
    meta.baseSec = meta.baseSec ? Math.min(meta.baseSec, info.baseSec || meta.baseSec) : (info && info.baseSec) || 60;
    meta.files.push({ name: (info && info.filename) || '', rows: candles.length, importedAt: Date.now() });
    meta.updatedAt = Date.now();
    await req('datasets', 'readwrite', os => os.put(meta));
    registry.set(symbol, meta); registerSymbol(meta);
    if (global.TVDataEngine) global.TVDataEngine.clearCache();
    if (global.TVSymbolAvailability) global.TVSymbolAvailability.reset();
    return { symbol, added, replaced, years: Array.from(byYear.keys()).sort(), meta };
  }

  async function remove(symbol) {
    const meta = registry.get(symbol); if (!meta) return false;
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(['datasets', 'chunks'], 'readwrite'); tx.objectStore('datasets').delete(symbol);
      const y0 = yearOf(meta.from), y1 = yearOf(meta.to); for (let y = y0; y <= y1; y++) tx.objectStore('chunks').delete(symbol + '|' + y);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    registry.delete(symbol); unregisterSymbol(symbol);
    if (global.TVDataEngine) global.TVDataEngine.clearCache();
    if (global.TVSymbolAvailability) global.TVSymbolAvailability.reset();
    return true;
  }

  // ---------- تسجيل الرمز في الواجهة (قائمة الرمز + البحث + الدقة) ----------
  function registerSymbol(meta) {
    const sym = meta.symbol;
    if (global.SYMBOL_PRECISION && meta.precision != null) global.SYMBOL_PRECISION[sym] = meta.precision;
    const sel = document.getElementById('pairSelect');
    if (sel && !Array.from(sel.options).some(o => o.value === sym)) { const o = document.createElement('option'); o.value = sym; o.textContent = sym; o.dataset.local = '1'; sel.appendChild(o); }
    if (global.MultiChartSymbols) global.MultiChartSymbols.register(sym, sym);
  }
  function unregisterSymbol(sym) {
    const sel = document.getElementById('pairSelect');
    if (sel) Array.from(sel.options).forEach(o => { if (o.value === sym && o.dataset.local === '1') o.remove(); });
    if (global.MultiChartSymbols) global.MultiChartSymbols.unregister(sym);
  }

  // يُحمَّل سجل البيانات فوراً (قبل أول طلب بيانات من المحرك)؛ تهيئة الواجهة لاحقاً بعد جاهزية DOM
  const ready = (async () => {
    try {
      const db = await openDB();
      const all = await new Promise((res, rej) => { const r = db.transaction('datasets').objectStore('datasets').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      all.forEach(m => registry.set(m.symbol, m));
    } catch (e) { console.warn('TVLocalData: التخزين المحلي غير متاح —', e.message); }
  })();
  function domInit() { registry.forEach(registerSymbol); installTimeframeGuard(); installButton(); }

  // ---------- حارس الأطر الزمنية: لا نبني إطاراً أصغر من دقة بيانات الرمز ----------
  function baseMinutes(sym) { const m = registry.get(sym); return m ? Math.max(1, Math.round(m.baseSec / 60)) : 1; }
  function timeframeAllowed(sym, minutes) {
    const b = baseMinutes(sym);
    if (!(minutes >= 1)) return { ok: false, reason: 'invalid' };
    if (minutes < b) return { ok: false, reason: 'finer_than_data', base: b };
    if (minutes <= 1440 && minutes % b !== 0) return { ok: false, reason: 'not_multiple', base: b };
    return { ok: true };
  }
  function installTimeframeGuard() {
    const sel = document.getElementById('timeframeSelect'), pair = document.getElementById('pairSelect');
    if (!sel || sel.__tvGuard) return; sel.__tvGuard = true;
    const orig = sel.onchange;
    sel.onchange = function (e) {
      const mins = Number(sel.value);
      if (isFinite(mins) && pair) {
        const chk = timeframeAllowed(pair.value, mins);
        if (!chk.ok && chk.reason !== 'invalid') {
          alert('الإطار الزمني المطلوب لا يمكن بناؤه بدقة من بيانات هذا الرمز (دقة الملف ' + chk.base + ' دقيقة).' + (chk.reason === 'not_multiple' ? ' اختر إطاراً من مضاعفاتها.' : ' اختر إطاراً أكبر أو يساويها.'));
          sel.value = String(chk.base);
        }
      }
      return orig ? orig.call(this, e) : undefined;
    };
  }

  // ---------- واجهة الاستيراد ----------
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmtT = t => t == null ? '–' : new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const REASONS = { bad_timestamp: 'وقت غير صالح', bad_number: 'رقم غير صالح/ناقص', non_positive_price: 'سعر صفر أو سالب', invalid_ohlc: 'شمعة OHLC غير منطقية', bad_volume: 'حجم غير صالح' };

  function openImportDialog() {
    const back = el('div', 'tvx-modal-back'), m = el('div', 'tvx-modal'); m.style.width = 'min(560px,96vw)';
    m.innerHTML = '<header><span>استيراد بيانات تاريخية محلية</span><button class="tvx-x" aria-label="إغلاق">✕</button></header><div class="tvx-body"></div>';
    const body = m.querySelector('.tvx-body'); const close = () => back.remove();
    m.querySelector('.tvx-x').addEventListener('click', close); back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    body.innerHTML = '<div class="tvx-tag" style="margin-bottom:8px">الملفات تُقرأ داخل متصفحك فقط ولا تُرسل لأي خادم. صيغ مدعومة: HistData/MetaTrader (YYYY.MM.DD,HH:MM,O,H,L,C,V) أو CSV بترويسة (date,time,open,high,low,close,volume). الأوقات تُعتمد كما هي في الملف (UTC).</div>' +
      '<input type="file" id="tvdFile" accept=".csv,.txt" multiple class="tvx-search">' +
      '<div class="tvx-field"><span>اسم الرمز</span><input type="text" id="tvdSym" placeholder="XAUUSD" style="width:140px;direction:ltr;text-transform:uppercase;padding:6px 8px;border-radius:5px;border:1px solid var(--tv-border,#2A2E39);background:var(--tv-bg,#131722);color:inherit"></div>' +
      '<div id="tvdReport" style="font-size:12px"></div><div class="tvx-err" id="tvdErr"></div>' +
      '<div style="margin-top:10px;font-weight:600">بياناتي المحفوظة</div><div id="tvdList"></div>';
    const act = el('div', 'tvx-actions', '<button class="tvx-btn primary" id="tvdGo" disabled>استيراد</button><button class="tvx-btn" id="tvdClose">إغلاق</button>');
    m.appendChild(act); back.appendChild(m); document.body.appendChild(back);
    const $ = id => m.querySelector('#' + id); let parsed = [];

    function renderList() {
      const L = $('tvdList'); L.innerHTML = '';
      if (!registry.size) { L.innerHTML = '<div class="tvx-tag" style="padding:8px">لا توجد بيانات مستوردة بعد.</div>'; return; }
      registry.forEach(meta => {
        const row = el('div', 'tvx-row');
        row.innerHTML = '<span><b>' + esc(meta.symbol) + '</b> <span class="tvx-tag">' + fmtT(meta.from) + ' → ' + fmtT(meta.to) + ' | ' + meta.count.toLocaleString() + ' شمعة | ' + Math.round(meta.baseSec / 60) + 'm | ' + (meta.hasVolume ? 'مع حجم' : 'بلا حجم') + '</span></span>';
        const del = el('button', 'tvx-btn', 'حذف'); del.addEventListener('click', async e => { e.stopPropagation(); if (confirm('حذف بيانات ' + meta.symbol + ' المحلية؟ لا يمكن التراجع.')) { await remove(meta.symbol); renderList(); } });
        row.appendChild(del); L.appendChild(row);
      });
    }
    renderList();

    $('tvdFile').addEventListener('change', async () => {
      const files = Array.from($('tvdFile').files); parsed = []; $('tvdErr').textContent = ''; $('tvdGo').disabled = true; const R = $('tvdReport'); R.innerHTML = 'جارٍ التحليل…';
      if (!files.length) { R.innerHTML = ''; return; }
      if (!$('tvdSym').value) $('tvdSym').value = TVDataImport.suggestSymbol(files[0].name);
      let html = '';
      for (const f of files) {
        await new Promise(r => setTimeout(r, 0));
        const text = await f.text(); const r = TVDataImport.parseCSV(text), rp = r.report;
        if (rp.error) { html += '<div class="tvx-err">' + esc(f.name) + ': ' + (rp.error === 'empty_file' ? 'ملف فارغ' : 'صيغة غير معروفة (تحقق من الأعمدة)') + '</div>'; continue; }
        parsed.push({ file: f, candles: r.candles, report: rp });
        const reasons = Object.keys(rp.rejectedByReason).map(k => (REASONS[k] || k) + ': ' + rp.rejectedByReason[k]).join('، ');
        html += '<div style="border:1px solid var(--tv-border,#2A2E39);border-radius:6px;padding:8px;margin:6px 0"><b>' + esc(f.name) + '</b><br>' +
          'الصفوف: ' + rp.totalRows.toLocaleString() + ' ← مقبولة ' + rp.accepted.toLocaleString() + (rp.rejected ? ' | مرفوضة ' + rp.rejected + ' (' + reasons + ')' : '') + '<br>' +
          'النطاق: ' + fmtT(rp.from) + ' → ' + fmtT(rp.to) + ' | الدقة: ' + Math.round(rp.baseSec / 60 * 100) / 100 + ' دقيقة | الخانات العشرية: ' + rp.precision + '<br>' +
          (rp.sorted ? '' : '<span style="color:#FFB300">⚠ الملف غير مرتب زمنياً — تم الفرز.</span><br>') +
          (rp.duplicatesIdentical ? '<span style="color:#FFB300">⚠ ' + rp.duplicatesIdentical + ' صف مكرر متطابق حُذف.</span><br>' : '') +
          (rp.duplicatesConflicting ? '<span style="color:#ef5350">⚠ ' + rp.duplicatesConflicting + ' طابع زمني مكرر بقيم مختلفة — أُبقيت الأولى.</span><br>' : '') +
          (rp.hasVolume ? 'الحجم: موجود' : 'الحجم: غير موجود في الملف (لن يُعرض حجم).') +
          (rp.baseSec > 60 ? '<br><span style="color:#FFB300">⚠ دقة الملف أكبر من دقيقة: لن تُبنى أطر أصغر منها.</span>' : '') + '</div>';
      }
      R.innerHTML = html; $('tvdGo').disabled = !parsed.length;
    });

    $('tvdClose').addEventListener('click', close);
    $('tvdGo').addEventListener('click', async () => {
      const sym = $('tvdSym').value.trim().toUpperCase(); const err = $('tvdErr'); err.textContent = '';
      if (!/^[A-Z0-9._-]{2,20}$/.test(sym)) { err.textContent = 'اسم الرمز: 2–20 حرفاً/رقماً (A-Z 0-9 . _ -)'; return; }
      $('tvdGo').disabled = true; $('tvdGo').textContent = 'جارٍ الحفظ…'; let summary = [];
      try {
        for (const p of parsed) { const s = await importCandles(sym, p.candles, Object.assign({ filename: p.file.name }, p.report)); summary.push(p.file.name + ': +' + s.added.toLocaleString() + (s.replaced ? ' (استُبدل ' + s.replaced.toLocaleString() + ')' : '')); }
        $('tvdReport').innerHTML = '<div style="color:#26A69A">تم الاستيراد ✔<br>' + summary.map(esc).join('<br>') + '</div>'; renderList();
        const sel = document.getElementById('pairSelect'); if (sel) { sel.value = sym; sel.dispatchEvent(new Event('change')); }
      } catch (e) { err.textContent = 'فشل الحفظ: ' + (e && e.message || e); }
      $('tvdGo').textContent = 'استيراد'; parsed = [];
    });
  }

  function installButton() {
    const bar = document.getElementById('tvTopBar') || document.getElementById('controls');
    if (!bar || document.getElementById('tvImportBtn')) return;
    const b = el('button', 'tv-topbar-btn', 'استيراد بيانات'); b.id = 'tvImportBtn'; b.title = 'استيراد ملفات أسعار محلية';
    b.addEventListener('click', e => { e.stopPropagation(); openImportDialog(); }); bar.appendChild(b);
  }

  global.TVLocalData = { ready, importCandles, getChunk, remove, openImportDialog, has: s => registry.has(s), meta: s => registry.get(s), symbols: () => Array.from(registry.keys()), range: s => { const m = registry.get(s); return m ? { from: yearOf(m.from), to: yearOf(m.to) } : null; }, baseMinutes, timeframeAllowed };
  ready.then(() => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(domInit, 300)); else setTimeout(domInit, 300); });
})(window);
