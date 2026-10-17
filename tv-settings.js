/* =========================================================================
   tv-settings.js — نظام إعدادات TradingView الكامل (Bottom Sheet)

   يحل محل settingsBtn القديم بالكامل. يستخدم نفس مفتاح localStorage
   ("chartSettings_v1") المستخدم بـ settings.js القديم حتى تبقى القيم
   متوافقة، ويبث نفس حدث "tvCloneChartSettingsChanged" المستخدم أصلاً
   لمزامنة الإعدادات بين شاشات multichart.js.

   Load this AFTER settings.js and multichart.js.
   ========================================================================= */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'chartSettings_v1';
  const TEMPLATE_INDEX_KEY = 'tv_settings_templates_v1';

  const IANA_TIMEZONES = [
    ['UTC', 'UTC'], ['America/New_York', 'نيويورك (UTC-4)'], ['America/Chicago', 'شيكاغو (UTC-5)'],
    ['America/Los_Angeles', 'لوس أنجلوس (UTC-7)'], ['America/Sao_Paulo', 'ساو باولو (UTC-3)'],
    ['Europe/London', 'لندن (UTC+1)'], ['Europe/Paris', 'باريس (UTC+2)'], ['Europe/Moscow', 'موسكو (UTC+3)'],
    ['Africa/Cairo', 'القاهرة (UTC+2)'], ['Asia/Dubai', 'دبي (UTC+4)'], ['Asia/Karachi', 'كراتشي (UTC+5)'],
    ['Asia/Colombo', 'كولومبو (UTC+5:30)'], ['Asia/Kathmandu', 'كاتماندو (UTC+5:45)'], ['Asia/Dhaka', 'داكا (UTC+6)'],
    ['Asia/Yangon', 'يانجون (UTC+6:30)'], ['Asia/Bangkok', 'بانكوك (UTC+7)'], ['Asia/Jakarta', 'جاكرتا (UTC+7)'],
    ['Asia/Shanghai', 'شنغهاي (UTC+8)'], ['Asia/Singapore', 'سنغافورة (UTC+8)'], ['Asia/Tokyo', 'طوكيو (UTC+9)'],
    ['Asia/Seoul', 'سيول (UTC+9)'], ['Australia/Sydney', 'سيدني (UTC+10)'], ['Pacific/Auckland', 'أوكلاند (UTC+13)']
  ];

  const SESSIONS = [
    ['24h', '24 ساعة'], ['tokyo', 'جلسة طوكيو'], ['london', 'جلسة لندن'],
    ['newyork', 'جلسة نيويورك'], ['syd_tok', 'سيدني-طوكيو'], ['custom', 'مخصصة']
  ];

const defaults = {
    seriesType: 'candles',
    
    upColor: '#26a69a', downColor: '#ef5350', bodyUpVisible: true, bodyDownVisible: true,
  borderVisible: true, borderUpColor: '#26a69a', borderDownColor: '#ef5350', borderUpVisible: true, borderDownVisible: true,
  wickVisible: true, wickUpColor: '#26a69a', wickDownColor: '#ef5350', wickUpVisible: true, wickDownVisible: true,
  borderThickness: 1, wickThickness: 1,
    
    precision: 2, bgColor: '#ffffff', gridColor: '#e0e3eb', gridVisible: true,
    textColor: '#131722', timezoneOffset: 0,

    timezone: 'UTC', session: '24h',
    
  scaleMode: 'normal', invertScale: false, scaleOnly: false, lockScale: false,
  rightScaleVisible: true, leftScaleVisible: false,
    
   watermarkVisible: true, watermarkText: '', watermarkOpacity: 6,
  logoVisible: false, backgroundImageUrl: '',
  marginTop: 10, marginBottom: 8,
  crosshairColor: '#787b86', crosshairStyle: 'dashed', crosshairWidth: 1, crosshairOpacity: 100,
    
statusLine: { symbol: true, description: false, ohlc: true, change: true, volume: false, lastDayChange: false, indicatorValues: true, indTitles: true, indInputs: false, indBackground: true, session: false, fontSize: 12, textColor: '#d7dde8', position: 'top-left' },
theme: 'tvlight',
events: { earnings: false, dividends: false, splits: false },

timeVisible: true, secondsVisible: false, weekendSeparation: false, sessionBreaks: false, sessionBreakColor: '#2962FF', sessionBreakStyle: 'dashed',
  barSpacing: 6, rightOffset: 20, zoomSpeed: 100,
  
  bgType: 'solid', bgColor2: '#1e222d', bgGradientDir: 'vertical',
  vGridVisible: true, vGridColor: '#e0e3eb', vGridOpacity: 100, vGridWidth: 1,
  hGridVisible: true, hGridColor: '#e0e3eb', hGridOpacity: 100, hGridWidth: 1,
  priceScaleVisible: true, priceScaleTextColor: '#131722', priceScaleFontSize: 12, priceScaleLineWidth: 1,
  timeScaleAxisVisible: true, timeScaleTextColor: '#131722', timeScaleFontSize: 12,
  canvasTextFontSize: 12
};

  let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const merged = Object.assign({}, defaults, parsed);
    merged.statusLine = Object.assign({}, defaults.statusLine, parsed.statusLine || {});
    merged.events = Object.assign({}, defaults.events, parsed.events || {});
    return merged;
  } catch (e) { return JSON.parse(JSON.stringify(defaults)); }
}
  
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

const THEME_PRESETS = {
  dark: { bgColor: '#180F24', gridColor: '#2b2138', textColor: '#d1d4dc' },
  light: { bgColor: '#ffffff', gridColor: '#e6e6e6', textColor: '#131722' },
  tvdark: { bgColor: '#131722', gridColor: '#2a2e39', textColor: '#d1d4dc' },
  tvlight: { bgColor: '#ffffff', gridColor: '#e0e3eb', textColor: '#131722' }
};

  // العلامة المائية: في lightweight-charts v5 أُزيل خيار watermark وحلّ محلّه plugin؛ نستخدمه إن وُجد
  // وإلا (v4) نرجع للخيار القديم.
  let wmPlugin = null;
  function applyWatermark() {
    const chart = global.chart; if (!chart || !global.LightweightCharts) return;
    const text = state.watermarkVisible ? (state.watermarkText || '') : '';
    const color = hexToRgbaLocal(state.textColor, (state.watermarkOpacity || 6) / 100);
    if (typeof LightweightCharts.createTextWatermark === 'function' && chart.panes) {
      try {
        if (wmPlugin) { wmPlugin.detach(); wmPlugin = null; }
        if (text) wmPlugin = LightweightCharts.createTextWatermark(chart.panes()[0], { horzAlign: 'center', vertAlign: 'center', lines: [{ text, color, fontSize: 48 }] });
      } catch (e) { console.error('watermark', e); }
    } else {
      try { chart.applyOptions({ watermark: { visible: !!text, color, text } }); } catch (e) {}
    }
  }

  // ---------------------------------------------------------- تطبيق الإعدادات فعلياً
  function applyAll() {
    const chart = global.chart, series = global.candleSeries;
    
if (series) {
  series.applyOptions({
    upColor: state.bodyUpVisible ? state.upColor : 'rgba(0,0,0,0)',
    downColor: state.bodyDownVisible ? state.downColor : 'rgba(0,0,0,0)',
    borderVisible: state.borderUpVisible || state.borderDownVisible,
    borderUpColor: state.borderUpVisible ? state.borderUpColor : 'rgba(0,0,0,0)',
    borderDownColor: state.borderDownVisible ? state.borderDownColor : 'rgba(0,0,0,0)',
    wickVisible: state.wickUpVisible || state.wickDownVisible,
    wickUpColor: state.wickUpVisible ? state.wickUpColor : 'rgba(0,0,0,0)',
    wickDownColor: state.wickDownVisible ? state.wickDownColor : 'rgba(0,0,0,0)',
    priceFormat: { type: 'price', precision: state.precision, minMove: 1 / Math.pow(10, state.precision) }
  });
}
    
    
if (chart) {
  const crosshairRgba = hexToRgbaLocal(state.crosshairColor, state.crosshairOpacity / 100);
  const bgLayout = state.bgType === 'gradient' ?
    { type: 'gradient', topColor: state.bgColor, bottomColor: state.bgColor2 } /* المكتبة تدعم التدرج العمودي فقط */ :
    { type: 'solid', color: state.bgColor };
  chart.applyOptions({
        layout: { background: bgLayout, textColor: state.textColor, fontSize: state.canvasTextFontSize },
        grid: {
          vertLines: { color: hexToRgbaLocal(state.vGridColor, state.vGridOpacity / 100), visible: state.vGridVisible },
          horzLines: { color: hexToRgbaLocal(state.hGridColor, state.hGridOpacity / 100), visible: state.hGridVisible }
        },
        
        crosshair: {
          vertLine: { color: crosshairRgba, width: state.crosshairWidth, style: state.crosshairStyle === 'solid' ? LightweightCharts.LineStyle.Solid : state.crosshairStyle === 'dotted' ? LightweightCharts.LineStyle.Dotted : LightweightCharts.LineStyle.Dashed },
          horzLine: { color: crosshairRgba, width: state.crosshairWidth, style: state.crosshairStyle === 'solid' ? LightweightCharts.LineStyle.Solid : state.crosshairStyle === 'dotted' ? LightweightCharts.LineStyle.Dotted : LightweightCharts.LineStyle.Dashed }
        },
    
  
  
  
timeScale: {
    borderColor: state.gridColor,
    visible: state.timeScaleAxisVisible,
    timeVisible: state.timeVisible,
    secondsVisible: state.secondsVisible,
    barSpacing: state.barSpacing,
    rightOffset: state.rightOffset
  },
  rightPriceScale: {
    visible: state.rightScaleVisible && state.priceScaleVisible,
    borderColor: state.gridColor,
    borderVisible: state.priceScaleLineWidth > 0,
    mode: state.scaleMode === 'log' ? LightweightCharts.PriceScaleMode.Logarithmic :
      state.scaleMode === 'percent' ? LightweightCharts.PriceScaleMode.Percentage :
      state.scaleMode === 'indexed' ? LightweightCharts.PriceScaleMode.IndexedTo100 :
      LightweightCharts.PriceScaleMode.Normal,
    invertScale: state.invertScale,
    scaleMargins: { top: state.marginTop / 100, bottom: state.marginBottom / 100 },
    textColor: state.priceScaleTextColor
  },
  leftPriceScale: {
    visible: state.leftScaleVisible,
    borderColor: state.gridColor,
    textColor: state.priceScaleTextColor
  }
});
  
}
    applyWatermark();
    document.body.style.background = state.bgColor;
document.documentElement.style.setProperty('--tv-chart-bg-color', state.bgColor);
updateStatusLineDOM();
    try { global.dispatchEvent(new CustomEvent('tvCloneChartSettingsChanged', { detail: Object.assign({}, state) })); } catch (e) {}
  }

  // ---------------------------------------------------------- شريط الحالة (Status Line) فوق الشارت
  function updateStatusLineDOM() {
    let bar = document.getElementById('tvStatusLine');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'tvStatusLine';
      const chartEl = document.getElementById('chart');
      if (chartEl && chartEl.parentNode) chartEl.parentNode.insertBefore(bar, chartEl);
    }
    const sl = state.statusLine;
    const parts = [];
    const pairSelect = document.getElementById('pairSelect');
    const symTxt = pairSelect ? pairSelect.options[pairSelect.selectedIndex].textContent : '';
    if (sl.symbol) parts.push('<b>' + symTxt + '</b>');
    if (sl.description) parts.push('<span class="tv-sl-dim">' + symTxt + '</span>');
    const bs = global.getBacktestState ? global.getBacktestState() : null;
    const bar1 = bs && bs.allData && bs.allData.length ? bs.allData[bs.allData.length - 1] : null;
    if (bar1 && sl.ohlc) {
      parts.push('O<span class="tv-sl-val">' + bar1.open.toFixed(state.precision) + '</span>');
      parts.push('H<span class="tv-sl-val">' + bar1.high.toFixed(state.precision) + '</span>');
      parts.push('L<span class="tv-sl-val">' + bar1.low.toFixed(state.precision) + '</span>');
      parts.push('C<span class="tv-sl-val">' + bar1.close.toFixed(state.precision) + '</span>');
    }
    if (bar1 && sl.change) {
      const chg = bar1.close - bar1.open;
      const pct = bar1.open ? (chg / bar1.open) * 100 : 0;
      const cls = chg >= 0 ? 'tv-sl-pos' : 'tv-sl-neg';
      parts.push('<span class="' + cls + '">' + (chg >= 0 ? '+' : '') + chg.toFixed(state.precision) + ' (' + (chg >= 0 ? '+' : '') + pct.toFixed(2) + '%)</span>');
    }
bar.innerHTML = parts.join(' ');
bar.style.display = parts.length ? 'flex' : 'none';
bar.style.fontSize = (sl.fontSize || 12) + 'px';
bar.style.color = sl.textColor || '#d7dde8';
bar.classList.remove('tv-sl-pos-left', 'tv-sl-pos-center', 'tv-sl-pos-right');
bar.classList.add('tv-sl-pos-' + (sl.position === 'top-center' ? 'center' : sl.position === 'top-right' ? 'right' : 'left'));
  }
  setInterval(updateStatusLineDOM, 1000);

  // ---------------------------------------------------------- بناء الواجهة
const TABS = [
  { id: 'symbol', label: 'الرمز', icon: '\u{1F4CA}' },
  { id: 'statusline', label: 'خط الحالة', icon: '\u2261' },
  { id: 'scales', label: 'المقاييس', icon: '\u2195' },
  { id: 'appearance', label: 'المظهر', icon: '\u{1F3A8}' },
  { id: 'trading', label: 'التداول', icon: '\u{1F4C8}' },
  { id: 'alerts', label: 'التنبيهات', icon: '\u{1F514}' },
  { id: 'events', label: 'الأحداث', icon: '\u{1F4C5}' },
  { id: 'canvas', label: 'اللوحة', icon: '\u270F\uFE0F' },
  { id: 'timescale', label: 'المحور الزمني', icon: '\u{1F551}' }
];

  let overlayEl, bodyEl, tabsEl, backup;

function hexToRgbaLocal(hex, alpha) {
    let h = (hex || '#787b86').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha == null ? 1 : alpha) + ')';
  }

function bindDraggable(handle, sheet) {
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.tvs-close')) return;
      dragging = true;
      const rect = sheet.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startLeft = rect.left; startTop = rect.top;
      sheet.style.margin = '0';
      sheet.style.position = 'fixed';
      sheet.style.left = startLeft + 'px';
      sheet.style.top = startTop + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const w = sheet.offsetWidth, h = sheet.offsetHeight;
      const left = Math.max(4, Math.min(startLeft + dx, window.innerWidth - w - 4));
      const top = Math.max(4, Math.min(startTop + dy, window.innerHeight - h - 4));
      sheet.style.left = left + 'px';
      sheet.style.top = top + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  function build() {
    overlayEl = document.createElement('div');
    overlayEl.id = 'tvSettingsOverlay';
    overlayEl.className = 'hidden';
    overlayEl.innerHTML =
      '<div id="tvSettingsSheet">' +
      '  <div class="tvs-header">' +
      '    <button class="tvs-close" id="tvsClose">\u2715</button>' +
      '    <div class="tvs-title">إعدادات</div>' +
      '  </div>' +
      '  <div class="tvs-body">' +
      '    <div class="tvs-panel" id="tvsPanel"></div>' +
      '    <div class="tvs-tabs" id="tvsTabs"></div>' +
      '  </div>' +
      '  <div class="tvs-footer">' +
      '    <button class="tvs-btn primary" id="tvsOk">موافق</button>' +
      '    <button class="tvs-btn" id="tvsCancel">إلغاء</button>' +
      '    <button class="tvs-btn ghost" id="tvsReset">تفعيل على الكل</button>' +
      '    <div class="tvs-template">' +
      '      <select id="tvsTemplateSelect"><option value="">قالب</option></select>' +
      '      <button class="tvs-btn small" id="tvsTemplateSave">حفظ</button>' +
      '    </div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(overlayEl);
    bindDraggable(overlayEl.querySelector('.tvs-header'), overlayEl.querySelector('#tvSettingsSheet'));
    bodyEl = overlayEl.querySelector('#tvsPanel');
    tabsEl = overlayEl.querySelector('#tvsTabs');

    TABS.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'tvs-tab' + (i === 0 ? ' active' : '');
      b.innerHTML = '<span class="tvs-tab-icon">' + t.icon + '</span><span>' + t.label + '</span>';
      b.addEventListener('click', () => {
        tabsEl.querySelectorAll('.tvs-tab').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        renderTab(t.id);
      });
      tabsEl.appendChild(b);
    });

    overlayEl.querySelector('#tvsClose').addEventListener('click', close);
    overlayEl.querySelector('#tvsCancel').addEventListener('click', () => {
      state = JSON.parse(JSON.stringify(backup));
      applyAll();
      close();
    });
    
    overlayEl.querySelector('#tvsOk').addEventListener('click', () => { saveState(); applyAll(); close(); });
    
    
overlayEl.querySelector('#tvsReset').addEventListener('click', () => {
      // "تفعيل على الكل" يعني: تشغيل كل مفاتيح الإظهار/التفعيل المعطّلة
      // فقط (visible/checked = true) — وليس استبدال الألوان أو القيم أو
      // إعادة تحميل/إنشاء الشارت.
      state.gridVisible = true;
      state.borderVisible = true; state.wickVisible = true;
      state.bodyUpVisible = true; state.bodyDownVisible = true;
      state.borderUpVisible = true; state.borderDownVisible = true;
      state.wickUpVisible = true; state.wickDownVisible = true;
      state.watermarkVisible = true;
      state.rightScaleVisible = true;
      state.vGridVisible = true; state.hGridVisible = true;
      state.priceScaleVisible = true; state.timeScaleAxisVisible = true;
      state.timeVisible = true;
      state.statusLine.symbol = true; state.statusLine.ohlc = true; state.statusLine.change = true;
      applyAll();
      renderTab(currentTabId());
    });
    
    
    overlayEl.querySelector('#tvsTemplateSave').addEventListener('click', saveTemplate);
    overlayEl.querySelector('#tvsTemplateSelect').addEventListener('change', (e) => { if (e.target.value) loadTemplate(e.target.value); });

    overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) close(); });
    refreshTemplateList();
    renderTab('symbol');
  }

  function currentTabId() {
    const active = tabsEl.querySelector('.tvs-tab.active');
    const idx = active ? Array.from(tabsEl.children).indexOf(active) : 0;
    return TABS[idx] ? TABS[idx].id : 'symbol';
  }

  function open() {
    backup = JSON.parse(JSON.stringify(state));
    overlayEl.classList.remove('hidden');
  }
  function close() { overlayEl.classList.add('hidden'); }

  // ---------------------------------------------------------- عناصر مساعدة (نفس أسلوب drawing.js)
  function row(labelText, controlEl) {
    const r = document.createElement('div');
    r.className = 'tvs-row';
    const l = document.createElement('span'); l.className = 'tvs-row-label'; l.textContent = labelText;
    r.appendChild(l); r.appendChild(controlEl);
    return r;
  }
  function candleRow(checked, onCheck, colorVal, onColor) {
    const wrap = document.createElement('div');
    wrap.className = 'tvs-candle-row';
    const chk = checkbox(checked, onCheck);
    const label = document.createElement('span');
    label.className = 'tvs-candle-row-label';
    label.textContent = 'إظهار';
    const sw = colorSwatch(colorVal, onColor);
    wrap.appendChild(chk); wrap.appendChild(label); wrap.appendChild(sw);
    return wrap;
  }
  
  function sectionLabel(text) {
    const s = document.createElement('div'); s.className = 'tvs-section-label'; s.textContent = text;
    return s;
  }
  function checkbox(checked, onChange) {
    const b = document.createElement('button');
    b.className = 'tvs-checkbox' + (checked ? ' checked' : '');
    b.addEventListener('click', () => { const v = !b.classList.contains('checked'); b.classList.toggle('checked', v); onChange(v); });
    return b;
  }
  function toggleSwitch(checked, onChange) {
    const b = document.createElement('button');
    b.className = 'tvs-toggle' + (checked ? ' on' : '');
    b.innerHTML = '<span class="tvs-toggle-knob"></span>';
    b.addEventListener('click', () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); onChange(v); });
    return b;
  }
  function select(value, options, onChange) {
    const s = document.createElement('select');
    s.className = 'tvs-select';
    options.forEach(([val, label]) => {
      const o = document.createElement('option'); o.value = val; o.textContent = label;
      if (val === value) o.selected = true;
      s.appendChild(o);
    });
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }
  
  
function colorSwatch(value, onChange, opacityGetSet) {
  const b = document.createElement('button');
  b.className = 'tvs-color-sw';
  b.style.background = value;
  b.addEventListener('click', () => {
    window.UnifiedColorPicker.open({
      anchorEl: b,
      color: value,
      opacity: opacityGetSet ? opacityGetSet.get() : 100,
      onChange: (hex, opacity) => {
        value = hex;
        b.style.background = hex;
        onChange(hex);
        if (opacityGetSet) opacityGetSet.set(opacity);
      }
    });
  });
  return b;
}
  
  
  function numberInput(value, onChange) {
    const inp = document.createElement('input');
    inp.type = 'number'; inp.className = 'tvs-select'; inp.value = value;
    inp.addEventListener('change', () => onChange(parseFloat(inp.value)));
    return inp;
  }
  function radioGroup(value, options, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'tvs-radio-group';
    options.forEach(([val, label]) => {
      const b = document.createElement('button');
      b.className = 'tvs-radio' + (val === value ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        wrap.querySelectorAll('.tvs-radio').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        onChange(val);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  // ---------------------------------------------------------- التبويبات
function renderTab(id) {
  bodyEl.innerHTML = '';
  if (id === 'symbol') renderSymbolTab();
  else if (id === 'statusline') renderStatusLineTab();
  else if (id === 'scales') renderScalesTab();
  else if (id === 'appearance') renderAppearanceTab();
  else if (id === 'trading') renderTradingTab();
  else if (id === 'alerts') renderAlertsTab();
  else if (id === 'events') renderEventsTab();
  else if (id === 'canvas') renderCanvasTab();
  else if (id === 'timescale') renderTimeScaleTab();
}

function renderSymbolTab() {
    bodyEl.appendChild(sectionLabel('نوع الرسم'));
    bodyEl.appendChild(row('النوع', select(state.seriesType, [
      ['candles', 'Candles'], ['hollow', 'Hollow Candles'], ['bars', 'Bars'],
      ['line', 'Line'], ['area', 'Area'], ['baseline', 'Baseline'], ['heikinashi', 'Heikin Ashi']
    ], v => { state.seriesType = v; })));
    const note = document.createElement('div');
    note.className = 'tvs-note';
    note.textContent = 'Hollow Candles / Bars / Line / Area / Baseline / Heikin Ashi: تغيير النوع الفعلي على الشارت يتطلب استبدال نوع السلسلة (Series) بالكامل — غير مُفعّل تنفيذياً بعد؛ الخيار محفوظ هنا تمهيداً للربط لاحقاً.';
    bodyEl.appendChild(note);

bodyEl.appendChild(sectionLabel('جسم الشمعة الصاعدة'));
    bodyEl.appendChild(candleRow(state.bodyUpVisible, v => state.bodyUpVisible = v, state.upColor, v => state.upColor = v));

    bodyEl.appendChild(sectionLabel('جسم الشمعة الهابطة'));
    bodyEl.appendChild(candleRow(state.bodyDownVisible, v => state.bodyDownVisible = v, state.downColor, v => state.downColor = v));

    bodyEl.appendChild(sectionLabel('حدود الشموع الصاعدة'));
    bodyEl.appendChild(candleRow(state.borderUpVisible, v => state.borderUpVisible = v, state.borderUpColor, v => state.borderUpColor = v));

    bodyEl.appendChild(sectionLabel('حدود الشموع الهابطة'));
    bodyEl.appendChild(candleRow(state.borderDownVisible, v => state.borderDownVisible = v, state.borderDownColor, v => state.borderDownColor = v));

    bodyEl.appendChild(sectionLabel('فتائل الشموع الصاعدة'));
    bodyEl.appendChild(candleRow(state.wickUpVisible, v => state.wickUpVisible = v, state.wickUpColor, v => state.wickUpColor = v));

    bodyEl.appendChild(sectionLabel('فتائل الشموع الهابطة'));
    bodyEl.appendChild(candleRow(state.wickDownVisible, v => state.wickDownVisible = v, state.wickDownColor, v => state.wickDownColor = v));

    bodyEl.appendChild(sectionLabel('سمك الحدود'));
    const borderThickInp = document.createElement('input');
    borderThickInp.type = 'range'; borderThickInp.min = 1; borderThickInp.max = 4; borderThickInp.value = state.borderThickness;
    borderThickInp.addEventListener('input', () => state.borderThickness = parseInt(borderThickInp.value, 10));
    bodyEl.appendChild(row('السمك', borderThickInp));

    bodyEl.appendChild(sectionLabel('سمك الفتائل'));
    const wickThickInp = document.createElement('input');
    wickThickInp.type = 'range'; wickThickInp.min = 1; wickThickInp.max = 4; wickThickInp.value = state.wickThickness;
    wickThickInp.addEventListener('input', () => state.wickThickness = parseInt(wickThickInp.value, 10));
    bodyEl.appendChild(row('السمك', wickThickInp));
    
    

    bodyEl.appendChild(sectionLabel('تعديل البيانات'));
    bodyEl.appendChild(row('الدقة', select(String(state.precision), [['0','0'],['1','1'],['2','2'],['3','3'],['4','4'],['5','5']], v => state.precision = parseInt(v, 10))));
    
    
    bodyEl.appendChild(row('الجلسة', select(state.session, SESSIONS, v => state.session = v)));

    const tzSel = document.createElement('select');
    tzSel.className = 'tvs-select tvs-select-wide';
    IANA_TIMEZONES.forEach(([val, label]) => {
      const o = document.createElement('option'); o.value = val; o.textContent = label;
      if (val === state.timezone) o.selected = true;
      tzSel.appendChild(o);
    });
    tzSel.addEventListener('change', () => { state.timezone = tzSel.value; applyTimezoneShift(tzSel.value); });
    bodyEl.appendChild(row('التوقيت', tzSel));
    const tzNote = document.createElement('div');
    tzNote.className = 'tvs-note';
    tzNote.textContent = 'يُطبَّق فقط على عرض محور الوقت أسفل الشارت — البيانات الأساسية (الشموع) تبقى بتوقيت UTC دائماً كمرجع ثابت، تماماً كسلوك TradingView.';
    bodyEl.appendChild(tzNote);
  }

function renderStatusLineTab() {
    bodyEl.appendChild(sectionLabel('عناصر خط الحالة'));
    const sl = state.statusLine;
    bodyEl.appendChild(row('الرمز (Symbol)', checkbox(sl.symbol, v => sl.symbol = v)));
    bodyEl.appendChild(row('الوصف', checkbox(sl.description, v => sl.description = v)));
    bodyEl.appendChild(row('قيم OHLC', checkbox(sl.ohlc, v => sl.ohlc = v)));
    bodyEl.appendChild(row('نسبة التغيّر (Change %)', checkbox(sl.change, v => sl.change = v)));
    bodyEl.appendChild(row('حجم التداول (Volume)', checkbox(sl.volume, v => sl.volume = v)));
    bodyEl.appendChild(row('الجلسة (Session)', checkbox(sl.session, v => sl.session = v)));
    bodyEl.appendChild(row('تغيّر آخر يوم', checkbox(sl.lastDayChange, v => sl.lastDayChange = v)));

    bodyEl.appendChild(sectionLabel('المؤشرات'));
    bodyEl.appendChild(row('العناوين (Titles)', checkbox(sl.indTitles, v => sl.indTitles = v)));
    bodyEl.appendChild(row('المدخلات (Inputs)', checkbox(sl.indInputs, v => sl.indInputs = v)));
    bodyEl.appendChild(row('القيم (Values)', checkbox(sl.indicatorValues, v => sl.indicatorValues = v)));
    bodyEl.appendChild(row('الخلفية (Background)', checkbox(sl.indBackground, v => sl.indBackground = v)));

    bodyEl.appendChild(sectionLabel('المظهر'));
    const sizeInp = document.createElement('input');
    sizeInp.type = 'range'; sizeInp.min = 10; sizeInp.max = 20; sizeInp.value = sl.fontSize;
    sizeInp.addEventListener('input', () => sl.fontSize = parseInt(sizeInp.value, 10));
    bodyEl.appendChild(row('حجم الخط', sizeInp));
    bodyEl.appendChild(row('لون النص', colorSwatch(sl.textColor, v => sl.textColor = v)));
    bodyEl.appendChild(row('مكان الظهور', select(sl.position, [
      ['top-left', 'أعلى يسار'], ['top-center', 'أعلى وسط'], ['top-right', 'أعلى يمين']
    ], v => sl.position = v)));
  }

function renderScalesTab() {
    bodyEl.appendChild(sectionLabel('عرض المقاييس'));
    bodyEl.appendChild(row('Right Price Scale', toggleSwitch(state.rightScaleVisible, v => state.rightScaleVisible = v)));
    bodyEl.appendChild(row('Left Price Scale', toggleSwitch(state.leftScaleVisible, v => state.leftScaleVisible = v)));

    bodyEl.appendChild(sectionLabel('وضع المقياس'));
    bodyEl.appendChild(row('Log Scale', toggleSwitch(state.scaleMode === 'log', v => state.scaleMode = v ? 'log' : 'normal')));
    bodyEl.appendChild(row('Percentage Scale', toggleSwitch(state.scaleMode === 'percent', v => state.scaleMode = v ? 'percent' : 'normal')));
    bodyEl.appendChild(radioGroup(state.scaleMode, [['normal','Auto'],['log','Log'],['percent','Percent'],['indexed','Indexed to 100']], v => state.scaleMode = v));

    bodyEl.appendChild(sectionLabel('خيارات إضافية'));
    bodyEl.appendChild(row('عكس المقياس (Invert)', toggleSwitch(state.invertScale, v => state.invertScale = v)));
    bodyEl.appendChild(row('Scale Only (تحكم بالسعر بلا وقت)', toggleSwitch(state.scaleOnly, v => state.scaleOnly = v)));
    bodyEl.appendChild(row('قفل المقياس (Lock Scale)', toggleSwitch(state.lockScale, v => state.lockScale = v)));

    bodyEl.appendChild(sectionLabel('الهوامش'));
    bodyEl.appendChild(row('هامش أعلى %', numberInput(state.marginTop, v => state.marginTop = v)));
    bodyEl.appendChild(row('هامش أسفل %', numberInput(state.marginBottom, v => state.marginBottom = v)));
  }

function renderAppearanceTab() {
    bodyEl.appendChild(sectionLabel('الألوان الأساسية'));
    bodyEl.appendChild(row('لون الخلفية (Background)', colorSwatch(state.bgColor, v => { state.bgColor = v; state.theme = 'custom'; })));
    bodyEl.appendChild(row('لون الشبكة (Grid)', colorSwatch(state.gridColor, v => { state.gridColor = v; state.theme = 'custom'; })));
    bodyEl.appendChild(row('إظهار الشبكة', toggleSwitch(state.gridVisible, v => state.gridVisible = v)));
    bodyEl.appendChild(row('لون النصوص (Text)', colorSwatch(state.textColor, v => { state.textColor = v; state.theme = 'custom'; })));

    bodyEl.appendChild(sectionLabel('Crosshair'));
    bodyEl.appendChild(row('لون Crosshair', colorSwatch(state.crosshairColor, v => state.crosshairColor = v)));
    bodyEl.appendChild(row('نمط Crosshair', select(state.crosshairStyle, [
      ['solid', 'خط متصل'], ['dashed', 'متقطع'], ['dotted', 'منقّط']
    ], v => state.crosshairStyle = v)));
    bodyEl.appendChild(row('سمك Crosshair', select(String(state.crosshairWidth), [['1','1px'],['2','2px'],['3','3px'],['4','4px']], v => state.crosshairWidth = parseInt(v, 10))));
    const opInp = document.createElement('input');
    opInp.type = 'range'; opInp.min = 0; opInp.max = 100; opInp.value = state.crosshairOpacity;
    opInp.addEventListener('input', () => state.crosshairOpacity = parseInt(opInp.value, 10));
    bodyEl.appendChild(row('شفافية Crosshair', opInp));
  }


function sliderRow(labelText, value, min, max, onChange) {
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.value = value;
    inp.addEventListener('input', () => onChange(parseInt(inp.value, 10)));
    return row(labelText, inp);
  }

  function renderCanvasTab() {
    // ===== 1) الخلفية =====
    bodyEl.appendChild(sectionLabel('الخلفية'));
    bodyEl.appendChild(row('نوع الخلفية', radioGroup(state.bgType, [['solid','ثابتة'],['gradient','متدرجة']], v => { state.bgType = v; renderTab('canvas'); })));
    if (state.bgType === 'solid') {
      bodyEl.appendChild(row('اللون', colorSwatch(state.bgColor, v => { state.bgColor = v; state.theme = 'custom'; })));
    } else {
      bodyEl.appendChild(row('اللون الأول', colorSwatch(state.bgColor, v => { state.bgColor = v; state.theme = 'custom'; })));
      bodyEl.appendChild(row('اللون الثاني', colorSwatch(state.bgColor2, v => { state.bgColor2 = v; })));
      bodyEl.appendChild(row('اتجاه التدرج', select(state.bgGradientDir, [['vertical','عمودي'],['horizontal','أفقي'],['diagonal','قطري']], v => state.bgGradientDir = v)));
      if (state.bgGradientDir !== 'vertical') {
        const note = document.createElement('div');
        note.className = 'tvs-note';
        note.textContent = 'التدرج الأفقي/القطري غير مدعوم من مكتبة الرسم (lightweight-charts) — يُطبَّق تدرج عمودي بدلاً منه.';
        bodyEl.appendChild(note);
      }
    }

    // ===== 2) الشبكة العمودية =====
    bodyEl.appendChild(sectionLabel('خطوط الشبكة العمودية'));
    bodyEl.appendChild(row('إظهار', toggleSwitch(state.vGridVisible, v => state.vGridVisible = v)));
    bodyEl.appendChild(row('اللون', colorSwatch(state.vGridColor, v => { state.vGridColor = v; state.theme = 'custom'; })));
    bodyEl.appendChild(sliderRow('الشفافية', state.vGridOpacity, 0, 100, v => state.vGridOpacity = v));
    bodyEl.appendChild(sliderRow('السمك', state.vGridWidth, 1, 4, v => state.vGridWidth = v));

    // ===== 3) الشبكة الأفقية =====
    bodyEl.appendChild(sectionLabel('خطوط الشبكة الأفقية'));
    bodyEl.appendChild(row('إظهار', toggleSwitch(state.hGridVisible, v => state.hGridVisible = v)));
    bodyEl.appendChild(row('اللون', colorSwatch(state.hGridColor, v => { state.hGridColor = v; state.theme = 'custom'; })));
    bodyEl.appendChild(sliderRow('الشفافية', state.hGridOpacity, 0, 100, v => state.hGridOpacity = v));
    bodyEl.appendChild(sliderRow('السمك', state.hGridWidth, 1, 4, v => state.hGridWidth = v));
    const gridNote = document.createElement('div');
    gridNote.className = 'tvs-note';
    gridNote.textContent = 'سمك خطوط الشبكة غير مدعوم من مكتبة الرسم الحالية (تدعم فقط اللون والإظهار) — القيمة محفوظة هنا تمهيداً لدعمها مستقبلاً.';
    bodyEl.appendChild(gridNote);

    // ===== 4) Crosshair =====
    bodyEl.appendChild(sectionLabel('مؤشر التقاطع (Crosshair)'));
    bodyEl.appendChild(row('إظهار', toggleSwitch(true, () => {})));
    bodyEl.appendChild(row('اللون', colorSwatch(state.crosshairColor, v => state.crosshairColor = v)));
    bodyEl.appendChild(sliderRow('السماكة', state.crosshairWidth, 1, 4, v => state.crosshairWidth = v));
    bodyEl.appendChild(row('نوع الخط', radioGroup(state.crosshairStyle, [['solid','متصل'],['dashed','متقطع'],['dotted','منقط']], v => state.crosshairStyle = v)));

    // ===== 5) النصوص =====
    bodyEl.appendChild(sectionLabel('النصوص'));
    bodyEl.appendChild(row('لون النص', colorSwatch(state.textColor, v => { state.textColor = v; state.theme = 'custom'; })));

    // ===== 6) حجم النص =====
    bodyEl.appendChild(sectionLabel('حجم النص'));
    bodyEl.appendChild(row('الحجم', select(String(state.canvasTextFontSize), [['10','10px'],['11','11px'],['12','12px'],['13','13px'],['14','14px'],['16','16px'],['18','18px'],['20','20px']], v => state.canvasTextFontSize = parseInt(v, 10))));

    // ===== 7) أسعار المحور =====
    bodyEl.appendChild(sectionLabel('أسعار المحور (Price Scale)'));
    bodyEl.appendChild(row('إظهار', toggleSwitch(state.priceScaleVisible, v => state.priceScaleVisible = v)));
    bodyEl.appendChild(row('لون النص', colorSwatch(state.priceScaleTextColor, v => state.priceScaleTextColor = v)));
    bodyEl.appendChild(row('حجم النص', select(String(state.priceScaleFontSize), [['10','10px'],['11','11px'],['12','12px'],['13','13px'],['14','14px']], v => state.priceScaleFontSize = parseInt(v, 10))));
    bodyEl.appendChild(sliderRow('سمك الخط', state.priceScaleLineWidth, 1, 4, v => state.priceScaleLineWidth = v));

    // ===== 8) محور الزمن =====
    bodyEl.appendChild(sectionLabel('محور الزمن (Time Scale)'));
    bodyEl.appendChild(row('إظهار', toggleSwitch(state.timeScaleAxisVisible, v => state.timeScaleAxisVisible = v)));
    bodyEl.appendChild(row('لون النص', colorSwatch(state.timeScaleTextColor, v => state.timeScaleTextColor = v)));
    bodyEl.appendChild(row('حجم النص', select(String(state.timeScaleFontSize), [['10','10px'],['11','11px'],['12','12px'],['13','13px'],['14','14px']], v => state.timeScaleFontSize = parseInt(v, 10))));

    // ===== Theme / Watermark / Logo / Background Image (من قبل) =====
    bodyEl.appendChild(sectionLabel('المظهر (Theme)'));
    bodyEl.appendChild(row('قالب جاهز', radioGroup(state.theme, [['tvlight','TradingView فاتح'],['dark','داكن'],['light','فاتح'],['tvdark','TradingView داكن'],['custom','مخصص']], v => {
      state.theme = v;
      if (THEME_PRESETS[v]) Object.assign(state, THEME_PRESETS[v]);
      applyAll(); renderTab('canvas');
    })));

    bodyEl.appendChild(sectionLabel('العلامة المائية (Watermark)'));
    bodyEl.appendChild(row('إظهار العلامة المائية', toggleSwitch(state.watermarkVisible, v => state.watermarkVisible = v)));
    const wmInp = document.createElement('input');
    wmInp.type = 'text'; wmInp.className = 'tvs-select tvs-select-wide'; wmInp.value = state.watermarkText;
    wmInp.placeholder = 'نص مخصص (اختياري)';
    wmInp.addEventListener('input', () => state.watermarkText = wmInp.value);
    bodyEl.appendChild(row('نص العلامة المائية', wmInp));
    bodyEl.appendChild(sliderRow('شفافية العلامة المائية', state.watermarkOpacity, 0, 30, v => state.watermarkOpacity = v));

    bodyEl.appendChild(sectionLabel('الشعار (Logo)'));
    bodyEl.appendChild(row('إظهار شعار المنصة', toggleSwitch(state.logoVisible, v => state.logoVisible = v)));

    bodyEl.appendChild(sectionLabel('خلفية مخصصة (Background Image)'));
    const bgInp = document.createElement('input');
    bgInp.type = 'text'; bgInp.className = 'tvs-select tvs-select-wide'; bgInp.value = state.backgroundImageUrl;
    bgInp.placeholder = 'رابط صورة (اختياري)';
    bgInp.addEventListener('input', () => state.backgroundImageUrl = bgInp.value);
    bodyEl.appendChild(row('رابط الصورة', bgInp));
    const imgNote = document.createElement('div');
    imgNote.className = 'tvs-note';
    imgNote.textContent = 'Logo وBackground Image يتطلبان بنية رفع/عرض ملفات غير موجودة بالمشروع الحالي — القيم محفوظة تمهيداً للربط لاحقاً.';
    bodyEl.appendChild(imgNote);
  }
  
  

function renderTimeScaleTab() {
    bodyEl.appendChild(sectionLabel('عرض المحور الزمني'));
    bodyEl.appendChild(row('Time Visible', toggleSwitch(state.timeVisible, v => state.timeVisible = v)));
    bodyEl.appendChild(row('Seconds Visible', toggleSwitch(state.secondsVisible, v => state.secondsVisible = v)));
    bodyEl.appendChild(row('Weekend Separation', toggleSwitch(state.weekendSeparation, v => state.weekendSeparation = v)));
    bodyEl.appendChild(row('Session Breaks', toggleSwitch(state.sessionBreaks, v => state.sessionBreaks = v)));

    bodyEl.appendChild(sectionLabel('التباعد والحركة'));
    const barSpInp = document.createElement('input');
    barSpInp.type = 'range'; barSpInp.min = 2; barSpInp.max = 30; barSpInp.value = state.barSpacing;
    barSpInp.addEventListener('input', () => state.barSpacing = parseInt(barSpInp.value, 10));
    bodyEl.appendChild(row('Bar Spacing', barSpInp));

    const rightOffInp = document.createElement('input');
    rightOffInp.type = 'range'; rightOffInp.min = 0; rightOffInp.max = 60; rightOffInp.value = state.rightOffset;
    rightOffInp.addEventListener('input', () => state.rightOffset = parseInt(rightOffInp.value, 10));
    bodyEl.appendChild(row('Right Offset', rightOffInp));

    const zoomInp = document.createElement('input');
    zoomInp.type = 'range'; zoomInp.min = 20; zoomInp.max = 200; zoomInp.value = state.zoomSpeed;
    zoomInp.addEventListener('input', () => state.zoomSpeed = parseInt(zoomInp.value, 10));
    bodyEl.appendChild(row('Zoom Speed', zoomInp));

    const note = document.createElement('div');
    note.className = 'tvs-note';
    note.textContent = 'Weekend Separation / Session Breaks تتطلب معالجة إضافية لبيانات الفجوات الزمنية — محفوظة هنا تمهيداً للتنفيذ الكامل.';
    bodyEl.appendChild(note);
  }

function renderTradingTab() {
  bodyEl.appendChild(sectionLabel('أدوات التداول (Trading Panel)'));
  const items = [
    ['\u{1F7E2}', 'Buy', 'شراء سريع من الشارت'],
    ['\u{1F534}', 'Sell', 'بيع سريع من الشارت'],
    ['\u{1F4CB}', 'Orders', 'إدارة الأوامر المعلّقة'],
    ['\u{1F4CA}', 'Positions', 'إدارة الصفقات المفتوحة']
  ];
  items.forEach(([icon, label, desc]) => {
    const wrap = document.createElement('div');
    wrap.className = 'tvs-trading-item';
    wrap.innerHTML = '<span class="tvs-trading-icon">' + icon + '</span>' +
      '<div class="tvs-trading-text"><b>' + label + '</b><span>' + desc + '</span></div>' +
      '<span class="tvs-soon-badge">قريباً</span>';
    bodyEl.appendChild(wrap);
  });
  const note = document.createElement('div');
  note.className = 'tvs-note';
  note.textContent = 'أدوات Long/Short Position الحالية (حساب R:R) متوفرة فعلياً من قائمة أدوات الرسم — أزرار التنفيذ الفعلي (اتصال بحساب تداول حقيقي) غير مفعّلة بعد وتظهر هنا كتمهيد مستقبلي.';
  bodyEl.appendChild(note);
}

  function renderAlertsTab() {
    bodyEl.appendChild(sectionLabel('التنبيهات'));
    const note = document.createElement('div');
    note.className = 'tvs-note';
    note.textContent = 'إدارة التنبيهات الكاملة متوفرة من زر "Alerts" بالشريط العلوي.';
    bodyEl.appendChild(note);
    const btn = document.createElement('button');
    btn.className = 'tvs-btn primary';
    btn.style.marginTop = '10px';
    btn.textContent = 'فتح قائمة التنبيهات';
    btn.addEventListener('click', () => { close(); const b = document.getElementById('alAlertsBtn'); if (b) b.click(); });
    bodyEl.appendChild(btn);
  }

function renderEventsTab() {
  bodyEl.appendChild(sectionLabel('فواصل الجلسات (Session breaks)'));
  bodyEl.appendChild(row('إظهار فواصل الجلسات', checkbox(state.sessionBreaks, v => state.sessionBreaks = v)));
  bodyEl.appendChild(row('اللون', colorSwatch(state.sessionBreakColor, v => state.sessionBreakColor = v)));
  bodyEl.appendChild(row('نمط الخط', select(state.sessionBreakStyle, [['solid', 'متصل'], ['dashed', 'متقطع'], ['dotted', 'منقط']], v => state.sessionBreakStyle = v)));
  const note = document.createElement('div');
  note.className = 'tvs-note';
  note.textContent = 'يُرسم فاصل عند بداية كل يوم بحسب المنطقة الزمنية المختارة. أحداث الأرباح والتوزيعات والتجزئة غير متاحة: لا يوجد مصدر بيانات أساسية متصل بالمشروع.';
  bodyEl.appendChild(note);
}

  // ---------------------------------------------------------- القوالب (Save/Load Template)
  function templateIndex() {
    try { return JSON.parse(localStorage.getItem(TEMPLATE_INDEX_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveTemplate() {
    const name = prompt('اسم القالب:');
    if (!name || !name.trim()) return;
    const idx = templateIndex();
    if (!idx.includes(name)) idx.push(name);
    localStorage.setItem(TEMPLATE_INDEX_KEY, JSON.stringify(idx));
    localStorage.setItem('tv_settings_template_' + name, JSON.stringify(state));
    refreshTemplateList();
  }
  function loadTemplate(name) {
    try {
      const data = JSON.parse(localStorage.getItem('tv_settings_template_' + name));
      if (data) { state = Object.assign({}, defaults, data); applyAll(); renderTab(currentTabId()); }
    } catch (e) {}
  }
  function refreshTemplateList() {
    const sel = overlayEl.querySelector('#tvsTemplateSelect');
    sel.innerHTML = '<option value="">قالب</option>';
    templateIndex().forEach(name => {
      const o = document.createElement('option'); o.value = name; o.textContent = name;
      sel.appendChild(o);
    });
  }

  // ---------------------------------------------------------- الربط بزر الإعدادات
  function bindSettingsButton() {
    const oldBtn = document.getElementById('settingsBtn');
    if (!oldBtn) { setTimeout(bindSettingsButton, 300); return; }
    // استبدال الزر (بدون معرّفه القديم) يزيل أي مستمعين قدامى مربوطين به
    // من settings.js دون الحاجة لتعديل ذلك الملف إطلاقاً.
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    newBtn.id = 'settingsBtn';
    newBtn.addEventListener('click', open);
  }
const TZ_OFFSETS_HOURS = {
    'UTC': 0, 'America/New_York': -4, 'America/Chicago': -5, 'America/Los_Angeles': -7,
    'America/Sao_Paulo': -3, 'Europe/London': 1, 'Europe/Paris': 2, 'Europe/Moscow': 3,
    'Africa/Cairo': 2, 'Asia/Dubai': 4, 'Asia/Karachi': 5, 'Asia/Colombo': 5.5,
    'Asia/Kathmandu': 5.75, 'Asia/Dhaka': 6, 'Asia/Yangon': 6.5, 'Asia/Bangkok': 7,
    'Asia/Jakarta': 7, 'Asia/Shanghai': 8, 'Asia/Singapore': 8, 'Asia/Tokyo': 9,
    'Asia/Seoul': 9, 'Australia/Sydney': 10, 'Pacific/Auckland': 13
  };
  function applyTimezoneShift(tz) {
    const offsetSec = (TZ_OFFSETS_HOURS[tz] || 0) * 3600;
    if (global.chart) {
      try {
        global.chart.applyOptions({
          timeScale: {
            tickMarkFormatter: (time) => {
              const d = new Date((time + offsetSec) * 1000);
              return d.toISOString().substring(11, 16);
            }
          }
        });
      } catch (e) {}
    }
  }
  function init() {
    build();
    applyAll();
    bindSettingsButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.TVSettings = { open, close, getState: () => Object.assign({}, state), tzOffsetHours: tz => TZ_OFFSETS_HOURS[tz] || 0 };

})(window);