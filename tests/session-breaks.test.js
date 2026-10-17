const assert = require('assert'); const { breakTimes } = require('../tv-session-breaks.js');
let n = 0; const t = (m, f) => { f(); n++; console.log('ok -', m); };
const U = (d, h, m) => Date.UTC(2024, 0, d, h, m) / 1000;
t('breaks at UTC midnight', () => {
  const times = [U(8, 23, 58), U(8, 23, 59), U(9, 0, 0), U(9, 0, 1), U(10, 0, 5)];
  assert.deepStrictEqual(breakTimes(times, 0), [U(9, 0, 0), U(10, 0, 5)]);
});
t('first bar is never a break; empty/one-bar safe', () => { assert.deepStrictEqual(breakTimes([], 0), []); assert.deepStrictEqual(breakTimes([U(8, 1, 0)], 0), []); });
t('timezone offset moves the boundary (UTC+3 → 21:00 UTC)', () => {
  const times = [U(8, 20, 59), U(8, 21, 0), U(8, 21, 1)]; assert.deepStrictEqual(breakTimes(times, 3 * 3600), [U(8, 21, 0)]);
});
t('negative offset (UTC-4 → 04:00 UTC)', () => {
  const times = [U(8, 3, 59), U(8, 4, 0)]; assert.deepStrictEqual(breakTimes(times, -4 * 3600), [U(8, 4, 0)]);
});
t('weekend gap yields a single break at the next bar', () => {
  const times = [U(12, 21, 59), U(15, 22, 0), U(15, 22, 1)]; assert.deepStrictEqual(breakTimes(times, 0), [U(15, 22, 0)]);
});
console.log(`\n${n} tests passed`);
