/* =========================================================================
   tv-draw-ui.js — واجهة أدوات الرسم بأسلوب TradingView (عربي RTL، داكن)
   ---------------------------------------------------------------------
   يُحمَّل بعد drawing.js ويُستدعى منه: TVDrawUI.create(manager).
   لا يملك محرك رسم خاصًا: كل التعديلات تُطبَّق مباشرة على كائنات
   DrawingManager الحالية (الوقت/السعر)، والحفظ عبر manager._save().

   يوفّر:
     1) الشريط العائم الرئيسي (كبسولة 14 أداة + مقبض سحب)
     2) شريحة التعليمات (Toast) أثناء الرسم + مؤشر التقاطع الأزرق المتقطع
     3) شريط خصائص الكائن العائم (يتغير حسب نوع الأداة)
     4) نافذة الإعدادات (تبويبات مخصصة لكل أداة + مؤشر متحرك)
     5) محرر نص مضمّن للأدوات النصية (بدل prompt)
   ========================================================================= */
(function (global) {
  'use strict';

  const BLUE = '#2962FF';

  /* ------------------------------ الأيقونات (خطوط رفيعة، currentColor) ------------------------------ */
  const svg = (inner, vb) => '<svg viewBox="' + (vb || '0 0 28 28') + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  const dot = (x, y, r) => '<circle cx="' + x + '" cy="' + y + '" r="' + (r || 2) + '" fill="#111" />';
  const ICONS = {
    note: svg('<rect x="4.5" y="4.5" width="19" height="14" rx="2"/><path d="M10 9.5h8M14 9.5v6M14 18.5v3"/><circle cx="14" cy="24" r="1.1"/>'),
    gannbox: svg('<rect x="4.5" y="4.5" width="19" height="19" rx="1.5"/><path d="M11 4.5v19M17.5 4.5v19M4.5 11h19M4.5 17.5h19"/>' + dot(11, 11) + dot(17.5, 17.5)),
    long: svg('<path d="M4 7h20M4 21h20" stroke-dasharray="1 3"/><path d="M4 14h20"/><path d="M10 11v6h5"/>' + dot(4, 14, 1.6)),
    short: svg('<path d="M4 7h20M4 21h20" stroke-dasharray="1 3"/><path d="M4 14h20"/><path d="M15 11h-5v3h5v3h-5"/>' + dot(4, 14, 1.6)),
    measure: svg('<path d="M6 5v18M22 5v18M6 14h16M9 11l-3 3 3 3M19 11l3 3-3 3"/>'),
    ellipse: svg('<ellipse cx="14" cy="14" rx="10" ry="7"/>' + dot(14, 7, 1.7) + dot(14, 21, 1.7) + dot(4, 14, 1.7) + dot(24, 14, 1.7)),
    callout: svg('<path d="M5.5 5.5h17a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H14l-5 4.5V17.5H5.5A1.5 1.5 0 0 1 4 16V7a1.5 1.5 0 0 1 1.5-1.5z"/>'),
    fib: svg('<path d="M4 6h20M4 11h20M4 17h20M4 22h20"/>' + dot(4, 6, 1.7) + dot(24, 22, 1.7) + dot(24, 6, 1.7) + dot(4, 22, 1.7)),
    text: svg('<path d="M6 7h16M14 7v15"/>'),
    infoline: svg('<path d="M4.5 22L19.5 9"/><rect x="19" y="4.5" width="5" height="5" rx="1"/>'),
    rect: svg('<rect x="6.5" y="7.5" width="15" height="13"/>' + dot(6.5, 7.5, 1.7) + dot(21.5, 7.5, 1.7) + dot(6.5, 20.5, 1.7) + dot(21.5, 20.5, 1.7)),
    curve: svg('<path d="M4.5 22C7 5 19 4 23.5 15"/>' + dot(4.5, 22, 1.8) + dot(23.5, 15, 1.8)),
    path: svg('<path d="M4 21l6-9 5 5 8-9"/><path d="M19 8h4.5v4.5"/>'),
    vline: svg('<path d="M14 3.5v21"/>' + dot(14, 14, 1.9)),
    // أيقونات شريط الخصائص
    more: svg('<circle cx="6" cy="14" r="1.4" fill="currentColor"/><circle cx="14" cy="14" r="1.4" fill="currentColor"/><circle cx="22" cy="14" r="1.4" fill="currentColor"/>'),
    trash: svg('<path d="M5 8h18M11 8V5.5h6V8M7.5 8l1 14.5h11L20.5 8M12 12v7M16 12v7"/>'),
    unlock: svg('<rect x="6" y="12.5" width="16" height="11" rx="2"/><path d="M9.5 12.5V9a4.5 4.5 0 0 1 8.6-1.8"/>'),
    lock: svg('<rect x="6" y="12.5" width="16" height="11" rx="2"/><path d="M9.5 12.5V9a4.5 4.5 0 0 1 9 0v3.5"/>'),
    alert: svg('<circle cx="13" cy="15" r="7.5"/><path d="M13 11v4.5l3 1.5M4 8l4-3.5M22 8l-4-3.5"/><path d="M22.5 19v6M19.5 22h6"/>'),
    gear: svg('<path d="M14 4.5l8 4.7v9.6l-8 4.7-8-4.7V9.2z"/><circle cx="14" cy="14" r="3.4"/>'),
    t: svg('<path d="M7 7h14M14 7v14"/>'),
    pen: svg('<path d="M5 23l1-5L19 5l4 4-13 13z"/><path d="M16.5 7.5l4 4"/>'),
    bucket: svg('<path d="M6 14l7-8 8 8-7 7z"/><path d="M22.5 17c1.4 2 2 3 2 4a2 2 0 0 1-4 0c0-1 .6-2 2-4z"/>'),
    templates: svg('<rect x="4.5" y="4.5" width="8" height="8" rx="1.5"/><rect x="15.5" y="4.5" width="8" height="8" rx="1.5"/><rect x="4.5" y="15.5" width="8" height="8" rx="1.5"/><path d="M19.5 15.5v8M15.5 19.5h8"/>'),
    angle: svg('<path d="M5 22L22 22M5 22L18 8"/><path d="M12 22a7 7 0 0 0-2.5-5.3"/>'),
    close: svg('<path d="M6 6l16 16M22 6L6 22"/>'),
    pencilSm: svg('<path d="M5 23l1-5L19 5l4 4-13 13z"/>'),
    chevron: svg('<path d="M7 11l7 7 7-7"/>'),
    check: svg('<path d="M5 14.5l6 6L23 8"/>', '0 0 28 28'),
    arrowEnd: svg('<path d="M4 14h19M17 8l6 6-6 6"/>'),
    arrowPlain: svg('<path d="M4 14h20"/>'),
    arrowPointed: svg('<path d="M4 14h19M17 9l6 5-6 5"/>')
  };

  // الأدوات الأربع عشرة من يسار الشريط إلى يمينه (مواصفات PDF §1)
  const CAPSULE_TOOLS = [
    { id: 'note', label: 'ملاحظة نصية' },
    { id: 'gannbox', label: 'شبكة الأدوات' },
    { id: 'long', label: 'مركز شراء' },
    { id: 'short', label: 'مركز بيع' },
    { id: 'measure', label: 'مدى التاريخ والسعر' },
    { id: 'ellipse', label: 'دائرة / إهليلج' },
    { id: 'callout', label: 'تعليق' },
    { id: 'fib', label: 'تصحيح فيبوناتشي' },
    { id: 'text', label: 'نص' },
    { id: 'infoline', label: 'خط معلومات' },
    { id: 'rect', label: 'مستطيل' },
    { id: 'curve', label: 'منحنى' },
    { id: 'path', label: 'مسار' },
    { id: 'vline', label: 'خط عمودي' }
  ];

  // تعليمات شريحة الرسم لكل أداة: نص لكل نقطة
  const HINTS = {
    default: ['نقل المؤشر إلى نقطة البداية', 'نقل المؤشر إلى نقطة النهاية', 'نقل المؤشر إلى النقطة التالية'],
    vline: ['اضغط لوضع الخط العمودي'],
    hline: ['اضغط لوضع الخط الأفقي'],
    text: ['اضغط لوضع النص'], note: ['اضغط لوضع الملاحظة'], callout: ['اضغط لوضع نقطة التعليق'], label: ['اضغط لوضع الوسم'],
    pin: ['اضغط لتثبيت الدبوس'], pricelabel: ['اضغط لوضع وسم السعر'],
    path: ['نقل المؤشر إلى نقطة البداية', 'اضغط لإضافة نقطة — نقرتان للإنهاء']
  };

  // الأدوات ذات المحتوى النصي في شريط الخصائص
  const TEXT_TYPES = ['text', 'note', 'callout', 'label'];
  const TYPE_AR = {
    trendline: 'خط اتجاه', ray: 'شعاع', extline: 'خط ممتد', hline: 'خط أفقي', vline: 'خط عمودي', arrow: 'سهم', curve: 'منحنى', path: 'مسار',
    infoline: 'خط معلومات', rect: 'مستطيل', erect: 'مستطيل ممتد', circle: 'دائرة', circlerad: 'دائرة', ellipse: 'دائرة / إهليلج',
    text: 'نص', label: 'وسم', note: 'ملاحظة نصية', callout: 'تعليق', pin: 'دبوس', pricelabel: 'وسم السعر',
    long: 'مركز شراء', short: 'مركز بيع', measure: 'مدى التاريخ والسعر', fib: 'تصحيح فيبوناتشي', fibext: 'امتداد فيبوناتشي',
    fibchannel: 'قناة فيبوناتشي', fibfan: 'مروحة فيبوناتشي', fibtimezone: 'مناطق فيبوناتشي الزمنية', gannbox: 'شبكة الأدوات'
  };

  // تبويبات النافذة لكل أداة (الأول في أقصى اليمين لأن الواجهة RTL)
  const TAB_LABEL = { inputs: 'مدخلات', style: 'نمط', text: 'النص', coords: 'إحداثيات', vis: 'الظهور' };
  function tabsFor(type) {
    if (type === 'text') return ['text'];
    if (type === 'long' || type === 'short') return ['inputs', 'style', 'vis'];
    if (['note', 'callout', 'label'].includes(type)) return ['text', 'coords', 'vis'];
    if (['curve', 'path', 'ellipse', 'circle', 'circlerad', 'hline', 'fib', 'fibext', 'fibchannel', 'fibfan', 'fibtimezone', 'gannbox', 'measure', 'arrow', 'ray', 'extline', 'pin', 'pricelabel'].includes(type)) return ['style', 'coords', 'vis'];
    return ['style', 'text', 'coords', 'vis']; // vline, rect, erect, infoline, trendline
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ======================================================================= */
  function create(m) {
    const ui = { m, destroyed: false };
    const cleanups = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanups.push(() => t.removeEventListener(ev, fn, o)); };
    const KEY_POS = 'dt_capsule_pos_' + m.storageKey;
    const KEY_VIS = 'dt_capsule_visible_' + m.storageKey;

    /* ================================ 1) الكبسولة ================================ */
    function buildCapsule() {
      const bar = h('div', 'dtc-capsule'); bar.id = 'dtFavBar'; bar.setAttribute('dir', 'ltr');
      bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'أدوات الرسم');
      const list = h('div', 'dtc-tools'); bar.appendChild(list);
      CAPSULE_TOOLS.forEach(t => {
        const b = h('button', 'dtc-btn', ICONS[t.id]); b.type = 'button';
        b.dataset.tool = t.id; b.setAttribute('aria-label', t.label); // بدون tooltips كما في المرجع
        b.addEventListener('click', e => {
          e.stopPropagation();
          global.DrawingTools.activeManager = m;
          if (m.activeTool === t.id) { m.setActiveTool('cursor'); return; }
          m._registerRecentTool(t.id);
          m.setActiveTool(t.id);
        });
        list.appendChild(b);
      });
      const grip = h('div', 'dtc-grip', '<i></i><i></i><i></i><i></i><i></i><i></i>'); grip.setAttribute('aria-label', 'سحب الشريط');
      bar.appendChild(grip);
      document.body.appendChild(bar);
      ui.capsule = bar; ui.capsuleList = list;
      bindDrag(grip, bar, pos => { try { localStorage.setItem(KEY_POS, JSON.stringify(pos)); } catch (e) {} });
      let pos = null; try { pos = JSON.parse(localStorage.getItem(KEY_POS) || 'null'); } catch (e) {}
      if (pos) { placeClamped(bar, pos.left, pos.top); }
      else { bar.style.left = '3.9vw'; bar.style.top = '16vh'; }
      const vis = localStorage.getItem(KEY_VIS);
      bar.classList.toggle('hidden', vis === '0');
      on(window, 'resize', () => { if (bar.style.left && !bar.style.left.endsWith('vw')) placeClamped(bar, parseFloat(bar.style.left), parseFloat(bar.style.top)); });
    }
    function placeClamped(el, left, top) {
      const w = el.offsetWidth || 300, hh = el.offsetHeight || 50;
      el.style.left = clamp(left, 4, Math.max(4, window.innerWidth - w - 4)) + 'px';
      el.style.top = clamp(top, 4, Math.max(4, window.innerHeight - hh - 4)) + 'px';
    }
    // سحب عام عبر Pointer Events (ماوس/لمس) — لا يؤثر على أدوات الرسم أو الشارت
    function bindDrag(handle, el, onEnd) {
      let st = null;
      handle.addEventListener('pointerdown', e => {
        if (e.button != null && e.button !== 0) return;
        const r = el.getBoundingClientRect();
        st = { x: e.clientX, y: e.clientY, l: r.left, t: r.top, id: e.pointerId };
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
        el.classList.add('dragging');
        e.preventDefault(); e.stopPropagation();
      });
      handle.addEventListener('pointermove', e => {
        if (!st) return;
        placeClamped(el, st.l + e.clientX - st.x, st.t + e.clientY - st.y);
      });
      const end = e => {
        if (!st) return; st = null; el.classList.remove('dragging');
        try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
        const r = el.getBoundingClientRect(); if (onEnd) onEnd({ left: r.left, top: r.top });
      };
      handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    }
    ui.syncCapsule = function () {
      if (!ui.capsuleList) return;
      ui.capsuleList.querySelectorAll('.dtc-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === m.activeTool));
    };
    ui.toggleCapsule = function () {
      const hidden = ui.capsule.classList.toggle('hidden');
      try { localStorage.setItem(KEY_VIS, hidden ? '0' : '1'); } catch (e) {}
      return !hidden;
    };
    ui.showCapsule = function () { ui.capsule.classList.remove('hidden'); try { localStorage.setItem(KEY_VIS, '1'); } catch (e) {} };

    /* ============================ 2) التعليمات + المؤشر ============================ */
    function buildToast() {
      const t = h('div', 'dtt-toast hidden'); t.id = 'dtToast'; t.setAttribute('dir', 'rtl'); t.setAttribute('role', 'status');
      t.innerHTML = '<span class="dtt-count"></span><span class="dtt-text"></span><button type="button" class="dtt-cancel" aria-label="إلغاء الرسم">' + ICONS.trash + '</button>';
      t.querySelector('.dtt-cancel').addEventListener('click', e => { e.stopPropagation(); m._cancelDraft(); m.setActiveTool('cursor'); });
      document.body.appendChild(t); ui.toast = t;
    }
    ui.updateToast = function () {
      const tool = m.activeTool;
      if (!ui.toast) return;
      if (!tool || tool === 'cursor' || tool === 'crosshair') { ui.toast.classList.add('hidden'); return; }
      const need = m.draft ? m.draft.required : (global.__DT_INTERNAL__.POINTS_REQUIRED[tool] || 2);
      const done = m.draft ? Math.max(0, m.draft.drawing.points.length - 1) : 0; // النقطة الأخيرة معاينة حيّة
      const step = Math.min(done + 1, need === Infinity ? done + 1 : need);
      const hints = HINTS[tool] || HINTS.default;
      const txt = hints[Math.min(done, hints.length - 1)];
      ui.toast.querySelector('.dtt-text').textContent = txt;
      const cnt = ui.toast.querySelector('.dtt-count');
      cnt.textContent = need === Infinity ? ('نقطة ' + step) : (step + ' من ' + need);
      cnt.style.display = need === 1 ? 'none' : '';
      ui.toast.classList.remove('hidden');
    };
    function buildCrosshair() {
      const c = h('div', 'dtx-cross hidden'); c.id = 'dtCrosshair';
      c.innerHTML = '<i class="dtx-h"></i><i class="dtx-v"></i><i class="dtx-dot"></i>';
      m.container.appendChild(c); ui.cross = c;
      const move = e => {
        if (!m.activeTool || m.activeTool === 'cursor' || m.activeTool === 'crosshair') return;
        const r = m.container.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
        c.classList.toggle('hidden', !inside);
        c.style.setProperty('--x', x + 'px'); c.style.setProperty('--y', y + 'px');
      };
      on(m.container, 'mousemove', move); on(m.container, 'pointermove', move);
      on(m.container, 'mouseleave', () => c.classList.add('hidden'));
    }
    ui.onToolChanged = function () {
      const active = m.activeTool && m.activeTool !== 'cursor' && m.activeTool !== 'crosshair';
      m.container.classList.toggle('dt-tool-active', !!active);
      if (!active && ui.cross) ui.cross.classList.add('hidden');
      ui.syncCapsule(); ui.updateToast();
    };

    /* =========================== أدوات مساعدة للنوافذ =========================== */
    function swatch(color, opacity) {
      const b = h('button', 'dts-swatch'); b.type = 'button';
      const t = h('i'); b.appendChild(t); setSwatch(b, color, opacity); return b;
    }
    function setSwatch(b, color, opacity) {
      const t = b.firstChild; if (!t) return;
      const transparent = !color || color === 'transparent' || (opacity != null && opacity <= 0);
      b.classList.toggle('checker', transparent);
      t.style.background = transparent ? 'transparent' : color;
      t.style.opacity = opacity != null ? Math.max(0.15, opacity) : 1;
    }
    // يفتح لوحة الألوان للحقل field من d؛ opacityField اختياري؛ stroke لإظهار السمك/النمط
    function openPicker(anchor, d, field, o) {
      o = o || {};
      const cur = d[field] || d.color || '#2962FF';
      const op = o.opacityField ? (d[o.opacityField] != null ? d[o.opacityField] : 1) : (o.noOpacity ? 1 : (d.opacity != null ? d.opacity : 1));
      const spec = {
        anchorEl: anchor, color: /^#/.test(cur) ? cur : '#2962FF', opacity: Math.round(op * 100),
        onChange: (hex, opacity) => {
          d[field] = hex;
          if (o.opacityField) d[o.opacityField] = opacity / 100; else if (!o.noOpacity && field === 'color') d.opacity = opacity / 100;
          if (o.onSet) o.onSet(hex, opacity);
          if (anchor && anchor.firstChild) setSwatch(anchor, hex, o.showOpacity ? opacity / 100 : null);
          m._save(true);
        }
      };
      if (o.stroke) spec.stroke = { width: d.width || 1, lineStyle: d.lineStyle || 'solid', onChange: (w, ls) => { d.width = w; d.lineStyle = ls; if (o.onStroke) o.onStroke(w, ls); m._save(true); } };
      if (o.strokeOnly) spec.strokeOnly = true;
      global.UnifiedColorPicker.open(spec);
      const p = document.querySelector('.ucp-popup');
      if (p && o.strokeOnly) p.classList.add('ucp-stroke-only');
    }
    ui.openPicker = openPicker;

    /* ============================ 3) شريط الخصائص ============================ */
    function barSpec(d) {
      const t = d.type;
      if (TEXT_TYPES.includes(t)) return ['more', 'trash', 'size', 'bucket', 't', 'templates'];
      if (t === 'long' || t === 'short') return ['more', 'trash', 'lock', 'alert', 'settings', 'templates'];
      if (t === 'rect' || t === 'erect') return ['more', 'trash', 'angle', 'lock', 'alert', 'settings', 'style', 'width', 't', 'bucket', 'pen', 'templates'];
      if (['curve', 'path'].includes(t)) return ['more', 'trash', 'lock', 'alert', 'settings', 'style', 'width', 'pen', 'templates'];
      if (['ellipse', 'circle', 'circlerad', 'gannbox', 'fibtimezone'].includes(t)) return ['more', 'trash', 'lock', 'alert', 'settings', 'style', 'width', 'bucket', 'pen', 'templates'];
      if (['fib', 'fibext', 'fibchannel', 'fibfan', 'measure'].includes(t)) return ['more', 'trash', 'lock', 'alert', 'settings', 'style', 'width', 'pen', 'templates'];
      return ['more', 'trash', 'lock', 'alert', 'settings', 'style', 'width', 't', 'pen', 'templates']; // خطوط (vline, infoline, trendline, …)
    }
    function buildObjectBar() {
      const bar = h('div', 'dto-bar hidden'); bar.id = 'dtFloatingToolbar'; bar.setAttribute('dir', 'ltr'); bar.setAttribute('role', 'toolbar');
      bar.addEventListener('mousedown', e => e.stopPropagation());
      bar.addEventListener('pointerdown', e => e.stopPropagation());
      document.body.appendChild(bar); ui.objbar = bar; ui._barKey = null;
    }
    function lineStyleSample(ls) {
      const dash = ls === 'dotted' ? '1 5' : ls === 'dashed' ? '7 5' : '';
      return '<svg viewBox="0 0 44 16" class="dto-sample"><line x1="2" y1="8" x2="42" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="' + (ls === 'dotted' ? 'round' : 'butt') + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/></svg>';
    }
    function renderObjectBar(d) {
      const bar = ui.objbar; bar.innerHTML = '';
      const add = (id, html, extra) => {
        const b = h('button', 'dto-btn' + (extra ? ' ' + extra : ''), html); b.type = 'button'; b.dataset.act = id; b.id = ACT_ID[id] || ''; if (!b.id) b.removeAttribute('id');
        b.setAttribute('aria-label', ACT_LABEL[id] || id);
        b.addEventListener('click', e => { e.stopPropagation(); onBarAction(id, b, d); });
        bar.appendChild(b); return b;
      };
      barSpec(d).forEach(id => {
        if (id === 'more') add(id, ICONS.more);
        else if (id === 'trash') add(id, ICONS.trash);
        else if (id === 'lock') add(id, d.locked ? ICONS.lock : ICONS.unlock);
        else if (id === 'alert') add(id, ICONS.alert);
        else if (id === 'settings') add(id, ICONS.gear);
        else if (id === 'style') add(id, lineStyleSample(d.lineStyle), 'wide');
        else if (id === 'width') add(id, '<span>' + (d.width || 1) + 'px</span>', 'text');
        else if (id === 'size') add(id, '<span>' + (d.fontSize || 14) + '</span>', 'text');
        else if (id === 'angle') add(id, ICONS.angle);
        else if (id === 't') { const b = add(id, ICONS.t + '<u></u>', 'colored'); }
        else if (id === 'pen') { add(id, ICONS.pen + '<u></u>', 'colored'); }
        else if (id === 'bucket') { add(id, ICONS.bucket + '<u></u>', 'colored'); }
        else if (id === 'templates') add(id, ICONS.templates);
      });
      bar.appendChild(h('div', 'dto-grip', '<i></i><i></i><i></i><i></i><i></i><i></i>'));
      ui._barKey = d.id + ':' + d.type;
      paintBar(d);
    }
    const ACT_ID = { trash: 'dtDeleteBtn', lock: 'dtLockBtn', settings: 'dtSettingsBtn', pen: 'dtColorSwatch', more: 'dtMoreBtn' };
    const ACT_LABEL = { more: 'المزيد', trash: 'حذف', lock: 'قفل', alert: 'إضافة تنبيه', settings: 'الإعدادات', style: 'نمط الخط', width: 'سماكة الخط', size: 'حجم الخط', angle: 'تمديد', t: 'لون النص', pen: 'لون الخط', bucket: 'التعبئة', templates: 'القوالب' };
    function textColorOf(d) { return TEXT_TYPES.includes(d.type) ? (d.color) : (d.textColor || d.color); }
    function paintBar(d) {
      const bar = ui.objbar;
      const q = a => bar.querySelector('[data-act="' + a + '"]');
      let b;
      if ((b = q('lock'))) { b.innerHTML = d.locked ? ICONS.lock : ICONS.unlock; b.classList.toggle('on', !!d.locked); }
      if ((b = q('width'))) b.firstChild.textContent = (d.width || 1) + 'px';
      if ((b = q('size'))) b.firstChild.textContent = d.fontSize || 14;
      if ((b = q('style'))) b.innerHTML = lineStyleSample(d.lineStyle);
      if ((b = q('pen'))) b.querySelector('u').style.background = d.color;
      if ((b = q('t'))) b.querySelector('u').style.background = textColorOf(d);
      if ((b = q('bucket'))) b.querySelector('u').style.background = fillOf(d);
      if ((b = q('angle'))) b.classList.toggle('on', !!d.extended);
    }
    function fillOf(d) { return (TEXT_TYPES.includes(d.type) ? d.bgColor : d.fillColor) || d.color; }
    function onBarAction(id, btn, d) {
      if (id === 'trash') { m.deleteSelected(); closePopMenus(); return; }
      if (id === 'lock') { d.locked = !d.locked; m._save(); paintBar(d); return; }
      if (id === 'settings') { ui.openSettings(); return; }
      if (id === 'alert') { addAlert(d, btn); return; }
      if (id === 'more') { moreMenu(btn, d); return; }
      if (id === 'templates') { templateMenu(btn, d); return; }
      if (id === 'pen') { openPicker(btn, d, 'color', { stroke: true, onSet: () => paintBar(d), onStroke: () => paintBar(d) }); return; }
      if (id === 'style' || id === 'width') { openPicker(btn, d, 'color', { stroke: true, strokeOnly: true, onStroke: () => paintBar(d) }); return; }
      if (id === 't') {
        const f = TEXT_TYPES.includes(d.type) ? 'color' : 'textColor';
        openPicker(btn, d, f, { noOpacity: true, onSet: () => paintBar(d) }); return;
      }
      if (id === 'bucket') {
        const f = TEXT_TYPES.includes(d.type) ? 'bgColor' : 'fillColor';
        openPicker(btn, d, f, { opacityField: TEXT_TYPES.includes(d.type) ? 'bgOpacity' : 'fillOpacity', onSet: () => { if (TEXT_TYPES.includes(d.type)) d.showBackground = true; else d.filled = true; paintBar(d); } }); return;
      }
      if (id === 'size') { sizeMenu(btn, d); return; }
      if (id === 'angle') { d.extended = !d.extended; d.type = d.extended ? 'erect' : 'rect'; m._save(); paintBar(d); return; }
    }
    // قوائم منبثقة صغيرة (المزيد/الحجم/القوالب)
    let popMenu = null;
    function closePopMenus() { if (popMenu) { popMenu.remove(); popMenu = null; } document.removeEventListener('mousedown', outsidePop, true); }
    function outsidePop(e) { if (popMenu && !popMenu.contains(e.target)) closePopMenus(); }
    function openPopMenu(anchor, items, cls) {
      closePopMenus();
      const menu = h('div', 'dtm-menu ' + (cls || '')); menu.setAttribute('dir', 'rtl'); menu.setAttribute('role', 'menu');
      items.forEach(it => {
        if (it.sep) { menu.appendChild(h('div', 'dtm-sep')); return; }
        if (it.html) { menu.appendChild(it.html); return; }
        const b = h('button', 'dtm-item' + (it.danger ? ' danger' : '') + (it.on ? ' on' : ''), '<span>' + esc(it.label) + '</span>' + (it.hint ? '<small>' + esc(it.hint) + '</small>' : ''));
        b.type = 'button'; b.addEventListener('click', e => { e.stopPropagation(); if (!it.keepOpen) closePopMenus(); it.run(); });
        menu.appendChild(b);
      });
      document.body.appendChild(menu);
      const r = anchor.getBoundingClientRect();
      let left = r.left + r.width / 2 - menu.offsetWidth / 2, top = r.bottom + 8;
      if (top + menu.offsetHeight > window.innerHeight - 8) top = r.top - menu.offsetHeight - 8;
      menu.style.left = clamp(left, 8, window.innerWidth - menu.offsetWidth - 8) + 'px';
      menu.style.top = Math.max(8, top) + 'px';
      popMenu = menu; setTimeout(() => document.addEventListener('mousedown', outsidePop, true), 0);
      return menu;
    }
    ui.closePopMenus = closePopMenus;
    function moreMenu(btn, d) {
      openPopMenu(btn, [
        { label: 'نسخ', run: () => m.cloneSelected() },
        { label: 'إحضار للأمام', run: () => m.bringForward() },
        { label: 'إرسال للخلف', run: () => m.sendBackward() },
        { label: 'إخفاء', run: () => { d.hidden = true; m._save(); ui.syncObjectBar(); } },
        { label: 'شجرة الكائنات', run: () => m._openObjectTree() },
        { sep: true },
        { label: 'حذف', danger: true, run: () => m.deleteSelected() }
      ]);
    }
    function sizeMenu(btn, d) {
      openPopMenu(btn, [10, 12, 14, 16, 18, 20, 24, 28, 32, 40].map(n => ({ label: String(n), on: (d.fontSize || 14) === n, run: () => { d.fontSize = n; m._save(); paintBar(d); } })), 'compact');
    }
    function addAlert(d, btn) {
      const A = global.MultiChartAlerts;
      if (!A || !Array.isArray(A.list)) { toastMsg('التنبيهات غير متاحة'); return; }
      const type = ['trendline', 'ray', 'extline'].includes(d.type) ? 'trend' : (d.type === 'fib' ? 'fib' : (d.type === 'rect' || d.type === 'erect') ? 'rect' : 'drawing');
      const label = d.customName || TYPE_AR[d.type] || d.type;
      A.list.push({ id: 'al' + Date.now(), type, drawingId: d.id, opt: {}, condition: 'crosses', message: 'تنبيه: ' + label, triggered: false, _prevClose: null });
      if (A._renderList) { try { A._renderList(); } catch (e) {} }
      toastMsg('تمت إضافة تنبيه على «' + label + '»');
    }
    function toastMsg(text) {
      const t = h('div', 'dtt-flash', esc(text)); t.setAttribute('dir', 'rtl'); document.body.appendChild(t);
      setTimeout(() => t.classList.add('out'), 1800); setTimeout(() => t.remove(), 2300);
    }
    function templateMenu(btn, d, afterApply) {
      const all = m.listTemplates(d.type);
      const names = Object.keys(all);
      const items = names.map(n => ({ label: n, run: () => { m.applyTemplate(d.type, n); if (afterApply) afterApply(); paintBarSafe(); } }));
      const form = h('div', 'dtm-form');
      form.innerHTML = '<input type="text" class="dtm-input" placeholder="اسم القالب" maxlength="40"><button type="button" class="dtm-save">حفظ كقالب</button>';
      const inp = form.querySelector('input');
      form.querySelector('button').addEventListener('click', e => {
        e.stopPropagation(); const n = inp.value.trim(); if (!n) { inp.focus(); return; }
        m.saveTemplate(d.type, n, d.toJSON()); closePopMenus(); toastMsg('تم حفظ القالب «' + n + '»');
      });
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') form.querySelector('button').click(); });
      const list = items.length ? items : [{ label: 'لا توجد قوالب محفوظة', run: () => {} }];
      if (!items.length) list[0].keepOpen = true;
      if (names.length) {
        const defName = localStorage.getItem('dt_default_template_' + d.type);
        names.forEach(n => list.push({ label: 'تعيين «' + n + '» افتراضيًا', hint: defName === n ? '✓' : '', run: () => m.setDefaultTemplate(d.type, n) }));
        names.forEach(n => list.push({ label: 'حذف «' + n + '»', danger: true, run: () => m.deleteTemplate(d.type, n) }));
      }
      list.push({ sep: true }); list.push({ html: form });
      openPopMenu(btn, list, 'templates');
    }
    function paintBarSafe() { if (m.selected && ui.objbar && !ui.objbar.classList.contains('hidden')) paintBar(m.selected); }
    ui.syncObjectBar = function () {
      const d = m.selected, bar = ui.objbar;
      if (!bar) return;
      if (!d || d.hidden) { bar.classList.add('hidden'); closePopMenusIfBarGone(); return; }
      const key = d.id + ':' + d.type;
      if (ui._barKey !== key) renderObjectBar(d); else paintBar(d);
      const box = d.boundingBoxPixels(m);
      const cr = m.container.getBoundingClientRect();
      bar.classList.remove('hidden');
      const bw = bar.offsetWidth || 400, bh = bar.offsetHeight || 50;
      let top = cr.top + Math.min(box.y1, box.y2) - bh - 14;
      if (top < cr.top + 8) top = cr.top + Math.max(box.y1, box.y2) + 14;
      top = clamp(top, 8, window.innerHeight - bh - 8);
      let left = cr.left + (box.x1 + box.x2) / 2 - bw / 2;
      left = clamp(left, cr.left + 4, Math.max(cr.left + 4, cr.right - bw - 4));
      bar.style.top = top + 'px'; bar.style.left = left + 'px';
    };
    function closePopMenusIfBarGone() { if (popMenu) closePopMenus(); }

    /* ====================== 4) نافذة الإعدادات (لكل أداة) ====================== */
    function buildSettings() {
      const ov = h('div', 'dtsw-overlay hidden'); ov.id = 'dtSettingsOverlay';
      ov.innerHTML =
        '<div class="dtsw-win" id="dtSettingsModal" role="dialog" aria-modal="true" dir="rtl">' +
        '  <div class="dtsw-header">' +
        '    <div class="dtsw-title-wrap"><span class="dtsw-title" id="dtSmTitle"></span><button type="button" class="dtsw-edit" id="dtSmEdit" aria-label="تعديل الاسم">' + ICONS.pencilSm + '</button></div>' +
        '    <button type="button" class="dtsw-close" id="dtSmClose" aria-label="إغلاق">' + ICONS.close + '</button>' +
        '  </div>' +
        '  <div class="dtsw-tabs-wrap"><div class="dtsw-tabs" id="dtSmTabs" role="tablist"></div><div class="dtsw-track"><i class="dtsw-ind" id="dtSmInd"></i></div></div>' +
        '  <div class="dtsw-body" id="dtSmBody"></div>' +
        '  <div class="dtsw-footer">' +
        '    <button type="button" class="dtsw-tpl" id="dtSmTpl"><span>قالب</span>' + ICONS.chevron + '</button>' +
        '    <button type="button" class="dtsw-btn" id="dtSmCancel">إلغاء</button>' +
        '    <button type="button" class="dtsw-btn primary" id="dtSmOk">موافق</button>' +
        '  </div></div>';
      document.body.appendChild(ov);
      ui.settings = ov;
      m.settingsOverlay = ov;
      m.smTitleEl = ov.querySelector('#dtSmTitle'); m.smTabsEl = ov.querySelector('#dtSmTabs'); m.smBodyEl = ov.querySelector('#dtSmBody');
      const win = ov.querySelector('#dtSettingsModal');
      ov.querySelector('#dtSmClose').addEventListener('click', () => m._cancelSettingsModal());
      ov.querySelector('#dtSmCancel').addEventListener('click', () => m._cancelSettingsModal());
      ov.querySelector('#dtSmOk').addEventListener('click', () => { m._save(); m._settingsSnapshot = null; m._closeSettingsModal(); });
      ov.querySelector('#dtSmTpl').addEventListener('click', e => { e.stopPropagation(); const d = m._settingsTarget; if (d) templateMenu(e.currentTarget, d, () => renderTab(ui._tab)); });
      ov.addEventListener('mousedown', e => { if (e.target === ov) { /* النقر خارج النافذة لا يغلقها (كما في المرجع) */ } });
      ov.querySelector('#dtSmEdit').addEventListener('click', () => editName());
      // سحب النافذة من الترويسة
      const head = ov.querySelector('.dtsw-header'); let ds = null;
      head.addEventListener('pointerdown', e => {
        if (e.target.closest('button,input')) return;
        const r = win.getBoundingClientRect(); ds = { x: e.clientX, y: e.clientY, l: r.left, t: r.top };
        win.style.position = 'fixed'; win.style.margin = '0'; win.style.left = r.left + 'px'; win.style.top = r.top + 'px'; win.style.transform = 'none';
        head.setPointerCapture(e.pointerId); e.preventDefault();
      });
      head.addEventListener('pointermove', e => { if (!ds) return; win.style.left = clamp(ds.l + e.clientX - ds.x, 0, window.innerWidth - 80) + 'px'; win.style.top = clamp(ds.t + e.clientY - ds.y, 0, window.innerHeight - 60) + 'px'; });
      head.addEventListener('pointerup', () => { ds = null; });
      on(window, 'resize', () => { if (!ov.classList.contains('hidden')) placeIndicator(); });
    }
    function editName() {
      const d = m._settingsTarget; if (!d) return;
      const t = m.smTitleEl; if (t.querySelector('input')) return;
      const inp = h('input', 'dtsw-title-input'); inp.type = 'text'; inp.value = d.customName || TYPE_AR[d.type] || d.type; inp.maxLength = 60;
      t.textContent = ''; t.appendChild(inp); inp.focus(); inp.select();
      const done = ok => { if (!inp.parentNode) return; if (ok) d.customName = inp.value.trim(); t.textContent = d.customName || TYPE_AR[d.type] || d.type; };
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true));
    }
    ui.openSettings = function () {
      const d = m.selected; if (!d) return;
      m._settingsTarget = d;
      m._settingsSnapshot = JSON.parse(JSON.stringify(d.toJSON()));
      m.smTitleEl.textContent = d.customName || TYPE_AR[d.type] || d.type;
      const tabs = tabsFor(d.type); ui._tabs = tabs;
      m.smTabsEl.innerHTML = '';
      tabs.forEach(t => {
        const b = h('button', 'dtsw-tab', esc(TAB_LABEL[t])); b.type = 'button'; b.dataset.tab = t; b.setAttribute('role', 'tab');
        b.addEventListener('click', () => switchTab(t));
        m.smTabsEl.appendChild(b);
      });
      ui.settings.classList.remove('hidden');
      const win = ui.settings.querySelector('#dtSettingsModal');
      win.style.cssText = ''; // إعادة التموضع في المنتصف
      win.classList.toggle('single-tab', tabs.length === 1);
      switchTab(tabs[0]);
    };
    ui.closeSettings = function () { if (ui.settings) ui.settings.classList.add('hidden'); try { global.UnifiedColorPicker.close(); } catch (e) {} };
    function switchTab(t) {
      ui._tab = t;
      m.smTabsEl.querySelectorAll('.dtsw-tab').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      renderTab(t); placeIndicator();
    }
    function placeIndicator() {
      const act = m.smTabsEl.querySelector('.dtsw-tab.active'), ind = ui.settings.querySelector('#dtSmInd'), track = ind.parentNode;
      if (!act) return;
      const a = act.getBoundingClientRect(), tr = track.getBoundingClientRect();
      ind.style.width = a.width + 'px';
      ind.style.transform = 'translateX(' + (a.left - tr.left) + 'px)';
    }
    function renderTab(t) {
      const d = m._settingsTarget; if (!d) return;
      const body = m.smBodyEl; body.innerHTML = '';
      let node;
      const B = BUILD;
      try {
        if (t === 'style') node = (B.style[d.type] || B.style._generic)(d);
        else if (t === 'text') node = (d.type === 'text' || TEXT_TYPES.includes(d.type)) ? B.textBox(d) : B.textTab(d);
        else if (t === 'coords') node = d.type === 'infoline' ? m._buildInfoLineCoordinatesTab(d) : m._buildCoordinatesTab(d);
        else if (t === 'vis') node = (d.type === 'infoline' || d.type === 'fib') ? BUILD.visRanges(d) : m._buildVisibilityTab(d);
        else if (t === 'inputs') node = m._buildTradeTab(d);
      } catch (err) { node = h('div', 'dtsw-error', 'تعذّر عرض هذا التبويب'); console.error('[TVDrawUI] tab error', t, err); }
      body.appendChild(node || h('div'));
      body.scrollTop = 0;
    }

    /* -------- حقول مشتركة -------- */
    const F = {
      row(label, ...ctrls) {
        const r = h('div', 'dts-row'); r.appendChild(h('span', 'dts-label', esc(label)));
        const c = h('div', 'dts-ctrls'); ctrls.forEach(x => x && c.appendChild(x)); r.appendChild(c); return r;
      },
      section(label) { return h('div', 'dts-section', esc(label)); },
      check(val, on) {
        const b = h('button', 'dts-check' + (val ? ' on' : ''), ICONS.check); b.type = 'button'; b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', val ? 'true' : 'false');
        b.addEventListener('click', () => { const n = !b.classList.contains('on'); b.classList.toggle('on', n); b.setAttribute('aria-checked', n ? 'true' : 'false'); on(n); });
        return b;
      },
      select(val, opts, on, wide) {
        const w = h('label', 'dts-select' + (wide ? ' wide' : '')); const s = h('select');
        opts.forEach(o => { const op = document.createElement('option'); op.value = o.value != null ? o.value : o; op.textContent = o.label != null ? o.label : o; s.appendChild(op); });
        s.value = String(val); s.addEventListener('change', () => on(s.value)); w.appendChild(s); w.insertAdjacentHTML('beforeend', ICONS.chevron); return w;
      },
      num(val, on, o) {
        o = o || {}; const i = h('input', 'dts-input'); i.type = 'number'; i.step = o.step || 'any'; if (o.min != null) i.min = o.min; if (o.max != null) i.max = o.max;
        i.value = val == null ? '' : val; i.addEventListener('change', () => { const v = parseFloat(i.value); if (Number.isFinite(v)) on(v); }); return i;
      },
      color(d, field, o) { const b = swatch(d[field] || d.color, o && o.showOpacity ? (d[o.opacityField || 'opacity']) : null); b.addEventListener('click', () => openPicker(b, d, field, o)); return b; },
      iconSeg(items, cur, on) { // أزرار أيقونات مختارة بحد أزرق
        const w = h('div', 'dts-iconseg');
        items.forEach(it => { const b = h('button', 'dts-iconbtn' + (it.v === cur ? ' sel' : ''), it.html); b.type = 'button'; b.setAttribute('aria-label', it.label || ''); b.addEventListener('click', () => { w.querySelectorAll('.dts-iconbtn').forEach(x => x.classList.toggle('sel', x === b)); on(it.v); }); w.appendChild(b); });
        return w;
      },
      fmt(d) { // B / I
        const w = h('div', 'dts-fmt');
        [['bold', 'B'], ['italic', 'I']].forEach(([k, t]) => { const b = h('button', 'dts-fmtbtn ' + k + (d[k] ? ' on' : ''), t); b.type = 'button'; b.setAttribute('aria-pressed', d[k] ? 'true' : 'false'); b.addEventListener('click', () => { d[k] = !d[k]; b.classList.toggle('on', d[k]); b.setAttribute('aria-pressed', d[k] ? 'true' : 'false'); }); w.appendChild(b); });
        return w;
      }
    };
    const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48];
    const ALIGN_V = [{ value: 'top', label: 'الأعلى' }, { value: 'middle', label: 'الوسط' }, { value: 'bottom', label: 'الأسفل' }];
    const ALIGN_H = [{ value: 'left', label: 'يسار' }, { value: 'center', label: 'مركز' }, { value: 'right', label: 'يمين' }];

    /* -------- بناة التبويبات -------- */
    const BUILD = { style: {} };
    const wrap = () => h('div', 'dts-wrap');

    // خط عمودي: صف واحد "خط" + لوحة الألوان (اللون/الشفافية/السمك/النمط)
    BUILD.style.vline = d => { const w = wrap(); w.appendChild(F.row('خط', F.color(d, 'color', { stroke: true, showOpacity: true }))); return w; };
    BUILD.style.hline = BUILD.style.vline;

    // ربط إعدادات النهايات بالحقول التي يرسمها المحرك فعلًا (arrowDirection / endpointStyle)
    function applyEnds(d) {
      const s = d.extra && d.extra.endStart === 'arrow', e = d.extra && d.extra.endEnd === 'arrow';
      d.endpointStyle = s && e ? 'both' : s ? 'start' : e ? 'end' : 'none';
      d.arrowDirection = s && e ? 'both' : s ? 'start' : 'end';
    }
    const EXT = [{ value: 'none', label: 'لا تقم بالتمديد' }, { value: 'left', label: 'تمديد لليسار' }, { value: 'right', label: 'تمديد لليمين' }, { value: 'both', label: 'تمديد للجهتين' }];
    function lineEndsRow(d) {
      d.extra = d.extra || {};
      const mk = (k) => {
        const cur = d.extra[k] || 'normal';
        const b = h('button', 'dts-iconbtn', cur === 'arrow' ? ICONS.arrowPointed : ICONS.arrowPlain); b.type = 'button';
        b.addEventListener('click', e => {
          e.stopPropagation();
          openPopMenu(b, [
            { label: 'عادي', on: (d.extra[k] || 'normal') === 'normal', run: () => { d.extra[k] = 'normal'; b.innerHTML = ICONS.arrowPlain; applyEnds(d); } },
            { label: 'سهم', on: d.extra[k] === 'arrow', run: () => { d.extra[k] = 'arrow'; b.innerHTML = ICONS.arrowPointed; applyEnds(d); } }
          ], 'compact');
        });
        return b;
      };
      return [F.color(d, 'color', { stroke: true, showOpacity: true }), mk('endStart'), mk('endEnd')];
    }
    // منحنى / مسار
    BUILD.style.curve = d => {
      const w = wrap();
      w.appendChild(F.row('خط', ...lineEndsRow(d)));
      w.appendChild(F.row('تمديد', F.select(d.extendMode || 'none', EXT, v => { d.extendMode = v; d.extendLeft = v === 'left' || v === 'both'; d.extendRight = v === 'right' || v === 'both'; }, true)));
      const bgSw = F.color(d, 'fillColor', { opacityField: 'fillOpacity', showOpacity: true, onSet: () => { d.filled = true; } });
      w.appendChild(F.row('الخلفية', bgSw, F.check(!!d.filled && d.type === 'curve' && d.extra && d.extra.bgOn, v => { d.extra = d.extra || {}; d.extra.bgOn = v; d.filled = v; })));
      return w;
    };
    BUILD.style.path = BUILD.style.curve;
    // مستطيل / إهليلج: حدود + تعبئة
    BUILD.style.rect = d => {
      const w = wrap();
      w.appendChild(F.row('الحدود', F.color(d, 'borderColor', { stroke: true, noOpacity: true, onSet: () => { d.showBorder = true; } }), F.check(d.showBorder !== false, v => d.showBorder = v)));
      w.appendChild(F.row('الخلفية', F.color(d, 'fillColor', { opacityField: 'fillOpacity', showOpacity: true, onSet: () => { d.filled = true; } }), F.check(d.filled !== false, v => d.filled = v)));
      return w;
    };
    BUILD.style.erect = BUILD.style.rect; BUILD.style.ellipse = BUILD.style.rect; BUILD.style.circle = BUILD.style.rect; BUILD.style.circlerad = BUILD.style.rect;

    // خط معلومات: نمط الخط + النهايات + التمديد + المنتصف + الإحصائيات
    BUILD.style.infoline = d => {
      const w = wrap(); d.extra = d.extra || {};
      w.appendChild(F.row('خط', ...lineEndsRow(d)));
      w.appendChild(F.row('تمديد', F.select(d.extendMode || 'none', EXT, v => d.extendMode = v, true)));
      w.appendChild(F.row('نقطة المنتصف', F.check(!!d.showMidpoint, v => d.showMidpoint = v)));
      w.appendChild(F.row('عنوان السعر', F.check(d.showPriceLabel !== false, v => d.showPriceLabel = v)));
      w.appendChild(F.section('معلومات'));
      const STAT = [{ value: 'priceRange', label: 'المدى السعري' }, { value: 'percent', label: 'التغير بالنسبة' }, { value: 'points', label: 'التغير بالنقاط' }, { value: 'bars', label: 'عدد الأعمدة' }, { value: 'dateTime', label: 'التاريخ/الوقت' }, { value: 'distance', label: 'المسافة' }, { value: 'angle', label: 'زاوية' }];
      const sel = d.statsMetrics && d.statsMetrics.length ? d.statsMetrics[0] : 'angle';
      w.appendChild(F.row('الإحصائيات', F.select(sel, STAT, v => { d.statsMetrics = [v]; }, true)));
      w.appendChild(F.row('موقف الإحصائيات', F.select(d.statsPosition || 'center', [{ value: 'start', label: 'بداية' }, { value: 'center', label: 'مركز' }, { value: 'end', label: 'نهاية' }], v => d.statsPosition = v, true)));
      w.appendChild(F.row('أظهر الإحصائيات دائمًا', F.check(!!d.statsAlways, v => d.statsAlways = v)));
      return w;
    };

    // فيبوناتشي: جدول مستويات بعمودين + إعدادات عامة
    BUILD.style.fib = d => {
      const w = wrap(); const lv = d.fibLevels || [];
      const grid = h('div', 'dts-levels');
      lv.forEach((l, i) => {
        const cell = h('div', 'dts-level' + (l.enabled ? '' : ' off'));
        const chk = F.check(!!l.enabled, v => { l.enabled = v; cell.classList.toggle('off', !v); });
        const inp = F.num(l.value, v => { l.value = v; }); inp.setAttribute('aria-label', 'قيمة المستوى ' + (i + 1));
        const sw = swatch(l.color); sw.addEventListener('click', () => global.UnifiedColorPicker.open({ anchorEl: sw, color: l.color, opacity: 100, onChange: hex => { l.color = hex; setSwatch(sw, hex); m._save(true); } }));
        cell.append(chk, inp, sw); grid.appendChild(cell);
      });
      w.appendChild(grid);
      const one = h('button', 'dts-onecolor', '<span class="dts-diag"></span><span>استخدم لون واحد</span>'); one.type = 'button';
      one.addEventListener('click', () => global.UnifiedColorPicker.open({ anchorEl: one, color: d.color, opacity: 100, onChange: hex => { lv.forEach(l => l.color = hex); d.color = hex; grid.querySelectorAll('.dts-swatch').forEach(s => setSwatch(s, hex)); m._save(true); } }));
      w.appendChild(one);
      w.appendChild(F.row('الخلفية', F.check(!!d.filled, v => d.filled = v), F.color(d, 'fillColor', { opacityField: 'fillOpacity', showOpacity: true, onSet: () => { d.filled = true; } })));
      w.appendChild(F.row('انعكاس', F.check(!!d.reverse, v => d.reverse = v)));
      w.appendChild(F.row('أسعار', F.check(d.showFibValues !== false, v => d.showFibValues = v)));
      d.extra = d.extra || {};
      w.appendChild(F.row('مستويات', F.check(d.extra.fibShowLevels !== false, v => d.extra.fibShowLevels = v), F.select(d.extra.fibLevelsMode === 'percent' ? 'percent' : 'values', [{ value: 'values', label: 'القيم' }, { value: 'percent', label: 'النسبة المئوية' }], v => d.extra.fibLevelsMode = v)));
      w.appendChild(F.row('عناوين', F.select(d.lineTextAlign === 'left' ? 'left' : 'right', [{ value: 'right', label: 'يمين' }, { value: 'left', label: 'يسار' }], v => d.lineTextAlign = v), F.select(d.textVerticalAlign === 'top' ? 'top' : 'middle', [{ value: 'middle', label: 'وسط' }, { value: 'top', label: 'الأعلى' }], v => d.textVerticalAlign = v)));
      w.appendChild(F.row('النص', F.check(d.showLabel !== false, v => d.showLabel = v)));
      w.appendChild(F.row('حجم الخط', F.select(String(d.fontSize || 10), SIZES.map(String), v => d.fontSize = +v)));
      const logRow = F.row('مستويات فيبوناتشي استنادا على المقياس اللوغاريتمي', F.check(false, () => {})); logRow.classList.add('dts-disabled');
      logRow.querySelectorAll('input,button').forEach(x => { x.disabled = true; x.setAttribute('aria-disabled', 'true'); });
      w.appendChild(logRow);
      return w;
    };
    BUILD.style.fibext = BUILD.style.fib;

    // مقياس مزدوج المقبض (مسار 120×12، مقبضان 18) — يحترم اتجاه RTL: الحد الأدنى جهة اليمين
    function dualRange(lo, hi, a, b, on) {
      const el = h('div', 'dts-dual'); const fill = h('div', 'dts-dual-fill');
      const hA = h('button', 'dts-dual-h'), hB = h('button', 'dts-dual-h');
      [hA, hB].forEach(x => { x.type = 'button'; x.setAttribute('role', 'slider'); x.setAttribute('aria-valuemin', lo); x.setAttribute('aria-valuemax', hi); });
      el.append(fill, hA, hB);
      const st = { a, b };
      const pos = v => (1 - (v - lo) / Math.max(1, hi - lo)) * 100;
      function paint() {
        hA.style.left = pos(st.a) + '%'; hB.style.left = pos(st.b) + '%';
        hA.setAttribute('aria-valuenow', st.a); hB.setAttribute('aria-valuenow', st.b);
        fill.style.left = pos(st.b) + '%'; fill.style.width = (pos(st.a) - pos(st.b)) + '%';
      }
      function valFromX(clientX) { const r = el.getBoundingClientRect(); const f = 1 - Math.min(1, Math.max(0, (clientX - r.left) / r.width)); return Math.round(lo + f * (hi - lo)); }
      function set(which, v, silent) {
        if (which === 'a') st.a = Math.max(lo, Math.min(st.b, v)); else st.b = Math.min(hi, Math.max(st.a, v));
        paint(); if (!silent) on(st.a, st.b);
      }
      [['a', hA], ['b', hB]].forEach(([which, hd]) => {
        hd.addEventListener('pointerdown', e => {
          e.preventDefault(); hd.setPointerCapture(e.pointerId); hd.classList.add('drag');
          const mv = ev => set(which, valFromX(ev.clientX));
          const up = () => { hd.classList.remove('drag'); hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up); };
          hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
        });
        hd.addEventListener('keydown', e => {
          const k = e.key; const step = (k === 'ArrowLeft' || k === 'ArrowDown') ? 1 : (k === 'ArrowRight' || k === 'ArrowUp') ? -1 : 0; // RTL: اليسار = زيادة
          if (step) { e.preventDefault(); set(which, (which === 'a' ? st.a : st.b) + step); }
        });
      });
      el.addEventListener('pointerdown', e => { if (e.target !== el && e.target !== fill) return; const v = valFromX(e.clientX); set(Math.abs(v - st.a) <= Math.abs(v - st.b) ? 'a' : 'b', v); });
      paint();
      return { el, set };
    }
    const VIS_UNITS = [['seconds', 'ثواني', 59], ['minutes', 'دقائق', 59], ['hours', 'ساعات', 24], ['days', 'الأيام', 366], ['weeks', 'أسابيع', 52], ['months', 'الشهور', 12]];
    BUILD.visRanges = d => {
      const w = wrap();
      w.appendChild(F.row('تيكات السعر', F.check(d.showPriceTicks !== false, v => d.showPriceTicks = v)));
      d.visibilityRanges = d.visibilityRanges || {};
      VIS_UNITS.forEach(([key, label, max]) => {
        const r = d.visibilityRanges[key] || (d.visibilityRanges[key] = { enabled: true, min: 1, max });
        const row = h('div', 'dts-vrow' + (r.enabled !== false ? '' : ' off'));
        const chk = F.check(r.enabled !== false, v => { r.enabled = v; row.classList.toggle('off', !v); m._save(true); });
        const name = h('span', 'dts-vname', esc(label));
        let dual;
        const lo = F.num(r.min || 1, v => { r.min = Math.max(1, Math.min(r.max || max, Math.round(v))); lo.value = r.min; dual.set('a', r.min, true); m._save(true); }, { min: 1, max });
        const hi = F.num(r.max || max, v => { r.max = Math.min(max, Math.max(r.min || 1, Math.round(v))); hi.value = r.max; dual.set('b', r.max, true); m._save(true); }, { min: 1, max });
        dual = dualRange(1, max, r.min || 1, r.max || max, (a, b2) => { r.min = a; r.max = b2; lo.value = a; hi.value = b2; m._save(true); });
        row.append(chk, name, lo, dual.el, hi); w.appendChild(row);
      });
      w.appendChild(F.row('Ranges', F.check(d.showRanges !== false, v => d.showRanges = v)));
      return w;
    };

    // مركز شراء/بيع: نمط
    function positionStyle(d) {
      const w = wrap();
      w.appendChild(F.row('الخطوط', F.color(d, 'color', { stroke: true, noOpacity: true })));
      w.appendChild(F.row('لون وقف الخسارة', F.color(d, 'lossColor', { noOpacity: true })));
      w.appendChild(F.row('لون الهدف', F.color(d, 'profitColor', { noOpacity: true })));
      w.appendChild(F.row('النص', F.color(d, 'textColor', { noOpacity: true })));
      w.appendChild(F.row('عنوان السعر', F.check(d.showPriceLabel !== false, v => d.showPriceLabel = v)));
      w.appendChild(F.section('معلومات'));
      w.appendChild(F.row('أظهر الإحصائيات دائمًا', F.check(!!d.statsAlways, v => d.statsAlways = v)));
      return w;
    }
    BUILD.style.long = positionStyle; BUILD.style.short = positionStyle;

    // النمط العام للأدوات الأخرى: يعاد استخدام منطق النمط الحالي
    BUILD.style._generic = d => m._buildStyleTab(d);

    // تبويب "النص" للأدوات الخطية/المستطيل (صف أدوات + منطقة نص + محاذاة)
    BUILD.textTab = d => {
      const w = wrap();
      const tools = h('div', 'dts-toolsrow');
      const fieldColor = d.type === 'infoline' || d.type === 'vline' || d.type === 'trendline' ? 'textColor' : 'color';
      tools.append(F.color(d, fieldColor, { noOpacity: true }), F.select(String(d.fontSize || 14), SIZES.map(String), v => d.fontSize = +v), F.fmt(d));
      w.appendChild(tools);
      const ta = h('textarea', 'dts-textarea'); ta.placeholder = 'إضافة نص'; ta.value = d.text || ''; ta.addEventListener('input', () => d.text = ta.value);
      w.appendChild(ta);
      if (d.type === 'rect' || d.type === 'erect') {
        w.appendChild(F.row('محاذاة النص', F.select(d.textVerticalAlign === 'top' ? 'inside' : 'inside', [{ value: 'inside', label: 'بالداخل' }, { value: 'top', label: 'الأعلى' }, { value: 'bottom', label: 'الأسفل' }], v => { d.textVerticalAlign = v === 'inside' ? 'middle' : v; d.textPos = { rx: d.textAlign === 'left' ? 0.08 : d.textAlign === 'right' ? 0.92 : 0.5, ry: v === 'top' ? 0.1 : v === 'bottom' ? 0.9 : 0.5 }; }), F.select(d.textAlign === 'left' || d.textAlign === 'right' ? d.textAlign : 'center', [{ value: 'center', label: 'مركز' }, { value: 'left', label: 'يسار' }, { value: 'right', label: 'يمين' }], v => { d.textAlign = v; const pos = d.textPos || { rx: .5, ry: .5 }; d.textPos = { rx: v === 'left' ? .08 : v === 'right' ? .92 : .5, ry: pos.ry }; })));
      } else {
        w.appendChild(F.row('محاذاة النص', F.select(d.textVerticalAlign || 'top', ALIGN_V, v => d.textVerticalAlign = v), F.select(d.textAlign || (d.type === 'infoline' ? 'left' : 'center'), ALIGN_H, v => d.textAlign = v)));
      }
      if (d.type === 'vline') w.appendChild(F.row('اتجاه النص', F.select(d.extra && d.extra.textOrientation || 'horizontal', [{ value: 'horizontal', label: 'أفقي' }, { value: 'vertical', label: 'عمودي' }], v => { d.extra = d.extra || {}; d.extra.textOrientation = v; })));
      return w;
    };
    // نافذة "نص" (ملاحظة/تعليق/وسم أيضًا): صف أدوات + مربع نص كبير + خلفية/إطار/التفاف
    BUILD.textBox = d => {
      const w = wrap();
      const tools = h('div', 'dts-toolsrow');
      tools.append(F.color(d, 'color', { noOpacity: true }), F.select(String(d.fontSize || 14), SIZES.map(String), v => d.fontSize = +v), F.fmt(d));
      w.appendChild(tools);
      const ta = h('textarea', 'dts-textarea tall'); ta.placeholder = 'إضافة نص'; ta.value = d.text || ''; ta.addEventListener('input', () => d.text = ta.value);
      w.appendChild(ta);
      d.extra = d.extra || {};
      w.appendChild(F.row('الخلفية', F.check(!!d.showBackground, v => d.showBackground = v), F.color(d, 'bgColor', { opacityField: 'bgOpacity', showOpacity: true, onSet: () => { d.showBackground = true; } })));
      w.appendChild(F.row('الإطار', F.check(!!d.borderColor, v => { d.borderColor = v ? (d.borderColor || '#4A4F75') : null; }), F.color(d, 'borderColor', { noOpacity: true })));
      w.appendChild(F.row('التفاف النص', F.check(!!d.extra.wrap, v => d.extra.wrap = v)));
      return w;
    };

    ui.BUILD = BUILD; ui.F = F;

    /* ========================= 5) محرر النص المضمّن ========================= */
    ui.editText = function (d, onDone) {
      if (!d || !d.points || !d.points[0]) return;
      const p = m.toPixel(d.points[0]); const cr = m.container.getBoundingClientRect();
      const ta = h('textarea', 'dtt-inline'); ta.setAttribute('dir', 'auto'); ta.rows = 1; ta.value = d.text && d.text !== 'Text' && d.text !== 'Label' ? d.text : '';
      ta.placeholder = 'إضافة نص'; ta.style.fontSize = (d.fontSize || 14) + 'px'; ta.style.color = d.color;
      ta.style.left = (cr.left + p.x) + 'px'; ta.style.top = (cr.top + p.y - (d.type === 'text' ? 4 : (d.fontSize || 14) + 18)) + 'px';
      document.body.appendChild(ta);
      let done = false, armed = false;
      setTimeout(() => { ta.focus(); armed = true; }, 60); // بعد انتهاء النقرة الأصلية كي لا تسحب التركيز
      const finish = commit => {
        if (done) return; done = true;
        if (commit) {
          const v = ta.value.trim();
          if (!v && !d._hadText) { m.drawings = m.drawings.filter(x => x !== d); m.select(null); }
          else if (v) d.text = v;
        } else if (!d._hadText) { m.drawings = m.drawings.filter(x => x !== d); m.select(null); }
        ta.remove(); m._save(); if (onDone) onDone();
      };
      ta.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') finish(false); else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); } });
      ta.addEventListener('blur', () => { if (armed) finish(true); });
      d._hadText = !!(d.text && d.text !== 'Text' && d.text !== 'Label');
    };

    /* ================================ تهيئة/تنظيف ================================ */
    buildCapsule(); buildToast(); buildCrosshair(); buildObjectBar(); buildSettings();
    on(document, 'keydown', e => { if (e.key === 'Escape') closePopMenus(); });
    ui.syncCapsule();
    ui.destroy = function () {
      ui.destroyed = true; cleanups.forEach(f => { try { f(); } catch (e) {} });
      [ui.capsule, ui.toast, ui.cross, ui.objbar, ui.settings].forEach(el => { if (el && el.parentNode) el.parentNode.removeChild(el); });
      closePopMenus();
    };
    return ui;
  }

  global.TVDrawUI = { create, ICONS, CAPSULE_TOOLS, tabsFor };
})(window);
