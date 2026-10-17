/* =========================================================================
   multichart.js — Multi-Chart Layout System (Phase 1)

   Scope of this phase (see chat for the full roadmap):
     - Layout switcher: 1 Chart / 2 Charts (H) / 2 Charts (V) / 4 Charts
     - Every extra pane is a fully independent LightweightCharts instance
       with its OWN symbol, timeframe and OHLC data (loaded from the same
       data/DAT_MT_{PAIR}_M1_{YEAR}.csv files backtest.js already uses).
     - Pane 1 (top-left) always reuses the EXISTING window.chart /
       window.candleSeries as-is, so backtest/replay/drawing tools/settings
       keep working exactly like before when layout = "1 Chart".

   NOT included yet (future phases, needs its own architecture work):
     - Independent drawing tools per extra pane (DrawingTools is currently a
       global singleton bound to pane 1 only — see chat explanation).
     - Symbol Compare / overlay, Percentage mode, Correlation, Spread,
       synchronized crosshair/time/replay, Watchlist, Object Tree, Alerts,
       Save/Load layouts.

   Requires: LightweightCharts loaded, and backtest.js already executed
   (window.chart / window.candleSeries must exist). Load this script AFTER
   backtest.js.
   ========================================================================= */

(function (global) {
  'use strict';

const LAYOUTS = (global.TVLayouts && global.TVLayouts.table) || (function () {
  // احتياطي إن لم يُحمَّل tv-layouts.js
  return {
  '1': { cols: 1, rows: 1, panes: 1 },
  '2h': { cols: 2, rows: 1, panes: 2 },
  '2v': { cols: 1, rows: 2, panes: 2 },
  // تخطيطات ثلاثية غير متماثلة بأسلوب TradingView — تُبنى عبر
  // grid-template-areas بدل الأعمدة/الصفوف المتساوية العادية.
  '3a': { panes: 3, custom: true, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gridTemplateAreas: '"a c" "b c"' }, // اثنين فوق بعض يسار + شاشة كبيرة يمين
  '3b': { panes: 3, custom: true, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gridTemplateAreas: '"a b" "a c"' }, // شاشة كبيرة يسار + اثنين فوق بعض يمين
  '3': { cols: 3, rows: 1, panes: 3 },
  '4': { cols: 2, rows: 2, panes: 4 },
  '6': { cols: 3, rows: 2, panes: 6 },
  '8': { cols: 4, rows: 2, panes: 8 },
  '16': { cols: 4, rows: 4, panes: 16 }
};
})();
const PAIR_OPTIONS = [
    ['XAUUSD', 'Gold'], ['XAGUSD', 'Silver'], ['EURUSD', 'EURUSD'], ['GBPUSD', 'GBPUSD'], ['USDJPY', 'USDJPY'],
    ['AUDUSD', 'AUDUSD'], ['USDCAD', 'USDCAD'], ['USDCHF', 'USDCHF'], ['NZDUSD', 'NZDUSD'],
    ['BTCUSD', 'BTCUSD'], ['NASDAQ', 'NASDAQ'], ['OIL', 'OIL'], ['DXY', 'DXY']
  ];

  // Category buckets for the Compare Search Window (item 13).
const SYMBOL_CATEGORIES = {
  Currency: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'],
  Crypto: ['BTCUSD'],
  Index: ['NASDAQ', 'DXY'],
  Commodities: ['XAUUSD', 'XAGUSD', 'OIL'],
  Local: [],
  Stock: [],
  Futures: [],
  Bond: [],
  Economy: []
};

// لون الأيقونة الدائرية لكل رمز — نفس فكرة TradingView (لون ثابت مشتق من
// اسم الرمز نفسه، حتى يكون كل رمز له هوية بصرية ثابتة دائماً).
function symbolIconColor(sym) {
  const palette = ['#2962FF', '#FF6D00', '#26A69A', '#E91E63', '#9C27B0', '#FFC107', '#00BCD4', '#7E57C2', '#43A047', '#EF5350'];
  let hash = 0;
  for (let i = 0; i < sym.length; i++) hash = (hash * 31 + sym.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

  const TF_OPTIONS = [
    ['1', '1M'], ['3', '3M'], ['5', '5M'], ['15', '15M'], ['30', '30M'],
    ['60', '1H'], ['240', '4H'], ['1440', '1D'], ['10080', '1W'], ['43200', '1MN']
  ];

  // Same OHLC bucketing logic as backtest.js's convertTimeframe(), duplicated
  // here (not imported) so this file has zero dependency on backtest.js
  // internals beyond window.chart / window.candleSeries.
function convertTimeframe(data, minutes) {
    let result = [], bucket = null, bucketKey = null;

    function keyFor(time, minutes) {
      const d = new Date(time * 1000);
      if (minutes === 1440) {
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
      }
      if (minutes === 10080) {
        const day = d.getUTCDay();
        const diffToMonday = (day + 6) % 7;
        const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday));
        return monday.getTime() / 1000;
      }
      if (minutes === 43200) {
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
      }
      const tfSec = minutes * 60;
      return Math.floor(time / tfSec) * tfSec;
    }

    data.forEach(candle => {
      const time = keyFor(candle.time, minutes);
      if (bucketKey !== time) {
        if (bucket) result.push(bucket);
        bucket = { time, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume || 0 };
        bucketKey = time;
      } else {
        bucket.high = Math.max(bucket.high, candle.high);
        bucket.low = Math.min(bucket.low, candle.low);
        bucket.close = candle.close;
        bucket.volume += candle.volume || 0;
      }
    });
    if (bucket) result.push(bucket);
    return result;
}

  // Shared M1 CSV loader — used both for a pane's own candles and for any
  // Compare overlay symbol added on top of a pane.
  async function loadRawM1(symbol) {
    // نفس مسار محرك البيانات الرئيسي (محلي IndexedDB أولاً ثم data/) — لا مسار جلب منفصل
    const E = global.TVDataEngine; const local = global.TVLocalData && global.TVLocalData.range(symbol);
    const from = local ? Math.min(local.from, 2011) : 2011, to = E ? E.MAX_YEAR : 2025;
    let raw = [];
    for (let year = from; year <= to; year++) {
      try { const chunk = await E.fetchYearChunk(symbol, year); if (chunk.length) raw = raw.concat(chunk); }
      catch (e) { /* سنة غير متوفرة */ }
    }
    return raw;
  }

  // Lightweight loader for the Watchlist — only reads the current + previous
  // year's file (last two closes are all that's needed for price/change%),
  // instead of loadRawM1's full 2011–2025 scan.
  async function loadRecentTail(symbol) {
    const E = global.TVDataEngine; let raw = [];
    for (let year = E.MAX_YEAR; year >= E.MAX_YEAR - 6 && raw.length < 2; year--) {
      try { const chunk = await E.fetchYearChunk(symbol, year); if (chunk.length) raw = chunk.slice(-2).concat(raw); } catch (e) { /* تخطّ */ }
    }
    return raw.slice(-2).map(c => ({ time: c.time, close: c.close }));
  }
// يطبّق نفس إعدادات مظهر الشارت (ألوان الشموع/الخلفية/الشبكة/الدقة) من
  // settings.js على أي شاشة إضافية — يُستخدم عند إنشاء الشاشة وعند تغيير
  // الإعدادات لاحقاً (مزامنة الإعدادات بين كل الشاشات).
  function applyChartSettingsToPane(pane, s) {
    if (!s || !pane.chart || !pane.series) return;
    pane.series.applyOptions({
      upColor: s.upColor, downColor: s.downColor,
      borderVisible: s.borderVisible, borderUpColor: s.borderUpColor, borderDownColor: s.borderDownColor,
      wickVisible: s.wickVisible, wickUpColor: s.wickUpColor, wickDownColor: s.wickDownColor,
      priceFormat: { type: 'price', precision: s.precision, minMove: 1 / Math.pow(10, s.precision) }
    });
    pane.chart.applyOptions({
      layout: { background: { color: s.bgColor }, textColor: s.textColor },
      grid: {
        vertLines: { color: s.gridColor, visible: s.gridVisible },
        horzLines: { color: s.gridColor, visible: s.gridVisible }
      }
    });
  }

  const COMPARE_PALETTE = ['#2962FF', '#FF6D00', '#26A69A', '#E91E63', '#9C27B0', '#FFC107', '#00BCD4'];
  const COMPARE_TYPES = [['line', 'Line'], ['area', 'Area'], ['step', 'Step'], ['histogram', 'Histogram']];

  const MAX_SERIES_POINTS = 5000;
  
  class ChartPane {
    constructor(index, container, isPrimary) {
      this.index = index;
      this.container = container;
      this.isPrimary = isPrimary;
      this.rawM1 = [];
      this.allData = [];

this.compareMode = 'overlay';
this._savedViewState = null; // { logicalRange } — حالة العرض المحفوظة الخاصة بهذي الشاشة فقط

if (isPrimary) {
        const pairSelect = document.getElementById('pairSelect');
        const tfSelect = document.getElementById('timeframeSelect');
        this.pair = pairSelect ? pairSelect.value : 'EURUSD';
        this.timeframe = Number(tfSelect ? tfSelect.value : 1);
        this._buildPrimaryHeader();
        this.chart = global.chart;
        this.series = global.candleSeries;
      } else {
        this.pair = PAIR_OPTIONS[index % PAIR_OPTIONS.length][0];
        this.timeframe = 60;
        this._buildPaneHeader();
        this._buildChart();
        this.loadData();
      }
  this._buildLegend();
this._bindSync();
this._bindActivation();
this._installMainSync();
}

async _loadAroundBacktestDate(targetTime) {
  if (!this._dataStream || targetTime == null) return;
  const tf = this.timeframe;
  const factor = Math.max(1, tf === 1 ? 1 : tf);
  this.container.classList.add('mc-loading');
  this.rawM1 = await this._dataStream.loadAroundDate(targetTime, 5000 * factor, 200 * factor);
  this.container.classList.remove('mc-loading');
  this._applyTimeframe();
}

// الضغط على أي مكان بالشاشة (ما عدا أزرار الرأس) يجعلها الشاشة
// النشطة — الشريط العلوي (الرمز/الفريم/المؤشرات لاحقاً/الرسم) يتحكم
// بها فقط بعدها، تماماً كما يعمل TradingView.
_bindActivation() {
  this.container.classList.toggle('mc-pane-active', this.index === global.MultiChart.activeIndex);
  this.container.addEventListener('mousedown', () => global.MultiChart.setActive(this.index));
  this.container.addEventListener('touchstart', () => global.MultiChart.setActive(this.index), { passive: true });
}
    // شريط Legend عائم أعلى يسار الشارت — يجمع الرمز الأساسي وكل رموز
    // المقارنة مع لونها وسعرها ونسبة تغيّرها، بالإضافة لأزرار أوضاع
    // المقارنة الأربعة (Overlay/Same Scale/%/Indexed 100).
    _buildLegend() {
      const legend = document.createElement('div');
      legend.className = 'mc-legend';
      const host = this.isPrimary ? this.container : this.bodyEl;
      if (!host) return;
      host.style.position = host.style.position || 'relative';
      host.appendChild(legend);
      this.legendEl = legend;
      this._renderLegend();
    }

    _renderLegend() {
      if (!this.legendEl) return;
      const legend = this.legendEl;
      legend.innerHTML = '';

      if (this.compares.length) {
        const modeRow = document.createElement('div');
        modeRow.className = 'mc-legend-modes';
        [['overlay', 'Overlay'], ['same', 'Same Scale'], ['percent', '%'], ['normalize', 'Indexed 100']].forEach(([key, label]) => {
          const b = document.createElement('button');
          b.className = 'mc-legend-mode-btn' + (this.compareMode === key ? ' active' : '');
          b.textContent = label;
          b.addEventListener('click', (e) => { e.stopPropagation(); this.setCompareMode(key); });
          modeRow.appendChild(b);
        });
        legend.appendChild(modeRow);
        // اسم الوضع المطبَّق + الأساس الزمني بوضوح (لا غموض في طريقة المقارنة)
        const info = document.createElement('div'); info.className = 'mc-legend-info';
        const md = this.compareMode, isoT = t => new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
        if (md === 'overlay') info.textContent = 'كل رمز على محور مستقل مخفي — الأسعار الخام (لا تُقارَن القيم بين الرموز بصرياً)';
        else if (md === 'same') info.textContent = 'محور واحد بالأسعار الخام';
        else {
          const kindTxt = md === 'percent' ? 'نسبة مئوية من الأساس (0% عند الأساس)' : 'مفهرس (100 عند الأساس)';
          const b = this._cmpBase;
          info.textContent = kindTxt + ' — المحور الأيسر. ' + (b && b.time != null ? 'الأساس: ' + isoT(b.time) : (b ? 'لا توجد نقطة زمنية مشتركة لكل الرموز: لكل رمز أساسه الخاص' : 'جارٍ الحساب…'));
        }
        legend.appendChild(info);
        if (md === 'same') {
          const main = this.series && this.series.data ? this.series.data().map(b => ({ time: b.time, value: b.close })) : [];
          this.compares.forEach(e => { const r = e.closeData && main.length ? TVCompare.medianRatio(main, e.closeData) : null; if (r && r > 10) { const w = document.createElement('div'); w.className = 'mc-legend-warn'; w.textContent = '⚠ ' + e.symbol + ': نطاق السعر يختلف عن الرئيسي ' + Math.round(r) + '× — استخدم % أو Indexed أو Overlay'; legend.appendChild(w); } });
        }
      }


      this.compares.forEach(entry => {
        const row = document.createElement('div');
        row.className = 'mc-legend-row';

        const dot = document.createElement('span');
        dot.className = 'mc-legend-dot';
        dot.style.background = entry.color;

        const name = document.createElement('span');
        name.className = 'mc-legend-name';
        name.textContent = entry.symbol;

        const priceEl = document.createElement('span');
        priceEl.className = 'mc-legend-price';
        const chgEl = document.createElement('span');
        chgEl.className = 'mc-legend-chg';
        entry._hoverEl = priceEl; // يُحدَّث عند تحريك المؤشر وأثناء الريبلاي (قيمة عند وقت الشارت، لا آخر شمعة محمّلة)
        priceEl.textContent = entry.closeData ? '' : '…';

        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'mc-legend-btn';
        eyeBtn.textContent = entry.visible ? '\u{1F441}' : '\u{1F576}';
        eyeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          entry.visible = !entry.visible;
          entry.series.applyOptions({ visible: entry.visible });
          this._renderLegend();
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'mc-legend-btn';
        delBtn.textContent = '\u2715';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (entry.locked) return;
          this.chart.removeSeries(entry.series);
          this.compares = this.compares.filter(c => c !== entry);
          this._renderCompareList();
          this._renderLegend();
        });

        row.appendChild(dot); row.appendChild(name); row.appendChild(priceEl);
        row.appendChild(eyeBtn); row.appendChild(delBtn);
        legend.appendChild(row);
        // تحذيرات التغطية: لا نُخفي نقص البيانات ولا نخترع شموعاً
        const cov = entry.coverage, warn = (txt) => { const w = document.createElement('div'); w.className = 'mc-legend-warn'; w.textContent = '⚠ ' + entry.symbol + ': ' + txt; legend.appendChild(w); };
        if (entry.noData) warn('لا توجد بيانات محلية لهذا الرمز في فترة الشارت');
        else if (cov && entry.closeData && entry.closeData.length && !cov.overlap) warn('لا يوجد تداخل زمني مع الشارت الرئيسي');
        else if (cov && cov.overlap && cov.matchRatio < 0.5) warn('تطابق الأوقات ' + Math.round(cov.matchRatio * 100) + '% فقط — الفجوات تُترك فارغة');
        if ((this.compareMode === 'percent' || this.compareMode === 'normalize') && entry.closeData && entry.closeData.length && entry.baseTime == null && !entry.noData) warn('لا أساس مشترك مع الرئيسي — لا يمكن حساب النسبة');
      });
      this._refreshHoverValues(null);

     // زر "+ إضافة رمز" حُذف من هنا — أصبح مكرراً مع زر "+" بالشريط
// العلوي (tvAddCompareBtn في tv-topbar.js) الذي يفتح نفس نافذة
// البحث ويضيف المقارنة بنفس الطريقة.
}

    _buildPrimaryHeader() {
      const header = document.createElement('div');
      header.className = 'mc-pane-header mc-pane-header-primary';
      const label = document.createElement('span');
      label.className = 'mc-pane-label';
      const pairSelect = document.getElementById('pairSelect');
const updateLabel = () => {
  const txt = pairSelect ? pairSelect.options[pairSelect.selectedIndex].textContent : '';
  label.textContent = 'Main — ' + txt;
  // لا تحدّث this.pair إلا إذا كانت الشاشة الرئيسية فعلاً هي النشطة حالياً —
  // وإلا فإن تغيّر القيمة قادم من مزامنة عرض اسم شاشة أخرى فقط، وليس تغييراً حقيقياً لرمز A.
  if (!global.MultiChart || global.MultiChart.getActivePane() === this) {
    this.pair = pairSelect ? pairSelect.value : this.pair;
  }
  this._renderLegend();
};
updateLabel();
if (pairSelect) pairSelect.addEventListener('change', updateLabel);
header.appendChild(label);
this._addSpreadButton(header);
this.container.insertBefore(header, this.container.firstChild);
this._buildCompareList();
this._buildSpreadList();
this._buildInfoBadge();
}

// شارة معلومات صغيرة أعلى يمين كل شاشة (رمز/فريم/نوع الشموع/آخر سعر)
_buildInfoBadge() {
  const badge = document.createElement('div');
  badge.className = 'mc-pane-info';
  this.container.appendChild(badge);
  this.infoEl = badge;
  this._refreshHeaderInfo();
}

 _buildPaneHeader() {
      const header = document.createElement('div');
      header.className = 'mc-pane-header';

this.container.appendChild(header);
this.headerEl = header;
this._buildCompareList();
this._buildSpreadList();

   const body = document.createElement('div');
body.className = 'mc-pane-body';
this.container.appendChild(body);
this.bodyEl = body;
this._buildInfoBadge();
}

    // زر أدوات إضافية لكل شاشة — يبني أدوات الرسم بشكل كسول (Lazy) عند أول
    // ضغطة فقط، حتى ما تُبنى 16 نسخة من DrawingTools تلقائياً وتبطّئ الصفحة.
    _addMoreToolsButton(header) {
      const btn = document.createElement('button');
      btn.className = 'mc-pane-draw-btn';
      btn.title = 'Drawing Tools';
      btn.textContent = '\u270F\uFE0F';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._ensureDrawingTools();
        btn.remove();
        if (this.drawingManager && this.drawingManager.drawBtn) {
          this.drawingManager.drawBtn.click();
        }
      });
      header.appendChild(btn);
      this._moreToolsBtn = btn;
    }

    // يبني DrawingTools مرة واحدة فقط عند الطلب الفعلي (أول ضغطة من المستخدم
    // على زر الرسم بهذي الشاشة تحديداً) — يحل مشكلة الأداء ويعطي قابلية
    // رسم كاملة لكل شاشة بنفس الوقت.
    _ensureDrawingTools() {
      if (this.drawingManager || !global.DrawingTools || !this.headerEl || !this.bodyEl) return;
      this.drawingManager = global.DrawingTools.init({
        chart: this.chart,
        series: this.series,
        container: this.bodyEl,
        storageKey: 'tv_clone_drawings_pane_' + this.index,
        toolbarContainer: this.headerEl
      });
    }

  
    _addSpreadButton(header) {
      const btn = document.createElement('button');
      btn.className = 'mc-compare-btn';
      btn.textContent = '+ Spread';
      btn.addEventListener('click', (e) => { e.stopPropagation(); this._toggleSpreadPicker(); });
      header.appendChild(btn);
    }

    _buildSpreadList() {
      this.spreads = [];
      const list = document.createElement('div');
      list.className = 'mc-compare-list mc-spread-list';
      this._compareListEl.insertAdjacentElement('afterend', list);
      this._spreadListEl = list;
    }

    // ---------------------------------------------------------- percentage mode
    // Uses Lightweight Charts' own built-in PriceScaleMode.Percentage — the
    // exact same mechanism TradingView's "Percentage" chart setting uses —
    // instead of hand-transforming every data point. All series sharing a
    // price scale switch together, so every comparison symbol is moved onto
    // one shared scale while the mode is on, and split back onto their own
    // independent (hidden) scales when it's off.
   // أربعة أوضاع مقارنة كاملة مطابقة لـ TradingView:
// overlay   -> كل رمز بمقياسه الخاص المخفي (الوضع الافتراضي الحالي)
// same      -> كل الرموز تشارك نفس مقياس السعر الأساسي
// percent   -> نسبة مئوية من نقطة البداية (LightweightCharts PriceScaleMode.Percentage)
// normalize -> Indexed to 100 (كل رمز يُعاد حسابه نسبة لأول قيمة له × 100)
setCompareMode(mode) {
  this.compareMode = mode;
  const L = LightweightCharts;
  this.compares.forEach(entry => {
    if (mode === 'overlay') { entry.series.applyOptions({ priceScaleId: entry.scaleId }); this.chart.priceScale(entry.scaleId).applyOptions({ visible: false }); }
    else if (mode === 'same') entry.series.applyOptions({ priceScaleId: 'right' });
    else entry.series.applyOptions({ priceScaleId: 'left' }); // % / Indexed: محور أيسر مستقل بأساس صريح
  });
  // محور السعر الأيمن يبقى خاماً دائماً (الرسومات والشموع الرئيسية مثبّتة عليه)
  this.chart.priceScale('right').applyOptions({ mode: L.PriceScaleMode.Normal, visible: true });
  const rebased = mode === 'percent' || mode === 'normalize';
  try { this.chart.priceScale('left').applyOptions({ visible: rebased && this.compares.length > 0, mode: L.PriceScaleMode.Normal }); } catch (e) {}
  if (!rebased) this._removeBaseLine();
  this._applyCompareData();
  this._renderLegend();
}

// ---------------------------------------------------------------- مقارنة: بيانات وأساس وتغطية
// خط الأساس للرمز الرئيسي على المحور الأيسر (يظهر فقط في وضعي % و Indexed)
_ensureBaseLine() {
  if (this._baseLine) return this._baseLine;
  const L = LightweightCharts;
  this._baseLine = this.chart.addSeries(L.LineSeries, { priceScaleId: 'left', color: '#6b7280', lineWidth: 1, lineStyle: L.LineStyle.Dashed, lastValueVisible: true, priceLineVisible: false, title: this.pair });
  return this._baseLine;
}
_removeBaseLine() { if (this._baseLine) { try { this.chart.removeSeries(this._baseLine); } catch (e) {} this._baseLine = null; } this._cmpBase = null; this._baseRef = null; }
_isReplay() { try { return !!(global.getBacktestState && global.getBacktestState().isBacktest); } catch (e) { return false; } }
_entryBars(entry) {
  // تجميع آمن لإطار الشارت الحالي (مُخزَّن بحسب الإطار وعدد الشموع الخام)
  const key = this.timeframe + '|' + (entry.rawM1 ? entry.rawM1.length : 0);
  if (entry._barsKey !== key) { entry._bars = !entry.rawM1 || !entry.rawM1.length ? [] : (this.timeframe === 1 ? entry.rawM1 : convertTimeframe(entry.rawM1, this.timeframe)); entry._barsKey = key; }
  return entry._bars;
}
_tolSec() { return Math.max(60, this.timeframe * 60) * 1.5; }
_decimals(sym) { return (SYMBOL_PRECISION && SYMBOL_PRECISION[sym] != null) ? SYMBOL_PRECISION[sym] : 5; }

// يعيد حساب بيانات كل سلاسل المقارنة (خام أو بالنسبة/الفهرس) ويقصّها عند الريبلاي
_applyCompareData() {
  if (!this.compares) return;
  const mode = this.compareMode || 'overlay', rebased = mode === 'percent' || mode === 'normalize';
  const kind = mode === 'percent' ? 'percent' : 'index100';
  const fmt = kind === 'percent' ? { type: 'custom', formatter: v => v.toFixed(2) + '%', minMove: 0.01 } : { type: 'price', precision: 2, minMove: 0.01 };
  const mainDisp = this.series && this.series.data ? this.series.data() : [];
  const mainTimes = mainDisp.map(b => b.time);
  this._mainLastTime = mainTimes.length ? mainTimes[mainTimes.length - 1] : null;
  const replay = this._isReplay();
  this.compares.forEach(entry => {
    entry.closeData = this._entryBars(entry).map(c => ({ time: c.time, value: c.close }));
    entry.coverage = TVCompare.coverage(mainTimes, entry.closeData.map(p => p.time));
  });
  if (rebased) {
    let visFrom = null; try { const r = this.chart.timeScale().getVisibleRange(); if (r && r.from != null) visFrom = r.from; } catch (e) {}
    const usable = this.compares.filter(e => e.visible && e.closeData.length);
    const sets = [mainTimes].concat(usable.map(e => e.closeData.map(p => p.time)));
    // الأساس = أول وقت مشترك بعد بداية النطاق المرئي؛ إن لم يوجد (مثلاً في الريبلاي حيث تنتهي البيانات المعروضة قبلها) نبحث من بداية البيانات المعروضة
    let bt = TVCompare.firstCommonAll(sets, visFrom);
    if (bt == null && visFrom != null) bt = TVCompare.firstCommonAll(sets, null);
    this._cmpBase = { time: bt, shared: bt != null };
    this.compares.forEach(entry => {
      let bte = bt;
      if (bte == null && entry.closeData.length) { const et = entry.closeData.map(p => p.time); bte = TVCompare.firstCommon(mainTimes, et, visFrom); if (bte == null) bte = TVCompare.firstCommon(mainTimes, et, null); } // أساس منفصل إن لم توجد نقطة مشتركة للجميع
      entry.baseTime = bte;
      entry.data = bte == null ? [] : TVCompare.rebase(entry.closeData, kind, bte);
      entry.series.applyOptions({ priceFormat: fmt });
    });
    const base = this._ensureBaseLine(); const mainClose = mainDisp.map(b => ({ time: b.time, value: b.close }));
    const bm = bt != null ? bt : (mainTimes.length ? mainTimes[0] : null);
    this._baseRef = { kind, b: bm == null ? null : TVCompare.baseValue(mainClose, bm) };
    base.setData(bm == null ? [] : TVCompare.rebase(mainClose, kind, bm));
    base.applyOptions({ priceFormat: fmt, title: this.pair, visible: this.compares.length > 0 });
  } else {
    this.compares.forEach(entry => {
      const dp = this._decimals(entry.symbol);
      entry.baseTime = null; entry.data = entry.closeData.slice(-MAX_SERIES_POINTS);
      entry.series.applyOptions({ priceFormat: { type: 'price', precision: dp, minMove: Math.pow(10, -dp) } });
    });
  }
  // لا مستقبل أثناء الريبلاي: تُقصّ كل السلاسل عند آخر شمعة معروضة للرئيسي
  this.compares.forEach(entry => {
    let show = entry.data || [];
    if (replay && this._mainLastTime != null) { let i = show.length; while (i > 0 && show[i - 1].time > this._mainLastTime) i--; show = show.slice(0, i); }
    entry.shownIdx = show.length - 1;
    entry.series.setData(show);
  });
}

// تحميل بيانات رمز المقارنة لنفس الفترة الزمنية للشارت الرئيسي (محلي أولاً)، لا "آخر 2000 شمعة"
async _ensureCompareRange(entry) {
  const E = global.TVDataEngine, main = this._dataArr();
  if (!main || !main.length) return;
  const from = main[0].time, to = main[main.length - 1].time;
  if (entry.loadedFrom != null && entry.loadedFrom <= from && entry.loadedTo >= to) return;
  const y0 = new Date(from * 1000).getUTCFullYear(), y1 = new Date(to * 1000).getUTCFullYear();
  let raw = [];
  for (let y = Math.max(E.MIN_YEAR, y0); y <= Math.min(E.MAX_YEAR, y1); y++) { const c = await E.fetchYearChunk(entry.symbol, y); if (c.length) raw = raw.concat(c); }
  entry.rawM1 = raw.filter(c => c.time >= from && c.time <= to);
  entry.loadedFrom = from; entry.loadedTo = to; entry.noData = entry.rawM1.length === 0;
}
async _syncCompare() {
  if (!this.compares || !this.compares.length) { this._removeBaseLine(); return; }
  if (this._cmpBusy) { this._cmpDirty = true; return; }
  this._cmpBusy = true;
  try {
    do { this._cmpDirty = false; for (const e of this.compares) await this._ensureCompareRange(e); this._applyCompareData(); } while (this._cmpDirty);
  } finally { this._cmpBusy = false; }
  this._renderCompareList(); this._renderLegend();
}
_scheduleCompareSync() { clearTimeout(this._cmpTimer); this._cmpTimer = setTimeout(() => this._syncCompare(), 60); }

// يراقب بيانات الشارت الرئيسي: إعادة المزامنة عند setData، وتحديث تدريجي (بلا مستقبل) أثناء الريبلاي
_installMainSync() {
  const s = this.series; if (!s || s.__mcCmpHook) return; s.__mcCmpHook = true;
  const self = this;
  const origUpdate = s.update.bind(s), origSet = s.setData.bind(s);
  s.update = function (bar) {
    const r = origUpdate(bar);
    self._mainLastTime = bar.time;
    if (self.compares && self.compares.length && self._isReplay()) self._advanceCompare(bar);
    return r;
  };
  s.setData = function (data) { const r = origSet(data); if (data && data.length) self._mainLastTime = data[data.length - 1].time; if (self.compares && self.compares.length) self._scheduleCompareSync(); return r; };
  try { this.chart.timeScale().subscribeVisibleTimeRangeChange(() => { if (self.compares && self.compares.length && (self.compareMode === 'percent' || self.compareMode === 'normalize')) self._scheduleCompareSync(); }); } catch (e) {}
  try { this.chart.subscribeCrosshairMove(param => self._onCrosshair(param)); } catch (e) {}
}
// أثناء الريبلاي: أضف نقطة لكل سلسلة فقط إن كان لها شمعة عند/قبل وقت الشمعة الجديدة (لا كشف للمستقبل)
_advanceCompare(bar) {
  const T = bar.time;
  this.compares.forEach(entry => {
    const d = entry.data; if (!d || !d.length) return;
    let i = entry.shownIdx == null ? -1 : entry.shownIdx;
    while (i + 1 < d.length && d[i + 1].time <= T) { i++; entry.series.update(d[i]); }
    entry.shownIdx = i;
  });
  if (this._baseLine && this._baseRef && this._baseRef.b) {
    const v = this._baseRef.kind === 'percent' ? (bar.close / this._baseRef.b - 1) * 100 : (bar.close / this._baseRef.b) * 100;
    this._baseLine.update({ time: T, value: v });
  }
  this._refreshHoverValues(null);
}
// قيم التحويم: لكل رمز قيمة الإغلاق الخام عند الوقت (أو – إن تجاوزت الفجوة حد الإطار)
_onCrosshair(param) { this._refreshHoverValues(param && param.time != null ? param.time : null); }
_refreshHoverValues(time) {
  if (!this.legendEl || !this.compares || !this.compares.length) return;
  const t = time != null ? time : this._mainLastTime; if (t == null) return;
  this.compares.forEach(entry => {
    if (!entry._hoverEl || !entry.closeData) return;
    const p = TVCompare.valueAtOrBefore(entry.closeData, t, this._tolSec());
    let txt = p ? p.value.toFixed(this._decimals(entry.symbol)) : '–';
    if (p && (this.compareMode === 'percent' || this.compareMode === 'normalize') && entry.baseTime != null) {
      const b = TVCompare.baseValue(entry.closeData, entry.baseTime);
      if (b) txt += this.compareMode === 'percent' ? '  (' + ((p.value / b - 1) * 100).toFixed(2) + '%)' : '  (' + ((p.value / b) * 100).toFixed(2) + ')';
    }
    entry._hoverEl.textContent = txt;
  });
}

// (احتفاظاً بالتوافق) أي استدعاء قديم يعيد حساب كل السلاسل بالوضع الحالي
_setEntrySeriesData() { this._applyCompareData(); }

    // ---------------------------------------------------------- spread comparison
    _toggleSpreadPicker() {
      if (this._spreadPicker) { this._spreadPicker.remove(); this._spreadPicker = null; return; }
      const pop = document.createElement('div');
      pop.className = 'mc-compare-picker';

      const aSel = document.createElement('select');
      const bSel = document.createElement('select');
      PAIR_OPTIONS.forEach(([val, label], i) => {
        const oa = document.createElement('option'); oa.value = val; oa.textContent = label;
        const ob = document.createElement('option'); ob.value = val; ob.textContent = label;
        aSel.appendChild(oa); bSel.appendChild(ob);
      });
      aSel.value = this.pair;
      bSel.selectedIndex = (aSel.selectedIndex + 1) % PAIR_OPTIONS.length;

      const minus = document.createElement('span');
      minus.className = 'mc-spread-minus';
      minus.textContent = '\u2212';

      const addBtn = document.createElement('button');
      addBtn.textContent = 'Add';
      addBtn.addEventListener('click', () => {
        if (aSel.value === bSel.value) return;
        this.addSpread(aSel.value, bSel.value);
        pop.remove();
        this._spreadPicker = null;
      });

      pop.appendChild(aSel); pop.appendChild(minus); pop.appendChild(bSel); pop.appendChild(addBtn);
      this.container.appendChild(pop);
      this._spreadPicker = pop;
    }

    addSpread(symA, symB) {
      const color = COMPARE_PALETTE[(this.compares.length + this.spreads.length) % COMPARE_PALETTE.length];
      const scaleId = 'spr_' + symA + '_' + symB + '_' + Date.now();
      const series = this.chart.addSeries(LightweightCharts.HistogramSeries, { priceScaleId: scaleId, color });
      this.chart.priceScale(scaleId).applyOptions({ visible: true, scaleMargins: { top: 0.75, bottom: 0 } });
      const entry = { symA, symB, series, scaleId, color, visible: true, label: symA + ' \u2212 ' + symB, rawA: null, rawB: null, data: [] };
      this.spreads.push(entry);
      this._renderSpreadList();
      Promise.all([loadRawM1(symA), loadRawM1(symB)]).then(([rawA, rawB]) => {
        entry.rawA = rawA; entry.rawB = rawB;
        this._recomputeSpread(entry);
      });
      return entry;
    }

    _recomputeSpread(entry) {
      if (!entry.rawA || !entry.rawB) return;
      const barsA = this.timeframe === 1 ? entry.rawA : convertTimeframe(entry.rawA, this.timeframe);
      const barsB = this.timeframe === 1 ? entry.rawB : convertTimeframe(entry.rawB, this.timeframe);
      const mapB = new Map(barsB.map(b => [b.time, b.close]));
      const data = [];
      barsA.forEach(a => {
        const bClose = mapB.get(a.time);
        if (bClose == null) return;
        const v = a.close - bClose;
        data.push({ time: a.time, value: v, color: v >= 0 ? '#26a69a' : '#ef5350' });
      });
   entry.data = data.slice(-MAX_SERIES_POINTS);
entry.series.setData(entry.data);
}

    _renderSpreadList() {
      this._spreadListEl.innerHTML = '';
      this.spreads.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'mc-compare-row';

        const colorTag = document.createElement('span');
        colorTag.className = 'mc-compare-color';
        colorTag.style.background = entry.color;

        const nameEl = document.createElement('span');
        nameEl.className = 'mc-compare-name';
        nameEl.style.width = 'auto';
        nameEl.textContent = entry.label;

        const visBtn = document.createElement('button');
        visBtn.className = 'mc-compare-vis';
        visBtn.textContent = entry.visible ? 'Show' : 'Hide';
        visBtn.addEventListener('click', () => {
          entry.visible = !entry.visible;
          entry.series.applyOptions({ visible: entry.visible });
          visBtn.textContent = entry.visible ? 'Show' : 'Hide';
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'mc-compare-del';
        delBtn.textContent = '\u2715';
        delBtn.addEventListener('click', () => {
          this.chart.removeSeries(entry.series);
          this.spreads = this.spreads.filter(s => s !== entry);
          this._renderSpreadList();
        });

        row.appendChild(colorTag); row.appendChild(nameEl); row.appendChild(visBtn); row.appendChild(delBtn);
        this._spreadListEl.appendChild(row);
      });
    }

    _addCompareButton(header) {
      const btn = document.createElement('button');
      btn.className = 'mc-compare-btn';
      btn.textContent = '+ Compare';
      btn.addEventListener('click', (e) => { e.stopPropagation(); this._toggleComparePicker(); });
      header.appendChild(btn);
    }

    _buildCompareList() {
      this.compares = [];
      const list = document.createElement('div');
      list.className = 'mc-compare-list';
      const headerEl = this.container.querySelector('.mc-pane-header');
      this.container.insertBefore(list, headerEl.nextSibling);
      this._compareListEl = list;
    }

  _toggleComparePicker() {
      global.MultiChartSymbolSearch.open((symbol) => this._openCompareTypePicker(symbol));
    }

    _openCompareTypePicker(symbol) {
      if (this._comparePicker) { this._comparePicker.remove(); this._comparePicker = null; }
      const pop = document.createElement('div');
      pop.className = 'mc-compare-picker';

      const label = document.createElement('span');
      label.className = 'mc-spread-minus';
      label.textContent = symbol;

      const typeSel = document.createElement('select');
      COMPARE_TYPES.forEach(([val, label2]) => {
        const o = document.createElement('option'); o.value = val; o.textContent = label2;
        typeSel.appendChild(o);
      });

      const addBtn = document.createElement('button');
      addBtn.textContent = 'Add';
      addBtn.addEventListener('click', () => {
        this.addCompare(symbol, typeSel.value);
        pop.remove();
        this._comparePicker = null;
      });

pop.appendChild(label); pop.appendChild(typeSel); pop.appendChild(addBtn);
      document.body.appendChild(pop);
      const anchorBtn = document.getElementById('tvAddCompareBtn');
      if (anchorBtn) {
        const r = anchorBtn.getBoundingClientRect();
        pop.style.top = (r.bottom + 6) + 'px';
        pop.style.left = Math.min(r.left, window.innerWidth - 220) + 'px';
      }
      this._comparePicker = pop;
      const closeOnOutside = (e) => {
        if (!pop.contains(e.target) && e.target !== anchorBtn) {
          pop.remove(); this._comparePicker = null;
          document.removeEventListener('mousedown', closeOnOutside);
        }
      };
      setTimeout(() => document.addEventListener('mousedown', closeOnOutside), 0);
    }

    _hexWithAlpha(hex, alpha) {
      let h = (hex || '#2962FF').replace('#', '');
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha == null ? 1 : alpha) + ')';
    }

    _makeCompareSeries(type, scaleId, color, width) {
      const seriesType = type === 'histogram' ? LightweightCharts.HistogramSeries
        : type === 'area' ? LightweightCharts.AreaSeries
        : LightweightCharts.LineSeries;
      const opts = { priceScaleId: scaleId, color, lineWidth: width };
      if (type === 'step') opts.lineType = LightweightCharts.LineType.WithSteps;
      if (type === 'area') { opts.lineColor = color; opts.topColor = color + '55'; opts.bottomColor = color + '05'; }
      return this.chart.addSeries(seriesType, opts);
    }

    // Adds a comparison symbol as an overlay with its own independent (hidden)
    // price scale — same default TradingView gives you before switching to
    // Percentage mode. Returns the entry synchronously so callers (e.g. Load
    // Layout) can apply saved styling immediately; the actual price data
    // loads in the background.
// بلا حد أقصى للرموز — Unlimited Symbols فعلياً (لا يوجد أي شرط MAX هنا)
addCompare(symbol, type) {
  const color = COMPARE_PALETTE[this.compares.length % COMPARE_PALETTE.length];
  const scaleId = 'cmp_' + symbol + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const series = this._makeCompareSeries(type, scaleId, color, 2);
  const cm = this.compareMode || 'overlay';
  series.applyOptions({ priceScaleId: cm === 'overlay' ? scaleId : cm === 'same' ? 'right' : 'left' });
  if (cm === 'overlay') this.chart.priceScale(scaleId).applyOptions({ visible: false, scaleMargins: { top: 0.1, bottom: 0.1 } });
  else if (cm !== 'same') { try { this.chart.priceScale('left').applyOptions({ visible: true }); } catch (e) {} }
  const entry = { symbol, type, series, scaleId, color, width: 2, opacity: 1, visible: true, locked: false, rawM1: null, data: [] };
  this.compares.push(entry);
  this._renderCompareList();
  this._renderLegend();
  this._loadCompareData(entry);
  return entry;
}

async _loadCompareData(entry) {
  // يحمّل نفس فترة الشارت الرئيسي (محلي أولاً). إن لم تُحمَّل بيانات الرئيسي بعد: احتياطي آخر 2000 شمعة.
  const main = this._dataArr();
  if (main && main.length) { await this._ensureCompareRange(entry); }
  else { const stream = new TVDataEngine.SymbolDataStream(entry.symbol); entry.rawM1 = await stream.loadInitial(2000); entry.noData = !entry.rawM1.length; }
  this._applyCompareData(); this._renderCompareList(); this._renderLegend();
}
    _changeCompareType(entry, newType) {
      this.chart.removeSeries(entry.series);
      entry.series = this._makeCompareSeries(newType, entry.scaleId, entry.color, entry.width);
      entry.type = newType;
      entry.series.setData(entry.data);
      entry.series.applyOptions({ visible: entry.visible });
    }

_renderCompareList() {
      this._compareListEl.innerHTML = '';
      this.compares.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'mc-compare-row' + (entry.locked ? ' locked' : '');

        const colorSw = document.createElement('button');
        colorSw.className = 'mc-compare-color';
        colorSw.style.background = entry.color;
        colorSw.disabled = entry.locked;
        colorSw.addEventListener('click', () => {
          const inp = document.createElement('input');
          inp.type = 'color'; inp.value = entry.color;
          inp.addEventListener('input', () => {
            entry.color = inp.value;
            colorSw.style.background = inp.value;
            entry.series.applyOptions({ color: this._hexWithAlpha(inp.value, entry.opacity) });
          });
          inp.click();
        });

        const nameEl = document.createElement('span');
        nameEl.className = 'mc-compare-name';
        nameEl.textContent = entry.symbol;

        const priceEl = document.createElement('span');
        priceEl.className = 'mc-compare-price';
        const chgEl = document.createElement('span');
        chgEl.className = 'mc-compare-chg';
        if (entry.rawM1 && entry.rawM1.length >= 2) {
          const tail = entry.rawM1.slice(-2);
          const chg = tail[1].close - tail[0].close;
          const pct = tail[0].close ? (chg / tail[0].close) * 100 : 0;
          priceEl.textContent = tail[1].close.toFixed(5);
          chgEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
          chgEl.classList.add(pct >= 0 ? 'pos' : 'neg');
        } else {
          priceEl.textContent = '\u2026';
        }

        const typeSel = document.createElement('select');
        COMPARE_TYPES.forEach(([val, label]) => {
          const o = document.createElement('option'); o.value = val; o.textContent = label;
          if (val === entry.type) o.selected = true;
          typeSel.appendChild(o);
        });
        typeSel.disabled = entry.locked;
        typeSel.addEventListener('change', () => this._changeCompareType(entry, typeSel.value));

        const widthSel = document.createElement('select');
        ['1', '2', '3', '4'].forEach(w => {
          const o = document.createElement('option'); o.value = w; o.textContent = w + 'px';
          if (Number(w) === entry.width) o.selected = true;
          widthSel.appendChild(o);
        });
        widthSel.disabled = entry.locked;
        widthSel.addEventListener('change', () => { entry.width = Number(widthSel.value); entry.series.applyOptions({ lineWidth: entry.width }); });

        const opInp = document.createElement('input');
        opInp.type = 'range'; opInp.min = 0; opInp.max = 100; opInp.value = Math.round(entry.opacity * 100);
        opInp.title = 'Opacity';
        opInp.disabled = entry.locked;
        opInp.addEventListener('input', () => {
          entry.opacity = opInp.value / 100;
          entry.series.applyOptions({ color: this._hexWithAlpha(entry.color, entry.opacity) });
        });

        const visBtn = document.createElement('button');
        visBtn.className = 'mc-compare-vis';
        visBtn.textContent = entry.visible ? 'Show' : 'Hide';
        visBtn.addEventListener('click', () => {
          entry.visible = !entry.visible;
          entry.series.applyOptions({ visible: entry.visible });
          visBtn.textContent = entry.visible ? 'Show' : 'Hide';
        });

        const lockBtn = document.createElement('button');
        lockBtn.className = 'mc-compare-lock';
        lockBtn.title = entry.locked ? 'Unlock' : 'Lock';
        lockBtn.textContent = entry.locked ? '\u{1F512}' : '\u{1F513}';
        lockBtn.addEventListener('click', () => { entry.locked = !entry.locked; this._renderCompareList(); });

        const delBtn = document.createElement('button');
        delBtn.className = 'mc-compare-del';
        delBtn.textContent = '\u2715';
        delBtn.disabled = entry.locked;
        delBtn.addEventListener('click', () => {
          if (entry.locked) return;
          this.chart.removeSeries(entry.series);
          this.compares = this.compares.filter(c => c !== entry);
          this._renderCompareList();
        });

        row.appendChild(colorSw); row.appendChild(nameEl); row.appendChild(priceEl); row.appendChild(chgEl);
        row.appendChild(typeSel); row.appendChild(widthSel); row.appendChild(opInp);
        row.appendChild(visBtn); row.appendChild(lockBtn); row.appendChild(delBtn);
        this._compareListEl.appendChild(row);
      });
    }

    _buildChart() {
      this.chart = LightweightCharts.createChart(this.bodyEl, {
        autoSize: true,
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        layout: { background: { color: '#180F24' }, textColor: '#ffffff' },
        timeScale: {
          timeVisible: true, secondsVisible: false,
          borderColor: 'rgba(255,255,255,0.2)', rightOffset: 20
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.05)' },
          horzLines: { color: 'rgba(255,255,255,0.05)' }
        }
      });
this.chart.applyOptions({ layout: { attributionLogo: false } });
this.series = this.chart.addSeries(LightweightCharts.CandlestickSeries);
this.drawingManager = null;
this._bindLazyLoad(); // يُبنى لاحقاً بشكل كسول عبر _ensureDrawingTools()

// تطبيق إعدادات مظهر الشارت الحالية (نفس ألوان الشاشة الرئيسية) فوراً
// عند إنشاء الشاشة، بدل ما تبقى بالألوان الافتراضية لحد ما يفتح المستخدم
// الإعدادات ويغيّر شي.
if (global.getChartSettingsState) {
  applyChartSettingsToPane(this, global.getChartSettingsState());
}
}

_bindLazyLoad() {
  this._loadedStartPane = 0;
  this._loadingOlderPane = false;
  this.chart.timeScale().subscribeVisibleLogicalRangeChange(async (range) => {
    if (!range || !this._dataStream || this._loadingOlderPane) return;
    if (range.from >= 100) return;
    if (global.getBacktestState && global.getBacktestState().isBacktest) return; // الريبلاي يُدار عبر _loadAroundBacktestDate بدل هذا
    this._loadingOlderPane = true;
    try {
      const grew = await this._dataStream.loadOlderIfNeeded(0);
      if (grew) {
        this.rawM1 = this._dataStream.data;
        const prevLen = (this.allData || []).length;
        this._applyTimeframe();
        const addedCount = this.allData.length - prevLen;
        if (addedCount > 0) {
          const cur = this.chart.timeScale().getVisibleLogicalRange();
          if (cur) this.chart.timeScale().setVisibleLogicalRange({ from: cur.from + addedCount, to: cur.to + addedCount });
        }
      }
    } catch (e) {}
    this._loadingOlderPane = false;
  });
}
// Primary pane has no local `allData` copy of its own — it reads the
    // exact same array backtest.js maintains, exposed via
    // window.getBacktestState() (see the backtest.js patch below).
    _dataArr() {
      if (this.isPrimary) {
        const state = global.getBacktestState ? global.getBacktestState() : null;
        return state ? state.allData : [];
      }
      return this.allData;
    }

    // Binary search for the closest bar's close price at a given Time — used
    // to position the synced crosshair correctly on panes with a totally
    // different symbol/price scale than the pane the user is actually hovering.
    _priceAtOrNear(time) {
      const arr = this._dataArr();
      if (!arr || !arr.length) return null;
      let lo = 0, hi = arr.length - 1;
      if (time <= arr[0].time) return arr[0].close;
      if (time >= arr[hi].time) return arr[hi].close;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid].time < time) lo = mid + 1; else hi = mid;
      }
      return arr[lo].close;
    }

    // Wires this pane's chart as BOTH a source and a target of the sync:
    // moving the mouse / scrolling on this pane pushes to every other pane,
    // and it also receives pushes from whichever pane the user is on.
    _bindSync() {
     this._onCrosshairMove = (param) => {
    if (!global.MultiChart || !global.MultiChart.syncCrosshair || global.MultiChart._crosshairLock) return;
        global.MultiChart._crosshairLock = true;
        global.MultiChart.panes.forEach(p => {
          if (p === this || !p.chart) return;
          if (!param.time) { p.chart.clearCrosshairPosition(); return; }
          const price = p._priceAtOrNear(param.time);
          if (price != null) p.chart.setCrosshairPosition(price, param.time, p.series);
        });
        global.MultiChart._crosshairLock = false;
      };
      this.chart.subscribeCrosshairMove(this._onCrosshairMove);

   this._onVisibleRangeChange = (range) => {
        const M = global.MultiChart;
        if (!range || !M || (!M.syncScroll && !M.syncZoom) || M._timeLock) return;
        M._timeLock = true;
        const width = range.to - range.from;
        const center = (range.to + range.from) / 2;
        M.panes.forEach(p => {
          if (p === this || !p.chart) return;
          try {
            if (M.syncScroll && M.syncZoom) {
              p.chart.timeScale().setVisibleRange(range);
            } else if (M.syncScroll) {
              const cur = p.chart.timeScale().getVisibleRange();
              if (cur) { const w = cur.to - cur.from; p.chart.timeScale().setVisibleRange({ from: center - w / 2, to: center + w / 2 }); }
            } else if (M.syncZoom) {
              const cur = p.chart.timeScale().getVisibleRange();
              if (cur) { const c = (cur.to + cur.from) / 2; p.chart.timeScale().setVisibleRange({ from: c - width / 2, to: c + width / 2 }); }
            }
          } catch (e) { /* بيانات غير متوافقة بهذي الشاشة — تجاهل */ }
        });
        M._timeLock = false;
      };
      this.chart.timeScale().subscribeVisibleTimeRangeChange(this._onVisibleRangeChange);
    }

async loadData() {
  this.container.classList.add('mc-loading');
  // تحميل كسول — آخر 2000 شمعة فقط بدل كل السنوات من 2011 إلى 2025
  this._dataStream = new TVDataEngine.SymbolDataStream(this.pair);
  this.rawM1 = await this._dataStream.loadInitial(2000);
  this.container.classList.remove('mc-loading');
  this._applyTimeframe();
}

    _applyTimeframe() {
      if (!this.rawM1 || !this.rawM1.length) return;
      this.allData = this.timeframe === 1 ? this.rawM1 : convertTimeframe(this.rawM1, this.timeframe);
      
if (global.SYMBOL_PRECISION && global.SYMBOL_PRECISION[this.pair] != null) {
  const p = global.SYMBOL_PRECISION[this.pair];
  this.series.applyOptions({ priceFormat: { type: 'price', precision: p, minMove: 1 / Math.pow(10, p) } });
}
this.series.setData(this.allData.slice(-5000));
setTimeout(() => {
      if (!this.chart) return;
      this.chart.timeScale().fitContent();
  
  
  // لقطة أولى فقط — لا تُستبدَل بأي استدعاء لاحق لنفس الشاشة
  if (!this._initialViewState) {
    try { this._initialViewState = this.chart.timeScale().getVisibleLogicalRange(); } catch (e) {}
  }
}, 30);
      
if ((this.compares || []).length) this._scheduleCompareSync();
(this.spreads || []).forEach(entry => this._recomputeSpread(entry));
this._renderLegend();
this._refreshHeaderInfo();
}

// يحفظ مجال الرؤية الحالي (Zoom + Scroll) لهذي الشاشة تحديداً، قبل
// فقدانها للتركيز — يُستدعى من MultiChart.setActive() عند التنقل بعيداً عنها.
_saveViewState() {
  if (!this.chart) return;
  try {
    const range = this.chart.timeScale().getVisibleLogicalRange();
    if (range) this._savedViewState = { logicalRange: range };
  } catch (e) {}
}
// يستعيد آخر مجال رؤية محفوظ لهذي الشاشة — يُستدعى عند إعادة تفعيلها.
// لو لم توجد حالة محفوظة (أول تفعيل)، لا يفعل شيئاً ويترك العرض الافتراضي.
_restoreViewState() {
  if (!this.chart || !this._savedViewState) return;
  try {
    this.chart.timeScale().setVisibleLogicalRange(this._savedViewState.logicalRange);
  } catch (e) {}
}

// يحدّث نص الهيدر بأعلى الشاشة (رمز + فريم + نوع الشموع + آخر سعر)
// — البند 6 من الطلب: "معلومات أعلى كل شارت".
_refreshHeaderInfo() {
  if (!this.infoEl) return;
  const TF_LABELS = { 1: '1M', 3: '3M', 5: '5M', 15: '15M', 30: '30M', 60: '1H', 240: '4H', 1440: '1D', 10080: '1W', 43200: '1MN' };
  const arr = this._dataArr();
  const last = arr && arr.length ? arr[arr.length - 1] : null;
  const priceTxt = last ? last.close.toFixed(5) : '';
  this.infoEl.textContent = this.pair + '  \u00B7  ' + (TF_LABELS[this.timeframe] || this.timeframe) + '  \u00B7  Candles' + (priceTxt ? '  \u00B7  ' + priceTxt : '');
}

    // Finds the index of the last bar whose time <= `time` in a sorted-by-time array.
    static _lastIndexAtOrBefore(arr, time) {
      if (!arr || !arr.length || time < arr[0].time) return -1;
      if (time >= arr[arr.length - 1].time) return arr.length - 1;
      let lo = 0, hi = arr.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (arr[mid].time <= time) lo = mid; else hi = mid - 1;
      }
      return lo;
    }

    // Trims this pane's candles + compare overlays to "up to `time`", so a
    // secondary pane visually advances one bar at a time in lockstep with
    // the primary chart's backtest replay — even though it may run on a
    // completely different symbol/timeframe (matched purely by real time).
    _replayTo(time) {
      if (this.isPrimary) return; // primary pane is driven by backtest.js itself
      if (this.allData && this.allData.length) {
        const idx = ChartPane._lastIndexAtOrBefore(this.allData, time);
        if (idx >= 0) this.series.setData(this.allData.slice(0, idx + 1));
      }
      (this.compares || []).forEach(entry => {
        if (!entry.data || !entry.data.length) return;
        const idx = ChartPane._lastIndexAtOrBefore(entry.data, time);
        if (idx >= 0) entry.series.setData(entry.data.slice(0, idx + 1));
      });
      (this.spreads || []).forEach(entry => {
        if (!entry.data || !entry.data.length) return;
        const idx = ChartPane._lastIndexAtOrBefore(entry.data, time);
        if (idx >= 0) entry.series.setData(entry.data.slice(0, idx + 1));
      });
    }

// يعيد الشاشة لعرض كل بياناتها الطبيعية (آخر 5000 شمعة) بعد انتهاء
// الريبلاي المتزامن — يُستدعى مرة وحدة عند الخروج من الباكتيست.
_restoreFullData() {
  if (this.isPrimary) return;
  if (this.allData && this.allData.length) {
    this.series.setData(this.allData.slice(-5000));
  }
  (this.compares || []).forEach(entry => {
    if (entry.data && entry.data.length) entry.series.setData(entry.data);
  });
  (this.spreads || []).forEach(entry => {
    if (entry.data && entry.data.length) entry.series.setData(entry.data);
  });
  if (this.chart) setTimeout(() => this.chart.timeScale().fitContent(), 30);
}

destroy() {
  if (this.drawingManager && typeof this.drawingManager.destroy === 'function') this.drawingManager.destroy();
  if (this.chart) {
    if (this._onCrosshairMove) this.chart.unsubscribeCrosshairMove(this._onCrosshairMove);
    if (this._onVisibleRangeChange) this.chart.timeScale().unsubscribeVisibleTimeRangeChange(this._onVisibleRangeChange);
  }
  if (!this.isPrimary && this.chart) this.chart.remove();
  this.container.remove();
}
  }

const MultiChart = {
    layout: '1',
    panes: [],
    gridEl: null,
    mainSlot: null,
    syncEnabled: true,
    activeIndex: 0,
    syncSymbol: false,
    syncTimeframe: false,
    syncCrosshair: true,
    syncZoom: true,
    syncScroll: true,
    syncDrawings: false,
    colFrac: null,
    rowFrac: null,
    _splitterEls: [],
    _crosshairLock: false,
    _timeLock: false,

    _resetFractions(cfg) {
      this.colFrac = new Array(cfg.cols).fill(1 / cfg.cols);
      this.rowFrac = new Array(cfg.rows).fill(1 / cfg.rows);
    },

    _applyFractions() {
      if (!this.colFrac || !this.rowFrac) return;
      this.gridEl.style.gridTemplateColumns = this.colFrac.map(f => (f * 100) + '%').join(' ');
      this.gridEl.style.gridTemplateRows = this.rowFrac.map(f => (f * 100) + '%').join(' ');
    },

    _buildSplitters(cfg) {
      if (this._splitterEls) this._splitterEls.forEach(el => el.remove());
      this._splitterEls = [];
      if (cfg.custom) return; // 3a/3b (grid-areas) غير قابلة للسحب بهذي الدفعة

      this._resetFractions(cfg);
      this._applyFractions();

      for (let i = 0; i < cfg.cols - 1; i++) {
        const sp = document.createElement('div');
        sp.className = 'mc-splitter mc-splitter-v';
        this._bindColSplitter(sp, i);
        this.gridEl.appendChild(sp);
        this._splitterEls.push(sp);
      }
      for (let i = 0; i < cfg.rows - 1; i++) {
        const sp = document.createElement('div');
        sp.className = 'mc-splitter mc-splitter-h';
        this._bindRowSplitter(sp, i);
        this.gridEl.appendChild(sp);
        this._splitterEls.push(sp);
      }
      this._positionSplitters();
    },

    _positionSplitters() {
      if (!this._splitterEls) return;
      let accX = 0;
      this._splitterEls.filter(s => s.classList.contains('mc-splitter-v')).forEach((sp, i) => {
        accX += this.colFrac[i];
        sp.style.left = (accX * 100) + '%';
      });
      let accY = 0;
      this._splitterEls.filter(s => s.classList.contains('mc-splitter-h')).forEach((sp, i) => {
        accY += this.rowFrac[i];
        sp.style.top = (accY * 100) + '%';
      });
    },

    _bindColSplitter(sp, i) {
      let dragging = false, startX = 0, fA = 0, fB = 0;
      const onDown = (e) => {
        dragging = true;
        startX = (e.touches ? e.touches[0] : e).clientX;
        fA = this.colFrac[i]; fB = this.colFrac[i + 1];
        document.body.classList.add('mc-resizing-col');
        e.preventDefault();
      };
      const onMove = (e) => {
        if (!dragging) return;
        const x = (e.touches ? e.touches[0] : e).clientX;
        const rect = this.gridEl.getBoundingClientRect();
        const d = (x - startX) / rect.width;
        const minF = 0.08;
        let a = fA + d, b = fB - d;
        if (a < minF) { b -= (minF - a); a = minF; }
        if (b < minF) { a -= (minF - b); b = minF; }
        this.colFrac[i] = a; this.colFrac[i + 1] = b;
        this._applyFractions(); this._positionSplitters();
      };
      const onUp = () => { dragging = false; document.body.classList.remove('mc-resizing-col'); };
      sp.addEventListener('mousedown', onDown);
      sp.addEventListener('touchstart', onDown, { passive: false });
      window.addEventListener('mousemove', onMove);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchend', onUp);
    },

    _bindRowSplitter(sp, i) {
      let dragging = false, startY = 0, fA = 0, fB = 0;
      const onDown = (e) => {
        dragging = true;
        startY = (e.touches ? e.touches[0] : e).clientY;
        fA = this.rowFrac[i]; fB = this.rowFrac[i + 1];
        document.body.classList.add('mc-resizing-row');
        e.preventDefault();
      };
      const onMove = (e) => {
        if (!dragging) return;
        const y = (e.touches ? e.touches[0] : e).clientY;
        const rect = this.gridEl.getBoundingClientRect();
        const d = (y - startY) / rect.height;
        const minF = 0.1;
        let a = fA + d, b = fB - d;
        if (a < minF) { b -= (minF - a); a = minF; }
        if (b < minF) { a -= (minF - b); b = minF; }
        this.rowFrac[i] = a; this.rowFrac[i + 1] = b;
        this._applyFractions(); this._positionSplitters();
      };
      const onUp = () => { dragging = false; document.body.classList.remove('mc-resizing-row'); };
      sp.addEventListener('mousedown', onDown);
      sp.addEventListener('touchstart', onDown, { passive: false });
      window.addEventListener('mousemove', onMove);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchend', onUp);
    },
    
    getActivePane() { return this.panes[this.activeIndex] || this.panes[0] || null; },
    isPrimaryActive() { const p = this.getActivePane(); return !p || p.isPrimary; },
    
setActive(index) {
  if (this.activeIndex === index) return;
  const prev = this.panes[this.activeIndex];
  if (prev) prev._saveViewState();
  this.activeIndex = index;
  this.panes.forEach(p => p.container.classList.toggle('mc-pane-active', p.index === index));
  const active = this.panes[index];
  if (active && global.DrawingTools) {
    if (active.isPrimary) {
      global.DrawingTools.activeManager = global.DrawingTools.manager;
    } else {
      if (!active.drawingManager) active._ensureDrawingTools();
      if (active.drawingManager) global.DrawingTools.activeManager = active.drawingManager;
    }
  }
  this._syncTopBarToActivePane();
  if (active) setTimeout(() => active._restoreViewState(), 0);
},
    
    // يزامن قيم select#pairSelect / select#timeframeSelect (الشريط العلوي)
    // مع الشاشة النشطة حالياً — بدون إطلاق حدث change (حتى لا يشغّل تحميل
    // بيانات الشاشة الأساسية خطأً عند مجرد تبديل التركيز).
_syncTopBarToActivePane() {
  const p = this.getActivePane();
  if (!p) return;
  const pairSelect = document.getElementById('pairSelect');
  const tfSelect = document.getElementById('timeframeSelect');
  
  // العلم أدناه يمنع مستمعي 'change' (المخصصين لتغيير حقيقي من
  // المستخدم) من إعادة تحميل بيانات الشاشة فقط لأن المستخدم ضغط
  // عليها للتركيز — هذا كان يسبب إعادة تحميل كاملة عند كل ضغطة.
  window.__mcSyncingLabelOnly = true;
  
if (pairSelect && pairSelect.value !== p.pair) {
  pairSelect.value = p.pair;
  pairSelect.dispatchEvent(new Event('change', { bubbles: false }));
}
// ملاحظة: لو كانت القيمة متطابقة أصلاً، لا نُطلق أي حدث change — إطلاقه
// كان يُعيد تحميل بيانات الرمز وضبط تكبير جديد (loadSymbolLazy) في كل
// مرة يُعاد فيها تفعيل نفس الشاشة، حتى بدون أي تغيير فعلي بالرمز.
  
  if (tfSelect && Number(tfSelect.value) !== p.timeframe) {
    tfSelect.value = String(p.timeframe);
    tfSelect.dispatchEvent(new Event('change', { bubbles: false }));
  }
  
  window.__mcSyncingLabelOnly = false;
},

init() {
    this._buildGrid();
    this._buildLayoutButton();
    this._buildSyncButton();
    this.setLayout('1');
    this._startReplaySync();
    this._bindTopBarToActivePane();
    
    // مزامنة إعدادات مظهر الشارت (من settings.js) عبر كل الشاشات الإضافية
    window.addEventListener('tvCloneChartSettingsChanged', (e) => this._applySettingsToAllPanes(e.detail));
  },
  
  // عندما يكون الشارت النشط شاشة إضافية (غير الأساسية)، تغيير الرمز/
  // الفريم من الشريط العلوي يُطبَّق على تلك الشاشة مباشرة (بدل الأساسية)
_bindTopBarToActivePane() {
  const pairSelect = document.getElementById('pairSelect');
  const tfSelect = document.getElementById('timeframeSelect');
  if (pairSelect) {
    pairSelect.addEventListener('change', () => {
      if (window.__mcForcePrimary || window.__mcSyncingLabelOnly) return;
      const p = this.getActivePane();
      if (!p || p.isPrimary) return;
      if (p.pair === pairSelect.value) return; // لا تغيير فعلي، لا تعيد التحميل
      p.pair = pairSelect.value;
      p.loadData();
      this.broadcastSymbolFromPane(p);
    });
  }
  if (tfSelect) {
    tfSelect.addEventListener('change', () => {
      if (window.__mcForcePrimary || window.__mcSyncingLabelOnly) return;
      const p = this.getActivePane();
      if (!p || p.isPrimary) return;
      if (p.timeframe === Number(tfSelect.value)) return;
      p.timeframe = Number(tfSelect.value);
      p._applyTimeframe();
      this.broadcastTimeframeFromPane(p);
    });
  }
},
  _applySettingsToAllPanes(s) {
    if (!s) return;
    this.panes.forEach(p => {
      if (p.isPrimary) return; // الشاشة الرئيسية تُطبَّق عليها الإعدادات مباشرة من settings.js نفسه
      applyChartSettingsToPane(p, s);
    });
  },

    // Polls backtest.js's replay state (exposed via window.getBacktestState(),
    // see the backtest.js patch) and, whenever the current backtest bar's
    // time changes, trims every secondary pane to that same point in time —
    // "Synchronized Replay". Polling (rather than hooking every play/pause/
    // next/prev button in backtest.js individually) keeps this file fully
    // self-contained and avoids touching backtest.js's replay logic at all.
_startReplaySync() {
    this._lastReplayTime = null;
    this._wasBacktesting = false;
    setInterval(() => {
          if (!global.getBacktestState) return;
          const state = global.getBacktestState();
          
          if (state.isBacktest) {
            if (!this._wasBacktesting) {
              // أول لحظة دخول لوضع الباكتيست — حمّل بيانات كل شاشة إضافية حول نفس تاريخ الهدف
              this.panes.forEach(p => { if (!p.isPrimary) p._loadAroundBacktestDate(state.currentBacktestTime); });
            }
            this._wasBacktesting = true;
            if (state.currentBacktestTime == null || state.currentBacktestTime === this._lastReplayTime) return;
            this._lastReplayTime = state.currentBacktestTime;
            this.panes.forEach(p => p._replayTo(state.currentBacktestTime));
          } else if (this._wasBacktesting) {
      
      // المستخدم خرج من الباكتيست بالشاشة الرئيسية — رجّع كل الشاشات
      // الإضافية لعرض كامل بياناتها بدل ما تبقى متجمدة عند آخر لحظة ريبلاي.
      this._wasBacktesting = false;
      this._lastReplayTime = null;
      this.panes.forEach(p => p._restoreFullData());
    }
  }, 80);
},

    // ---------------------------------------------------------- saved layouts
    _layoutIndex() {
      try { return JSON.parse(localStorage.getItem('mc_layout_index') || '[]'); } catch (e) { return []; }
    },

saveLayout(name) {
      if (!name) return;
      const data = {
        layout: this.layout,
        panes: this.panes.map(p => {
          let visibleRange = null;
          try { visibleRange = p.chart ? p.chart.timeScale().getVisibleLogicalRange() : null; } catch (e) {}
          let drawingsJSON = [];
          try { if (p.drawingManager) drawingsJSON = p.drawingManager.drawings.map(d => d.toJSON()); } catch (e) {}
          return {
            pair: p.pair,
            timeframe: p.timeframe,
            visibleRange: visibleRange,
            compareMode: p.compareMode,
            compares: (p.compares || []).map(c => ({
              symbol: c.symbol, type: c.type, color: c.color, width: c.width, opacity: c.opacity, visible: c.visible, locked: c.locked
            })),
            drawings: drawingsJSON
          };
        })
      };
      const idx = this._layoutIndex();
      if (!idx.includes(name)) idx.push(name);
      localStorage.setItem('mc_layout_index', JSON.stringify(idx));
      localStorage.setItem('mc_layout_' + name, JSON.stringify(data));
      this._refreshLayoutManagerUI();
    },

loadLayout(name) {
      let data;
      try { data = JSON.parse(localStorage.getItem('mc_layout_' + name)); } catch (e) { return; }
      if (!data) return;
      this.setLayout(data.layout);
      (data.panes || []).forEach((pd, i) => {
        const pane = this.panes[i];
        if (!pane) return;
        const finishSetup = () => {
          if (pd.compareMode && pd.compareMode !== 'overlay') pane.setCompareMode(pd.compareMode);
          (pd.compares || []).forEach(cd => {
            const entry = pane.addCompare(cd.symbol, cd.type);
            if (!entry) return;
            entry.color = cd.color; entry.width = cd.width; entry.opacity = cd.opacity; entry.visible = cd.visible; entry.locked = !!cd.locked;
            entry.series.applyOptions({ color: pane._hexWithAlpha(cd.color, cd.opacity), lineWidth: cd.width, visible: cd.visible });
            pane._renderCompareList();
          });
          if (pd.drawings && pd.drawings.length) {
            pane._ensureDrawingTools();
            if (pane.drawingManager) {
              pane.drawingManager.drawings = pd.drawings.map(item => {
                const ctor = global.__DT_INTERNAL__.CTORS[item.type];
                if (!ctor) return null;
                const d = ctor(item.points, global.__DT_INTERNAL__.styleFromJSON(item));
                d.id = item.id; d.locked = !!item.locked; d.hidden = !!item.hidden;
                return d;
              }).filter(Boolean);
              pane.drawingManager._save(true);
            }
          }
          if (pd.visibleRange && pane.chart) {
            setTimeout(() => { try { pane.chart.timeScale().setVisibleLogicalRange(pd.visibleRange); } catch (e) {} }, 100);
          }
        };
        if (pane.isPrimary) {
          const pairSelect = document.getElementById('pairSelect');
          const tfSelect = document.getElementById('timeframeSelect');
          if (pairSelect && pd.pair) { pairSelect.value = pd.pair; pairSelect.dispatchEvent(new Event('change')); }
          if (tfSelect && pd.timeframe != null) { tfSelect.value = String(pd.timeframe); tfSelect.dispatchEvent(new Event('change')); }
          pane.pair = pd.pair; pane.timeframe = pd.timeframe;
          setTimeout(finishSetup, 250);
        } else {
          pane.pair = pd.pair;
          pane.timeframe = pd.timeframe;
          pane.loadData().then ? pane.loadData().then(finishSetup) : (pane.loadData(), setTimeout(finishSetup, 300));
        }
      });
    },

    deleteLayout(name) {
      localStorage.removeItem('mc_layout_' + name);
      const idx = this._layoutIndex().filter(n => n !== name);
      localStorage.setItem('mc_layout_index', JSON.stringify(idx));
      this._refreshLayoutManagerUI();
    },

    duplicateLayout(name) {
      const raw = localStorage.getItem('mc_layout_' + name);
      if (!raw) return;
      let newName = name + ' copy', i = 2;
      while (this._layoutIndex().includes(newName)) { newName = name + ' copy ' + i; i++; }
      const idx = this._layoutIndex();
      idx.push(newName);
      localStorage.setItem('mc_layout_index', JSON.stringify(idx));
      localStorage.setItem('mc_layout_' + newName, raw);
      this._refreshLayoutManagerUI();
    },

    _refreshLayoutManagerUI() {
      if (!this._savedLayoutsEl) return;
      this._savedLayoutsEl.innerHTML = '';
      this._layoutIndex().forEach(name => {
        const row = document.createElement('div');
        row.className = 'mc-saved-layout-row';

        const nameBtn = document.createElement('button');
        nameBtn.className = 'mc-layout-item mc-saved-name';
        nameBtn.textContent = name;
        nameBtn.addEventListener('click', () => { this.loadLayout(name); this.layoutMenu.classList.add('hidden'); });

        const dupBtn = document.createElement('button');
        dupBtn.className = 'mc-saved-icon-btn';
        dupBtn.textContent = '\u29C9';
        dupBtn.title = 'Duplicate Layout';
        dupBtn.addEventListener('click', (e) => { e.stopPropagation(); this.duplicateLayout(name); });

        const delBtn = document.createElement('button');
        delBtn.className = 'mc-saved-icon-btn';
        delBtn.textContent = '\u2715';
        delBtn.title = 'Delete Layout';
        delBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteLayout(name); });

        row.appendChild(nameBtn); row.appendChild(dupBtn); row.appendChild(delBtn);
        this._savedLayoutsEl.appendChild(row);
      });
    },

_buildSyncButton() {
      const btn = document.createElement('button');
      btn.id = 'mcSyncBtn';
      btn.title = 'إعدادات المزامنة بين الشاشات';
      btn.textContent = 'Sync';
      const controlsBar = document.getElementById('controls');
      if (controlsBar) controlsBar.appendChild(btn); else document.body.appendChild(btn);
      this.syncBtn = btn;
      this._buildSyncPanel();
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.syncPanelEl.classList.toggle('hidden'); });
      this._refreshSyncButtonState();
    },

    _refreshSyncButtonState() {
      const any = this.syncSymbol || this.syncTimeframe || this.syncCrosshair || this.syncZoom || this.syncScroll;
      if (this.syncBtn) this.syncBtn.classList.toggle('active', any);
    },

    _buildSyncPanel() {
      const panel = document.createElement('div');
      panel.id = 'mcSyncPanel';
      panel.className = 'hidden';
      panel.addEventListener('click', (e) => e.stopPropagation());

      const header = document.createElement('div');
      header.className = 'mc-wl-header';
      header.textContent = 'مزامنة الشاشات';
      panel.appendChild(header);

      const OPTS = [
        ['syncSymbol', 'الرمز (Symbol)'],
        ['syncTimeframe', 'الفريم الزمني'],
        ['syncCrosshair', 'مؤشر التقاطع (Crosshair)'],
        ['syncZoom', 'التكبير (Zoom)'],
        ['syncScroll', 'التمرير (Scroll)'],
        ['syncDrawings', 'أدوات الرسم (قريباً)']
      ];
      OPTS.forEach(([key, label]) => {
        const row = document.createElement('label');
        row.className = 'mc-sync-row' + (key === 'syncDrawings' ? ' mc-sync-disabled' : '');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!this[key];
        cb.disabled = key === 'syncDrawings';
        cb.addEventListener('change', () => {
          this[key] = cb.checked;
          this._refreshSyncButtonState();
          if (key === 'syncCrosshair' && !cb.checked) this.panes.forEach(p => { if (p.chart) p.chart.clearCrosshairPosition(); });
        });
        const span = document.createElement('span');
        span.textContent = label;
        row.appendChild(cb); row.appendChild(span);
        panel.appendChild(row);
      });

      document.body.appendChild(panel);
      this.syncPanelEl = panel;
      document.addEventListener('click', () => panel.classList.add('hidden'));
    },

    broadcastSymbolFromPane(sourcePane) {
      if (!this.syncSymbol) return;
      this.panes.forEach(p => {
        if (p === sourcePane) return;
        if (p.isPrimary) {
          const pairSelect = document.getElementById('pairSelect');
          if (pairSelect && pairSelect.value !== sourcePane.pair) {
            window.__mcForcePrimary = true;
            pairSelect.value = sourcePane.pair;
            pairSelect.dispatchEvent(new Event('change'));
            window.__mcForcePrimary = false;
          }
        } else {
          p.pair = sourcePane.pair;
          p.loadData();
        }
      });
    },

    broadcastTimeframeFromPane(sourcePane) {
      if (!this.syncTimeframe) return;
      this.panes.forEach(p => {
        if (p === sourcePane) return;
        if (p.isPrimary) {
          const tfSelect = document.getElementById('timeframeSelect');
          if (tfSelect && Number(tfSelect.value) !== sourcePane.timeframe) {
            window.__mcForcePrimary = true;
            tfSelect.value = String(sourcePane.timeframe);
            tfSelect.dispatchEvent(new Event('change'));
            window.__mcForcePrimary = false;
          }
        } else {
          p.timeframe = sourcePane.timeframe;
          p._applyTimeframe();
        }
      });
    },

    _buildGrid() {
      const chartEl = document.getElementById('chart');
      const wrap = document.createElement('div');
      wrap.id = 'mcGrid';
      chartEl.parentNode.insertBefore(wrap, chartEl);
      this.gridEl = wrap;

      this.mainSlot = document.createElement('div');
      this.mainSlot.className = 'mc-pane mc-pane-primary';
      wrap.appendChild(this.mainSlot);
      this.mainSlot.appendChild(chartEl); // move the existing #chart into slot 1, untouched
    },

    _buildLayoutButton() {
      const btn = document.createElement('button');
      btn.id = 'mcLayoutBtn';
      btn.title = 'Chart Layout';
      btn.innerHTML = '&#9639;';

   const menu = document.createElement('div');
      menu.id = 'mcLayoutMenu';
      menu.className = 'hidden';

      // كل خانة Layout تحتوي معاينة بصرية مصغّرة (شبكة CSS داخل مربع صغير)
      // بدل النص فقط — بنفس فكرة قائمة التخطيطات بـ TradingView.
      // قائمة بصفوف حسب عدد الشاشات (1 → 16) تُبنى من tv-layouts.js
      const grid = document.createElement('div');
      grid.className = 'tvl-menu';
      const groups = global.TVLayouts ? global.TVLayouts.groups : Object.keys(LAYOUTS).map(k => ({ count: LAYOUTS[k].panes, keys: [k] }));
      this._layoutItems = {};
      groups.forEach(g => {
        const row = document.createElement('div'); row.className = 'tvl-row';
        const cnt = document.createElement('span'); cnt.className = 'tvl-count'; cnt.textContent = g.count; row.appendChild(cnt);
        g.keys.forEach(key => {
          const item = document.createElement('button');
          item.className = 'tvl-item'; item.dataset.layout = key; item.title = g.count + (g.count === 1 ? ' شاشة' : ' شاشات');
          item.innerHTML = global.TVLayouts ? global.TVLayouts.previewSVG(key) : String(g.count);
          item.addEventListener('click', (e) => { e.stopPropagation(); this.setLayout(key); menu.classList.add('hidden'); });
          this._layoutItems[key] = item; row.appendChild(item);
        });
        grid.appendChild(row);
      });
      menu.appendChild(grid);

      const divider = document.createElement('div');
      divider.className = 'mc-menu-divider';
      menu.appendChild(divider);

      const saveBtn = document.createElement('button');
      saveBtn.className = 'mc-layout-item';
      saveBtn.textContent = 'Save Layout...';
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = prompt('Layout name:');
        if (name && name.trim()) this.saveLayout(name.trim());
      });
      menu.appendChild(saveBtn);

      const savedWrap = document.createElement('div');
      savedWrap.id = 'mcSavedLayouts';
      menu.appendChild(savedWrap);
      this._savedLayoutsEl = savedWrap;

      btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); });
      document.addEventListener('click', () => menu.classList.add('hidden'));

      const controlsBar = document.getElementById('controls');
      if (controlsBar) controlsBar.appendChild(btn); else document.body.appendChild(btn);
      document.body.appendChild(menu);

      this.layoutBtn = btn;
      this.layoutMenu = menu;
      this._refreshLayoutManagerUI();
    },

setLayout(key) {
    const cfg = LAYOUTS[key] || LAYOUTS['1'];
    // لو نفس التخطيط المفعَّل حالياً بنفس عدد الشاشات — لا تدمّر/تُعِد بناء
    // أي شيء، لأن كل الشاشات الفرعية موجودة وسليمة أصلاً بالذاكرة.
    if (key === this.layout && this.panes.length === cfg.panes) return;
    this.layout = key;
    
    // Keep pane 0 (primary) alive across layout switches; only destroy the extras.
    this.panes.slice(1).forEach(p => p.destroy());
  this.panes = this.panes.slice(0, 1);
  
  if (cfg.custom) {
    this.gridEl.className = 'mc-grid mc-custom';
    this.gridEl.style.gridTemplateColumns = cfg.gridTemplateColumns;
    this.gridEl.style.gridTemplateRows = cfg.gridTemplateRows;
    this.gridEl.style.gridTemplateAreas = cfg.gridTemplateAreas;
  } else {
    this.gridEl.className = 'mc-grid mc-cols-' + cfg.cols + ' mc-rows-' + cfg.rows;
    this.gridEl.style.gridTemplateColumns = '';
    this.gridEl.style.gridTemplateRows = '';
    this.gridEl.style.gridTemplateAreas = '';
  }
  
  if (!this.panes[0]) {
    this.panes[0] = new ChartPane(0, this.mainSlot, true);
  }
  this.mainSlot.style.gridArea = cfg.custom ? (cfg.areaNames ? cfg.areaNames[0] : 'a') : '';
  if (this._layoutItems) Object.keys(this._layoutItems).forEach(k => this._layoutItems[k].classList.toggle('active', k === key));
  
const areaNames = cfg.areaNames || ['a', 'b', 'c', 'd'];
for (let i = 1; i < cfg.panes; i++) {
  const slot = document.createElement('div');
  slot.className = 'mc-pane';
  if (cfg.custom) slot.style.gridArea = areaNames[i];
  this.gridEl.appendChild(slot);
  this.panes.push(new ChartPane(i, slot, false));
}

if (!cfg.custom) {
  this._buildSplitters(cfg);
} else if (this._splitterEls) {
  this._splitterEls.forEach(el => el.remove());
  this._splitterEls = [];
}
}
};

// تسجيل/إلغاء رموز البيانات المحلية المستوردة في قائمة البحث وقوائم المقارنة
global.MultiChartSymbols = {
  register(sym, label) {
    if (!PAIR_OPTIONS.some(p => p[0] === sym)) PAIR_OPTIONS.push([sym, label || sym]);
    if (!SYMBOL_CATEGORIES.Local.includes(sym)) SYMBOL_CATEGORIES.Local.push(sym);
  },
  unregister(sym) {
    const i = SYMBOL_CATEGORIES.Local.indexOf(sym); if (i >= 0) SYMBOL_CATEGORIES.Local.splice(i, 1);
    const builtin = Object.keys(SYMBOL_CATEGORIES).some(k => k !== 'Local' && SYMBOL_CATEGORIES[k].includes(sym));
    if (!builtin) { const j = PAIR_OPTIONS.findIndex(p => p[0] === sym); if (j >= 0) PAIR_OPTIONS.splice(j, 1); }
  }
};
global.MultiChart = MultiChart;
MultiChart.init();

// ---------------------------------------------------------- compare search window (item 13)

  const RECENT_KEY = 'mc_recent_symbols';
  const FAV_KEY = 'mc_fav_symbols';

  function pushRecentSymbol(sym) {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) {}
    arr = arr.filter(s => s !== sym);
    arr.unshift(sym);
    localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 10)));
  }
  function getRecentSymbols() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
  }
  function getFavoriteSymbols() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; }
  }
  function toggleFavoriteSymbol(sym) {
    let favs = getFavoriteSymbols();
    favs = favs.includes(sym) ? favs.filter(s => s !== sym) : favs.concat([sym]);
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  }

const SymbolSearch = {
    activeCategory: 'Favorites',
    _onPick: null,

    init() { this._build(); },

    open(onPick) {
      this._onPick = onPick;
      this.modalEl.classList.remove('hidden');
      this._searchInp.value = '';
      this._setCategory('Favorites');
      setTimeout(() => this._searchInp.focus(), 50);
    },

    close() { this.modalEl.classList.add('hidden'); },

    _build() {
      const modal = document.createElement('div');
      modal.id = 'mcSearchModal';
      modal.className = 'hidden mc-search-fullscreen';

      const box = document.createElement('div');
      box.className = 'mc-search-box mc-search-box-full';

      // ---- الشريط العلوي: زر إغلاق + عنوان + شريط بحث ----
      const topBar = document.createElement('div');
      topBar.className = 'mc-search-topbar';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'mc-search-close';
      closeBtn.innerHTML = '\u2715';
      closeBtn.addEventListener('click', () => this.close());
      topBar.appendChild(closeBtn);

      const searchWrap = document.createElement('div');
      searchWrap.className = 'mc-search-input-wrap';
      const searchIcon = document.createElement('span');
      searchIcon.className = 'mc-search-icon';
      searchIcon.textContent = '\u{1F50D}';
      const searchInp = document.createElement('input');
      searchInp.type = 'text';
      searchInp.className = 'mc-search-input';
      searchInp.placeholder = 'ابحث عن رمز أو أداة';
      searchInp.addEventListener('input', () => this._renderList());
      searchWrap.appendChild(searchIcon);
      searchWrap.appendChild(searchInp);
      topBar.appendChild(searchWrap);
      box.appendChild(topBar);
      this._searchInp = searchInp;

      // ---- التبويبات الأفقية القابلة للتمرير ----
      const tabs = document.createElement('div');
      tabs.className = 'mc-search-tabs';
      this._tabEls = {};
  ['Favorites', 'Recent', 'Local', 'Currency', 'Crypto', 'Index', 'Commodities'].forEach(cat => {
        const tab = document.createElement('button');
        tab.className = 'mc-search-tab';
        tab.textContent = this._catLabel(cat);
        tab.addEventListener('click', () => this._setCategory(cat));
        tabs.appendChild(tab);
        this._tabEls[cat] = tab;
      });
      box.appendChild(tabs);

      // ---- قائمة النتائج ----
      const list = document.createElement('div');
      list.className = 'mc-search-list';
      box.appendChild(list);
      this._listEl = list;

      modal.appendChild(box);
      document.body.appendChild(modal);
      this.modalEl = modal;
    },

    _catLabel(cat) {
      const labels = {
        Favorites: '\u2605 المفضلة', Recent: 'الأخيرة', Local: 'بياناتي', Currency: 'عملات',
        Crypto: 'عملات رقمية', Index: 'مؤشرات', Commodities: 'سلع',
        Stock: 'أسهم', Futures: 'عقود آجلة', Bond: 'سندات', Economy: 'اقتصاد'
      };
      return labels[cat] || cat;
    },

    _setCategory(cat) {
      this.activeCategory = cat;
      Object.entries(this._tabEls).forEach(([c, el]) => el.classList.toggle('active', c === cat));
      this._renderList();
    },

    _symbolsForCategory() {
      if (this.activeCategory === 'Favorites') return getFavoriteSymbols();
      if (this.activeCategory === 'Recent') return getRecentSymbols();
      return SYMBOL_CATEGORIES[this.activeCategory] || [];
    },

    _renderList() {
      const q = this._searchInp.value.trim().toUpperCase();
      let syms = q ? PAIR_OPTIONS.map(p => p[0]).filter(s => s.includes(q)) : this._symbolsForCategory();
      this._listEl.innerHTML = '';
      if (!syms.length) {
        const empty = document.createElement('div');
        empty.className = 'mc-search-empty';
        empty.textContent = 'لا توجد نتائج';
        this._listEl.appendChild(empty);
        return;
      }
      const AV = global.TVSymbolAvailability;
      if (AV) {
        AV.check(PAIR_OPTIONS.map(p => p[0]));
        if (!this._avBound) { this._avBound = true; AV.onChange(() => { if (this._listEl && this._listEl.isConnected) this._renderList(); }); }
        const rank = s => { const st = AV.get(s).state; return st === 'ok' ? 0 : st === 'checking' ? 1 : 2; };
        syms = syms.slice().sort((a, b) => rank(a) - rank(b)); // الرموز التي لها بيانات أولاً (ترتيب مستقر)
      }
      syms.forEach(sym => {
        const opt = PAIR_OPTIONS.find(p => p[0] === sym);
        const av = AV ? AV.get(sym) : { state: 'ok' };
        const row = document.createElement('div');
        row.className = 'mc-search-row' + (av.state === 'none' ? ' mc-search-nodata' : '');

        // أيقونة دائرية ملونة بحرف الرمز — نفس أسلوب TradingView
        const iconEl = document.createElement('div');
        iconEl.className = 'mc-search-symicon';
        iconEl.style.background = symbolIconColor(sym);
        iconEl.textContent = sym.charAt(0);

        const textWrap = document.createElement('div');
        textWrap.className = 'mc-search-textwrap';
        const nameEl = document.createElement('div');
        nameEl.className = 'mc-search-symname';
        nameEl.textContent = sym;
        const descEl = document.createElement('div');
        descEl.className = 'mc-search-symdesc';
        descEl.textContent = opt ? opt[1] : sym;
        textWrap.appendChild(nameEl);
        textWrap.appendChild(descEl);

        const exchTag = document.createElement('span');
        exchTag.className = 'mc-search-exch';
        exchTag.textContent = this._exchangeFor(sym);

        const favBtn = document.createElement('button');
        favBtn.className = 'mc-search-fav';
        const isFav = getFavoriteSymbols().includes(sym);
        favBtn.textContent = isFav ? '\u2605' : '\u2606';
        favBtn.classList.toggle('active', isFav);
        favBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFavoriteSymbol(sym); this._renderList(); });

        row.appendChild(iconEl);
        row.appendChild(textWrap);
        row.appendChild(exchTag);
        row.appendChild(favBtn);
        const dataTag = document.createElement('span');
        dataTag.className = 'mc-search-datatag';
        dataTag.textContent = av.state === 'none' ? 'لا توجد بيانات' : av.state === 'checking' ? 'جارٍ التحقق…' : (av.from === av.to ? String(av.from) : av.from + '–' + av.to);
        row.insertBefore(dataTag, favBtn);
        row.addEventListener('click', () => {
          if (av.state === 'none') { dataTag.textContent = 'لا توجد بيانات لهذا الرمز'; return; } // لا نعرض أسواقاً بلا بيانات
          pushRecentSymbol(sym);
          if (this._onPick) this._onPick(sym);
          this.close();
        });
        this._listEl.appendChild(row);
      });
    },

    _exchangeFor(sym) {
      if (SYMBOL_CATEGORIES.Currency.includes(sym)) return 'FX';
      if (SYMBOL_CATEGORIES.Crypto.includes(sym)) return 'CRYPTO';
      if (SYMBOL_CATEGORIES.Index.includes(sym)) return 'INDEX';
      if (SYMBOL_CATEGORIES.Commodities.includes(sym)) return 'CFD';
      return '';
    }
  };

  global.MultiChartSymbolSearch = SymbolSearch;
  SymbolSearch.init();

  // ---------------------------------------------------------- correlation tool (item 4)
  function pearsonCorrelation(barsA, barsB) {
    const mapB = new Map(barsB.map(b => [b.time, b.close]));
    const pairs = [];
    barsA.forEach(a => { if (mapB.has(a.time)) pairs.push([a.close, mapB.get(a.time)]); });
    if (pairs.length < 3) return null;
    const retA = [], retB = [];
    for (let i = 1; i < pairs.length; i++) {
      retA.push((pairs[i][0] - pairs[i - 1][0]) / pairs[i - 1][0]);
      retB.push((pairs[i][1] - pairs[i - 1][1]) / pairs[i - 1][1]);
    }
    const meanA = retA.reduce((s, v) => s + v, 0) / retA.length;
    const meanB = retB.reduce((s, v) => s + v, 0) / retB.length;
    let num = 0, denA = 0, denB = 0;
    for (let i = 0; i < retA.length; i++) {
      const da = retA[i] - meanA, db = retB[i] - meanB;
      num += da * db; denA += da * da; denB += db * db;
    }
    const den = Math.sqrt(denA * denB);
    return den ? num / den : 0;
  }

  const Correlation = {
    selected: new Set(['EURUSD', 'GBPUSD']),
    panelEl: null,

    init() { this._buildButton(); this._buildPanel(); },

    _buildButton() {
      const btn = document.createElement('button');
      btn.id = 'mcCorrBtn';
      btn.textContent = 'Correlation';
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.panelEl.classList.toggle('hidden'); });
      const controlsBar = document.getElementById('controls');
      if (controlsBar) controlsBar.appendChild(btn); else document.body.appendChild(btn);
    },

    _buildPanel() {
      const panel = document.createElement('div');
      panel.id = 'mcCorrPanel';
      panel.className = 'hidden';
      panel.addEventListener('click', (e) => e.stopPropagation());

      const header = document.createElement('div');
      header.className = 'mc-wl-header';
      header.textContent = 'Correlation Tool';
      panel.appendChild(header);

      const listEl = document.createElement('div');
      listEl.className = 'mc-corr-checklist';
      PAIR_OPTIONS.forEach(([val, label]) => {
        const row = document.createElement('label');
        row.className = 'mc-corr-check-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = this.selected.has(val);
        cb.addEventListener('change', () => { cb.checked ? this.selected.add(val) : this.selected.delete(val); });
        const span = document.createElement('span');
        span.textContent = label;
        row.appendChild(cb); row.appendChild(span);
        listEl.appendChild(row);
      });
      panel.appendChild(listEl);

      const calcBtn = document.createElement('button');
      calcBtn.className = 'mc-corr-calc';
      calcBtn.textContent = 'Calculate';
      const resultsEl = document.createElement('div');
      resultsEl.className = 'mc-corr-results';

      calcBtn.addEventListener('click', async () => {
        const syms = Array.from(this.selected);
        if (syms.length < 2) {
          resultsEl.innerHTML = '<div class="mc-corr-row">Select at least 2 symbols</div>';
          return;
        }
        resultsEl.innerHTML = '<div class="mc-corr-row">Calculating\u2026</div>';
        const dataMap = {};
        for (const s of syms) dataMap[s] = await loadRawM1(s);
        resultsEl.innerHTML = '';
        for (let i = 0; i < syms.length; i++) {
          for (let j = i + 1; j < syms.length; j++) {
            const r = pearsonCorrelation(dataMap[syms[i]], dataMap[syms[j]]);
            let tag = 'Neutral', cls = 'neu';
            if (r != null) {
              if (r > 0.3) { tag = 'Positive'; cls = 'pos'; }
              else if (r < -0.3) { tag = 'Negative'; cls = 'neg'; }
            }
            const row = document.createElement('div');
            row.className = 'mc-corr-row';
            const label = document.createElement('span');
            label.textContent = syms[i] + ' \u2194 ' + syms[j];
            const val = document.createElement('b');
            val.className = 'mc-corr-val ' + cls;
            val.textContent = r == null ? '\u2014' : r.toFixed(2);
            const tagEl = document.createElement('span');
            tagEl.className = 'mc-corr-tag ' + cls;
            tagEl.textContent = tag;
            row.appendChild(label); row.appendChild(val); row.appendChild(tagEl);
            resultsEl.appendChild(row);
          }
        }
      });
      panel.appendChild(calcBtn);
      panel.appendChild(resultsEl);

      document.body.appendChild(panel);
      this.panelEl = panel;
      document.addEventListener('click', () => panel.classList.add('hidden'));
    }
  };

  global.MultiChartCorrelation = Correlation;
  Correlation.init();

  // ---------------------------------------------------------- mini watchlist
  const Watchlist = {
    symbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'XAGUSD','BTCUSD', 'NASDAQ', 'OIL', 'DXY'],
    data: {},
    panelEl: null,

    init() {
      this._buildButton();
      this._buildPanel();
      this.refresh();
      setInterval(() => this.refresh(), 60000);
    },

    _buildButton() {
      const btn = document.createElement('button');
      btn.id = 'mcWatchlistBtn';
      btn.textContent = 'Watchlist';
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.panelEl.classList.toggle('hidden'); });
      const controlsBar = document.getElementById('controls');
      if (controlsBar) controlsBar.appendChild(btn); else document.body.appendChild(btn);
    },

    _buildPanel() {
      const panel = document.createElement('div');
      panel.id = 'mcWatchlistPanel';
      panel.className = 'hidden';

      const header = document.createElement('div');
      header.className = 'mc-wl-header';
      header.textContent = 'Watchlist';
      panel.appendChild(header);

      const addRow = document.createElement('div');
      addRow.className = 'mc-wl-add';
      const sel = document.createElement('select');
      PAIR_OPTIONS.forEach(([val, label]) => {
        const o = document.createElement('option'); o.value = val; o.textContent = label;
        sel.appendChild(o);
      });
      const addBtn = document.createElement('button');
      addBtn.textContent = '+';
      addBtn.addEventListener('click', () => {
        if (!this.symbols.includes(sel.value)) { this.symbols.push(sel.value); this.refresh(); }
      });
      addRow.appendChild(sel); addRow.appendChild(addBtn);
      panel.appendChild(addRow);

      const list = document.createElement('div');
      list.className = 'mc-wl-list';
      panel.appendChild(list);
      this._listEl = list;

      panel.addEventListener('click', (e) => e.stopPropagation());
      document.body.appendChild(panel);
      this.panelEl = panel;
      document.addEventListener('click', () => panel.classList.add('hidden'));
    },

    async refresh() {
      for (const sym of this.symbols) {
        const tail = await loadRecentTail(sym);
        if (tail.length) this.data[sym] = tail;
      }
      this._render();
    },

    _render() {
      this._listEl.innerHTML = '';
      this.symbols.forEach(sym => {
        const tail = this.data[sym];
        const row = document.createElement('div');
        row.className = 'mc-wl-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'mc-wl-name';
        nameEl.textContent = sym;

        const priceEl = document.createElement('span');
        priceEl.className = 'mc-wl-price';

        const chgEl = document.createElement('span');
        chgEl.className = 'mc-wl-chg';

        if (tail && tail.length === 2) {
          const [prev, last] = tail;
          const chg = last.close - prev.close;
          const pct = prev.close ? (chg / prev.close) * 100 : 0;
          priceEl.textContent = last.close.toFixed(5);
          chgEl.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(5) + ' (' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%)';
          chgEl.classList.add(chg >= 0 ? 'pos' : 'neg');
        } else {
          priceEl.textContent = '—';
        }

        const delBtn = document.createElement('button');
        delBtn.className = 'mc-wl-del';
        delBtn.textContent = '\u2715';
        delBtn.addEventListener('click', () => {
          this.symbols = this.symbols.filter(s => s !== sym);
          delete this.data[sym];
          this._render();
        });

        row.appendChild(nameEl); row.appendChild(priceEl); row.appendChild(chgEl); row.appendChild(delBtn);
        this._listEl.appendChild(row);
      });
    }
  };

  global.MultiChartWatchlist = Watchlist;
  Watchlist.init();

})(window);
