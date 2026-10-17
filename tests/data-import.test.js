const assert = require('assert'); const fs = require('fs'); const I = require('../tv-data-import.js');
let n = 0; const t = (m, f) => { f(); n++; console.log('ok -', m); };
const U = (y, mo, d, h, mi, s) => Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0) / 1000;
t('HistData format parsed as UTC (independent of machine timezone)', () => {
  const r = I.parseCSV('2019.01.01,17:00,1282.95,1282.95,1282.95,1282.95,0\n2019.01.01,17:01,1282.90,1283.20,1282.80,1283.00,0\n');
  assert.strictEqual(r.report.format, 'histdata'); assert.strictEqual(r.candles[0].time, U(2019, 1, 1, 17, 0)); assert.strictEqual(r.report.precision, 2);
  assert.strictEqual(r.report.hasVolume, false); assert.strictEqual(r.candles[1].volume, 0); assert.strictEqual(r.report.baseSec, 60);
});
t('precision ignores trailing zeros', () => { assert.strictEqual(I.parseCSV('2020.01.01,10:00,1282.295000,1282.300000,1282.100000,1282.200000,0\n').report.precision, 3); assert.strictEqual(I.parseCSV('2020.01.01,10:00,1.10000,1.10010,1.09990,1.10005,0\n').report.precision, 5); assert.strictEqual(I.parseCSV('2020.01.01,10:00,1800,1801,1799,1800.5,0\n').report.precision, 1); });
t('volume preserved only when file has it', () => {
  const r = I.parseCSV('2020.01.01,10:00,1,2,0.5,1.5,120\n2020.01.01,10:01,1.5,2,1,1.2,80\n'); assert.strictEqual(r.report.hasVolume, true); assert.strictEqual(r.candles[0].volume, 120);
});
t('header file with separate Date/Time and semicolon delimiter', () => {
  const r = I.parseCSV('Date;Time;Open;High;Low;Close;Volume\n2021-03-04;09:30;10;11;9;10.5;5\n'); assert.strictEqual(r.report.format, 'header'); assert.strictEqual(r.candles[0].time, U(2021, 3, 4, 9, 30)); assert.strictEqual(r.candles[0].close, 10.5);
});
t('single datetime column with ISO and explicit offset', () => {
  const r = I.parseCSV('timestamp,open,high,low,close\n2021-03-04T09:30:00+02:00,1,2,0.5,1.5\n2021-03-04T09:31:00Z,1,2,0.5,1.5\n');
  assert.strictEqual(r.candles[0].time, U(2021, 3, 4, 7, 30)); assert.strictEqual(r.candles[1].time, U(2021, 3, 4, 9, 31));
});
t('epoch seconds and milliseconds', () => {
  const r = I.parseCSV('1700000000,1,2,0.5,1.5\n1700000060000,1,2,0.5,1.5\n'); assert.strictEqual(r.candles[0].time, 1700000000); assert.strictEqual(r.candles[1].time, 1700000060);
});
t('rejects malformed rows with reasons and keeps the good ones', () => {
  const r = I.parseCSV(['2020.01.01,10:00,1,2,0.5,1.5,0', '2020.01.01,10:01,abc,2,0.5,1.5,0', '2020.13.01,10:02,1,2,0.5,1.5,0', '2020.01.01,10:03,1,2,0.5', '2020.01.01,10:04,1,0.5,2,1.5,0', '2020.01.01,10:05,-1,2,0.5,1.5,0', '2020.01.01,10:06,1,2,0.5,1.5,-3', '2020.02.31,10:00,1,2,0.5,1.5,0'].join('\n'));
  assert.strictEqual(r.report.accepted, 1); assert.strictEqual(r.report.rejected, 7);
  assert.deepStrictEqual(r.report.rejectedByReason, { bad_number: 2, bad_timestamp: 2, invalid_ohlc: 1, non_positive_price: 1, bad_volume: 1 });
  assert.strictEqual(r.report.rejectedSamples[0].line, 2);
});
t('open/close outside high-low is invalid', () => { const r = I.parseCSV('2020.01.01,10:00,3,2,1,1.5,0\n'); assert.strictEqual(r.report.accepted, 0); assert.strictEqual(r.report.rejectedByReason.invalid_ohlc, 1); });
t('unsorted input is sorted (and reported)', () => {
  const r = I.parseCSV('2020.01.01,10:02,1,2,0.5,1.5,0\n2020.01.01,10:00,1,2,0.5,1.5,0\n2020.01.01,10:01,1,2,0.5,1.5,0\n');
  assert.strictEqual(r.report.sorted, false); assert.deepStrictEqual(r.candles.map(c => c.time), [U(2020, 1, 1, 10, 0), U(2020, 1, 1, 10, 1), U(2020, 1, 1, 10, 2)]);
});
t('duplicates: identical dropped, conflicting keeps first and is reported', () => {
  const r = I.parseCSV('2020.01.01,10:00,1,2,0.5,1.5,0\n2020.01.01,10:00,1,2,0.5,1.5,0\n2020.01.01,10:00,1,3,0.5,1.7,0\n2020.01.01,10:01,1,2,0.5,1.5,0\n');
  assert.strictEqual(r.report.accepted, 2); assert.strictEqual(r.report.duplicatesIdentical, 1); assert.strictEqual(r.report.duplicatesConflicting, 1); assert.strictEqual(r.candles[0].high, 2);
});
t('empty and unrecognized files give explicit errors', () => {
  assert.strictEqual(I.parseCSV('  \n').report.error, 'empty_file'); assert.strictEqual(I.parseCSV('hello,world\nfoo,bar\n').report.error, 'unrecognized_format');
});
t('CRLF line endings and trailing blank lines', () => { const r = I.parseCSV('2020.01.01,10:00,1,2,0.5,1.5,0\r\n2020.01.01,10:01,1,2,0.5,1.5,0\r\n\r\n'); assert.strictEqual(r.report.accepted, 2); });
t('suggestSymbol from filenames', () => {
  assert.strictEqual(I.suggestSymbol('DAT_MT_XAUUSD_M1_2019.csv'), 'XAUUSD'); assert.strictEqual(I.suggestSymbol('HISTDATA_COM_MT_XAUUSD_M12019.zip'.replace('.zip', '.csv')), 'HISTDATA'); assert.strictEqual(I.suggestSymbol('eurusd-m5.csv'), 'EURUSD');
});
const real = process.env.XAU_CSV || '/tmp/xau2019.csv';
if (fs.existsSync(real)) t('REAL FILE: XAUUSD M1 2019 parses cleanly with no silent changes', () => {
  const txt = fs.readFileSync(real, 'utf8'); const t0 = Date.now(); const r = I.parseCSV(txt); const ms = Date.now() - t0;
  const lineCount = txt.split(/\r?\n/).filter(x => x.trim()).length;
  console.log('   rows', lineCount, 'accepted', r.report.accepted, 'rejected', r.report.rejected, 'dupId', r.report.duplicatesIdentical, 'dupConf', r.report.duplicatesConflicting, 'sorted', r.report.sorted, 'vol', r.report.hasVolume, 'prec', r.report.precision, 'base', r.report.baseSec, 'ms', ms);
  console.log('   range', new Date(r.report.from * 1000).toISOString(), '→', new Date(r.report.to * 1000).toISOString());
  assert.strictEqual(r.report.accepted + r.report.rejected + r.report.duplicatesIdentical + r.report.duplicatesConflicting, lineCount); // لا صف يُفقد بصمت
  assert.strictEqual(r.report.format, 'histdata'); assert.strictEqual(r.report.baseSec, 60);
  assert.strictEqual(r.report.precision, 3); assert.strictEqual(r.report.duplicatesIdentical, 60); assert.strictEqual(r.report.sorted, false); // ساعة مكررة عند تغيير التوقيت الصيفي
  for (let i = 1; i < r.candles.length; i++) assert.ok(r.candles[i].time > r.candles[i - 1].time); // مرتبة تماماً بلا تكرار
});
console.log(`\n${n} tests passed`);
