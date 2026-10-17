/* =========================================================================
   tv-data-import.js — محلّل وتحقق ملفات الأسعار التاريخية المحلية (دوال نقية)

   الصيغ المدعومة (تُكتشف تلقائياً):
   A) HistData / MetaTrader بلا ترويسة:  YYYY.MM.DD,HH:MM,O,H,L,C[,V]
   B) ملف بترويسة (أسماء أعمدة: date/time/datetime/timestamp/open/high/low/close/volume)
      بفاصل , أو ; أو Tab، وبأعمدة تاريخ+وقت منفصلة أو عمود واحد.
   C) بلا ترويسة بعمود وقت واحد (نص أو Unix ثوانٍ/ميلي ثانية): T,O,H,L,C[,V]

   سياسة الوقت: الطابع الزمني يُقرأ كما هو في الملف ويُعامَل كـ UTC (لا تحويل
   لمنطقة جهاز المتصفح)، إلا إذا حمل الملف إزاحة صريحة (Z أو ±hh:mm) فتُطبَّق.
   لا تُختلق قيم: الحجم يبقى 0 إن لم يوجد، ولا تُنشأ شموع مفقودة.

   قواعد الرفض (كل صف مرفوض يُسجَّل بسببه): bad_timestamp, bad_number,
   non_positive_price, invalid_ohlc (high<low أو open/close خارج المدى), bad_volume.
   التكرار: نفس الوقت + نفس القيم → يُحذف؛ نفس الوقت بقيم مختلفة → تُبقى الأولى
   ويُبلَّغ عنه. الفرز تصاعدياً عند الحاجة ويُبلَّغ عنه.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TVDataImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TS_RE = /^(\d{4})[-.\/](\d{2})[-.\/](\d{2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/;
  const HDR_TIME = ['datetime', 'timestamp', 'time', 'date', 'gmt time', 'local time', 'date time'];
  const MAX_REPORTED = 50;

  function parseTimestamp(s) {
    s = s.trim();
    if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000);
    if (/^\d{10}$/.test(s)) return Number(s);
    const m = TS_RE.exec(s); if (!m) return NaN;
    const [, y, mo, d, h, mi, se, tz] = m;
    const mon = +mo, day = +d, hh = h == null ? 0 : +h, mm = mi == null ? 0 : +mi, ss = se == null ? 0 : +se;
    if (mon < 1 || mon > 12 || day < 1 || day > 31 || hh > 23 || mm > 59 || ss > 59) return NaN;
    let t = Date.UTC(+y, mon - 1, day, hh, mm, ss) / 1000;
    if (new Date(t * 1000).getUTCDate() !== day) return NaN; // 31 فبراير مثلاً
    if (tz && tz !== 'Z') { const sign = tz[0] === '-' ? -1 : 1, digits = tz.slice(1).replace(':', ''); t -= sign * (+digits.slice(0, 2) * 3600 + +digits.slice(2) * 60); }
    return t;
  }

  function detectDelimiter(line) {
    const c = { ',': 0, ';': 0, '\t': 0 };
    for (const ch of line) if (ch in c) c[ch]++;
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0];
  }

  // الدقة الفعلية: تُهمل الأصفار اللاحقة (1282.295000 → 3 خانات)
  function decimalsOf(str) { const i = str.indexOf('.'); if (i < 0) return 0; let e = str.length; while (e > i + 1 && str.charCodeAt(e - 1) === 48) e--; return Math.min(8, e - i - 1); }

  // يبني خريطة الأعمدة؛ يُرجع null إن لم يتعرّف على الصيغة
  function detectLayout(first, delim) {
    const cols = first.split(delim).map(s => s.trim());
    const lower = cols.map(s => s.toLowerCase().replace(/^["']|["']$/g, ''));
    const hasHeader = lower.some(c => /^(open|high|low|close)$/.test(c)) || lower.some(c => HDR_TIME.includes(c));
    if (hasHeader) {
      const idx = n => lower.indexOf(n);
      const L = { header: true, o: idx('open'), h: idx('high'), l: idx('low'), c: idx('close'), v: idx('volume') >= 0 ? idx('volume') : (idx('vol') >= 0 ? idx('vol') : idx('tick_volume')) };
      const di = idx('date'), ti = idx('time');
      if (di >= 0 && ti >= 0 && di !== ti) { L.date = di; L.time = ti; }
      else { const one = lower.findIndex(c => HDR_TIME.includes(c)); L.dt = one; }
      if (L.o < 0 || L.h < 0 || L.l < 0 || L.c < 0 || (L.dt == null && L.date == null) || L.dt === -1) return null;
      return L;
    }
    if (/^\d{4}[.\-\/]\d{2}[.\-\/]\d{2}$/.test(cols[0]) && /^\d{1,2}:\d{2}(:\d{2})?$/.test(cols[1] || '') && cols.length >= 6) return { header: false, date: 0, time: 1, o: 2, h: 3, l: 4, c: 5, v: cols.length > 6 ? 6 : -1 };
    if (cols.length >= 5 && !isNaN(parseTimestamp(cols[0]))) return { header: false, dt: 0, o: 1, h: 2, l: 3, c: 4, v: cols.length > 5 ? 5 : -1 };
    return null;
  }

  function modeDelta(times) {
    const counts = new Map(); const n = Math.min(times.length - 1, 5000);
    for (let i = 0; i < n; i++) { const d = times[i + 1] - times[i]; if (d > 0) counts.set(d, (counts.get(d) || 0) + 1); }
    let best = 0, bc = 0; counts.forEach((c, d) => { if (c > bc) { bc = c; best = d; } });
    return best;
  }

  function parseCSV(text, opts) {
    opts = opts || {};
    const report = { format: null, totalRows: 0, accepted: 0, rejected: 0, rejectedSamples: [], rejectedByReason: {}, duplicatesIdentical: 0, duplicatesConflicting: 0, conflictSamples: [], sorted: true, hasVolume: false, precision: 0, baseSec: 0, from: null, to: null };
    const lines = text.split(/\r?\n/);
    let li = 0; while (li < lines.length && !lines[li].trim()) li++;
    if (li >= lines.length) { report.error = 'empty_file'; return { candles: [], report }; }
    const delim = detectDelimiter(lines[li]);
    const L = detectLayout(lines[li], delim);
    if (!L) { report.error = 'unrecognized_format'; return { candles: [], report }; }
    report.format = L.header ? 'header' : (L.date != null ? 'histdata' : 'single-time-column');
    const start = L.header ? li + 1 : li;
    const reject = (line, reason) => { report.rejected++; report.rejectedByReason[reason] = (report.rejectedByReason[reason] || 0) + 1; if (report.rejectedSamples.length < MAX_REPORTED) report.rejectedSamples.push({ line, reason }); };
    const out = []; let prevT = -Infinity, anyVol = false, prec = 0;
    for (let i = start; i < lines.length; i++) {
      const raw = lines[i]; if (!raw.trim()) continue;
      report.totalRows++;
      const c = raw.split(delim);
      const tStr = L.dt != null ? c[L.dt] : (c[L.date] != null && c[L.time] != null ? c[L.date].trim() + ' ' + c[L.time].trim() : undefined);
      if (tStr == null) { reject(i + 1, 'bad_timestamp'); continue; }
      const t = parseTimestamp(tStr);
      if (!isFinite(t)) { reject(i + 1, 'bad_timestamp'); continue; }
      const so = c[L.o], sh = c[L.h], sl = c[L.l], sc = c[L.c];
      if (so == null || sh == null || sl == null || sc == null) { reject(i + 1, 'bad_number'); continue; }
      const o = +so, h = +sh, l = +sl, cl = +sc;
      if (!(isFinite(o) && isFinite(h) && isFinite(l) && isFinite(cl)) || so.trim() === '' || sh.trim() === '' || sl.trim() === '' || sc.trim() === '') { reject(i + 1, 'bad_number'); continue; }
      if (!opts.allowNonPositive && (o <= 0 || h <= 0 || l <= 0 || cl <= 0)) { reject(i + 1, 'non_positive_price'); continue; }
      if (h < l || h < o || h < cl || l > o || l > cl) { reject(i + 1, 'invalid_ohlc'); continue; }
      let v = 0;
      if (L.v >= 0 && c[L.v] != null && c[L.v].trim() !== '') { v = +c[L.v]; if (!isFinite(v) || v < 0) { reject(i + 1, 'bad_volume'); continue; } if (v > 0) anyVol = true; }
      if (t < prevT) report.sorted = false; prevT = t;
      const d = Math.max(decimalsOf(so.trim()), decimalsOf(sh.trim()), decimalsOf(sl.trim()), decimalsOf(sc.trim())); if (d > prec) prec = d;
      out.push({ time: t, open: o, high: h, low: l, close: cl, volume: v });
    }
    if (!report.sorted) out.sort((a, b) => a.time - b.time); // فرز مستقر
    // التكرارات (بعد الفرز المستقر تبقى الأولى حسب ترتيب الملف)
    const dedup = [];
    for (const k of out) {
      const last = dedup[dedup.length - 1];
      if (last && last.time === k.time) {
        if (last.open === k.open && last.high === k.high && last.low === k.low && last.close === k.close) report.duplicatesIdentical++;
        else { report.duplicatesConflicting++; if (report.conflictSamples.length < MAX_REPORTED) report.conflictSamples.push({ time: k.time }); }
        continue;
      }
      dedup.push(k);
    }
    report.accepted = dedup.length; report.hasVolume = anyVol; report.precision = prec;
    if (dedup.length) { report.from = dedup[0].time; report.to = dedup[dedup.length - 1].time; report.baseSec = modeDelta(dedup.map(x => x.time)); }
    if (!anyVol) dedup.forEach(k => { k.volume = 0; });
    return { candles: dedup, report };
  }

  // اسم الرمز المقترح من اسم الملف: DAT_MT_XAUUSD_M1_2019.csv → XAUUSD
  function suggestSymbol(filename) {
    const base = filename.replace(/\.[^.]+$/, '');
    const m = /DAT_(?:MT|ASCII)_([A-Za-z0-9]+)_/.exec(base) || /^([A-Za-z0-9]{3,12})(?:[_\-.]|$)/.exec(base);
    return (m ? m[1] : base).toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 20);
  }

  return { parseCSV, parseTimestamp, suggestSymbol };
});
