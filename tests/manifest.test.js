const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path'); const M = require('../tools/build-data-manifest.js');
let n = 0; const t = (m, f) => { f(); n++; console.log('ok -', m); };
t('HistData MT yearly name', () => assert.deepStrictEqual(M.parseFileName('DAT_MT_EURUSD_M1_2020.csv'), { symbol: 'EURUSD', frame: 'M1', period: '2020' }));
t('HistData monthly name (current-year files)', () => assert.deepStrictEqual(M.parseFileName('DAT_MT_EURUSD_M1_202401.csv'), { symbol: 'EURUSD', frame: 'M1', period: '202401' }));
t('ASCII/NT prefixes and lowercase names', () => { assert.strictEqual(M.parseFileName('DAT_ASCII_XAUUSD_M1_2019.csv').symbol, 'XAUUSD'); assert.strictEqual(M.parseFileName('dat_mt_gbpusd_m5_2021.csv').frame, 'M5'); assert.strictEqual(M.parseFileName('dat_mt_gbpusd_m5_2021.csv').symbol, 'GBPUSD'); });
t('generic symbol_frame_year names', () => { assert.deepStrictEqual(M.parseFileName('USDJPY_H1_2022.csv'), { symbol: 'USDJPY', frame: 'H1', period: '2022' }); assert.strictEqual(M.parseFileName('USDJPY-M15-2022.csv').frame, 'M15'); });
t('unknown/invalid names are rejected (zip, bad month, no frame, txt)', () => { ['HISTDATA_COM_MT_XAUUSD_M12019.zip', 'DAT_MT_EURUSD_M1_202413.csv', 'EURUSD_2020.csv', 'DAT_MT_EURUSD_M1_2020.txt', 'notes.csv', 'DAT_MT_EURUSD_M1_1800.csv'].forEach(x => assert.strictEqual(M.parseFileName(x), null, x)); });
const files = ['DAT_MT_EURUSD_M1_2021.csv', 'DAT_MT_EURUSD_M1_2019.csv', 'DAT_MT_EURUSD_M1_2020.csv', 'DAT_MT_XAUUSD_M1_2019.csv', 'DAT_MT_GBPUSD_M1_202402.csv', 'DAT_MT_GBPUSD_M1_202401.csv', 'DAT_MT_USDJPY_M5_2022.csv', 'readme.txt', 'DAT_MT_XAUUSD_M1_2019.zip'].map((name, i) => ({ name, bytes: 100 + i }));
t('multiple assets, years sorted, frames separated', () => {
  const m = M.build(files);
  assert.deepStrictEqual(Object.keys(m.symbols), ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD']);
  assert.deepStrictEqual(m.symbols.EURUSD.frames.M1.years, [2019, 2020, 2021]); assert.deepStrictEqual(m.symbols.GBPUSD.frames.M1.years, [2024]);
  assert.deepStrictEqual(Object.keys(m.symbols.GBPUSD.frames.M1.periods), ['202401', '202402']); assert.strictEqual(m.symbols.USDJPY.frames.M5.baseSec, 300);
  assert.strictEqual(m.symbols.EURUSD.frames.M1.periods['2020'], 'DAT_MT_EURUSD_M1_2020.csv');
});
t('skipped files are reported, never silently dropped', () => { const m = M.build(files); assert.deepStrictEqual(m.skipped, ['DAT_MT_XAUUSD_M1_2019.zip', 'readme.txt']); });
t('output is deterministic regardless of input order and has no timestamps', () => {
  const a = JSON.stringify(M.build(files)), b = JSON.stringify(M.build(files.slice().reverse())); assert.strictEqual(a, b); assert.ok(!/generated|date/i.test(Object.keys(JSON.parse(a)).join()));
});
t('duplicate period (same symbol/frame/period, different names) is reported', () => {
  const m = M.build([{ name: 'DAT_MT_EURUSD_M1_2020.csv', bytes: 1 }, { name: 'DAT_ASCII_EURUSD_M1_2020.csv', bytes: 2 }]); assert.strictEqual(Object.keys(m.symbols.EURUSD.frames.M1.periods).length, 1); assert.ok(m.skipped.some(x => x.includes('مكرر')));
});
t('CLI scans a real folder, writes manifest.json and is idempotent', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-')); fs.writeFileSync(path.join(d, 'DAT_MT_EURUSD_M1_2020.csv'), 'x'); fs.writeFileSync(path.join(d, 'DAT_MT_EURUSD_M1_2021.csv'), 'yy');
  const run = () => require('child_process').execFileSync('node', [path.join(__dirname, '..', 'tools', 'build-data-manifest.js'), d]).toString();
  const o1 = run(); const j1 = fs.readFileSync(path.join(d, 'manifest.json'), 'utf8'); assert.ok(o1.includes('كُتب')); const o2 = run(); assert.ok(o2.includes('بلا تغيير')); assert.strictEqual(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8'), j1);
  const m = JSON.parse(j1); assert.deepStrictEqual(m.symbols.EURUSD.frames.M1.years, [2020, 2021]); assert.strictEqual(m.symbols.EURUSD.frames.M1.bytes['2021'], 2);
  fs.writeFileSync(path.join(d, 'DAT_MT_EURUSD_M1_2022.csv'), 'z'); run(); assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')).symbols.EURUSD.frames.M1.years, [2020, 2021, 2022]);
});
t('manifest.json itself is never indexed; missing folder gives a clear error', () => {
  assert.throws(() => M.scan('/nonexistent_dir_xyz'), /غير موجود/);
});
console.log(`\n${n} tests passed`);
