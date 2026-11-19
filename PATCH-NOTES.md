IXVIEW — Render recovery patch
================================

Merged inputs
-------------
- Full project archive: Ixview-chart1-main-١.zip
- Latest standalone tv-settings.js
- Latest standalone tv-theme.css

Changes in this build
---------------------
1. tv-settings.js
   - Preserves the latest uploaded visibility/price-scale fixes.
   - Adds TVSettings.repairVisuals(), an explicit recovery action that restores
     candle bodies, borders, wicks, the main series, the right price scale, and
     the time axis. It saves the repaired visibility settings and refits the
     chart only when the user explicitly invokes the action.

2. tv-health.js
   - Extends the diagnostic report with chart-container CSS geometry,
     parent layout, loading-overlay state, candle-series options, and axis
     visibility/autoscale options.
   - Adds an "إصلاح ظهور الشموع والمحاور" action to the diagnostic panel.

3. tests/settings.browser.py
   - Adds a regression test for the explicit visual-recovery action.

Intentionally unchanged
-----------------------
- tv-data-engine.js, backtest.js, multichart.js, tv-gaps.js, drawing.js,
  replay/backtest logic, and data files were not rewritten. Existing checks
  show that the data engine returns valid candles and the data-processing
  unit tests pass. Replacing those modules without evidence would add risk
  to Replay, Backtesting, Drawing Tools, and MultiChart.

Validation
----------
- JavaScript syntax checks: passed.
- 156 existing Node unit tests: passed.
- Settings browser suite: passed (21 checks) using system Chromium and the
  suite's lightweight-charts mock.
- Live rendering against the actual Lightweight Charts CDN was not tested
  because this environment has no network access. The patch therefore adds
  a recovery action and richer diagnostics; it does not claim the live-site
  rendering issue is conclusively fixed until verified in the deployed page.
