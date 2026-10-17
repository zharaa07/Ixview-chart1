const assert = require('assert'); const L = require('../tv-layouts.js');
let n = 0; const t = (m, f) => { f(); n++; console.log('ok -', m); };
t('every layout is valid (rectangular areas, equal rows, <=16 panes)', () => {
  L.SPEC.forEach(([count, vs]) => vs.forEach(rows => { assert.strictEqual(L.validate(rows), null, rows.join('|')); }));
});
t('pane count of each variant equals its group count', () => {
  L.groups.forEach(g => g.keys.forEach(k => assert.strictEqual(L.table[k].panes, g.count, k)));
});
t('counts 1..10,12,14,16 all present', () => {
  assert.deepStrictEqual(L.groups.map(g => g.count), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16]);
});
t('legacy keys preserved with same pane counts', () => {
  const exp = { '1': 1, '2h': 2, '2v': 2, '3': 3, '3a': 3, '3b': 3, '4': 4, '6': 6, '8': 8, '16': 16 };
  Object.keys(exp).forEach(k => { assert.ok(L.table[k], 'missing ' + k); assert.strictEqual(L.table[k].panes, exp[k]); });
  assert.strictEqual(L.table['3a'].gridTemplateAreas, '"a c" "b c"'); // مطابق للتعريف القديم
  assert.strictEqual(L.table['3b'].gridTemplateAreas, '"a b" "a c"');
});
t('uniform grids keep cols/rows (draggable splitters); irregular are custom', () => {
  assert.deepStrictEqual([L.table['4'].cols, L.table['4'].rows, !!L.table['4'].custom], [2, 2, false]);
  assert.strictEqual(L.table['3a'].custom, true);
});
t('keys are unique', () => { const all = [].concat(...L.groups.map(g => g.keys)); assert.strictEqual(new Set(all).size, all.length); });
t('validator rejects bad layouts', () => {
  assert.ok(L.validate(['ab', 'ba']).startsWith('not_rectangular'));
  assert.strictEqual(L.validate(['abc', 'de']), 'rows_unequal');
});
t('preview SVG draws one rect per pane', () => {
  L.groups.forEach(g => g.keys.forEach(k => assert.strictEqual((L.previewSVG(k).match(/<rect/g) || []).length, g.count, k)));
});
console.log(`\n${n} tests passed`);
