/* =========================================================================
   tv-symbol-availability.js — حالة بيانات كل رمز في قائمة البحث (متوفر / لا بيانات)
   المصدر: محرك البيانات (فهرس data/manifest.json أو الاكتشاف التلقائي)؛ لا تخزين خاص.
   الحالات: checking | ok {from,to} | none
   ========================================================================= */
(function (global) {
  'use strict';
  const cache = {}; const listeners = [];
  function get(sym) { return cache[sym] || { state: 'checking' }; }
  async function probe(sym) {
    const E = global.TVDataEngine; if (!E) return { state: 'none' };
    await E.ensureInfo(sym); const ys = E.yearsOf(sym);
    return ys && ys.length ? { state: 'ok', from: ys[0], to: ys[ys.length - 1] } : { state: 'none' };
  }
  async function check(symbols) {
    const todo = symbols.filter(s => !cache[s]);
    todo.forEach(s => { cache[s] = { state: 'checking' }; });
    if (todo.length) {
      await Promise.all(todo.map(async s => { cache[s] = await probe(s); }));
      listeners.forEach(f => { try { f(); } catch (e) {} }); // إشعار فقط عند ظهور نتائج جديدة
    }
  }
  function onChange(f) { listeners.push(f); }
  function reset() { Object.keys(cache).forEach(k => delete cache[k]); }
  global.TVSymbolAvailability = { get, check, onChange, reset };
})(window);
