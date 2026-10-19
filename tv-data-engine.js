/* =========================================================================
   tv-data-engine.js — محرك بيانات Lazy Loading احترافي

   يستبدل منطق loadAllYears/loadYear القديم في backtest.js بنظام:
   - تحميل آخر ~2000 شمعة فقط عند الفتح (سنة واحدة أو سنتين حسب الحاجة)
   - تحميل تلقائي لسنة أقدم عند الاقتراب من بداية البيانات المحمّلة
   - Memory Cache لكل سنة/رمز (لا يُعاد تحميل نفس الملف مرتين)
   - حد أقصى للذاكرة (10000 شمعة) مع تفريغ الأجزاء البعيدة عن العرض الحالي
   - تحميل مباشر حول تاريخ معيّن (لوضع الباكتيست) بدل تحميل كل السنوات

   الوحدة الأساسية للتقسيم هنا هي "السنة" (نفس بنية الملفات الحالية
   DAT_MT_{symbol}_M1_{year}.csv) — وهذا "Chunk" كافٍ عملياً (كل سنة
   ~370,000 شمعة دقيقة، أكبر بكثير من حاجة 2000 شمعة). تقسيم لملفات أصغر
   من سنة (شهرية) يحتاج تجهيز ملفات مصدر جديدة على السيرفر، وهو تحسين
   منفصل لاحقاً إن احتجناه — هذا المحرك مبني بحيث يدعمه بسهولة (فقط
   استبدال دالة _chunkKey/_fetchChunk).
   ========================================================================= */

(function (global) {
  'use strict';

const MIN_YEAR = 2000;
const MAX_YEAR = Math.max(2025, new Date().getUTCFullYear()); // يشمل السنة الحالية (بيانات 2026 مثلاً)
const INITIAL_TARGET_CANDLES = 2000;
const BACKWARD_CHUNK_CANDLES_TRIGGER = 300;
// بيانات M1 (دقيقة واحدة) تحتوي سنة كاملة على ~370,000 شمعة — حد ذاكرة
// بـ10,000 كان يحذف 97% من أي سنة محمّلة فوراً بعد تحميلها (هذا كان
// السبب الحقيقي لاختفاء البيانات الوسطى). الحد الجديد يسمح بحوالي
// سنتين من بيانات M1 محمّلة بالذاكرة بنفس الوقت قبل أي تفريغ.
const MEMORY_LIMIT_CANDLES = 800000;

  // ---------------------------------------------------------- Memory Cache
  // key = "SYMBOL_YEAR" -> Array of candles لتلك السنة (مرتبة زمنياً)
  const yearCache = new Map();

  function cacheKey(symbol, year) { return symbol + '_' + year; }

  // ---------------------------------------------------------- Manifest (فهرس ملفات data/)
  // المتصفح لا يقرأ محتويات مجلد على GitHub Pages، لذلك تُكتشف الأصول والسنوات والفريمات من
  // data/manifest.json (يولّده tools/build-data-manifest.js). إن غاب الفهرس أو غاب الأصل منه
  // نرجع للصيغة القديمة DAT_MT_{SYMBOL}_M1_{YEAR}.csv فلا ينكسر شيء.
  let manifest = null, manifestPromise = null;
  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch('data/manifest.json', { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null)).catch(() => null)
        .then(m => { manifest = (m && m.symbols) ? m : null; if (!manifest) console.warn('[TVDataEngine] data/manifest.json غير متوفر — استخدام الصيغة القديمة DAT_MT_{SYMBOL}_M1_{YEAR}.csv'); registerManifestSymbols(); return manifest; });
    }
    return manifestPromise;
  }
  // أصغر فريم متوفر للأصل (يُفضَّل M1 لأن بقية النظام يجمّع منه)
  function pickFrame(symbol) {
    const info = manifest && manifest.symbols[symbol]; if (!info) return null;
    const names = Object.keys(info.frames).sort((x, y) => info.frames[x].baseSec - info.frames[y].baseSec);
    return names.length ? { name: names[0], ...info.frames[names[0]] } : null;
  }
  function yearsOf(symbol) { const f = pickFrame(symbol); return f ? f.years.slice() : null; }
  function baseMinutes(symbol) { const f = pickFrame(symbol); return f ? Math.max(1, Math.round(f.baseSec / 60)) : 1; }
  function symbols() { return manifest ? Object.keys(manifest.symbols) : []; }
  // عناوين ملفات سنة محددة (سنوي أو أشهر متعددة)
  function urlsFor(symbol, year) {
    const f = pickFrame(symbol);
    if (f) return Object.keys(f.periods).filter(k => +k.slice(0, 4) === year).sort().map(k => 'data/' + encodeURIComponent(f.periods[k]));
    return ['data/DAT_MT_' + symbol + '_M1_' + year + '.csv']; // أصل غير مفهرس: الصيغة القديمة
  }
  // يضيف أصولاً من الفهرس لقائمة الأصل (إن لم تكن موجودة) حتى لا يحتاج المستخدم لأي خطوة
  function registerManifestSymbols() {
    const run = () => {
      const sel = document.getElementById('pairSelect');
      symbols().forEach(sym => {
        if (sel && !Array.from(sel.options).some(o => o.value === sym)) { const o = document.createElement('option'); o.value = sym; o.textContent = sym; o.dataset.manifest = '1'; sel.appendChild(o); }
        if (global.MultiChartSymbols) global.MultiChartSymbols.register(sym, sym);
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(run, 500)); else setTimeout(run, 500);
  }

  // دمج شموع عدة ملفات (أشهر) مع الترتيب وحذف المكرر بالطابع الزمني
  function mergeSorted(parts) {
    if (parts.length === 1) return parts[0];
    const all = [].concat(...parts).sort((a, b) => a.time - b.time), out = [];
    for (const c of all) { if (out.length && out[out.length - 1].time === c.time) continue; out.push(c); }
    return out;
  }

  async function fetchText(url) {
    // محاولة إعادة واحدة عند خطأ شبكة؛ 404 = لا ملف (حالة طبيعية)
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const res = await fetch(url); if (res.status === 404) return { missing: true }; if (!res.ok) throw new Error('HTTP ' + res.status); return { text: await res.text() }; }
      catch (e) { if (attempt === 1) return { error: e }; }
    }
  }

  async function fetchYearChunk(symbol, year) {
    const key = cacheKey(symbol, year);
    if (yearCache.has(key)) return yearCache.get(key);
    // 1) بيانات مستوردة محلياً (IndexedDB) لها الأولوية لهذا الرمز/السنة
    if (global.TVLocalData) {
      try {
        await global.TVLocalData.ready;
        const lc = await global.TVLocalData.getChunk(symbol, year);
        if (lc) { yearCache.set(key, lc); return lc; }
      } catch (e) { console.warn('TVLocalData.getChunk', e); }
    }
    // 2) ملفات data/ — تُحلَّل وتُتحقَّق بنفس محلّل الاستيراد
    await loadManifest();
    const parts = []; let transientFailure = false;
    for (const url of urlsFor(symbol, year)) {
      const r = await fetchText(url);
      if (r.missing) continue;
      if (r.error) { transientFailure = true; console.warn('[TVDataEngine] فشل تحميل ' + url + ':', r.error.message); continue; }
      const out = global.TVDataImport ? global.TVDataImport.parseCSV(r.text) : null;
      let candles;
      if (out && !out.report.error) {
        candles = out.candles; const rp = out.report;
        if (rp.rejected || rp.duplicatesIdentical || rp.duplicatesConflicting) console.warn('[TVDataEngine] ' + url + ': rejected=' + rp.rejected + ' dupIdentical=' + rp.duplicatesIdentical + ' dupConflicting=' + rp.duplicatesConflicting);
        // دقة السعر للأصول غير المعرّفة مسبقاً تُستنتج من البيانات الفعلية
        if (global.SYMBOL_PRECISION && global.SYMBOL_PRECISION[symbol] == null && rp.precision) global.SYMBOL_PRECISION[symbol] = Math.max(2, rp.precision);
      } else if (out) { console.warn('[TVDataEngine] ' + url + ': تنسيق غير مفهوم (' + out.report.error + ')'); continue; }
      else {
        // احتياطي إن لم يُحمَّل tv-data-import.js (يقرأ الوقت كـ UTC أيضاً)
        candles = [];
        r.text.trim().split('\n').forEach((row, idx) => {
          if (idx === 0 && row.includes('Date')) return;
          const c = row.split(','); if (c.length < 6) return;
          const d = c[0].split('.'), t = c[1].split(':');
          candles.push({ time: Date.UTC(+d[0], +d[1] - 1, +d[2], +t[0], +t[1]) / 1000, open: parseFloat(c[2]), high: parseFloat(c[3]), low: parseFloat(c[4]), close: parseFloat(c[5]), volume: 0 });
        });
      }
      if (candles.length) parts.push(candles);
    }
    const merged = parts.length ? mergeSorted(parts) : [];
    // الفشل المؤقت (شبكة) لا يُخزَّن حتى يمكن التعافي لاحقاً؛ غياب الملف (404) يُخزَّن
    if (!transientFailure || merged.length) yearCache.set(key, merged);
    return merged;
  }

  // ---------------------------------------------------------- SymbolDataStream
  // نسخة واحدة لكل (رمز يُعرض حالياً بشاشة ما) — تدير نافذة البيانات
  // المحمّلة لذلك الرمز تدريجياً بدل تحميل كل شيء دفعة واحدة.
  class SymbolDataStream {
    constructor(symbol) {
      this.symbol = symbol;
      this.data = [];          // الشموع المحمّلة حالياً (نافذة متنقلة)
      this.oldestLoadedYear = null;
      this.newestLoadedYear = null;
      this.exhaustedBackward = false; // وصلنا لأقدم سنة متوفرة (2000) أو لا توجد بيانات أقدم
      this._loadingOlder = false;
      this._min = MIN_YEAR; this._max = MAX_YEAR;
    }
    // نطاق السنوات المتاحة فعلاً لهذا الأصل (من الفهرس)؛ بدونه المدى العام القديم
    async _initRange() {
      await loadManifest();
      const ys = yearsOf(this.symbol);
      if (ys && ys.length) { this._min = ys[0]; this._max = ys[ys.length - 1]; }
    }

    // تحميل أولي: يبدأ من أحدث سنة متوفرة فعلياً وينزل للخلف سنة بسنة حتى
    // يجمع ~2000 شمعة على الأقل (أو يصل لأول سنة متوفرة).
    async loadInitial(targetCandles) {
      targetCandles = targetCandles || INITIAL_TARGET_CANDLES;
      this.data = [];
      await this._initRange();
      let year = this._max;
      // ابحث عن أحدث سنة فيها بيانات فعلياً (تفادي سنوات فارغة بنهاية النطاق)
      while (year >= this._min) {
        const chunk = await fetchYearChunk(this.symbol, year);
        if (chunk.length) { this.newestLoadedYear = year; break; }
        year--;
      }
      if (year < this._min) { this.exhaustedBackward = true; return this.data; }

      let cur = year;
      while (this.data.length < targetCandles && cur >= this._min) {
        const chunk = await fetchYearChunk(this.symbol, cur);
        this.data = chunk.concat(this.data);
        this.oldestLoadedYear = cur;
        cur--;
      }
if (cur < this._min) this.exhaustedBackward = true;
// لا تفريغ ذاكرة هنا إطلاقاً — التحميل الأولي يجب أن يبقى كاملاً
// بالذاكرة (هو نفسه أقل من MEMORY_LIMIT_CANDLES الجديد أصلاً).
return this.data;
}
    // يُستدعى عند اقتراب المستخدم من بداية البيانات المحمّلة أثناء السحب
    // للخلف — يحمّل سنة أقدم واحدة ويضيفها لبداية المصفوفة بدون إعادة تحميل.
    async loadOlderIfNeeded(visibleFromIndex) {
      if (this._loadingOlder || this.exhaustedBackward) return false;
      if (visibleFromIndex > BACKWARD_CHUNK_CANDLES_TRIGGER) return false;
      if (this.oldestLoadedYear == null) return false;

   this._loadingOlder = true;
try {
  await this._initRange();
  let year = this.oldestLoadedYear - 1;
  while (year >= this._min) {
    const chunk = await fetchYearChunk(this.symbol, year);
    this.oldestLoadedYear = year;
    if (chunk.length) {
      this.data = chunk.concat(this.data);
      this._trimFrontIfNeeded();
      return true;
    }
    year--; // سنة فارغة — جرّب الأقدم منها بنفس الاستدعاء، بدون انتظار سحبة يدوية جديدة
  }
  this.exhaustedBackward = true;
  return false;
} finally {
  this._loadingOlder = false;
}
}
// يمنع تضخم الذاكرة بلا حدود عبر تكرار تحميل سنوات أقدم كثيرة — يحذف
// فقط الفائض من الطرف الأقدم (بداية المصفوفة)، ويُبقي كل شيء بعده
// سليماً بدون أي فجوات وسطى. يُستدعى فقط بعد إضافة سنة أقدم فعلياً
// (loadOlderIfNeeded)، وليس بعد التحميل الأولي.
_trimFrontIfNeeded() {
  if (this.data.length <= MEMORY_LIMIT_CANDLES) return;
  const excess = this.data.length - MEMORY_LIMIT_CANDLES;
  this.data = this.data.slice(excess);
  if (this.data.length) {
    this.oldestLoadedYear = new Date(this.data[0].time * 1000).getUTCFullYear();
  }
}

    // تحميل مباشر حول تاريخ معيّن (Backtest jump-to-date) — بدل تحميل كل
    // السنوات، نحمّل فقط السنة المستهدفة + سنة قبلها حتى نضمن وجود history
    // كافٍ (historyCandles) قبل نقطة البداية.
    async loadAroundDate(targetTimeSec, historyCandles, forwardCandles) {
      await this._initRange();
      const targetYear = new Date(targetTimeSec * 1000).getUTCFullYear();
      this.data = [];
      let year = targetYear;
      let collected = [];

      // اجمع للخلف من سنة الهدف حتى تتوفر historyCandles قبل نقطة الهدف
      while (year >= this._min) {
        const chunk = await fetchYearChunk(this.symbol, year);
        collected = chunk.concat(collected);
        this.oldestLoadedYear = year;
        const idx = collected.findIndex(c => c.time >= targetTimeSec);
        if (idx >= historyCandles || (idx === -1 && collected.length >= historyCandles)) break;
        year--;
      }
      if (year < this._min) this.exhaustedBackward = true;

      // اجمع للأمام سنة الهدف (وربما التالية) حتى تتوفر forwardCandles بعد نقطة الهدف
      let fwdYear = targetYear;
      const idxNow = collected.findIndex(c => c.time >= targetTimeSec);
      let haveForward = idxNow === -1 ? 0 : (collected.length - idxNow);
      while (haveForward < forwardCandles && fwdYear + 1 <= this._max) {
        fwdYear++;
        const chunk = await fetchYearChunk(this.symbol, fwdYear);
        collected = collected.concat(chunk);
        this.newestLoadedYear = fwdYear;
        haveForward += chunk.length;
      }
      if (this.newestLoadedYear == null) this.newestLoadedYear = targetYear;

      this.data = collected;
      return this.data;
    }
  }

  const _engine = {
    SymbolDataStream,
    fetchYearChunk,
    MIN_YEAR, MAX_YEAR,
    ready: null, loadManifest, symbols, yearsOf, baseMinutes, manifest: () => manifest,
    clearCache() { yearCache.clear(); },
    cacheSize() { return yearCache.size; }
  };
  _engine.ready = loadManifest();
  global.TVDataEngine = _engine;

})(window);