/* =========================================================================
   tv-symbol-availability.js — يتحقق فعلياً من وجود ملفات بيانات كل رمز
   المصدر الأول: data/manifest.json  { "XAUUSD": {"from":2019,"to":2019}, ... }
   إن لم يوجد: فحص HEAD لملفات data/DAT_MT_{SYMBOL}_M1_{YEAR}.csv للسنوات
   MIN..MAX (يُخزَّن النتيجة 24 ساعة). الحالات: checking | ok | none
   ========================================================================= */
(function (global) {
  'use strict';
  const MIN_YEAR = 2000, MAX_YEAR = Math.max(2025, new Date().getUTCFullYear()), TTL = 24 * 3600 * 1000, KEY = 'tv_symavail_v1';
  const cache = {}; let manifest = undefined; const listeners = [];

  function readStore() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function writeStore() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {} }

  async function exists(url) {
    try {
      let r = await fetch(url, { method: 'HEAD' });
      if (r.status === 405 || r.status === 501) r = await fetch(url, { headers: { Range: 'bytes=0-0' } });
      return r.ok;
    } catch (e) { return false; }
  }

  async function loadManifest() {
    if (manifest !== undefined) return manifest;
    try { const r = await fetch('data/manifest.json'); manifest = r.ok ? await r.json() : null; } catch (e) { manifest = null; }
    return manifest;
  }

  async function probe(sym) {
    const base = await probeServer(sym);
    const loc = global.TVLocalData && (await global.TVLocalData.ready, global.TVLocalData.range(sym));
    if (loc) return base.state === 'ok' ? { state: 'ok', from: Math.min(base.from, loc.from), to: Math.max(base.to, loc.to), local: true } : { state: 'ok', from: loc.from, to: loc.to, local: true };
    return base;
  }
  async function probeServer(sym) {
    const m = await loadManifest();
    if (m) { const e = m[sym]; return e ? { state: 'ok', from: e.from, to: e.to } : { state: 'none' }; }
    const years = []; for (let y = MIN_YEAR; y <= MAX_YEAR; y++) years.push(y);
    const hits = await Promise.all(years.map(y => exists('data/DAT_MT_' + sym + '_M1_' + y + '.csv')));
    const ok = years.filter((_, i) => hits[i]);
    return ok.length ? { state: 'ok', from: ok[0], to: ok[ok.length - 1] } : { state: 'none' };
  }

  function get(sym) { return cache[sym] || { state: 'checking' }; }

  async function check(symbols) {
    const stored = readStore(); const todo = [];
    symbols.forEach(s => {
      const c = stored[s];
      if (c && c.t && Date.now() - c.t < TTL) cache[s] = c; else if (!cache[s] || cache[s].state === 'checking') { cache[s] = { state: 'checking' }; todo.push(s); }
    });
    if (todo.length) {
      await Promise.all(todo.map(async s => { const r = await probe(s); cache[s] = Object.assign({ t: Date.now() }, r); }));
      writeStore();
      listeners.forEach(f => { try { f(); } catch (e) {} }); // إشعار فقط عند ظهور نتائج جديدة (لا حلقة إعادة رسم)
    }
  }
  function onChange(f) { listeners.push(f); }
  function reset() { Object.keys(cache).forEach(k => delete cache[k]); manifest = undefined; try { localStorage.removeItem(KEY); } catch (e) {} }

  global.TVSymbolAvailability = { get, check, onChange, reset };
})(window);
