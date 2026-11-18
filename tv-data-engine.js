/* =========================================================================
   tv-data-engine.js — نظام بيانات الأسعار (إعادة بناء كاملة)

   المصدر الوحيد للبيانات: ملفات CSV الموجودة في مجلد data/ داخل المستودع.
   لا رفع يدوي، لا تخزين محلي، لا بيانات خارجية أو اصطناعية.

   ما يفعله:
   1) يكتشف الملفات المتاحة (الأصل/الفريم/السنة) من data/manifest.json الذي تولّده
      tools/build-data-manifest.js تلقائياً (المتصفح لا يستطيع قراءة محتوى مجلد على
      GitHub Pages). أصل غائب عن الفهرس: يجرّب الصيغة الأصلية DAT_MT_{الأصل}_M1_{السنة}.csv.
      بلا فهرس إطلاقاً: يجرّب كل الفريمات بطلبات HEAD ثم يحفظ النتيجة.
   2) يحمّل ملفات السنة المطلوبة (ملف سنوي أو عدة ملفات شهرية) ويحلّلها في Web Worker
      حتى لا تتجمد الواجهة مع ملفات بحجم ~25MB (بديل: التحليل في الخيط الرئيسي).
   3) يتحقق من الصفوف (تاريخ/وقت/أرقام/OHLC)، يرتّب زمنياً، ويحذف المكرر بالطابع الزمني.
   4) يخدم الشارت عبر نفس الواجهة الأصلية: SymbolDataStream.loadInitial / loadOlderIfNeeded /
      loadAroundDate و fetchYearChunk و clearCache و cacheSize.

   سياسة الوقت: التاريخ والوقت في الملف يُقرآن كما هما ويُحوَّلان إلى Unix بالثواني بعدّهما UTC
   (لا تحويل لمنطقة جهاز المتصفح)، فيظهر وقت الشمعة على الشارت كما هو مكتوب في الملف.
   ========================================================================= */
(function (global) {
  'use strict';

  const MIN_YEAR = 2000;
  const MAX_YEAR = Math.max(2025, new Date().getUTCFullYear());
  const INITIAL_TARGET_CANDLES = 2000;
  const BACKWARD_CHUNK_CANDLES_TRIGGER = 300;
  const MEMORY_LIMIT_CANDLES = 800000;   // حد الذاكرة لنافذة رمز واحد (نحو سنتين من M1)
  const MAX_CACHED_CHUNKS = 8;           // أقصى عدد ملفات-سنوات محفوظة بالذاكرة (الأقدم يُحذف)

  // =====================================================================
  // 1) محلّل CSV — دالة نقية بلا اعتماد خارجي (تعمل في Worker وفي الخيط الرئيسي)
  //    الصيغة المرجعية (HistData MetaTrader): YYYY.MM.DD,HH:MM,Open,High,Low,Close,Volume
  //    تُقبل أيضاً الفواصل ; و Tab، والتاريخ بـ - أو /، والثواني في الوقت، وسطر ترويسة أول اختياري.
  // =====================================================================
  function parseCsvText(text) {
    var stats = { rows: 0, accepted: 0, rejected: 0, rejectedByReason: {}, dupIdentical: 0, dupConflicting: 0, sorted: true, precision: 0, hasVolume: false };
    var T = [], O = [], H = [], L = [], C = [], V = [];
    var pos = 0, n = text.length, delim = null, prevT = -Infinity, prec = 0, anyVol = false, firstLine = true;
    var reDate = /^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/, reTime = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
    function rej(r) { stats.rejected++; stats.rejectedByReason[r] = (stats.rejectedByReason[r] || 0) + 1; }
    function dec(s) { var i = s.indexOf('.'); if (i < 0) return 0; var e = s.length; while (e > i + 1 && s.charCodeAt(e - 1) === 48) e--; return Math.min(8, e - i - 1); }
    while (pos < n) {
      var end = text.indexOf('\n', pos); if (end === -1) end = n;
      var line = text.substring(pos, end); pos = end + 1;
      if (line.length && line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
      if (!line.trim()) continue;
      if (delim === null) delim = line.indexOf(',') >= 0 ? ',' : (line.indexOf(';') >= 0 ? ';' : (line.indexOf('\t') >= 0 ? '\t' : ','));
      var f0 = line.charCodeAt(0), wasFirst = firstLine; firstLine = false;
      if (wasFirst && !(f0 >= 48 && f0 <= 57)) continue; // سطر الترويسة الأول فقط (لا يبدأ برقم)؛ غيره من الأسطر غير الرقمية مرفوض ومُعدّ
      stats.rows++;
      var c = line.split(delim);
      if (c.length < 6) { rej('bad_columns'); continue; }
      var md = reDate.exec(c[0].trim()), mt = reTime.exec(c[1].trim());
      if (!md) { rej('bad_date'); continue; }
      if (!mt) { rej('bad_time'); continue; }
      var y = +md[1], mo = +md[2], da = +md[3], hh = +mt[1], mi = +mt[2], ss = mt[3] ? +mt[3] : 0;
      if (mo < 1 || mo > 12 || da < 1 || da > 31 || hh > 23 || mi > 59 || ss > 59) { rej('bad_datetime'); continue; }
      var ms = Date.UTC(y, mo - 1, da, hh, mi, ss);
      if (new Date(ms).getUTCDate() !== da) { rej('bad_datetime'); continue; } // مثل 31 فبراير
      var s2 = c[2].trim(), s3 = c[3].trim(), s4 = c[4].trim(), s5 = c[5].trim();
      var o = parseFloat(s2), h = parseFloat(s3), l = parseFloat(s4), cl = parseFloat(s5);
      if (!(isFinite(o) && isFinite(h) && isFinite(l) && isFinite(cl))) { rej('bad_number'); continue; }
      if (o <= 0 || h <= 0 || l <= 0 || cl <= 0) { rej('non_positive_price'); continue; }
      if (h < l || h < o || h < cl || l > o || l > cl) { rej('invalid_ohlc'); continue; }
      var v = c.length > 6 ? parseFloat(c[6]) : 0; if (!isFinite(v) || v < 0) v = 0; if (v > 0) anyVol = true;
      var t = ms / 1000; if (t < prevT) stats.sorted = false; prevT = t;
      var d1 = dec(s2), d2 = dec(s3), d3 = dec(s4), d4 = dec(s5); if (d1 > prec) prec = d1; if (d2 > prec) prec = d2; if (d3 > prec) prec = d3; if (d4 > prec) prec = d4;
      T.push(t); O.push(o); H.push(h); L.push(l); C.push(cl); V.push(v);
    }
    var count = T.length, order = null;
    if (!stats.sorted) { // فرز مستقر بالطابع الزمني (تبقى الأولى في الملف عند التساوي)
      order = new Array(count); for (var i = 0; i < count; i++) order[i] = i;
      order.sort(function (a, b) { return T[a] - T[b] || a - b; });
    }
    var oT = new Float64Array(count), oO = new Float64Array(count), oH = new Float64Array(count), oL = new Float64Array(count), oC = new Float64Array(count), oV = new Float64Array(count), k = 0;
    for (var j = 0; j < count; j++) {
      var s = order ? order[j] : j;
      if (k > 0 && oT[k - 1] === T[s]) { // نفس الطابع الزمني: تُحذف الشمعة المكررة
        if (oO[k - 1] === O[s] && oH[k - 1] === H[s] && oL[k - 1] === L[s] && oC[k - 1] === C[s]) stats.dupIdentical++; else stats.dupConflicting++;
        continue;
      }
      oT[k] = T[s]; oO[k] = O[s]; oH[k] = H[s]; oL[k] = L[s]; oC[k] = C[s]; oV[k] = V[s]; k++;
    }
    stats.accepted = k; stats.precision = prec; stats.hasVolume = anyVol;
    return { T: oT.subarray(0, k), O: oO.subarray(0, k), H: oH.subarray(0, k), L: oL.subarray(0, k), C: oC.subarray(0, k), V: oV.subarray(0, k), stats: stats };
  }

  // ---- تشغيل المحلّل في Worker (بديل: الخيط الرئيسي) ----
  const WORKER_SRC = '(function(){' + parseCsvText.toString() + ';self.onmessage=function(e){try{var text=new TextDecoder("utf-8").decode(e.data.buf);var r=parseCsvText(text);postMessage({id:e.data.id,res:r},[r.T.buffer,r.O.buffer,r.H.buffer,r.L.buffer,r.C.buffer,r.V.buffer]);}catch(err){postMessage({id:e.data.id,error:String(err&&err.message||err)});}};})()';
  let worker = null, workerBroken = false, taskSeq = 0; const pending = new Map();
  function getWorker() {
    if (workerBroken || typeof Worker === 'undefined' || typeof Blob === 'undefined') return null;
    if (worker) return worker;
    try {
      worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' })));
      worker.onmessage = function (e) { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.res); };
      worker.onerror = function () { workerBroken = true; worker = null; pending.forEach(p => p.reject(new Error('worker_failed'))); pending.clear(); };
      return worker;
    } catch (e) { workerBroken = true; worker = null; return null; }
  }
  async function parseBuffer(buf) {
    const w = getWorker();
    if (w) {
      try { return await new Promise((resolve, reject) => { const id = ++taskSeq; pending.set(id, { resolve, reject }); w.postMessage({ id: id, buf: buf }); }); }
      catch (e) { /* يُكمَل بالخيط الرئيسي */ }
    }
    await new Promise(r => setTimeout(r, 0)); // أعطِ الواجهة فرصة للرسم قبل التحليل
    return parseCsvText(new TextDecoder('utf-8').decode(buf));
  }
  // تحويل المصفوفات المعبّأة إلى شموع {time,open,high,low,close,volume} على دفعات (لا تجميد)
  async function toCandles(r) {
    const n = r.T.length, out = new Array(n), STEP = 80000;
    for (let i = 0; i < n; i++) {
      out[i] = { time: r.T[i], open: r.O[i], high: r.H[i], low: r.L[i], close: r.C[i], volume: r.V[i] };
      if (i % STEP === STEP - 1) await new Promise(res => setTimeout(res, 0));
    }
    return out;
  }

  // =====================================================================
  // 2) فهرس الملفات (manifest) والاكتشاف التلقائي
  // =====================================================================
  const FRAMES = [['M1', 60], ['M5', 300], ['M15', 900], ['M30', 1800], ['H1', 3600], ['H4', 14400], ['D1', 86400]];
  let manifest = null, manifestPromise = null;
  const discovered = {}, discoverPromises = {};

  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch('data/manifest.json', { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null)).catch(() => null)
        .then(m => { manifest = (m && m.symbols) ? m : null; registerManifestSymbols(); return manifest; });
    }
    return manifestPromise;
  }
  function pickFrame(symbol) {
    const info = manifest && manifest.symbols[symbol];
    if (info) { // أصغر فريم متوفر (M1 مفضّل لأن الشارت يجمّع منه)
      const names = Object.keys(info.frames).sort((a, b) => info.frames[a].baseSec - info.frames[b].baseSec);
      return names.length ? Object.assign({ name: names[0] }, info.frames[names[0]]) : null;
    }
    return discovered[symbol] || null;
  }
  const yearsOf = symbol => { const f = pickFrame(symbol); return f ? f.years.slice() : null; };
  const baseMinutes = symbol => { const f = pickFrame(symbol); return f ? Math.max(1, Math.round(f.baseSec / 60)) : 1; };
  const symbols = () => (manifest ? Object.keys(manifest.symbols) : []);

  async function exists(url) {
    try {
      let r = await fetch(url, { method: 'HEAD' });
      if (r.status === 405 || r.status === 501) r = await fetch(url, { headers: { Range: 'bytes=0-0' } });
      return r.ok;
    } catch (e) { return false; }
  }
  // جرّب DAT_MT_{الأصل}_{الفريم}_{السنة}.csv بدفعات صغيرة: كل الفريمات (M1 أولاً) إن لم يوجد فهرس،
  // أو M1 فقط (الصيغة الأصلية) لأصل غائب عن فهرس موجود (فهرس لم يُحدَّث بعد)
  function discoverSymbol(symbol, m1Only) {
    if (!(symbol in discoverPromises)) {
      discoverPromises[symbol] = (async () => {
        const years = []; for (let y = MAX_YEAR; y >= MIN_YEAR; y--) years.push(y);
        for (const [name, baseSec] of (m1Only ? FRAMES.slice(0, 1) : FRAMES)) {
          const urls = years.map(y => 'data/DAT_MT_' + symbol + '_' + name + '_' + y + '.csv'), hits = [];
          for (let i = 0; i < urls.length; i += 8) hits.push(...await Promise.all(urls.slice(i, i + 8).map(exists)));
          const found = years.filter((_, i) => hits[i]).sort((a, b) => a - b);
          if (found.length) {
            const periods = {}; found.forEach(y => { periods[String(y)] = 'DAT_MT_' + symbol + '_' + name + '_' + y + '.csv'; });
            return (discovered[symbol] = { name, baseSec, years: found, periods });
          }
        }
        return (discovered[symbol] = null);
      })();
    }
    return discoverPromises[symbol];
  }
  // فهرس موجود = المرجع (يحدّثه الـ Action). أصل غائب عنه = تجربة الصيغة الأصلية M1 فقط.
  // بلا فهرس = اكتشاف بالتجربة (كل الفريمات).
  async function ensureInfo(symbol) {
    await loadManifest();
    if (manifest && manifest.symbols[symbol]) return pickFrame(symbol);
    return discoverSymbol(symbol, !!manifest);
  }
  function urlsFor(symbol, year) {
    const f = pickFrame(symbol); if (!f) return [];
    return Object.keys(f.periods).filter(k => +k.slice(0, 4) === year).sort().map(k => 'data/' + encodeURIComponent(f.periods[k]));
  }
  // الأصول الموجودة بالفهرس تُضاف لقائمة اختيار الأصل (إن لم تكن فيها) دون أي خطوة من المستخدم
  function registerManifestSymbols() {
    const run = () => {
      const sel = document.getElementById('pairSelect');
      symbols().forEach(sym => {
        if (sel && !Array.from(sel.options).some(o => o.value === sym)) { const o = document.createElement('option'); o.value = sym; o.textContent = sym; o.dataset.manifest = '1'; sel.appendChild(o); }
        if (global.MultiChartSymbols) global.MultiChartSymbols.register(sym, sym);
      });
    };
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(run, 500)); else setTimeout(run, 500);
  }

  // =====================================================================
  // 3) تحميل ملفات سنة (مع Cache، ومنع التكرار المتزامن، وسجل تحميل)
  // =====================================================================
  const yearCache = new Map(), inflight = new Map(), loadLog = [];
  const cacheKey = (symbol, year) => symbol + '_' + year;
  function logLoad(e) { loadLog.push(e); if (loadLog.length > 60) loadLog.shift(); }

  async function fetchBuffer(url) { // محاولة ثانية عند خطأ شبكة؛ 404 = لا ملف
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const res = await fetch(url); if (res.status === 404) return { missing: true }; if (!res.ok) throw new Error('HTTP ' + res.status); return { buf: await res.arrayBuffer() }; }
      catch (e) { last = e; }
    }
    return { error: last };
  }
  function mergeSorted(parts) {
    if (parts.length === 1) return parts[0];
    const all = [].concat(...parts).sort((a, b) => a.time - b.time), out = [];
    for (const c of all) { if (out.length && out[out.length - 1].time === c.time) continue; out.push(c); }
    return out;
  }

  async function loadYear(symbol, year) {
    await ensureInfo(symbol);
    const urls = urlsFor(symbol, year), parts = []; let transient = false;
    if (!urls.length) { logLoad({ symbol, year, status: 'no_file', note: 'لا ملف لهذه السنة' }); return { candles: [], cache: true }; }
    for (const url of urls) {
      const t0 = Date.now(), r = await fetchBuffer(url);
      if (r.missing) { logLoad({ symbol, year, file: url, status: 'missing', note: 'HTTP 404' }); continue; }
      if (r.error) { transient = true; logLoad({ symbol, year, file: url, status: 'error', note: String(r.error.message || r.error) }); continue; }
      try {
        const parsed = await parseBuffer(r.buf), st = parsed.stats;
        if (global.SYMBOL_PRECISION && global.SYMBOL_PRECISION[symbol] == null && st.precision) global.SYMBOL_PRECISION[symbol] = Math.max(2, st.precision);
        if (!st.accepted) { logLoad({ symbol, year, file: url, status: 'empty', rows: st.rows, rejected: st.rejected, note: st.rows ? 'كل الصفوف مرفوضة: ' + JSON.stringify(st.rejectedByReason) : 'ملف فارغ أو بلا بيانات' }); continue; }
        parts.push(await toCandles(parsed));
        logLoad({ symbol, year, file: url, status: 'ok', rows: st.rows, accepted: st.accepted, rejected: st.rejected, dupIdentical: st.dupIdentical, dupConflicting: st.dupConflicting, sorted: st.sorted, ms: Date.now() - t0 });
      } catch (e) { transient = true; logLoad({ symbol, year, file: url, status: 'error', note: 'فشل التحليل: ' + (e && e.message || e) }); }
    }
    return { candles: parts.length ? mergeSorted(parts) : [], cache: !transient || parts.length > 0 }; // الفشل المؤقت لا يُخزَّن
  }

  function fetchYearChunk(symbol, year) {
    const key = cacheKey(symbol, year);
    if (yearCache.has(key)) return Promise.resolve(yearCache.get(key));
    if (inflight.has(key)) return inflight.get(key); // طلب متزامن لنفس الملف: ينتظر الأول
    const p = loadYear(symbol, year).then(r => {
      if (r.cache) { yearCache.set(key, r.candles); while (yearCache.size > MAX_CACHED_CHUNKS) yearCache.delete(yearCache.keys().next().value); }
      return r.candles;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p); return p;
  }

  // =====================================================================
  // 4) SymbolDataStream — نفس الواجهة والمنطق الأصليين (نافذة بيانات لرمز واحد)
  // =====================================================================
  // يضمّ شموعاً أقدم قبل الحالية بلا تداخل (الحالية تُحفظ)
  function prependSafe(chunk, data) {
    if (!data.length || !chunk.length) return chunk.concat(data);
    const first = data[0].time; let n = chunk.length; while (n > 0 && chunk[n - 1].time >= first) n--;
    return (n === chunk.length ? chunk : chunk.slice(0, n)).concat(data);
  }
  function ensureAscending(arr) { // المكتبة ترفض غير الصاعد: فرز + حذف تكرار عند الحاجة فقط
    for (let i = 1; i < arr.length; i++) if (arr[i].time <= arr[i - 1].time) {
      const sorted = arr.slice().sort((a, b) => a.time - b.time), out = [];
      for (const c of sorted) { if (out.length && out[out.length - 1].time === c.time) continue; out.push(c); }
      return out;
    }
    return arr;
  }

  class SymbolDataStream {
    constructor(symbol) {
      this.symbol = symbol;
      this.data = [];                  // الشموع المحمّلة حالياً (نافذة متنقلة)
      this.oldestLoadedYear = null;
      this.newestLoadedYear = null;
      this.exhaustedBackward = false;  // وصلنا لأقدم سنة متوفرة
      this._loadingOlder = false;
      this._min = MIN_YEAR; this._max = MAX_YEAR;
    }
    async _initRange() { // نطاق السنوات المتاحة فعلاً لهذا الأصل
      await ensureInfo(this.symbol);
      const ys = yearsOf(this.symbol);
      if (ys && ys.length) { this._min = ys[0]; this._max = ys[ys.length - 1]; }
    }
    // تحميل أولي: أحدث سنة فيها بيانات، ثم للخلف حتى ~2000 شمعة على الأقل
    async loadInitial(targetCandles) {
      targetCandles = targetCandles || INITIAL_TARGET_CANDLES;
      this.data = []; await this._initRange();
      let year = this._max;
      while (year >= this._min) {
        const chunk = await fetchYearChunk(this.symbol, year);
        if (chunk.length) { this.newestLoadedYear = year; break; }
        year--;
      }
      if (year < this._min) { this.exhaustedBackward = true; return this.data; }
      let cur = year;
      while (this.data.length < targetCandles && cur >= this._min) {
        const chunk = await fetchYearChunk(this.symbol, cur);
        this.data = prependSafe(chunk, this.data);
        this.oldestLoadedYear = cur; cur--;
      }
      if (cur < this._min) this.exhaustedBackward = true;
      return this.data;
    }
    // عند الاقتراب من بداية البيانات المحمّلة: أضف أقرب سنة أقدم فيها بيانات
    async loadOlderIfNeeded(visibleFromIndex) {
      if (this._loadingOlder || this.exhaustedBackward) return false;
      if (visibleFromIndex > BACKWARD_CHUNK_CANDLES_TRIGGER) return false;
      if (this.oldestLoadedYear == null) return false;
      this._loadingOlder = true;
      try {
        let year = this.oldestLoadedYear - 1;
        while (year >= this._min) {
          const chunk = await fetchYearChunk(this.symbol, year);
          this.oldestLoadedYear = year;
          if (chunk.length) { this.data = prependSafe(chunk, this.data); this._trimFrontIfNeeded(); return true; }
          year--; // سنة بلا بيانات: جرّب الأقدم بنفس الاستدعاء
        }
        this.exhaustedBackward = true; return false;
      } finally { this._loadingOlder = false; }
    }
    _trimFrontIfNeeded() { // يحذف الفائض من الطرف الأقدم فقط (بلا فجوات وسطى)
      if (this.data.length <= MEMORY_LIMIT_CANDLES) return;
      this.data = this.data.slice(this.data.length - MEMORY_LIMIT_CANDLES);
      if (this.data.length) this.oldestLoadedYear = new Date(this.data[0].time * 1000).getUTCFullYear();
    }
    // تحميل حول تاريخ معيّن (قفز الباكتيست/الريبلاي): سنة الهدف + ما يلزم قبلها وبعدها
    async loadAroundDate(targetTimeSec, historyCandles, forwardCandles) {
      await this._initRange();
      const targetYear = new Date(targetTimeSec * 1000).getUTCFullYear();
      this.data = []; let year = targetYear, collected = [];
      while (year >= this._min) {
        const chunk = await fetchYearChunk(this.symbol, year);
        collected = prependSafe(chunk, collected); this.oldestLoadedYear = year;
        const idx = collected.findIndex(c => c.time >= targetTimeSec);
        if (idx >= historyCandles || (idx === -1 && collected.length >= historyCandles)) break;
        year--;
      }
      if (year < this._min) this.exhaustedBackward = true;
      let fwdYear = targetYear;
      const idxNow = collected.findIndex(c => c.time >= targetTimeSec);
      let haveForward = idxNow === -1 ? 0 : (collected.length - idxNow);
      while (haveForward < forwardCandles && fwdYear + 1 <= this._max) {
        fwdYear++;
        const chunk = await fetchYearChunk(this.symbol, fwdYear);
        collected = collected.concat(chunk); this.newestLoadedYear = fwdYear; haveForward += chunk.length;
      }
      if (this.newestLoadedYear == null) this.newestLoadedYear = targetYear;
      this.data = ensureAscending(collected);
      return this.data;
    }
  }

  // =====================================================================
  // 5) الواجهة العامة
  // =====================================================================
  const api = {
    SymbolDataStream, fetchYearChunk,
    clearCache() { yearCache.clear(); },
    cacheSize() { return yearCache.size; },
    // إضافات (لا تغيّر ما سبق): اكتشاف الملفات وسجل التحميل
    MIN_YEAR, MAX_YEAR, ready: null, loadManifest, ensureInfo, symbols, yearsOf, baseMinutes, manifest: () => manifest,
    loadLog: () => loadLog.slice(), _parseCsvText: parseCsvText
  };
  if (typeof window !== 'undefined' && global === window) { api.ready = loadManifest(); global.TVDataEngine = api; }
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
