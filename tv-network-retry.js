/* IXVIEW: retry temporary data-host errors.
   Include AFTER tv-data-engine.js and BEFORE backtest.js. */
(function (global) {
  'use strict';
  if (global.__tvFetchRetryInstalled || typeof global.fetch !== 'function') return;
  global.__tvFetchRetryInstalled = true;

  const originalFetch = global.fetch.bind(global);
  const attempts = 5;

  function delay(ms) {
    return new Promise(resolve => global.setTimeout(resolve, ms));
  }

  function retryWait(response, attempt) {
    const value = response && response.headers && response.headers.get('Retry-After');
    if (value) {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) return Math.min(10000, seconds * 1000);
      const date = Date.parse(value);
      if (Number.isFinite(date)) return Math.min(10000, Math.max(0, date - Date.now()));
    }
    return Math.min(8000, 600 * Math.pow(2, attempt));
  }

  global.fetch = async function (input, init) {
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return originalFetch(input, init);

    for (let attempt = 0; attempt < attempts; attempt++) {
      let response;
      try {
        response = await originalFetch(input, init);
      } catch (error) {
        if (attempt === attempts - 1) throw error;
        await delay(Math.min(8000, 600 * Math.pow(2, attempt)));
        continue;
      }

      const retryable = [429, 500, 502, 503, 504].includes(response.status);
      if (!retryable || attempt === attempts - 1) return response;

      try { if (response.body) await response.body.cancel(); } catch (_) {}
      await delay(retryWait(response, attempt));
    }
  };

  global.__tvFetchRetryOriginal = originalFetch;
})(window);
