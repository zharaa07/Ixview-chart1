/* =========================================================================
   tv-settings.js — نافذة إعدادات الشارت (الوضع الفاتح، RTL، سبعة تبويبات)

   • مرجع التصميم: «مواصفات نافذة إعدادات الشارت — تريدنك فيو».
   • يحتفظ بنفس مفتاح التخزين ("chartSettings_v1") ونفس الحدث
     ("tvCloneChartSettingsChanged") ونفس واجهة window.TVSettings المستخدمة
     من بقية الوحدات (tv-health, tv-session-breaks, tv-indicators-ui, multichart).
   • التعديلات داخل النافذة تُجرى على نسخة مسوّدة (draft) فقط؛ «موافق» يعتمدها
     ويحفظها ويطبقها، و«إلغاء»/X يتجاهلانها.
   • الخيارات التي لا يدعمها محرك الشارت الحالي تُعرض بنفس التصميم وتُحفظ لكنها
     لا تدّعي أي وظيفة: انظر TVSettings.unlinked() للقائمة الكاملة.
   Load this AFTER multichart.js (الترتيب الحالي في index.html صحيح).
   ========================================================================= */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'chartSettings_v1';
  const TEMPLATE_INDEX_KEY = 'tv_settings_templates_v1';
  const clone = o => JSON.parse(JSON.stringify(o));
  const isNum = v => typeof v === 'number' && isFinite(v);

  // ---------------------------------------------------------- الأزمنة والتنسيق
  // مدن المواصفات (بترتيب الوثيقة) + مدن المشروع القديمة (تقدير تنفيذي: حتى لا تُفقد خيارات سابقة).
  const TIMEZONES = [
    ['UTC', 'UTC', 0], ['America/Sao_Paulo', 'ساو باولو', -3], ['America/New_York', 'نيويورك', -5], ['America/Chicago', 'شيكاغو', -6],
    ['America/Los_Angeles', 'لوس أنجلوس', -8], ['Europe/London', 'لندن', 0], ['Europe/Paris', 'باريس', 1], ['Africa/Cairo', 'القاهرة', 2],
    ['Asia/Nicosia', 'نيقوسيا', 2], ['Europe/Istanbul', 'إسطنبول', 3], ['Asia/Bahrain', 'البحرين', 3], ['Asia/Riyadh', 'الرياض', 3],
    ['Asia/Kuwait', 'الكويت', 3], ['Asia/Qatar', 'قطر', 3], ['Europe/Moscow', 'موسكو', 3], ['Africa/Nairobi', 'نيروبي', 3],
    ['Asia/Tehran', 'طهران', 3.5], ['Asia/Dubai', 'دبي', 4], ['Asia/Muscat', 'مسقط', 4], ['Asia/Kabul', 'كابول', 4.5],
    ['Asia/Ashgabat', 'عشق آباد', 5], ['Asia/Karachi', 'كراتشي', 5], ['Asia/Almaty', 'أستانا', 5], ['Asia/Kolkata', 'كولكاتا', 5.5],
    ['Asia/Colombo', 'كولومبو', 5.5], ['Asia/Kathmandu', 'كاتماندو', 5.75], ['Asia/Dhaka', 'داكا', 6],
    ['Asia/Yangon', 'يانجون', 6.5], ['Asia/Bangkok', 'بانكوك', 7], ['Asia/Jakarta', 'جاكرتا', 7], ['Asia/Shanghai', 'شنغهاي', 8],
    ['Asia/Singapore', 'سنغافورة', 8], ['Asia/Tokyo', 'طوكيو', 9], ['Asia/Seoul', 'سيول', 9], ['Australia/Sydney', 'سيدني', 11],
    ['Pacific/Auckland', 'أوكلاند', 13]
  ];
  const TZ_FALLBACK = {}; TIMEZONES.forEach(t => TZ_FALLBACK[t[0]] = t[2]);
  const tzFmtCache = {};
  function tzOffsetMin(tz, sec) {
    try {
      let f = tzFmtCache[tz];
      if (!f) f = tzFmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
      const ms = (sec == null ? Date.now() / 1000 : sec) * 1000;
      const p = {}; f.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
      const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
      return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
    } catch (e) { return Math.round((TZ_FALLBACK[tz] || 0) * 60); }
  }
  function tzOffsetHours(tz, sec) { return tzOffsetMin(tz, sec) / 60; }
  function offLabel(min) {
    const s = min < 0 ? '-' : '+'; const a = Math.abs(min); const h = Math.floor(a / 60), m = a % 60;
    return 'UTC' + s + h + (m ? ':' + String(m).padStart(2, '0') : '');
  }
  function tzLabel(row) { return row[1] + (row[0] === 'UTC' ? '' : ' (' + offLabel(tzOffsetMin(row[0])) + ')'); }

  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const DATE_FORMATS = [
    ['dMy2', '29 سبتمبر ’97'], ['My2', 'سبتمبر ’97'], ['Mdy', 'سبتمبر 29, 1997'], ['My', 'سبتمبر 1997'], ['Md', 'سبتمبر 29'], ['dM', '29 سبتمبر'],
    ['y-m-d', '1997-09-29'], ['yy-m-d', '97-09-29'], ['yy/m/d', '97/09/29'], ['y/m/d', '1997/09/29'],
    ['d-m-y', '29-09-1997'], ['d-m-yy', '29-09-97'], ['d/m/yy', '29/09/97'], ['d/m/y', '29/09/1997']
  ];
  const pad2 = n => String(n).padStart(2, '0');
  function fmtDate(fmt, y, mo, d) {
    const yy = pad2(y % 100), M = MONTHS[mo], mm = pad2(mo + 1), dd = pad2(d);
    switch (fmt) {
      case 'dMy2': return d + ' ' + M + ' ’' + yy;
      case 'My2': return M + ' ’' + yy;
      case 'Mdy': return M + ' ' + d + ', ' + y;
      case 'My': return M + ' ' + y;
      case 'Md': return M + ' ' + d;
      case 'dM': return d + ' ' + M;
      case 'y-m-d': return y + '-' + mm + '-' + dd;
      case 'yy-m-d': return yy + '-' + mm + '-' + dd;
      case 'yy/m/d': return yy + '/' + mm + '/' + dd;
      case 'y/m/d': return y + '/' + mm + '/' + dd;
      case 'd-m-y': return dd + '-' + mm + '-' + y;
      case 'd-m-yy': return dd + '-' + mm + '-' + yy;
      case 'd/m/yy': return dd + '/' + mm + '/' + yy;
      case 'd/m/y': return dd + '/' + mm + '/' + y;
      default: return d + ' ' + M + ' ’' + yy;
    }
  }
  function fmtClock(h24, mi, se, hours) {
    if (hours === '12') {
      const ap = h24 >= 12 ? 'م' : 'ص'; const h = h24 % 12 || 12;
      return h + ':' + pad2(mi) + (se != null ? ':' + pad2(se) : '') + ' ' + ap;
    }
    return pad2(h24) + ':' + pad2(mi) + (se != null ? ':' + pad2(se) : '');
  }
  function shifted(sec, tz) { return new Date((sec + tzOffsetMin(tz, sec) * 60) * 1000); }

  // ---------------------------------------------------------- الدقة
  const PRECISIONS = [['default', 'افتراضي']]
    .concat([1, 2, 3, 4].map(n => [String(n), n + ' عشرية']))
    .concat(Array.from({ length: 11 }, (_, i) => [String(i + 5), (i + 5) + ' عشرية']))
    .concat([2, 4, 8, 16, 32, 64].map(n => ['1/' + n, '1/' + n]));
  function fracFormatter(n) {
    return p => {
      const neg = p < 0; const a = Math.abs(p); let whole = Math.floor(a); let num = Math.round((a - whole) * n);
      if (num >= n) { whole += 1; num = 0; }
      const s = num ? (whole ? whole + ' ' : '') + num + '/' + n : String(whole);
      return neg ? '-' + s : s;
    };
  }

  const SOUNDS = [['notes', 'ملاحظات تابعة'], ['call', 'اتصال'], ['beep', 'بيب-بيب'], ['error', 'خطأ'], ['thin', 'رفيع'], ['alarm', 'ساعة المنبه'], ['fun', 'مرح'], ['bell', 'نموذج الجرس']];
  const VIS3 = [['click', 'مرئي عند النقر'], ['always', 'ظاهر وموجود دائمًا'], ['never', 'مختفي دائمًا']];
  const PNL_MODES = [['money', 'أموال'], ['ticks', 'تيكات السعر'], ['pct', '%']];

  // ---------------------------------------------------------- الحالة الافتراضية
  const defaults = {
    seriesType: 'candles',
    // --- شموع (القيم من المواصفات) ---
    colorByPrevClose: false,
    upColor: '#16A97D', downColor: '#E3224F', bodyUpVisible: true, bodyDownVisible: true,
    borderVisible: true, borderUpColor: '#16A97D', borderDownColor: '#E3224F', borderUpVisible: true, borderDownVisible: true,
    wickVisible: true, wickUpColor: '#16A97D', wickDownColor: '#E3224F', wickUpVisible: true, wickDownVisible: true,
    borderThickness: 1, wickThickness: 1,
    // --- تعديل البيانات ---
    adjustSettlement: true, adjustContracts: false,
    precisionMode: 'default', precision: 2,
    timezone: 'Asia/Dubai', session: '24h', timezoneOffset: 0,
    // --- لوحة / ألوان ---
    bgColor: '#FFFFFF', bgType: 'solid', bgColor2: '#E8EEF9', bgGradientDir: 'vertical',
    gridColor: '#E0E3EB', gridVisible: false, textColor: '#000000',
    vGridVisible: false, vGridColor: '#E0E3EB', vGridOpacity: 100, vGridWidth: 1,
    hGridVisible: false, hGridColor: '#E0E3EB', hGridOpacity: 100, hGridWidth: 1,
    crosshairColor: '#9E9E9E', crosshairStyle: 'dashed', crosshairWidth: 1, crosshairOpacity: 100,
    watermarkMode: 'replay', watermarkColor: '#000000', watermarkAlpha: 0, watermarkVisible: true, watermarkText: '', watermarkOpacity: 6,
    logoVisible: false, backgroundImageUrl: '',
    canvasTextFontSize: 12, scaleLineColor: '#000000', scaleLineAlpha: 0,
    navButtons: 'click', paneButtons: 'click',
    marginTop: 10, marginBottom: 8, marginRight: 10,
    // --- مقاييس ---
    priceScaleVisible: true, rightScaleVisible: true, leftScaleVisible: false, invertScale: false, scaleOnly: false, lockScale: false,
    scaleMode: 'normal', currencyUnit: 'click', scaleModeButtons: 'click', lockRatio: false, lockRatioValue: '17.8460304',
    noOverlapLabels: true, plusButton: true, barCountdown: true,
    symbolLabelMode: 'both', symbolLabelValue: 'scale', symbolLineColor: '', hiLoMode: 'hidden', bidAskMode: 'hidden',
    bidColor: '#F4A3AF', askColor: '#9AA9F5',
    priceScaleTextColor: '#000000', priceScaleFontSize: 12, priceScaleLineWidth: 1,
    timeScaleAxisVisible: true, timeScaleTextColor: '#000000', timeScaleFontSize: 12,
    // --- مقياس الوقت ---
    weekdayOnLabels: false, dateFormat: 'dMy2', hoursFormat: '24', keepLeftEdge: false, allowMoreZoomOut: false,
    timeVisible: true, secondsVisible: false, showTimeGaps: true, weekendSeparation: false,
    sessionBreaks: false, sessionBreakColor: '#2962FF', sessionBreakStyle: 'dashed',
    barSpacing: 6, rightOffset: 10, zoomSpeed: 100,
    // --- خط الحالة ---
    statusLine: {
      logo: false, title: false, titleMode: 'name', ohlc: false, change: false, volume: false, lastDayChange: false,
      buySell: true, bgOn: false, bgAlpha: 30,
      // مفاتيح قديمة يقرؤها tv-indicators-ui.js (تبقى كما هي)
      symbol: false, description: false, indicatorValues: true, indTitles: true, indInputs: false, indBackground: true, session: false,
      fontSize: 12, textColor: '#131722', position: 'top-left'
    },
    // --- تداول (واجهة فقط ما لم يُذكر خلاف ذلك في unlinked()) ---
    trading: {
      buySell: true, oneClick: false, sound: false, volume: 30, soundName: 'alarm', rejectOnly: false,
      positionsOrders: true, reverseBtn: true, controls: 'click', droppedOrder: true,
      pnl: true, pnlPositions: true, pnlPositionsMode: 'money', pnlBrackets: true, pnlBracketsMode: 'money',
      execMarks: true, execLabels: false, extendLines: true, align: 'right', snapshots: false
    },
    alertsUi: { lines: true, linesColor: '#000000', activeOnly: true, size: true, volume: 10, autoHideToast: true },
    events: { earnings: false, dividends: false, splits: false, ideas: false, ideasMode: 'all', continuousSwitch: true, switchBreaks: false, news: false, newsNotify: false },
    theme: 'tvlight'
  };

  let state = loadState();
  let draft = null;

  function mergeDeep(base, extra) {
    const out = clone(base);
    if (!extra || typeof extra !== 'object') return out;
    Object.keys(extra).forEach(k => {
      if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) && extra[k] && typeof extra[k] === 'object') out[k] = Object.assign(out[k], extra[k]);
      else out[k] = extra[k];
    });
    return out;
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const merged = mergeDeep(defaults, parsed);
      // ترحيل إعداد قديم: «الرمز» في خط الحالة صار «عنوان»
      if (parsed.statusLine && parsed.statusLine.title === undefined && parsed.statusLine.symbol) merged.statusLine.title = true;
      if (parsed.precisionMode === undefined && isNum(parsed.precision) && parsed.precision !== 2) merged.precisionMode = String(parsed.precision);
      if (parsed.watermarkMode === undefined && parsed.watermarkText) { merged.watermarkMode = 'custom'; merged.watermarkColor = parsed.textColor || '#000000'; merged.watermarkAlpha = parsed.watermarkOpacity || 6; }
      if (parsed.marginRight === undefined && isNum(parsed.rightOffset)) merged.marginRight = parsed.rightOffset;
      return sanitize(merged);
    } catch (e) { return sanitize(clone(defaults)); }
  }
  function sanitize(s) {
    if (!TIMEZONES.some(t => t[0] === s.timezone)) s.timezone = defaults.timezone;
    if (!PRECISIONS.some(p => p[0] === s.precisionMode)) s.precisionMode = 'default';
    if (!DATE_FORMATS.some(d => d[0] === s.dateFormat)) s.dateFormat = defaults.dateFormat;
    return s;
  }
  function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }

  const THEME_PRESETS = {
    dark: { bgColor: '#180F24', gridColor: '#2b2138', textColor: '#d1d4dc' },
    light: { bgColor: '#ffffff', gridColor: '#e6e6e6', textColor: '#131722' },
    tvdark: { bgColor: '#131722', gridColor: '#2a2e39', textColor: '#d1d4dc' },
    tvlight: { bgColor: '#ffffff', gridColor: '#e0e3eb', textColor: '#131722' }
  };

  function hexToRgbaLocal(hex, alpha) {
    let h = (hex || '#787b86').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + (r || 0) + ',' + (g || 0) + ',' + (b || 0) + ',' + (alpha == null ? 1 : alpha) + ')';
  }
  const pairText = () => { const ps = document.getElementById('pairSelect'); return ps && ps.options[ps.selectedIndex] ? ps.options[ps.selectedIndex].textContent : ''; };
  const pairValue = () => { const ps = document.getElementById('pairSelect'); return ps ? ps.value : ''; };
  function symbolPrecision() { const p = global.SYMBOL_PRECISION && global.SYMBOL_PRECISION[pairValue()]; return p == null ? 5 : p; }
  function curPrecision(s) {
    s = s || state; const m = s.precisionMode;
    if (m && /^\d+$/.test(m)) return +m;
    if (m && m.indexOf('/') > 0) return 4;
    return symbolPrecision();
  }

  // ---------------------------------------------------------- العلامة المائية
  let wmPlugin = null, wmKey = '';
  function watermarkText() {
    if (!state.watermarkVisible) return '';
    if (state.watermarkMode === 'none') return '';
    if (state.watermarkMode === 'symbol') return pairValue();
    if (state.watermarkMode === 'replay') {
      let on = false; try { on = !!(global.getBacktestState && global.getBacktestState().isBacktest); } catch (e) {}
      return on ? 'وضع إعادة التشغيل' : '';
    }
    return state.watermarkText || '';
  }
  function applyWatermark() {
    const chart = global.chart; if (!chart || !global.LightweightCharts) return;
    const text = watermarkText();
    const color = hexToRgbaLocal(state.watermarkColor, (state.watermarkAlpha || 0) / 100);
    wmKey = text + '|' + color;
    const show = !!text && (state.watermarkAlpha || 0) > 0;
    if (typeof LightweightCharts.createTextWatermark === 'function' && chart.panes) {
      try {
        if (wmPlugin) { wmPlugin.detach(); wmPlugin = null; }
        if (show) wmPlugin = LightweightCharts.createTextWatermark(chart.panes()[0], { horzAlign: 'center', vertAlign: 'center', lines: [{ text, color, fontSize: 48 }] });
      } catch (e) { console.error('watermark', e); }
    } else {
      try { chart.applyOptions({ watermark: { visible: show, color, text } }); } catch (e) {}
    }
  }

  // ---------------------------------------------------------- تطبيق الإعدادات فعلياً
  function reportSettingsError(what, e) { try { console.error('[TVSettings]', what, e); global.dispatchEvent(new CustomEvent('tv-health-error', { detail: 'إعداد ' + what + ': ' + (e && e.message || e) })); } catch (x) {} }
  function applyChartOptionsSafe(chart, opts) {
    Object.keys(opts).forEach(k => {
      try { chart.applyOptions({ [k]: opts[k] }); }
      catch (e) {
        reportSettingsError(k, e);
        if (k === 'layout') { try { chart.applyOptions({ layout: { background: { type: 'solid', color: '#FFFFFF' }, textColor: '#000000' } }); } catch (x) {} }
      }
    });
  }
  function lineStyleOf(name) {
    const L = global.LightweightCharts && LightweightCharts.LineStyle || { Solid: 0, Dotted: 1, Dashed: 2 };
    return name === 'solid' ? L.Solid : name === 'dotted' ? L.Dotted : L.Dashed;
  }
  function priceFormatOpts() {
    const m = state.precisionMode;
    if (m && /^\d+$/.test(m)) return { type: 'price', precision: +m, minMove: Math.pow(10, -(+m)) };
    if (m && m.indexOf('/') > 0) { const n = +m.split('/')[1]; return { type: 'custom', minMove: 1 / n, formatter: fracFormatter(n) }; }
    const p = symbolPrecision();
    return { type: 'price', precision: p, minMove: Math.pow(10, -p) };
  }
  // منسّق الوقت: يحترم المنطقة الزمنية وتنسيق التاريخ والساعات ويوم الأسبوع.
  function makeTickFormatter() {
    const tz = state.timezone, hours = state.hoursFormat, df = state.dateFormat;
    return function (time, type) {
      if (typeof time !== 'number') return String(time && time.year != null ? time.year + '-' + pad2(time.month) + '-' + pad2(time.day) : time);
      const d = shifted(time, tz);
      const y = d.getUTCFullYear(), mo = d.getUTCMonth(), day = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes(), se = d.getUTCSeconds();
      switch (type) {
        case 0: return String(y);
        case 1: return MONTHS[mo];
        case 2: return String(day);
        case 4: return fmtClock(h, mi, se, hours);
        default: return fmtClock(h, mi, null, hours);
      }
    };
  }
  function makeCrosshairFormatter() {
    const tz = state.timezone, hours = state.hoursFormat, df = state.dateFormat, wd = state.weekdayOnLabels;
    return function (time) {
      if (typeof time !== 'number') return String(time && time.year != null ? time.year + '-' + pad2(time.month) + '-' + pad2(time.day) : time);
      const d = shifted(time, tz);
      const date = fmtDate(df, d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const clock = fmtClock(d.getUTCHours(), d.getUTCMinutes(), state.secondsVisible ? d.getUTCSeconds() : null, hours);
      return (wd ? WEEKDAYS[d.getUTCDay()] + ' ' : '') + date + '  ' + clock;
    };
  }
  function symbolLineSeriesOpts() {
    const m = state.symbolLabelMode;
    const o = { lastValueVisible: m === 'both' || m === 'value', priceLineVisible: m === 'both' || m === 'line' };
    o.priceLineColor = state.symbolLineColor || '';
    return o;
  }
  function applyAll() {
    const chart = global.chart, series = global.candleSeries;
    if (series) {
      try {
        series.applyOptions(Object.assign({
          visible: true, priceScaleId: 'right',
          upColor: state.bodyUpVisible ? state.upColor : 'rgba(0,0,0,0)',
          downColor: state.bodyDownVisible ? state.downColor : 'rgba(0,0,0,0)',
          borderVisible: state.borderUpVisible || state.borderDownVisible,
          borderUpColor: state.borderUpVisible ? state.borderUpColor : 'rgba(0,0,0,0)',
          borderDownColor: state.borderDownVisible ? state.borderDownColor : 'rgba(0,0,0,0)',
          wickVisible: state.wickUpVisible || state.wickDownVisible,
          wickUpColor: state.wickUpVisible ? state.wickUpColor : 'rgba(0,0,0,0)',
          wickDownColor: state.wickDownVisible ? state.wickDownColor : 'rgba(0,0,0,0)',
          priceFormat: priceFormatOpts()
        }, symbolLineSeriesOpts()));
      } catch (e) { reportSettingsError('الشموع', e); }
    }
    if (chart) {
      const crosshairRgba = hexToRgbaLocal(state.crosshairColor, state.crosshairOpacity / 100);
      const ch = { color: crosshairRgba, width: state.crosshairWidth, style: lineStyleOf(state.crosshairStyle) };
      const bgLayout = state.bgType === 'gradient' ? { type: 'gradient', topColor: state.bgColor, bottomColor: state.bgColor2 } : { type: 'solid', color: state.bgColor };
      const scaleLine = hexToRgbaLocal(state.scaleLineColor, (state.scaleLineAlpha || 0) / 100);
      const scaleLineOn = (state.scaleLineAlpha || 0) > 0;
      const modeOf = {
        log: LightweightCharts.PriceScaleMode.Logarithmic, percent: LightweightCharts.PriceScaleMode.Percentage,
        indexed: LightweightCharts.PriceScaleMode.IndexedTo100
      };
      applyChartOptionsSafe(chart, {
        layout: { background: bgLayout, textColor: state.textColor, fontSize: state.canvasTextFontSize },
        grid: {
          vertLines: { color: hexToRgbaLocal(state.vGridColor, state.vGridOpacity / 100), visible: state.vGridVisible },
          horzLines: { color: hexToRgbaLocal(state.hGridColor, state.hGridOpacity / 100), visible: state.hGridVisible }
        },
        crosshair: { vertLine: ch, horzLine: ch },
        localization: { timeFormatter: makeCrosshairFormatter() },
        timeScale: {
          borderColor: scaleLine, borderVisible: scaleLineOn, visible: state.timeScaleAxisVisible,
          timeVisible: state.timeVisible, secondsVisible: state.secondsVisible,
          rightOffset: state.marginRight, minBarSpacing: state.allowMoreZoomOut ? 0.01 : 0.5,
          tickMarkFormatter: makeTickFormatter()
        },
        rightPriceScale: {
          visible: state.rightScaleVisible && state.priceScaleVisible, autoScale: true,
          borderColor: scaleLine, borderVisible: scaleLineOn,
          mode: modeOf[state.scaleMode] != null ? modeOf[state.scaleMode] : LightweightCharts.PriceScaleMode.Normal,
          invertScale: state.invertScale, scaleMargins: { top: state.marginTop / 100, bottom: state.marginBottom / 100 },
          textColor: state.textColor
        },
        leftPriceScale: { visible: state.leftScaleVisible, borderColor: scaleLine, borderVisible: scaleLineOn, textColor: state.textColor }
      });
    }
    try { applyWatermark(); } catch (e) { reportSettingsError('العلامة المائية', e); }
    if (global.TVGaps) global.TVGaps.setEnabled(state.showTimeGaps !== false);
    document.body.style.background = state.bgColor;
    document.documentElement.style.setProperty('--tv-chart-bg-color', state.bgColor);
    updateStatusLineDOM();
    try {
      // مفاتيح قديمة تقرؤها multichart.js للشاشات الإضافية
      const detail = Object.assign({}, state, {
        precision: curPrecision(), borderVisible: state.borderUpVisible || state.borderDownVisible,
        wickVisible: state.wickUpVisible || state.wickDownVisible, gridVisible: state.vGridVisible || state.hGridVisible, gridColor: state.hGridColor
      });
      global.dispatchEvent(new CustomEvent('tvCloneChartSettingsChanged', { detail }));
    } catch (e) {}
  }

  // ---------------------------------------------------------- خط الحالة فوق الشارت
  function lastDayChangeText(allData, prec) {
    if (!allData || allData.length < 2) return '';
    const last = allData[allData.length - 1]; const day = Math.floor(last.time / 86400);
    let i = allData.length - 1; while (i >= 0 && Math.floor(allData[i].time / 86400) === day) i--;
    if (i < 0) return '';
    const prev = allData[i].close, chg = last.close - prev, pct = prev ? chg / prev * 100 : 0;
    return (chg >= 0 ? '+' : '') + chg.toFixed(prec) + ' (' + (chg >= 0 ? '+' : '') + pct.toFixed(2) + '%)';
  }
  function updateStatusLineDOM() {
    let bar = document.getElementById('tvStatusLine');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'tvStatusLine';
      const chartEl = document.getElementById('chart');
      if (chartEl && chartEl.parentNode) chartEl.parentNode.insertBefore(bar, chartEl);
    }
    const sl = state.statusLine, prec = curPrecision();
    const parts = [];
    const txt = pairText(), val = pairValue();
    if (sl.title || (sl.symbol && sl.title === undefined)) {
      parts.push('<b>' + (sl.titleMode === 'ticker' ? val : sl.titleMode === 'both' ? val + ' · ' + txt : txt) + '</b>');
    }
    if (sl.description) parts.push('<span class="tv-sl-dim">' + txt + '</span>');
    const bs = global.getBacktestState ? global.getBacktestState() : null;
    const all = bs && bs.allData && bs.allData.length ? bs.allData : null;
    const b1 = all ? all[all.length - 1] : null;
    if (b1 && sl.ohlc) {
      parts.push('O<span class="tv-sl-val">' + b1.open.toFixed(prec) + '</span>');
      parts.push('H<span class="tv-sl-val">' + b1.high.toFixed(prec) + '</span>');
      parts.push('L<span class="tv-sl-val">' + b1.low.toFixed(prec) + '</span>');
      parts.push('C<span class="tv-sl-val">' + b1.close.toFixed(prec) + '</span>');
    }
    if (b1 && sl.change) {
      const chg = b1.close - b1.open, pct = b1.open ? (chg / b1.open) * 100 : 0;
      parts.push('<span class="' + (chg >= 0 ? 'tv-sl-pos' : 'tv-sl-neg') + '">' + (chg >= 0 ? '+' : '') + chg.toFixed(prec) + ' (' + (chg >= 0 ? '+' : '') + pct.toFixed(2) + '%)</span>');
    }
    if (b1 && sl.volume && b1.volume != null && isFinite(b1.volume)) parts.push('Vol<span class="tv-sl-val">' + Math.round(b1.volume) + '</span>');
    if (b1 && sl.lastDayChange) {
      const t = lastDayChangeText(all, prec);
      if (t) parts.push('<span class="tv-sl-dim">يوم</span><span class="tv-sl-val">' + t + '</span>');
    }
    const html = parts.join(' ');
    if (bar.__html !== html) { bar.innerHTML = html; bar.__html = html; }
    bar.style.display = parts.length ? 'flex' : 'none';
    bar.style.fontSize = (sl.fontSize || 12) + 'px';
    bar.style.color = sl.textColor || '#131722';
    bar.style.background = sl.bgOn ? hexToRgbaLocal(state.bgColor, (sl.bgAlpha == null ? 30 : sl.bgAlpha) / 100) : '';
    bar.classList.remove('tv-sl-pos-left', 'tv-sl-pos-center', 'tv-sl-pos-right');
    bar.classList.add('tv-sl-pos-' + (sl.position === 'top-center' ? 'center' : sl.position === 'top-right' ? 'right' : 'left'));
  }
  setInterval(() => {
    updateStatusLineDOM();
    // العلامة المائية «وضع إعادة التشغيل» تتبع حالة الريبلاي الفعلية
    if (state.watermarkMode === 'replay') { const k = watermarkText() + '|' + hexToRgbaLocal(state.watermarkColor, (state.watermarkAlpha || 0) / 100); if (k !== wmKey) { try { applyWatermark(); } catch (e) {} } }
  }, 1000);

  // =========================================================================
  //  الواجهة
  // =========================================================================
  const unlinkedList = [];
  const NS = 'http://www.w3.org/2000/svg';
  const SVG = {
    close: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l18 18M22 4L4 22"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    spk: '<svg class="tvs-spk" viewBox="0 0 30 30"><path d="M5 12h4l6-5v16l-6-5H5z"/><path class="w1" d="M19 11c1.6 1.2 2.4 2.5 2.4 4s-.8 2.8-2.4 4"/><path class="w2" d="M22 8c2.8 2 4.2 4.4 4.2 7s-1.4 5-4.2 7"/></svg>',
    spkMute: '<svg class="tvs-spk" viewBox="0 0 30 30"><path d="M5 12h4l6-5v16l-6-5H5z"/><path d="M20 11l7 8M27 11l-7 8"/></svg>'
  };
  const TAB_ICONS = {
    symbol: '<svg viewBox="0 0 28 28"><path d="M8 4v20M5 8h6v10H5zM20 3v22M17 7h6v12h-6z"/></svg>',
    statusline: '<svg viewBox="0 0 28 28"><path d="M5 7h18M5 12h12M5 17h18M5 22h12"/></svg>',
    scales: '<svg viewBox="0 0 28 28"><path d="M6 3v19h10M6 3L3 7M6 3l3 4M16 22l-4-3M16 22l-4 3M12 12h12M24 12l-4-3.5M24 12l-4 3.5"/></svg>',
    canvas: '<svg viewBox="0 0 28 28"><path d="M5 23l1.2-5L19 5.2a2.2 2.2 0 013.2 0l.6.6a2.2 2.2 0 010 3.2L10 21.8zM17 7.5l3.5 3.5"/></svg>',
    trading: '<svg viewBox="0 0 28 28"><path d="M3 9l4 3 4-5 4 5 5-6 5 2M3 20l4-3 4 5 4-5 5 6 5-2M20 6h5v4M20 22h5v-4"/></svg>',
    alerts: '<svg viewBox="0 0 28 28"><circle cx="14" cy="15" r="8.5"/><path d="M14 10.5V15l3.2 2M4 8l4-4M24 8l-4-4"/></svg>',
    events: '<svg viewBox="0 0 28 28"><rect x="4" y="6" width="20" height="18" rx="3"/><path d="M4 12h20M10 3v6M18 3v6"/></svg>'
  };
  const TABS = [
    { id: 'symbol', label: 'رمز' }, { id: 'statusline', label: 'خط الحالة' }, { id: 'scales', label: 'المقاييس والخطوط' },
    { id: 'canvas', label: 'لوحة' }, { id: 'trading', label: 'تداول' }, { id: 'alerts', label: 'تنبيهات' }, { id: 'events', label: 'أحداث' }
  ];

  let overlayEl, sheetEl, panelEl, tabsEl, layerEl, tplBtn, modalEl, backup;
  let activeTab = 'symbol'; const scrollPos = {};
  let openDD = null;

  const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const getp = (p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), draft);
  const setp = (p, v) => { const ks = p.split('.'); const last = ks.pop(); const o = ks.reduce((a, k) => a[k], draft); o[last] = v; };
  const sizeVar = (n) => 'calc(' + n + ' * 1px)';

  // ---- مساعدة: تمكين/تعطيل
  function setDisabled(c, dis) {
    const el = c.el || c;
    el.classList.toggle('is-disabled', !!dis); el.classList.toggle('disabled', !!dis);
    el.setAttribute('aria-disabled', dis ? 'true' : 'false');
    if (c.setDisabled) c.setDisabled(!!dis);
  }

  // ---- مربع الاختيار
  function Checkbox(checked, onChange) {
    const b = mk('button', 'tvs-checkbox' + (checked ? ' checked' : ''), SVG.check);
    b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', String(!!checked));
    const set = v => { b.classList.toggle('checked', v); b.setAttribute('aria-checked', String(v)); };
    b.addEventListener('click', () => { const v = !b.classList.contains('checked'); set(v); onChange(v); });
    b.__set = set;
    return b;
  }

  // ---- القائمة المنسدلة (مخصصة) — القائمة المفتوحة تُرسم في طبقة خارج منطقة التمرير
  function closeDD() { if (openDD) { openDD.close(); } }
  function Dropdown(opts) {
    // opts: options [[val,label]], value, onChange, width, disabled, menu(bool: أسلوب قائمة التذييل), rightLabel, template
    let value = opts.value; let disabled = !!opts.disabled;
    const btn = mk('button', 'tvs-dd' + (opts.template ? ' template' : ''), '<span class="tvs-dd-text"></span>' + SVG.chev);
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    if (opts.width) { btn.dataset.w = opts.width; btn.style.setProperty('--w', opts.width); }
    const txt = btn.querySelector('.tvs-dd-text');
    const labelOf = v => { const f = (opts.options || []).find(o => o[0] === v); return f ? f[1] : (opts.fixedLabel || ''); };
    const paint = () => { txt.textContent = opts.fixedLabel || labelOf(value); };
    paint();
    let listEl = null;
    function position() {
      if (!listEl) return;
      const sr = sheetEl.getBoundingClientRect(); const k = (sr.width / sheetEl.offsetWidth) || 1;
      const r = btn.getBoundingClientRect();
      const items = listEl.children.length; const itemH = opts.menu ? 30 : (parseFloat(getComputedStyle(listEl.firstChild || btn).height) || 44);
      let natural = Math.min(items * itemH + 2, opts.maxHeight || 800);
      listEl.style.width = (r.width / k) + 'px'; listEl.style.minWidth = (r.width / k) + 'px';
      const below = (global.innerHeight - r.bottom - 8) / k, above = (r.top - 8) / k;
      const up = below < natural && above > below;
      const h = Math.max(80, Math.min(natural, up ? above : below));
      listEl.style.maxHeight = h + 'px'; listEl.style.height = Math.min(natural, h) + 'px';
      listEl.style.left = ((r.left - sr.left) / k) + 'px';
      listEl.style.top = up ? (((r.top - sr.top) / k) - Math.min(natural, h) - 4) + 'px' : (((r.bottom - sr.top) / k) + 4) + 'px';
      listEl.dataset.dir = up ? 'up' : 'down';
    }
    function open() {
      if (disabled) return; closeDD();
      listEl = mk('ul', 'tvs-list' + (opts.menu ? ' menu' : '')); listEl.setAttribute('role', 'listbox');
      (opts.options || []).forEach(o => {
        if (o === '-') { listEl.appendChild(mk('li', 'tvs-opt sep')); return; }
        const li = mk('li', 'tvs-opt' + (!opts.menu && o[0] === value ? ' selected' : '')); li.textContent = o[1]; li.setAttribute('role', 'option'); li.dataset.v = o[0];
        li.addEventListener('click', e => { e.stopPropagation(); choose(o[0]); });
        listEl.appendChild(li);
      });
      layerEl.appendChild(listEl); btn.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
      position();
      const sel = listEl.querySelector('.selected'); if (sel) listEl.scrollTop = Math.max(0, sel.offsetTop - listEl.clientHeight / 2 + 22);
      openDD = api;
    }
    function close() {
      if (listEl) { listEl.remove(); listEl = null; }
      btn.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
      if (openDD === api) openDD = null;
    }
    function choose(v) { if (!opts.menu) { value = v; paint(); } close(); if (opts.onChange) opts.onChange(v); }
    btn.addEventListener('click', e => { e.stopPropagation(); if (listEl) close(); else open(); });
    btn.addEventListener('keydown', e => {
      if (disabled) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (opts.menu) return;
        const list = opts.options; let i = list.findIndex(o => o[0] === value); i = Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        value = list[i][0]; paint(); if (opts.onChange) opts.onChange(value);
        if (listEl) { open(); }
      } else if (e.key === 'Escape' && listEl) { e.stopPropagation(); close(); }
    });
    const api = { el: btn, close, position, get value() { return value; }, set(v) { value = v; paint(); }, setDisabled(d) { disabled = d; if (d) close(); } };
    if (disabled) setDisabled(api, true);
    return api;
  }

  // ---- زر لون
  function colorBtnFor(el, getHex, getAlpha, onPick, useChecker) {
    const paint = () => {
      const a = getAlpha ? getAlpha() : 100; const hex = getHex();
      el.style.setProperty('--sw', hex ? hexToRgbaLocal(hex, a / 100) : 'transparent');
      el.classList.toggle('checker', !!useChecker || a < 100 || !hex);
    };
    paint();
    el.addEventListener('click', () => {
      if (el.classList.contains('is-disabled')) return;
      if (!global.UnifiedColorPicker) return;
      global.UnifiedColorPicker.open({
        anchorEl: el, color: getHex() || '#000000', opacity: getAlpha ? getAlpha() : 100,
        onChange: (hex, op) => { onPick(hex, op); paint(); }
      });
    });
    return paint;
  }
  function ColorBtn(path, alphaPath) {
    const b = mk('button', 'tvs-color-sw'); b.setAttribute('aria-label', 'اللون');
    const paint = colorBtnFor(b, () => getp(path), alphaPath ? () => getp(alphaPath) : null, (hex, op) => { setp(path, hex); if (alphaPath) setp(alphaPath, op == null ? 100 : op); }, false);
    return { el: b, repaint: paint };
  }
  function ComboBtn(opt) {
    // زر مركّب: عينة خط + مربع لون (opt.lineCls، path/alphaPath أو diag)
    const b = mk('button', 'tvs-combo', '<span class="ln ' + (opt.lineCls || '') + '"></span><span class="sq' + (opt.diag ? ' diag' : '') + '"></span>');
    const sq = b.querySelector('.sq');
    const hexGet = () => getp(opt.path); const alGet = opt.alphaPath ? () => getp(opt.alphaPath) : null;
    const paint = () => {
      const a = alGet ? alGet() : 100; const hex = hexGet();
      if (opt.diag && !hex) { sq.classList.add('diag'); sq.classList.remove('tvs-check-bg'); sq.style.setProperty('--sw-a', getp('upColor')); sq.style.setProperty('--sw-b', getp('downColor')); }
      else { sq.classList.remove('diag'); sq.style.setProperty('--sw', hexToRgbaLocal(hex || '#9E9E9E', a / 100)); sq.classList.toggle('tvs-check-bg', a < 100); }
    };
    paint();
    b.addEventListener('click', () => {
      if (b.classList.contains('is-disabled') || !global.UnifiedColorPicker) return;
      global.UnifiedColorPicker.open({ anchorEl: b, color: hexGet() || getp('upColor'), opacity: alGet ? alGet() : 100,
        onChange: (hex, op) => { setp(opt.path, hex); if (opt.alphaPath) setp(opt.alphaPath, op == null ? 100 : op); paint(); } });
    });
    return { el: b, repaint: paint };
  }

  // ---- شريط السحب
  function Slider(value, onChange, opt) {
    opt = opt || {};
    const root = mk('div', 'tvs-slider'); root.setAttribute('role', 'slider'); root.tabIndex = 0;
    root.setAttribute('aria-valuemin', '0'); root.setAttribute('aria-valuemax', '100');
    const track = mk('div', 'tvs-s-track' + (opt.alpha ? ' alpha' : '')); const fill = mk('div', 's-fill tvs-s-fill'); track.appendChild(fill);
    if (opt.alpha) fill.style.display = 'none';
    const knob = mk('div', 'tvs-s-knob'); root.appendChild(track); root.appendChild(knob);
    let dragging = false; let dis = false;
    const KN = 14;
    function render() {
      const f = Math.max(0, Math.min(1, value / 100));
      knob.style.left = 'calc(' + f + ' * (100% - ' + KN + 'px))';
      fill.style.width = 'calc(' + f + ' * (100% - ' + KN + 'px) + ' + KN / 2 + 'px)';
      root.setAttribute('aria-valuenow', String(Math.round(value)));
      if (opt.onRender) opt.onRender(value);
    }
    function fromEvent(e) {
      const r = root.getBoundingClientRect(); const k = (r.width / root.offsetWidth) || 1;
      const f = (e.clientX - r.left - (KN / 2) * k) / (r.width - KN * k);
      const v = Math.round(Math.max(0, Math.min(1, f)) * 100);
      if (v !== value) { value = v; render(); onChange(v); }
    }
    root.addEventListener('pointerdown', e => {
      if (dis) return; dragging = true; root.classList.add('dragging');
      try { root.setPointerCapture(e.pointerId); } catch (x) {} fromEvent(e); e.preventDefault();
    });
    root.addEventListener('pointermove', e => { if (dragging) fromEvent(e); });
    const end = e => { dragging = false; root.classList.remove('dragging'); try { root.releasePointerCapture(e.pointerId); } catch (x) {} };
    root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
    root.addEventListener('keydown', e => {
      if (dis) return; let v = value;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = Math.max(0, value - 5);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = Math.min(100, value + 5);
      else if (e.key === 'Home') v = 0; else if (e.key === 'End') v = 100; else return;
      e.preventDefault(); if (v !== value) { value = v; render(); onChange(v); }
    });
    render();
    return { el: root, setDisabled(d) { dis = d; root.tabIndex = d ? -1 : 0; }, set(v) { value = v; render(); }, get value() { return value; } };
  }

  // ---- حقل رقمي
  function NumField(opt) {
    // opt: path, min, max, step, wide, combo (قائمة أحجام), suffix, suffixCls, float, disabled
    const box = mk('div', 'tvs-numbox' + (opt.wide ? ' wide' : ''));
    const inp = mk('input'); inp.type = 'text'; inp.inputMode = opt.float ? 'decimal' : 'numeric'; inp.value = String(getp(opt.path));
    box.appendChild(inp);
    const commit = () => {
      let v = opt.float ? parseFloat(inp.value) : parseInt(inp.value, 10);
      if (!isFinite(v)) v = getp(opt.path);
      if (opt.min != null) v = Math.max(opt.min, v); if (opt.max != null) v = Math.min(opt.max, v);
      inp.value = String(v); setp(opt.path, v);
    };
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { commit(); e.stopPropagation(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const d = (opt.step || 1) * (e.key === 'ArrowUp' ? 1 : -1); inp.value = String((parseFloat(inp.value) || 0) + d); commit(); }
    });
    let dd = null;
    if (opt.combo) {
      const ch = mk('span', '', SVG.chev); box.appendChild(ch);
      dd = Dropdown({ options: opt.combo.map(n => [String(n), String(n)]), value: String(getp(opt.path)), menu: false, onChange: v => { inp.value = v; commit(); }, maxHeight: 360 });
      dd.el.style.display = 'none'; box.appendChild(dd.el);
      ch.addEventListener('click', e => { e.stopPropagation(); box.__ddOpen(); });
      box.__ddOpen = () => { if (box.classList.contains('disabled')) return; const real = dd; real.el.style.display = ''; real.el.style.position = 'absolute'; real.el.style.opacity = '0'; real.el.style.pointerEvents = 'none'; real.el.style.inset = '0'; real.el.click(); };
    }
    const api = { el: box, setDisabled(d) { inp.readOnly = d; inp.tabIndex = d ? -1 : 0; }, input: inp };
    if (opt.disabled) setDisabled(api, true);
    return api;
  }

  // ---- بناء الأقسام والصفوف
  let panelBuf = null;
  const add = el => panelBuf.appendChild(el);
  function sec(text) { add(mk('div', 'tvs-sec', text)); }
  function note(text) { add(mk('div', 'tvs-note', text)); }
  function infoIcon() { const i = mk('span', 'tvs-info', '؟'); i.setAttribute('aria-hidden', 'true'); return i; }
  function mark(tab, label, why) { unlinkedList.push({ tab, label, why: why || 'يحتاج تطويراً منفصلاً' }); }
  let curTab = '';
  function unlinked(label, why) { if (!unlinkedSeen[curTab + '|' + label]) { unlinkedSeen[curTab + '|' + label] = 1; mark(curTab, label, why); } }
  const unlinkedSeen = {};

  function item(opt) {
    // opt: label, path (checkbox), info, desc, ctls[], sub (0|1|2), dd(bool), onCheck, depends(bool), unlinked(why)
    const wrap = mk('div', 'tvs-item');
    const row = mk('div', 'tvs-row' + (opt.sub === 1 ? ' sub' : opt.sub === 2 ? ' sub2' : '') + (opt.ctls && opt.ctls.length ? ' has-ctl' : '') + (opt.dd ? ' dd' : ''));
    const lw = mk('div', 'tvs-lbl-wrap');
    let chk = null;
    if (opt.path) {
      chk = Checkbox(!!getp(opt.path), v => { setp(opt.path, v); if (opt.depends) deps.forEach(c => setDisabled(c, !v)); if (opt.onCheck) opt.onCheck(v); });
      lw.appendChild(chk);
    }
    const lbl = mk('span', 'tvs-lbl' + (opt.path ? ' click' : '') + (opt.wrapLabel ? ' wrap' : ''), '');
    lbl.textContent = opt.label || '';
    if (opt.path) lbl.addEventListener('click', () => chk.click());
    lw.appendChild(lbl);
    if (opt.info) lw.appendChild(infoIcon());
    row.appendChild(lw);
    const deps = [];
    if (opt.ctls && opt.ctls.length) {
      const cw = mk('div', 'tvs-ctls');
      opt.ctls.forEach(c => { cw.appendChild(c.el || c); if (opt.depends && c.el !== undefined) deps.push(c); else if (opt.depends) deps.push({ el: c }); });
      row.appendChild(cw);
      if (opt.depends) deps.forEach(c => setDisabled(c, !getp(opt.path)));
    }
    wrap.appendChild(row);
    if (opt.desc) wrap.appendChild(mk('div', 'tvs-desc', opt.desc));
    if (opt.unlinked) unlinked(opt.label || opt.desc || opt.path, opt.unlinked);
    add(wrap);
    return { wrap, chk, deps };
  }
  function dd(path, options, extra) {
    extra = extra || {};
    return Dropdown(Object.assign({ options, value: getp(path), onChange: v => { setp(path, v); if (extra.after) extra.after(v); } }, extra));
  }

  // ---------------------------------------------------------- التبويبات
  function renderTab(id) {
    if (panelEl && curTab) scrollPos[curTab] = panelEl.scrollTop;
    closeDD(); try { global.UnifiedColorPicker && global.UnifiedColorPicker.close && global.UnifiedColorPicker.close(); } catch (e) {}
    activeTab = id; curTab = id; panelEl.dataset.tab = id;
    panelEl.innerHTML = ''; panelBuf = panelEl;
    tabsEl.querySelectorAll('.tvs-tab').forEach(t => { const on = t.dataset.id === id; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); });
    ({ symbol: tabSymbol, statusline: tabStatus, scales: tabScales, canvas: tabCanvas, trading: tabTrading, alerts: tabAlerts, events: tabEvents })[id]();
    panelEl.scrollTop = scrollPos[id] || 0;
    fit();
  }

  // ---- رمز
  function tabSymbol() {
    sec('شموع');
    item({ label: 'تلوين الأعمدة طبقًا للإغلاق السابق', path: 'colorByPrevClose', unlinked: 'تلوين الشمعة حسب الإغلاق السابق يتطلب لون لكل شمعة (color لكل نقطة بيانات) ولا يوجد ذلك في محرك البيانات الحالي' });
    const pair = (upK, dnK) => { const u = ColorBtn(upK), d = ColorBtn(dnK); return [u, d]; };
    const candleRow = (label, visUp, visDn, upC, dnC) => {
      const r = item({ label, path: visUp, ctls: pair(upC, dnC), depends: true, onCheck: v => { setp(visDn, v); } });
      return r;
    };
    candleRow('الجزء الرئيسي', 'bodyUpVisible', 'bodyDownVisible', 'upColor', 'downColor');
    candleRow('إطارات', 'borderUpVisible', 'borderDownVisible', 'borderUpColor', 'borderDownColor');
    candleRow('ظل الشمعة', 'wickUpVisible', 'wickDownVisible', 'wickUpColor', 'wickDownColor');
    sec('تعديل البيانات');
    item({ label: 'استخدم التسوية في أقرب وقت على الفاصل الزمني اليومي', path: 'adjustSettlement', info: true, unlinked: 'تسوية العقود الآجلة غير موجودة في مصدر البيانات الحالي (بيانات M1 فورية)' });
    item({ label: 'ضبط لتغييرات العقود', path: 'adjustContracts', info: true, unlinked: 'لا توجد عقود آجلة/تبديل عقود في مصدر البيانات الحالي' });
    item({ label: 'الدقة', dd: true, ctls: [dd('precisionMode', PRECISIONS, { width: 203, maxHeight: 700, after: () => {} })] });
    const tzOpts = TIMEZONES.map(t => [t[0], tzLabel(t)]);
    item({ label: 'توقيت', dd: true, ctls: [dd('timezone', tzOpts, { width: 203, maxHeight: 800 })] });
  }

  // ---- خط الحالة
  function tabStatus() {
    sec('الأداة');
    const S = 'statusLine.';
    item({ label: 'الشعار', path: S + 'logo', unlinked: 'لا توجد شعارات رموز في المشروع' });
    const titleDD = dd(S + 'titleMode', [['name', 'الاسم'], ['ticker', 'رمز'], ['both', 'الرمز والاسم']], { width: 205 });
    item({ label: 'عنوان', path: S + 'title', ctls: [titleDD], depends: true, dd: true });
    item({ label: 'قيم الرسم البياني', path: S + 'ohlc' });
    item({ label: 'قيمة التغير للعمود', path: S + 'change' });
    item({ label: 'حجم التداول', path: S + 'volume' });
    item({ label: 'قيم تغيير اليوم الأخير', path: S + 'lastDayChange' });
    item({ label: 'أزرار الشراء/البيع', path: S + 'buySell', desc: 'يعرض أزرار البيع والشراء مباشرة على الرسم البياني', unlinked: 'أزرار بيع/شراء على الشارت (بأسعار Bid/Ask) غير موجودة؛ لوحة التداول الورقي الحالية منفصلة' });
    const sl = Slider(getp(S + 'bgAlpha'), v => setp(S + 'bgAlpha', v), { alpha: true });
    item({ label: 'الخلفية', path: S + 'bgOn', ctls: [sl], depends: true });
    sec('المؤشرات (من خيارات المشروع الحالية)');
    item({ label: 'عناوين المؤشرات', path: S + 'indTitles' });
    item({ label: 'مدخلات المؤشرات', path: S + 'indInputs' });
    item({ label: 'قيم المؤشرات', path: S + 'indicatorValues' });
    item({ label: 'خلفية المؤشرات', path: S + 'indBackground' });
  }

  // ---- المقاييس والخطوط
  function tabScales() {
    sec('مقياس الأسعار');
    item({ label: 'العملة والوحدة', dd: true, ctls: [dd('currencyUnit', VIS3, { width: 245 })], unlinked: 'لا يوجد زر عملة/وحدة على مقياس السعر' });
    item({ label: 'أوضاع المقياس (A و L)', dd: true, ctls: [dd('scaleModeButtons', VIS3, { width: 245 })], unlinked: 'أزرار A/L على المقياس غير موجودة (وضع المقياس نفسه يعمل من القائمة أدناه)' });
    const lockNum = NumField({ path: 'lockRatioValue', wide: true, float: true, disabled: true });
    item({ label: 'قفل نسبة السعر للعمود البياني', path: 'lockRatio', wrapLabel: true, ctls: [lockNum], depends: true, unlinked: 'قفل نسبة السعر/الأعمدة غير مدعوم في محرك الشارت' });
    item({ label: 'وضع المقاييس', dd: true, ctls: [dd('scaleMode', [['normal', 'تلقائي'], ['log', 'لوغاريتمي'], ['percent', 'نسبة مئوية'], ['indexed', 'مفهرس إلى 100']], { width: 205 })] });
    sec('ملصقات وخطوط الأسعار');
    item({ label: 'بدون ملصقات متداخلة', path: 'noOverlapLabels', unlinked: 'تجنّب تداخل الملصقات غير متاح في lightweight-charts' });
    item({ label: 'زر زائد', path: 'plusButton', info: true, unlinked: 'زر «+» عند مؤشر التقاطع غير موجود' });
    item({ label: 'العد التنازلي لإغلاق العمود البياني', path: 'barCountdown', unlinked: 'عدّاد إغلاق الشمعة غير موجود على الشارت' });
    const symDD = dd('symbolLabelMode', [['both', 'قيمة، خط'], ['value', 'قيمة'], ['line', 'خط'], ['none', 'مخفي']], { width: 245 });
    const symCombo = ComboBtn({ path: 'symbolLineColor', diag: true });
    item({ label: 'رمز', dd: true, ctls: [symDD, symCombo] });
    item({ label: '', dd: true, ctls: [dd('symbolLabelValue', [['scale', 'القيمة حسب المقياس']], { width: 245 })] });
    item({ label: 'أعلى وأدنى', dd: true, ctls: [dd('hiLoMode', [['hidden', 'مخفي']], { width: 245 }), (() => { const c = mk('button', 'tvs-combo is-disabled', '<span class="ln gray"></span><span class="sq diag"></span>'); c.querySelector('.sq').style.setProperty('--sw-a', '#16A97D'); c.querySelector('.sq').style.setProperty('--sw-b', '#E3224F'); return { el: c }; })()], unlinked: 'خطوط أعلى/أدنى سعر غير موجودة' });
    const bid = ColorBtn('bidColor'), ask = ColorBtn('askColor');
    item({ label: 'سعر البيع والشراء', dd: true, ctls: [dd('bidAskMode', [['hidden', 'مخفي']], { width: 245 }), bid, ask], unlinked: 'لا توجد أسعار Bid/Ask في مصدر البيانات (شموع OHLC فقط)' });
    sec('مقياس الوقت');
    item({ label: 'يوم الأسبوع على الملصقات', path: 'weekdayOnLabels' });
    item({ label: 'تنسيق التاريخ', dd: true, ctls: [dd('dateFormat', DATE_FORMATS, { width: 205, maxHeight: 700 })] });
    item({ label: 'تنسيق الساعات', dd: true, ctls: [dd('hoursFormat', [['24', '24 ساعة'], ['12', '12 ساعة']], { width: 150 })] });
    item({ label: 'احفظ موضع الحافة اليسرى للمخطط عند تغيير الفاصل الزمني', path: 'keepLeftEdge', wrapLabel: true, unlinked: 'حفظ الحافة اليسرى عند تغيير الفاصل يتطلب تعديل منطق تحميل البيانات/الفريمات' });
    item({ label: 'السماح بتصغير العرض بدرجة أكبر', path: 'allowMoreZoomOut', info: true });
    sec('خيارات إضافية من المشروع الحالي');
    item({ label: 'إظهار الفجوات الزمنية (وقت بلا شمعة = فراغ)', path: 'showTimeGaps' });
    item({ label: 'عرض الثواني', path: 'secondsVisible' });
    item({ label: 'عكس المقياس', path: 'invertScale' });
    item({ label: 'مقياس السعر الأيمن', path: 'rightScaleVisible' });
    item({ label: 'مقياس السعر الأيسر', path: 'leftScaleVisible' });
  }

  // ---- لوحة
  function tabCanvas() {
    sec('أنماط الرسم البياني الأساسية');
    const bgBtn = ColorBtn('bgColor');
    const bg2 = ColorBtn('bgColor2');
    const bgType = dd('bgType', [['solid', 'ثابت'], ['gradient', 'تدرج']], { width: 150, after: v => { bg2.el.style.display = v === 'gradient' ? '' : 'none'; } });
    bg2.el.style.display = getp('bgType') === 'gradient' ? '' : 'none';
    item({ label: 'الخلفية', dd: true, ctls: [bgType, bgBtn, bg2] });
    const gridRow = (label, onK, colK, alK) => {
      const cb = ComboBtn({ path: colK, alphaPath: alK });
      return item({ label, path: onK, ctls: [cb], depends: true });
    };
    gridRow('خطوط الشبكة الرأسية', 'vGridVisible', 'vGridColor', 'vGridOpacity');
    gridRow('خطوط الشبكة الأفقية', 'hGridVisible', 'hGridColor', 'hGridOpacity');
    item({ label: 'مؤشر التقاطع', dd: true, ctls: [ComboBtn({ path: 'crosshairColor', lineCls: 'dashed gray' })] });
    item({ label: 'علامة مائية', dd: true, ctls: [dd('watermarkMode', [['none', 'مخفية'], ['symbol', 'الرمز'], ['replay', 'وضع إعادة التشغيل']], { width: 250 }), ColorBtn('watermarkColor', 'watermarkAlpha')] });
    sec('المقاييس');
    item({ label: 'النص', dd: true, ctls: [NumField({ path: 'canvasTextFontSize', min: 8, max: 40, combo: [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24] }), ColorBtn('textColor')] });
    item({ label: 'الخطوط', ctls: [ColorBtn('scaleLineColor', 'scaleLineAlpha')] });
    sec('أزرار');
    item({ label: 'تنقل', dd: true, ctls: [dd('navButtons', VIS3, { width: 175 })], unlinked: 'أزرار التنقل (الذهاب للنهاية/إعادة الضبط) غير موجودة على الشارت' });
    item({ label: 'جزء', dd: true, ctls: [dd('paneButtons', VIS3, { width: 175 })], unlinked: 'أزرار إدارة الأجزاء (Panes) غير موجودة' });
    sec('هوامش');
    const pct = (label, path) => item({ label, ctls: [NumField({ path, min: 0, max: 80 }), mk('span', 'tvs-unit', '%')] });
    pct('الأعلى', 'marginTop'); pct('الأسفل', 'marginBottom');
    item({ label: 'يمين', ctls: [NumField({ path: 'marginRight', min: 0, max: 200 }), mk('span', 'tvs-unit small', 'الأعمدة البيانية')] });
  }

  // ---- تداول
  function tabTrading() {
    const T = 'trading.';
    const U = 'ميزة التداول على الشارت (أوامر/مراكز حيّة) غير موجودة؛ المتوفر محاكي ورقي منفصل أثناء الريبلاي (tv-trade-ui.js)';
    sec('عام');
    item({ label: 'أزرار الشراء/البيع', path: T + 'buySell', desc: 'يعرض أزرار البيع والشراء مباشرة على الرسم البياني', unlinked: U });
    item({ label: 'تداول بنقرة واحدة', path: T + 'oneClick', info: true, desc: 'قم بتنفيذ الأوامر أو تعديلها أو إلغائها أو إغلاق المراكز فورًا دون تأكيد', unlinked: U });
    const spkWrap = mk('span', '', SVG.spkMute); const spk = spkWrap.firstChild;
    const vol = Slider(getp(T + 'volume'), v => { setp(T + 'volume', v); paintSpk(v); });
    function paintSpk(v) { const n = spk; const mute = v === 0; n.querySelectorAll('path')[0] && 0; spkWrap.innerHTML = mute ? SVG.spkMute : SVG.spk; }
    paintSpk(getp(T + 'volume'));
    const soundDD = dd(T + 'soundName', SOUNDS, { width: 205 });
    const r = item({ label: 'صوت التنفيذ', path: T + 'sound', ctls: [spkWrap, vol], depends: true, unlinked: 'صوت التنفيذ مرتبط بتنفيذ أوامر حيّة غير موجودة (المحاكي لا يبث حدث تنفيذ)' });
    r.deps.push({ el: spkWrap });
    item({ label: '', dd: true, ctls: [soundDD] }); const rdd = panelBuf.lastChild; r.deps.push(soundDD); setDisabled(soundDD, !getp(T + 'sound'));
    // ربط تفعيل الصوت بالقائمة
    r.chk.addEventListener('click', () => setDisabled(soundDD, !getp(T + 'sound')));
    item({ label: 'عرض إشعارات الرفض فقط', path: T + 'rejectOnly', unlinked: U });
    sec('المظهر');
    item({ label: 'المراكز والأوامر', path: T + 'positionsOrders', info: true, unlinked: U });
    item({ label: 'زر عكس المركز', path: T + 'reverseBtn', sub: 1, desc: 'يضيف زر الرجوع بجوار مركز الفتح على الرسم البياني', unlinked: U });
    item({ label: 'عناصر التحكم في التداول', sub: 1, dd: true, ctls: [dd(T + 'controls', VIS3, { width: 205 })], desc: 'يحدد مدى ظهور عناصر إجراءات التداول', unlinked: U });
    item({ label: 'أمر مُسقط لأوامر السوق', path: T + 'droppedOrder', desc: 'يعرض أمرًا مُسقطًا على الرسم البياني قبل إرسال أمر سوق.', unlinked: U });
    item({ label: 'قيمة الربح والخسارة', path: T + 'pnl', info: true, unlinked: U });
    item({ label: 'مراكز تداول', path: T + 'pnlPositions', sub: 1, ctls: [dd(T + 'pnlPositionsMode', PNL_MODES, { width: 205 })], depends: true, dd: true, unlinked: U });
    item({ label: 'أقواس', path: T + 'pnlBrackets', sub: 1, ctls: [dd(T + 'pnlBracketsMode', PNL_MODES, { width: 205 })], depends: true, dd: true, unlinked: U });
    item({ label: 'علامات التنفيذ', path: T + 'execMarks', info: true, unlinked: U });
    item({ label: 'تسميات التنفيذ', path: T + 'execLabels', sub: 1, unlinked: U });
    item({ label: 'خطوط أسعار ممتدة عبر عرض الرسم بالكامل', path: T + 'extendLines', wrapLabel: true, unlinked: U });
    item({ label: 'محاذاة الترتيب والموضع', dd: true, ctls: [dd(T + 'align', [['right', 'يمين'], ['left', 'يسار']], { width: 205 })], unlinked: U });
    item({ label: 'الأوامر والتنفيذات والمراكز في لقطات الرسم البياني', path: T + 'snapshots', wrapLabel: true, desc: 'يعرض صفقاتك على الرسم البياني على شكل لقطات', unlinked: U });
  }

  // ---- تنبيهات
  function tabAlerts() {
    const A = 'alertsUi.';
    sec('رؤية خط الرسم البياني');
    item({ label: 'خطوط التنبيه', path: A + 'lines', ctls: [ColorBtn(A + 'linesColor')], unlinked: 'التنبيهات الحالية (alerts.js) لا ترسم خطوطاً على الشارت' });
    item({ label: 'التنبيهات النشطة فقط', path: A + 'activeOnly', unlinked: 'مرتبط بخطوط التنبيه غير الموجودة' });
    sec('إشعارات');
    const spkWrap = mk('span', '', SVG.spk);
    const vol = Slider(getp(A + 'volume'), v => { setp(A + 'volume', v); spkWrap.innerHTML = v === 0 ? SVG.spkMute : SVG.spk; });
    spkWrap.innerHTML = getp(A + 'volume') === 0 ? SVG.spkMute : SVG.spk;
    const r = item({ label: 'حجم التنبيه', path: A + 'size', ctls: [spkWrap, vol], depends: true, unlinked: 'alerts.js لا يشغّل صوتاً للتنبيه (إشعار نصي فقط)' });
    r.deps.push({ el: spkWrap });
    item({ label: 'إخفاء «التوست» تلقائيًا', path: A + 'autoHideToast', info: true, unlinked: 'مدة التوست مضبوطة داخل alerts.js (5 ثوانٍ) ولا تقرأ هذا الإعداد' });
  }

  // ---- أحداث
  function tabEvents() {
    const E = 'events.';
    sec('أحداث');
    item({ label: 'الأفكار', path: E + 'ideas', info: true, ctls: [dd(E + 'ideasMode', [['all', 'جميع التحديثات']], { width: 205 })], depends: true, dd: true, unlinked: 'لا يوجد مصدر أفكار/منشورات في المشروع' });
    item({ label: 'تبديل العقود المستمر', path: E + 'continuousSwitch', unlinked: 'لا توجد عقود آجلة' });
    item({ label: 'فواصل تبديل العقود', path: E + 'switchBreaks', unlinked: 'لا توجد عقود آجلة' });
    item({ label: 'أحدث الأخبار', path: E + 'news', unlinked: 'لا يوجد مصدر أخبار' });
    item({ label: 'إشعار الأخبار', path: E + 'newsNotify', unlinked: 'لا يوجد مصدر أخبار' });
    sec('فواصل الجلسات (من خيارات المشروع الحالية)');
    item({ label: 'إظهار فواصل الجلسات', path: 'sessionBreaks', ctls: [ColorBtn('sessionBreakColor'), dd('sessionBreakStyle', [['solid', 'متصل'], ['dashed', 'متقطع'], ['dotted', 'منقط']], { width: 150 })], depends: true, dd: true });
  }

  // ---------------------------------------------------------- الهيكل والتفاعل
  function build() {
    overlayEl = mk('div'); overlayEl.id = 'tvSettingsOverlay'; overlayEl.className = 'hidden'; overlayEl.setAttribute('dir', 'rtl');
    overlayEl.innerHTML =
      '<div id="tvSettingsSheet" role="dialog" aria-modal="true" aria-label="إعدادات">' +
      '  <div class="tvs-header"><div class="tvs-title">إعدادات</div><button class="tvs-close" id="tvsClose" aria-label="إغلاق">' + SVG.close + '</button></div>' +
      '  <div class="tvs-main"><div class="tvs-tabs" id="tvsTabs" role="tablist"></div>' +
      '    <div class="tvs-panel-wrap"><div class="tvs-panel" id="tvsPanel"></div></div></div>' +
      '  <div class="tvs-footer" id="tvsFooter"><div class="tvs-tpl-slot"></div><div class="tvs-spacer"></div>' +
      '    <button class="tvs-btn primary" id="tvsOk">موافق</button><button class="tvs-btn secondary" id="tvsCancel">إلغاء</button></div>' +
      '  <div class="tvs-layer" id="tvsLayer"></div>' +
      '  <div class="tvs-modal hidden" id="tvsModal"><div class="tvs-modal-card"><h3>حفظ باسم…</h3><input class="tvs-text" id="tvsTplName" type="text" placeholder="اسم القالب" maxlength="40">' +
      '    <div class="tvs-modal-actions"><button class="tvs-btn primary" id="tvsTplSave">حفظ</button><button class="tvs-btn secondary" id="tvsTplCancel">إلغاء</button></div></div></div>' +
      '</div>';
    document.body.appendChild(overlayEl);
    sheetEl = overlayEl.querySelector('#tvSettingsSheet'); panelEl = overlayEl.querySelector('#tvsPanel'); tabsEl = overlayEl.querySelector('#tvsTabs');
    layerEl = overlayEl.querySelector('#tvsLayer'); modalEl = overlayEl.querySelector('#tvsModal');
    panelEl.id = 'tvsPanel'; panelEl.setAttribute('role', 'tabpanel');

    TABS.forEach(t => {
      const b = mk('button', 'tvs-tab', TAB_ICONS[t.id] + '<span>' + t.label + '</span>'); b.dataset.id = t.id; b.setAttribute('role', 'tab');
      b.addEventListener('click', () => renderTab(t.id));
      tabsEl.appendChild(b);
    });

    // زر «قالب» (قائمة تُفتح أسفل الزر، أو للأعلى إن لم تتسع)
    tplBtn = Dropdown({ template: true, menu: true, fixedLabel: 'قالب', options: [['defaults', 'تطبيق الإعدادات الافتراضية'], ['saveas', 'حفظ باسم...']], maxHeight: 260,
      onChange: v => { if (v === 'defaults') applyDefaultsToDraft(); else if (v === 'saveas') openSaveAs(); else if (v.indexOf('tpl:') === 0) loadTemplateIntoDraft(v.slice(4)); } });
    tplBtn.el.id = 'tvsTemplateBtn';
    overlayEl.querySelector('.tvs-tpl-slot').appendChild(tplBtn.el);

    overlayEl.querySelector('#tvsClose').addEventListener('click', cancel);
    overlayEl.querySelector('#tvsCancel').addEventListener('click', cancel);
    overlayEl.querySelector('#tvsOk').addEventListener('click', commit);
    overlayEl.querySelector('#tvsTplCancel').addEventListener('click', () => modalEl.classList.add('hidden'));
    overlayEl.querySelector('#tvsTplSave').addEventListener('click', saveAsConfirm);
    overlayEl.querySelector('#tvsTplName').addEventListener('keydown', e => { if (e.key === 'Enter') saveAsConfirm(); if (e.key === 'Escape') { e.stopPropagation(); modalEl.classList.add('hidden'); } });

    // إغلاق القوائم عند الضغط خارجها
    document.addEventListener('pointerdown', e => {
      if (!openDD || overlayEl.classList.contains('hidden')) return;
      const t = e.target;
      if (t.closest && (t.closest('.tvs-list') || t.closest('.tvs-dd'))) return;
      closeDD();
    }, true);
    panelEl.addEventListener('scroll', () => { if (openDD) closeDD(); }, { passive: true });
    document.addEventListener('keydown', e => {
      if (overlayEl.classList.contains('hidden')) return;
      if (e.key === 'Escape') { if (!modalEl.classList.contains('hidden')) { modalEl.classList.add('hidden'); return; } if (openDD) { closeDD(); return; } cancel(); }
    });
    global.addEventListener('resize', () => { if (!overlayEl.classList.contains('hidden')) { closeDD(); fit(); } });
    refreshTemplateMenu();
  }

  // تحجيم النافذة: على سطح المكتب نصغّرها بنفس النسبة عند ضيق العرض، وعلى الهاتف تخطيط مستقل.
  function fit() {
    if (!overlayEl) return;
    const vw = global.innerWidth, vh = global.innerHeight;
    const mobile = vw < 720;
    overlayEl.classList.toggle('tvs-mobile', mobile);
    if (mobile) { sheetEl.style.transform = ''; sheetEl.style.setProperty('--tvs-k', 1); sheetEl.style.maxHeight = ''; sheetEl.style.height = ''; return; }
    // أحجام حقيقية (بدون transform): العرض والارتفاع من CSS (min(66vw,1100px) و85vh)
    sheetEl.style.transform = ''; sheetEl.style.maxHeight = ''; sheetEl.style.height = '';
  }

  function open() {
    if (!overlayEl) return;
    draft = clone(state); backup = clone(state);
    overlayEl.classList.remove('hidden'); modalEl.classList.add('hidden');
    Object.keys(scrollPos).forEach(k => delete scrollPos[k]);
    fit(); renderTab('symbol'); refreshTemplateMenu();
    const first = tabsEl.querySelector('.tvs-tab.active'); if (first) first.focus({ preventScroll: true });
  }
  function hide() { closeDD(); try { global.UnifiedColorPicker && global.UnifiedColorPicker.close && global.UnifiedColorPicker.close(); } catch (e) {} overlayEl.classList.add('hidden'); }
  function cancel() { draft = null; hide(); }
  function commit() {
    state = sanitize(mergeDeep(defaults, draft)); draft = null;
    saveState(); applyAll(); hide();
  }
  function close() { cancel(); }

  // ---------------------------------------------------------- القوالب
  function templateIndex() { try { return JSON.parse(localStorage.getItem(TEMPLATE_INDEX_KEY) || '[]'); } catch (e) { return []; } }
  function refreshTemplateMenu() {
    if (!tplBtn) return;
    const opts = [['defaults', 'تطبيق الإعدادات الافتراضية'], ['saveas', 'حفظ باسم...']];
    const idx = templateIndex();
    if (idx.length) { opts.push('-'); idx.forEach(n => opts.push(['tpl:' + n, n])); }
    tplBtn.el.__opts = opts;
    // نعيد بناء الخيارات عبر إعادة إنشاء الكائن (الخيارات داخل الإغلاق)
    const slot = overlayEl.querySelector('.tvs-tpl-slot'); const old = tplBtn.el;
    const nu = Dropdown({ template: true, menu: true, fixedLabel: 'قالب', options: opts, maxHeight: 300,
      onChange: v => { if (v === 'defaults') applyDefaultsToDraft(); else if (v === 'saveas') openSaveAs(); else if (v.indexOf('tpl:') === 0) loadTemplateIntoDraft(v.slice(4)); } });
    nu.el.id = 'tvsTemplateBtn'; slot.replaceChild(nu.el, old); tplBtn = nu;
  }
  function applyDefaultsToDraft() {
    // يطبّق القيم الافتراضية على المسوّدة؛ لا يُحفظ شيء حتى «موافق».
    draft = clone(defaults); renderTab(activeTab);
  }
  function openSaveAs() { modalEl.classList.remove('hidden'); const i = overlayEl.querySelector('#tvsTplName'); i.value = ''; setTimeout(() => i.focus(), 20); }
  function saveAsConfirm() {
    const name = overlayEl.querySelector('#tvsTplName').value.trim(); if (!name) return;
    const idx = templateIndex(); if (idx.indexOf(name) < 0) idx.push(name);
    try { localStorage.setItem(TEMPLATE_INDEX_KEY, JSON.stringify(idx)); localStorage.setItem('tv_settings_template_' + name, JSON.stringify(draft)); } catch (e) {}
    modalEl.classList.add('hidden'); refreshTemplateMenu();
  }
  function loadTemplateIntoDraft(name) {
    try { const data = JSON.parse(localStorage.getItem('tv_settings_template_' + name)); if (data) { draft = sanitize(mergeDeep(defaults, data)); renderTab(activeTab); } } catch (e) {}
  }

  // ---------------------------------------------------------- الربط بزر الإعدادات الحالي
  function bindSettingsButton() {
    const oldBtn = document.getElementById('settingsBtn');
    if (!oldBtn) { setTimeout(bindSettingsButton, 300); return; }
    // استبدال الزر يزيل أي مستمعين قدامى (settings.js القديم) دون تعديل ذلك الملف.
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    newBtn.id = 'settingsBtn';
    newBtn.addEventListener('click', open);
  }

  function applyTimezoneShift() { applyAll(); }

  // استعادة مرئية صريحة عند اختفاء الشموع/المحاور بسبب إعداد محفوظ (تستدعيها لوحة التشخيص).
  function repairVisuals() {
    state.bodyUpVisible = state.bodyDownVisible = true;
    state.borderVisible = state.borderUpVisible = state.borderDownVisible = true;
    state.wickVisible = state.wickUpVisible = state.wickDownVisible = true;
    state.rightScaleVisible = state.priceScaleVisible = state.timeScaleAxisVisible = true;
    saveState(); applyAll();
    const chart = global.chart, series = global.candleSeries;
    try {
      if (series) series.applyOptions({ visible: true, priceScaleId: 'right', upColor: state.upColor, downColor: state.downColor, borderVisible: true,
        borderUpColor: state.borderUpColor, borderDownColor: state.borderDownColor, wickVisible: true, wickUpColor: state.wickUpColor, wickDownColor: state.wickDownColor });
    } catch (e) { reportSettingsError('استعادة الشموع', e); }
    try {
      if (chart) {
        chart.applyOptions({ rightPriceScale: { visible: true, autoScale: true }, timeScale: { visible: true } });
        const data = series && series.data ? series.data() : [];
        if (data.length) chart.timeScale().fitContent();
      }
    } catch (e) { reportSettingsError('استعادة المحاور والعرض', e); }
    return true;
  }

  function init() {
    build();
    applyAll();
    bindSettingsButton();
    // عند تبديل الرمز يعيد backtest.js ضبط دقة السعر الخاصة بالرمز؛ نعيد تطبيق اختيار المستخدم الصريح بعده.
    const ps = document.getElementById('pairSelect');
    if (ps) ps.addEventListener('change', () => {
      [700, 2500].forEach(ms => setTimeout(() => {
        try { if (global.candleSeries) global.candleSeries.applyOptions({ priceFormat: priceFormatOpts() }); } catch (e) {}
      }, ms));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.TVSettings = {
    open, close, repairVisuals, apply: applyAll,
    getState: () => Object.assign({}, state),
    tzOffsetHours: tz => tzOffsetHours(tz),
    unlinked: () => { if (!unlinkedList.length) { /* تُملأ عند أول رسم لكل تبويب */ } return unlinkedList.slice(); },
    _defaults: () => clone(defaults)
  };

})(window);
