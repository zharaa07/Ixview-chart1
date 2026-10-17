/* =========================================================================
   tv-layouts.js — تعريف تخطيطات الشاشات المتعددة (1 → 16) كبيانات
   كل تخطيط = مصفوفة صفوف نصية؛ كل حرف = شاشة، وتكرار الحرف = امتداد المنطقة.
   مثال: ['ac','bc'] = شاشتان يساراً فوق بعض + شاشة طويلة يميناً.
   الشبكات المنتظمة (حرف لكل خلية) تُعاد كـ {cols,rows} فتحتفظ بالفواصل القابلة للسحب؛
   وغيرها كـ custom مع grid-template-areas.
   المفاتيح القديمة (1, 2h, 2v, 3, 3a, 3b, 4, 6, 8, 16) محفوظة للتوافق مع التخطيطات المحفوظة.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TVLayouts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SPEC = [
    [1, [['a']]],
    [2, [['ab'], ['a', 'b']]],
    [3, [['abc'], ['a', 'b', 'c'], ['ab', 'cc'], ['aa', 'bc'], ['ac', 'bc'], ['ab', 'ac']]],
    [4, [['ab', 'cd'], ['abcd'], ['a', 'b', 'c', 'd'], ['aaa', 'bcd'], ['abc', 'ddd'], ['ab', 'ac', 'ad'], ['ad', 'bd', 'cd']]],
    [5, [['abcde'], ['a', 'b', 'c', 'd', 'e'], ['aabbcc', 'dddeee'], ['aaabbb', 'ccddee'], ['abc', 'dbe'], ['abc', 'ade'], ['abc', 'dec']]],
    [6, [['abc', 'def'], ['ab', 'cd', 'ef'], ['abcdef'], ['a', 'b', 'c', 'd', 'e', 'f'], ['aab', 'aac', 'def'], ['abcd', 'eeff']]],
    [7, [['abcd', 'efgg'], ['abc', 'def', 'ggg']]],
    [8, [['abcd', 'efgh'], ['ab', 'cd', 'ef', 'gh'], ['abcdefgh'], ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']]],
    [9, [['abc', 'def', 'ghi'], ['abcdefghi']]],
    [10, [['abcde', 'fghij'], ['ab', 'cd', 'ef', 'gh', 'ij'], ['abcdefghij']]],
    [12, [['abcd', 'efgh', 'ijkl'], ['abc', 'def', 'ghi', 'jkl'], ['abcdef', 'ghijkl'], ['ab', 'cd', 'ef', 'gh', 'ij', 'kl']]],
    [14, [['abcdefg', 'hijklmn']]],
    [16, [['abcd', 'efgh', 'ijkl', 'mnop'], ['abcdefgh', 'ijklmnop']]]
  ];
  // مفاتيح قديمة → مصفوفاتها
  const LEGACY = { '1': 'a', '2h': 'ab', '2v': 'a|b', '3': 'abc', '3a': 'ac|bc', '3b': 'ab|ac', '4': 'ab|cd', '6': 'abc|def', '8': 'abcd|efgh', '16': 'abcd|efgh|ijkl|mnop' };
  const LEGACY_BY_SIG = {}; Object.keys(LEGACY).forEach(k => LEGACY_BY_SIG[LEGACY[k]] = k);

  const sig = rows => rows.join('|');
  const letters = rows => Array.from(new Set(rows.join('').split('')));

  function build() {
    const table = {}, groups = [];
    SPEC.forEach(([count, variants]) => {
      const items = [];
      variants.forEach((rows, i) => {
        const key = LEGACY_BY_SIG[sig(rows)] || (count + '_' + (i + 1));
        const L = letters(rows), nR = rows.length, nC = rows[0].length;
        const uniform = rows.join('').length === L.length; // كل حرف خلية واحدة
        const cfg = { panes: L.length, areaNames: L, rowsSpec: rows };
        if (uniform) { cfg.cols = nC; cfg.rows = nR; }
        else {
          cfg.custom = true;
          cfg.gridTemplateColumns = 'repeat(' + nC + ', 1fr)';
          cfg.gridTemplateRows = 'repeat(' + nR + ', 1fr)';
          cfg.gridTemplateAreas = rows.map(r => '"' + r.split('').join(' ') + '"').join(' ');
        }
        table[key] = cfg; items.push(key);
      });
      groups.push({ count, keys: items });
    });
    return { table, groups };
  }
  const built = build();

  // صلاحية التخطيط: كل حرف يشكّل مستطيلاً كاملاً، والصفوف متساوية الطول، وعدد الشاشات ≤ 16
  function validate(rows) {
    if (!rows.length || rows.some(r => r.length !== rows[0].length)) return 'rows_unequal';
    const L = letters(rows); if (L.length > 16) return 'too_many_panes';
    for (const ch of L) {
      let r0 = 99, r1 = -1, c0 = 99, c1 = -1, n = 0;
      rows.forEach((r, ri) => r.split('').forEach((c, ci) => { if (c === ch) { n++; r0 = Math.min(r0, ri); r1 = Math.max(r1, ri); c0 = Math.min(c0, ci); c1 = Math.max(c1, ci); } }));
      if (n !== (r1 - r0 + 1) * (c1 - c0 + 1)) return 'not_rectangular:' + ch;
    }
    return null;
  }

  // أيقونة SVG مصغّرة لتخطيط (تُستخدم في قائمة التخطيطات)
  function previewSVG(key, w, h) {
    const cfg = built.table[key]; if (!cfg) return '';
    w = w || 26; h = h || 18; const rows = cfg.rowsSpec, nR = rows.length, nC = rows[0].length, cw = w / nC, ch = h / nR;
    const rects = cfg.areaNames.map(a => {
      let r0 = 99, r1 = -1, c0 = 99, c1 = -1;
      rows.forEach((r, ri) => r.split('').forEach((c, ci) => { if (c === a) { r0 = Math.min(r0, ri); r1 = Math.max(r1, ri); c0 = Math.min(c0, ci); c1 = Math.max(c1, ci); } }));
      return '<rect x="' + (c0 * cw + .75).toFixed(2) + '" y="' + (r0 * ch + .75).toFixed(2) + '" width="' + ((c1 - c0 + 1) * cw - 1.5).toFixed(2) + '" height="' + ((r1 - r0 + 1) * ch - 1.5).toFixed(2) + '" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>';
    }).join('');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">' + rects + '</svg>';
  }

  return { table: built.table, groups: built.groups, validate, previewSVG, SPEC };
});
