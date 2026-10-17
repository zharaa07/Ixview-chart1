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
    // 2) ملف data/ على الخادم — يُحلَّل ويُتحقَّق منه بنفس محلّل الاستيراد
    try {
      const res = await fetch(`data/DAT_MT_${symbol}_M1_${year}.csv`);
      if (!res.ok) { yearCache.set(key, []); return []; }
      const text = await res.text();
      const out = global.TVDataImport ? global.TVDataImport.parseCSV(text) : null;
      let candles;
      if (out && !out.report.error) {
        candles = out.candles;
        const rp = out.report;
        if (rp.rejected || rp.duplicatesIdentical || rp.duplicatesConflicting) console.warn('[TVDataEngine] ' + symbol + ' ' + year + ': rejected=' + rp.rejected + ' dupIdentical=' + rp.duplicatesIdentical + ' dupConflicting=' + rp.duplicatesConflicting);
      } else {
        // احتياطي إن لم يُحمَّل tv-data-import.js (يقرأ الوقت كـ UTC أيضاً)
        candles = [];
        text.trim().split('\n').forEach((row, idx) => {
          if (idx === 0 && row.includes('Date')) return;
          const c = row.split(','); if (c.length < 6) return;
          const d = c[0].split('.'), t = c[1].split(':');
          candles.push({ time: Date.UTC(+d[0], +d[1] - 1, +d[2], +t[0], +t[1]) / 1000, open: parseFloat(c[2]), high: parseFloat(c[3]), low: parseFloat(c[4]), close: parseFloat(c[5]), volume: 0 });
        });
      }
      yearCache.set(key, candles);
      return candles;
    } catch (e) {
      yearCache.set(key, []);
      return [];
    }
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
    }

    // تحميل أولي: يبدأ من أحدث سنة متوفرة فعلياً وينزل للخلف سنة بسنة حتى
    // يجمع ~2000 شمعة على الأقل (أو يصل لأول سنة متوفرة).
    async loadInitial(targetCandles) {
      targetCandles = targetCandles || INITIAL_TARGET_CANDLES;
      this.data = [];
      let year = MAX_YEAR;
      // ابحث عن أحدث سنة فيها بيانات فعلياً (تفادي سنوات فارغة بنهاية النطاق)
      while (year >= MIN_YEAR) {
        const chunk = await fetchYearChunk(this.symbol, year);
        if (chunk.length) { this.newestLoadedYear = year; break; }
        year--;
      }
      if (year < MIN_YEAR) { this.exhaustedBackward = true; return this.data; }

      let cur = year;
      while (this.data.length < targetCandles && cur >= MIN_YEAR) {
        const chunk = await fetchYearChunk(this.symbol, cur);
        this.data = chunk.concat(this.data);
        this.oldestLoadedYear = cur;
        cur--;
      }
if (cur < MIN_YEAR) this.exhaustedBackward = true;
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
  let year = this.oldestLoadedYear - 1;
  while (year >= MIN_YEAR) {
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
      const targetYear = new Date(targetTimeSec * 1000).getUTCFullYear();
      this.data = [];
      let year = targetYear;
      let collected = [];

      // اجمع للخلف من سنة الهدف حتى تتوفر historyCandles قبل نقطة الهدف
      while (year >= MIN_YEAR) {
        const chunk = await fetchYearChunk(this.symbol, year);
        collected = chunk.concat(collected);
        this.oldestLoadedYear = year;
        const idx = collected.findIndex(c => c.time >= targetTimeSec);
        if (idx >= historyCandles || (idx === -1 && collected.length >= historyCandles)) break;
        year--;
      }
      if (year < MIN_YEAR) this.exhaustedBackward = true;

      // اجمع للأمام سنة الهدف (وربما التالية) حتى تتوفر forwardCandles بعد نقطة الهدف
      let fwdYear = targetYear;
      const idxNow = collected.findIndex(c => c.time >= targetTimeSec);
      let haveForward = idxNow === -1 ? 0 : (collected.length - idxNow);
      while (haveForward < forwardCandles && fwdYear + 1 <= MAX_YEAR) {
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

  global.TVDataEngine = {
    SymbolDataStream,
    fetchYearChunk,
    MIN_YEAR, MAX_YEAR,
    clearCache() { yearCache.clear(); },
    cacheSize() { return yearCache.size; }
  };

})(window);