#!/usr/bin/env node
/* =========================================================================
   tools/build-data-manifest.js — يفحص ملفات مجلد data/ ويولّد data/manifest.json
   (المتصفح لا يستطيع قراءة محتويات مجلد على GitHub Pages، لذلك يُولَّد فهرس ثابت.)

   الاستخدام:   node tools/build-data-manifest.js [مجلد_البيانات=data]
   يعمل تلقائياً على GitHub عبر .github/workflows/data-manifest.yml عند أي push يمس data/.

   الأسماء المدعومة (غير حساسة لحالة الأحرف):
     DAT_MT_EURUSD_M1_2020.csv      HistData MetaTrader (سنوي)
     DAT_MT_EURUSD_M1_202401.csv    HistData MetaTrader (شهري)
     DAT_ASCII_EURUSD_M1_2020.csv   HistData ASCII      DAT_NT_... أيضاً
     EURUSD_M5_2020.csv  /  EURUSD-H1-2020.csv  (رمز_فريم_سنة)
   الفريمات: M1 M5 M15 M30 H1 H4 D1 W1 (الدقة بالثواني تُستنتج من الاسم).
   أي ملف آخر (zip، أسماء غير مفهومة) يُسجَّل في skipped ولا يُتجاهل بصمت.
   الناتج حتمي (بلا طوابع زمنية) فلا يُنتج commit جديداً ما لم تتغير الملفات.
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const FRAME_SEC = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800 };
const RE_HISTDATA = /^DAT_(?:MT|ASCII|NT)_([A-Z0-9]{3,12})_(M1|M5|M15|M30|H1|H4|D1|W1)_(\d{4}|\d{6})\.csv$/i;
const RE_GENERIC = /^([A-Z0-9]{3,12})[_-](M1|M5|M15|M30|H1|H4|D1|W1)[_-](\d{4}|\d{6})\.csv$/i;

// يعيد {symbol, frame, period} أو null
function parseFileName(name) {
  const m = RE_HISTDATA.exec(name) || RE_GENERIC.exec(name);
  if (!m) return null;
  const period = m[3];
  if (period.length === 6) { const mo = +period.slice(4); if (mo < 1 || mo > 12) return null; }
  const year = +period.slice(0, 4); if (year < 1970 || year > 2100) return null;
  return { symbol: m[1].toUpperCase(), frame: m[2].toUpperCase(), period };
}

// files: [{name, bytes}] ← manifest (ترتيب ثابت)
function build(files) {
  const symbols = {}, skipped = [];
  files.slice().sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).forEach(f => {
    const p = parseFileName(f.name);
    if (!p) { skipped.push(f.name); return; }
    const sym = symbols[p.symbol] || (symbols[p.symbol] = { frames: {} });
    const fr = sym.frames[p.frame] || (sym.frames[p.frame] = { baseSec: FRAME_SEC[p.frame], periods: {}, bytes: {}, years: [] });
    if (fr.periods[p.period]) { skipped.push(f.name + ' (مكرر لنفس الفترة: ' + fr.periods[p.period] + ')'); return; }
    fr.periods[p.period] = f.name; fr.bytes[p.period] = f.bytes;
  });
  Object.keys(symbols).sort().forEach(s => {
    Object.keys(symbols[s].frames).forEach(k => {
      const fr = symbols[s].frames[k];
      fr.years = Array.from(new Set(Object.keys(fr.periods).map(p => +p.slice(0, 4)))).sort((a, b) => a - b);
      fr.periods = sortKeys(fr.periods); fr.bytes = sortKeys(fr.bytes);
    });
  });
  const ordered = {}; Object.keys(symbols).sort().forEach(s => { ordered[s] = symbols[s]; });
  return { version: 1, symbols: ordered, skipped: skipped.sort() };
}
function sortKeys(o) { const r = {}; Object.keys(o).sort().forEach(k => { r[k] = o[k]; }); return r; }

function scan(dir) {
  if (!fs.existsSync(dir)) throw new Error('المجلد غير موجود: ' + dir);
  return fs.readdirSync(dir).filter(n => n !== 'manifest.json' && !n.startsWith('.'))
    .map(n => ({ n, st: fs.statSync(path.join(dir, n)) })).filter(x => x.st.isFile()) // statSync يتبع الروابط الرمزية
    .map(x => ({ name: x.n, bytes: x.st.size }));
}

function main() {
  const dir = process.argv[2] || 'data';
  const manifest = build(scan(dir));
  const out = path.join(dir, 'manifest.json');
  const text = JSON.stringify(manifest, null, 2) + '\n';
  const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  if (prev !== text) fs.writeFileSync(out, text);
  const syms = Object.keys(manifest.symbols);
  console.log((prev === text ? 'بلا تغيير: ' : 'كُتب: ') + out + ' — ' + syms.length + ' أصل');
  syms.forEach(s => Object.keys(manifest.symbols[s].frames).forEach(k => { const fr = manifest.symbols[s].frames[k]; console.log('  ' + s + ' ' + k + ' : ' + fr.years.join(', ')); }));
  if (manifest.skipped.length) { console.warn('ملفات لم تُفهرس (' + manifest.skipped.length + '):'); manifest.skipped.forEach(n => console.warn('  - ' + n)); }
}

if (require.main === module) { try { main(); } catch (e) { console.error(e.message); process.exit(1); } }
module.exports = { parseFileName, build, scan, FRAME_SEC };
