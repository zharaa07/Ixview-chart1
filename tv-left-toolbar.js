/* =========================================================================
   tv-left-toolbar.js — شريط أدوات الرسم الأيسر (مواصفات «مواصفات شريط أدوات الرسم الأيسر»)
   - عرض 72px نسبي (1728×1080)، أزرار 46×46، أيقونات خطية SVG، فواصل عند المجموعات.
   - أزرار المجموعات (مؤشرات، خطوط، فيبوناتشي، أنماط، توقعات، فراشي/أشكال) تفتح قوائم جانبية.
   - القوائم تستدعي أدوات DrawingManager الموجودة فقط؛ ما ليس له محرك يظهر معطّلاً (soon).
   - تحميل هذا الملف أخيراً بعد drawing.js.
   ========================================================================= */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const mgr = () => (global.DrawingTools && (global.DrawingTools.activeManager || global.DrawingTools.manager)) || null;

  // ---------- أيقونات خطية (viewBox 28) ----------
  const P = {
    cross: 'M14 4v7M14 17v7M4 14h7M17 14h7',
    dot: '<circle cx="14" cy="14" r="3.2" fill="currentColor" stroke="none"/>',
    arrow: 'M8 5l12 9.5-5.2.9 3.2 6-2.6 1.3-3.1-6-4.3 3.5z',
    demo: '<circle cx="14" cy="14" r="9"/><path d="M12 10.5l5.5 3.5-5.5 3.5z"/>',
    eraser: 'M5 17l9-9 8 8-5 5H10zM11 11l8 8M12 23h11',
    trend: '<path d="M6 21L22 7"/><circle cx="6" cy="21" r="2"/><circle cx="22" cy="7" r="2"/>',
    ray: '<path d="M6 21L24 5"/><circle cx="6" cy="21" r="2"/>',
    info: '<path d="M5 21L19 9"/><circle cx="5" cy="21" r="1.8"/><rect x="15" y="12" width="9" height="9" rx="2"/>',
    ext: 'M3 22L25 6M3 22l3-.5M3 22l.5-3M25 6l-3 .5M25 6l-.5 3',
    hline: '<path d="M4 14h20"/><circle cx="14" cy="14" r="2"/>',
    hray: '<path d="M6 14h18"/><circle cx="6" cy="14" r="2"/>',
    vline: '<path d="M14 4v20"/><circle cx="14" cy="14" r="2"/>',
    crossline: 'M14 4v20M4 14h20',
    angle: 'M5 22h18M5 22L19 9',
    channel: 'M5 17L19 5M9 24L23 12',
    pitchfork: 'M5 23L17 11M10 6l13 12M14 4l9 9',
    fib: 'M4 7h20M4 12h20M4 17h20M4 22h20',
    fibc: '<path d="M4 8h20M4 14h20M4 20h20"/><circle cx="6" cy="8" r="1.8"/><circle cx="22" cy="20" r="1.8"/>',
    fibtz: 'M6 5v18M11 5v18M17 5v18M24 5v18',
    fan: 'M5 23L24 6M5 23L24 12M5 23L24 18',
    circles: '<circle cx="12" cy="14" r="4"/><circle cx="12" cy="14" r="8"/>',
    spiral: 'M14 14a2 2 0 1 1 2 2 4 4 0 1 1-4-4 7 7 0 1 1 7 7',
    gann: '<rect x="5" y="5" width="18" height="18"/><path d="M5 23L23 5M5 23l18-9M5 23l9-18"/>',
    pattern: 'M4 20l6-12 5 8 4-10 5 14',
    elliott: 'M3 21l5-9 4 6 5-12 4 7 4-3',
    cycle: 'M3 14c3-9 6-9 8 0s5 9 8 0 4-6 6-3',
    long: '<rect x="5" y="5" width="18" height="8" fill="currentColor" fill-opacity=".18"/><rect x="5" y="13" width="18" height="9"/>',
    short: '<rect x="5" y="6" width="18" height="9"/><rect x="5" y="15" width="18" height="8" fill="currentColor" fill-opacity=".18"/>',
    bars: 'M6 22V10M11 22V6M16 22V13M21 22V8',
    vwap: 'M4 20c4-8 7 2 11-4s6-6 9-8',
    range: 'M5 8h18M5 20h18M14 8v12M11 11l3-3 3 3M11 17l3 3 3-3',
    ruler: 'M5 19L19 5l4 4L9 23zM9 15l2 2M12 12l2 2M15 9l2 2',
    brush: 'M8 21c3 0 4-2 4-4l8-9-3-3-9 8c-2 0-4 1-4 4z',
    marker: 'M7 21l3-1 11-11-2-2L8 18zM6 23h8',
    arrowmark: 'M6 22L22 6M22 6h-8M22 6v8',
    arrowline: 'M5 21L23 7M23 7l-6 1M23 7l-1 6',
    arrowup: 'M14 23V6M8 12l6-6 6 6',
    arrowdown: 'M14 5v17M8 16l6 6 6-6',
    rect: '<rect x="5" y="7" width="18" height="14" rx="1"/>',
    rrect: '<rect x="5" y="7" width="18" height="14" rx="5"/>',
    path: '<path d="M5 20l7-9 5 6 6-10"/><circle cx="5" cy="20" r="1.8"/><circle cx="23" cy="7" r="1.8"/>',
    circle: '<circle cx="14" cy="14" r="9"/>',
    ellipse: '<ellipse cx="14" cy="14" rx="10" ry="6.5"/>',
    poly: 'M5 20l4-11 8 3 6-5-2 14z',
    tri: 'M14 6l10 16H4z',
    arc: 'M5 21c0-10 8-16 18-14',
    curve: 'M4 21C9 4 15 4 18 14s4 7 6 3',
    dcurve: 'M3 14c3-8 6-8 8 0s5 8 8 0',
    text: 'M7 7h14M14 7v15M11 22h6',
    note: '<rect x="5" y="5" width="18" height="18" rx="2"/><path d="M9 11h10M9 15h10M9 19h6"/>',
    callout: 'M5 6h18v12H13l-5 4v-4H5z',
    emoji: '<circle cx="14" cy="14" r="9.5"/><path d="M10 12h.01M18 12h.01M9.5 16.5c2.5 3 6.5 3 9 0"/>',
    zoomin: '<circle cx="12" cy="12" r="7"/><path d="M17 17l6 6M9 12h6M12 9v6"/>',
    zoomout: '<circle cx="12" cy="12" r="7"/><path d="M17 17l6 6M9 12h6"/>',
    magnet: 'M7 5v9a7 7 0 0 0 14 0V5h-4v9a3 3 0 0 1-6 0V5zM7 9h4M17 9h4',
    stay: 'M5 22l1-5 9-9 4 4-9 9zM18 6l2-2 4 4-2 2',
    lock: '<rect x="6" y="13" width="16" height="10" rx="2"/><path d="M9.5 13V9.5a4.5 4.5 0 0 1 9 0V13"/>',
    unlock: '<rect x="6" y="13" width="16" height="10" rx="2"/><path d="M9.5 13V9.5a4.5 4.5 0 0 1 8.7-1.6"/>',
    eye: '<path d="M3 14c3-5 6-7 11-7s8 2 11 7c-3 5-6 7-11 7S6 19 3 14z"/><circle cx="14" cy="14" r="3.2"/>',
    eyeoff: '<path d="M3 14c3-5 6-7 11-7s8 2 11 7c-3 5-6 7-11 7S6 19 3 14z"/><path d="M5 23L23 5"/>',
    trash: 'M6 8h16M11 8V5h6v3M8 8l1 15h10l1-15M12 12v7M16 12v7',
    link: 'M11 17l6-6M12 8l2-2a4.5 4.5 0 0 1 6.5 6.5L18 15M16 20l-2 2a4.5 4.5 0 0 1-6.5-6.5L10 13',
    star: 'M14 4l3 7 7.5.6-5.7 5 1.8 7.4L14 20l-6.6 4 1.8-7.4-5.7-5L11 11z',
    help: '<circle cx="14" cy="14" r="11" fill="#BDBDBD" stroke="none"/><path d="M11 11a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.1-1.5 2.4M14 20v.01" stroke="#fff"/>'
  };
  function icon(key, size, extra) {
    const v = P[key] || P.trend;
    const inner = v.charAt(0) === '<' ? v : '<path d="' + v + '"/>';
    return '<svg class="tvlt-ic ' + (extra || '') + '" viewBox="0 0 28 28" width="' + (size || 28) + '" height="' + (size || 28) + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  // ---------- تعريف القوائم: [id|null, الاسم, أيقونة, اختصار] — id=null => المحرك لا يدعمه بعد ----------
  const T = (id, label, ic, key) => ({ id, label, ic, key: key || '' });
  const H = t => ({ heading: t });
  const GROUPS = [
    { id: 'tvltCursor', ic: 'cross', title: 'المؤشرات', stars: true, items: [
      T('cursor', 'تقاطع', 'cross'), T('cursor:dot', 'نقطة', 'dot'), T('cursor:arrow', 'سهم', 'arrow'),
      T(null, 'توضيح', 'demo'), { sep: true }, T(null, 'ممحاة', 'eraser') ] },
    { id: 'tvltLines', ic: 'trend', title: 'الخطوط', items: [
      T('trendline', 'خط اتجاه', 'trend', 'Alt + T'), T('ray', 'شعاع', 'ray'), T('infoline', 'خط معلومات', 'info'),
      T('extline', 'خط ممتد', 'ext'), T(null, 'زاوية الاتجاه', 'angle'), T('hline', 'خط أفقي', 'hline', 'Alt + H'),
      T(null, 'شعاع أفقي', 'hray', 'Alt + J'), T('vline', 'خط عمودي', 'vline', 'Alt + V'), T(null, 'الخط المتقاطع', 'crossline', 'Alt + C'),
      H('القنوات'), T(null, 'قناة متوازية', 'channel'), T(null, 'اتجاه الانحدار', 'channel'), T(null, 'قمة/قاع مسطح', 'channel'), T(null, 'قناة منفصلة', 'channel'),
      H('PITCHFORKS'), T(null, 'شوكة Pitchfork', 'pitchfork'), T(null, 'شوكة شيف', 'pitchfork'), T(null, 'شوكة شيف المعدلة', 'pitchfork'), T(null, 'شوكة داخلية', 'pitchfork') ] },
    { id: 'tvltFib', ic: 'fib', title: 'فيبوناتشي', items: [
      T('fib', 'تصحيح فيبوناتشي', 'fib', 'Alt + F'), T('fibext', 'امتداد فيبوناتشي', 'fib'), T('fibchannel', 'قناة فيبوناتشي', 'fibc'),
      T('fibtimezone', 'منطقة الزمن فيبوناتشي', 'fibtz'), T('fibfan', 'مروحة مقاومة السرعة فيبوناتشي', 'fan'),
      T(null, 'وقت فيبوناتشي قائم على الاتجاه', 'fibtz'), T(null, 'دوائر فيبوناتشي', 'circles'), T(null, 'حلزون فيبوناتشي', 'spiral'),
      T(null, 'أقواس مقاومة السرعة فيبوناتشي', 'arc'), T(null, 'إسفين فيبوناتشي', 'fan'), T(null, 'مروحة Pitchfork', 'pitchfork'),
      H('جان'), T('gannbox', 'صندوق جان', 'gann'), T(null, 'مربع جان ثابت', 'gann'), T(null, 'مربع جان', 'gann'), T(null, 'مروحة جان', 'fan') ] },
    { id: 'tvltPatterns', ic: 'pattern', title: 'الأنماط', items: [
      H('أنماط الرسم البياني'), T(null, 'نموذج XABCD', 'pattern'), T(null, 'نموذج Cypher', 'pattern'), T(null, 'الرأس والكتفين', 'pattern'),
      T(null, 'نموذج ABCD', 'pattern'), T(null, 'نموذج المثلث', 'pattern'), T(null, 'نموذج ثلاثي الحركات', 'pattern'),
      H('موجات إليوت'), T(null, 'موجة إليوت الاندفاعية', 'elliott'), T(null, 'موجة إليوت التصحيحية', 'elliott'), T(null, 'موجة إليوت المثلثية', 'elliott'),
      T(null, 'موجة إليوت المزدوجة المركبة', 'elliott'), T(null, 'موجة إليوت الثلاثية المركبة', 'elliott'),
      H('دورات'), T(null, 'خطوط دورية', 'fibtz'), T(null, 'دورات الزمن', 'cycle'), T(null, 'خط جيبي', 'cycle') ] },
    { id: 'tvltForecast', ic: 'long', title: 'التوقعات والقياس', items: [
      H('التوقعات'), T('long', 'مركز شراء', 'long'), T('short', 'مركز بيع', 'short'), T(null, 'توقع المركز', 'long'),
      T(null, 'نمط الأعمدة', 'bars'), T(null, 'تغذية وهمية', 'bars'), T(null, 'قطاع', 'arc'),
      H('معتمد على الحجم'), T(null, 'VWAP المثبت', 'vwap'), T(null, 'بروفايل الحجم بنطاق ثابت', 'bars'), T(null, 'بروفايل الحجم المثبت', 'bars'),
      H('المقاييس'), T(null, 'نطاق السعر', 'range'), T(null, 'نطاق التاريخ', 'range'), T('measure', 'نطاق التاريخ والسعر', 'range') ] },
    { id: 'tvltBrush', ic: 'brush', title: 'الفراشي والأسهم والأشكال', items: [
      H('فراشي'), T(null, 'فرشاة', 'brush'), T(null, 'لون مُميِّز', 'marker'),
      H('أسهم'), T(null, 'علامة سهم', 'arrowmark'), T('arrow', 'سهم', 'arrowline'), T(null, 'سهم لأعلى', 'arrowup'), T(null, 'سهم لأسفل', 'arrowdown'),
      H('أشكال'), T('rect', 'مستطيل', 'rect', 'Shift + Alt + R'), T('erect', 'مستطيل ممتد', 'rect'), T(null, 'مستطيل مُدار', 'rrect'), T('path', 'مسار', 'path'),
      T('circlerad', 'دائرة', 'circle'), T('ellipse', 'قطع ناقص', 'ellipse'), T(null, 'خط متعدد', 'poly'), T(null, 'مثلث', 'tri'),
      T(null, 'قوس', 'arc'), T('curve', 'منحنى', 'curve'), T(null, 'منحنى مزدوج', 'dcurve') ] }
  ];
  // أدوات التعليق التوضيحي (نص / ملاحظة / Callout) متاحة من زر النص بقائمة صغيرة
  const TEXT_GROUP = { id: 'tvltText', ic: 'text', title: 'نصوص وملاحظات', items: [
    T('text', 'نص', 'text'), T('note', 'ملاحظة نص', 'note'), T('callout', 'Callout', 'callout') ] };

  const HOTKEYS = { 't': 'trendline', 'h': 'hline', 'v': 'vline', 'f': 'fib' };
  const lastKey = id => 'tvlt_last_' + id;
  const toolMeta = {}; GROUPS.concat([TEXT_GROUP]).forEach(g => g.items.forEach(it => { if (it.id) toolMeta[it.id] = it; }));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  let bar = null, flyout = null, flyOwner = null, hintEl = null, savedRange = null, zoomOutBtn = null;
  const btnById = {};

  function closeFly() {
    if (flyout) { flyout.remove(); flyout = null; }
    if (flyOwner) { flyOwner.classList.remove('tvlt-open'); flyOwner = null; }
  }

  function showHint(text) {
    hideHint();
    hintEl = el('div', 'tvlt-hint', '<button type="button" class="tvlt-hint-x" aria-label="إغلاق">✕</button><span></span>');
    hintEl.querySelector('span').textContent = text;
    hintEl.querySelector('button').addEventListener('click', hideHint);
    document.body.appendChild(hintEl);
  }
  function hideHint() { if (hintEl) { hintEl.remove(); hintEl = null; } }

  function chooseTool(group, item, btn) {
    const m = mgr(); if (!m || !item.id) return;
    closeFly();
    try { localStorage.setItem(lastKey(group.id), item.id); } catch (e) {}
    setGroupIcon(group, item);
    if (item.id.indexOf('cursor') === 0) {
      m.setActiveTool('cursor');
      m.cursorStyle = item.id.split(':')[1] || 'cross';
      try { localStorage.setItem('tvlt_cursor_style', m.cursorStyle); } catch (e) {}
    } else {
      m._registerRecentTool && m._registerRecentTool(item.id);
      m.setActiveTool(item.id);
    }
  }

  function setGroupIcon(group, item) {
    const b = btnById[group.id]; if (!b) return;
    const span = b.querySelector('.tvlt-ic-wrap'); if (span) span.innerHTML = icon(item.ic);
  }

  function openFly(group, btn) {
    if (flyOwner === btn) { closeFly(); return; }
    closeFly();
    const m = mgr();
    flyout = el('div', 'tvlt-fly'); flyout.setAttribute('role', 'menu'); flyout.dataset.group = group.id;
    group.items.forEach(it => {
      if (it.sep) { flyout.appendChild(el('div', 'tvlt-fly-sep')); return; }
      if (it.heading) { flyout.appendChild(el('div', 'tvlt-fly-head', '')).textContent = it.heading; return; }
      const enabled = !!it.id;
      const row = el('div', 'tvlt-row' + (enabled ? '' : ' tvlt-soon'));
      row.setAttribute('role', 'menuitem'); row.dataset.tool = it.id || '';
      if (!enabled) { row.title = 'غير متاحة بعد'; row.setAttribute('aria-disabled', 'true'); row.tabIndex = -1; }
      const sel = enabled && m && (m.activeTool === it.id);
      if (sel) row.classList.add('tvlt-sel');
      row.innerHTML = icon(it.ic, 26, 'tvlt-row-ic');
      const lab = el('span', 'tvlt-row-label'); lab.textContent = it.label; row.appendChild(lab);
      row.appendChild(el('span', 'tvlt-row-grow'));
      if (it.key) { const k = el('span', 'tvlt-row-key'); k.textContent = it.key; row.appendChild(k); }
      if (enabled && !group.stars && it.id !== 'cursor') {
        const fav = m && m.favoriteTools && m.favoriteTools.indexOf(it.id) >= 0;
        const s = el('button', 'tvlt-row-star' + (fav ? ' on' : ''), icon('star', 22)); s.type = 'button'; s.title = 'إضافة إلى المفضلة';
        s.addEventListener('click', e => { e.stopPropagation(); const mm = mgr(); if (mm) { mm._toggleFavorite(it.id); s.classList.toggle('on', mm.favoriteTools.indexOf(it.id) >= 0); } });
        row.appendChild(s);
      }
      if (enabled) row.addEventListener('click', e => { e.stopPropagation(); chooseTool(group, it, btn); });
      flyout.appendChild(row);
    });
    document.body.appendChild(flyout);
    const r = btn.getBoundingClientRect(), bw = bar.getBoundingClientRect();
    flyout.style.left = bw.right + 'px';
    const top = Math.max(bw.top, Math.min(r.top - 8, innerHeight - flyout.offsetHeight - 8));
    flyout.style.top = top + 'px';
    flyout.style.maxHeight = (innerHeight - top - 8) + 'px';
    btn.classList.add('tvlt-open'); flyOwner = btn;
  }

  function mkBtn(id, ic, title, onClick, cls) {
    const b = el('button', 'tvlt-btn' + (cls ? ' ' + cls : ''), '<span class="tvlt-ic-wrap">' + icon(ic) + '</span>');
    b.id = id; b.type = 'button'; b.title = title; b.setAttribute('aria-label', title);
    b.addEventListener('click', e => { e.stopPropagation(); onClick(b, e); });
    btnById[id] = b; return b;
  }
  const sep = () => el('div', 'tvlt-sep');

  function toolActive(id) { const m = mgr(); return m && m.activeTool === id; }

  function refresh() {
    const m = mgr(); if (!m) return;
    GROUPS.concat([TEXT_GROUP]).forEach(g => {
      const b = btnById[g.id]; if (!b) return;
      const ids = g.items.filter(i => i.id).map(i => i.id);
      b.classList.toggle('tvlt-tool-active', ids.indexOf(m.activeTool) >= 0 && m.activeTool !== 'cursor');
    });
    const cur = btnById.tvltCursor; if (cur) cur.classList.toggle('tvlt-tool-active', m.activeTool === 'cursor' && false);
    const mg = btnById.tvltMagnet; if (mg) mg.classList.toggle('tvlt-active', m.magnetMode && m.magnetMode !== 'off');
    const st = btnById.tvltStay; if (st) st.classList.toggle('tvlt-active', !!m.stayInDraw);
    const lk = btnById.tvltLock; if (lk) { const all = m.drawings.length && m.drawings.every(d => d.locked); lk.classList.toggle('tvlt-active', !!all); lk.querySelector('.tvlt-ic-wrap').innerHTML = icon(all ? 'lock' : 'unlock'); }
    const ey = btnById.tvltEye; if (ey) { const hid = m.drawings.length && m.drawings.every(d => d.hidden); ey.classList.toggle('tvlt-active', !!hid); ey.querySelector('.tvlt-ic-wrap').innerHTML = icon(hid ? 'eyeoff' : 'eye'); }
    const fv = btnById.tvltFav; if (fv) fv.classList.toggle('tvlt-fav-on', !!(m._tvUi && m._tvUi.capsule && !m._tvUi.capsule.classList.contains('hidden')));
  }

  function onToolChange(e) {
    const id = e && e.detail && e.detail.tool;
    if (id && id !== 'cursor') showHint('اضغط باستمرار على Alt للرسم المؤقت'); else hideHint();
    refresh();
  }

  function build() {
    if (document.getElementById('tvLeftToolbar')) return;
    bar = el('div'); bar.id = 'tvLeftToolbar'; bar.setAttribute('dir', 'rtl');
    const g1 = el('div', 'tvlt-group'), g2 = el('div', 'tvlt-group'), g3 = el('div', 'tvlt-group'), g4 = el('div', 'tvlt-group');

    GROUPS.forEach(g => {
      let ic = g.ic; try { const last = localStorage.getItem(lastKey(g.id)); if (last && toolMeta[last]) ic = toolMeta[last].ic; } catch (e) {}
      const b = mkBtn(g.id, ic, g.title, (btn) => openFly(g, btn), 'tvlt-grp'); g1.appendChild(b);
    });
    // نص: زر مباشر بأداة النص (القائمة الصغيرة بنقر مطوّل غير مطلوبة)
    g1.appendChild(mkBtn('tvltText', 'text', 'نص', (btn) => { const m = mgr(); if (!m) return; closeFly(); m.setActiveTool(m.activeTool === 'text' ? 'cursor' : 'text'); }, 'tvlt-grp'));
    g1.lastChild.title = 'نص';
    g1.appendChild(mkBtn('tvltEmoji', 'emoji', 'الرموز التعبيرية', (btn) => {
      const m = mgr(); if (!m || !global.TVEmojiPicker) return; closeFly();
      global.TVEmojiPicker.open(btn, (emoji) => { m.setActiveTool('cursor'); m._pendingEmojiText = emoji; m.setActiveTool('text'); });
    }));

    g2.appendChild(mkBtn('tvltRuler', 'ruler', 'قياس', () => { const m = mgr(); if (!m) return; closeFly(); m.setActiveTool(m.activeTool === 'measure' ? 'cursor' : 'measure'); }));
    g2.appendChild(mkBtn('tvltZoom', 'zoomin', 'تكبير', () => {
      const m = mgr(); if (!m) return; closeFly();
      try {
        const ts = m.chart.timeScale(), range = ts.getVisibleLogicalRange();
        if (range) {
          if (!savedRange) savedRange = { from: range.from, to: range.to };
          const mid = (range.from + range.to) / 2, half = (range.to - range.from) / 4;
          ts.setVisibleLogicalRange({ from: mid - half, to: mid + half });
          zoomOutBtn.style.display = '';
        }
      } catch (e) {}
    }));
    zoomOutBtn = mkBtn('tvltZoomOut', 'zoomout', 'تصغير', () => {
      const m = mgr(); if (!m || !savedRange) return;
      try { m.chart.timeScale().setVisibleLogicalRange(savedRange); } catch (e) {}
      savedRange = null; zoomOutBtn.style.display = 'none';
    });
    zoomOutBtn.style.display = 'none'; g2.appendChild(zoomOutBtn);

    g3.appendChild(mkBtn('tvltMagnet', 'magnet', 'مغناطيس', () => {
      const m = mgr(); if (!m) return; closeFly();
      m.magnetMode = (m.magnetMode && m.magnetMode !== 'off') ? 'off' : 'normal';
      try { localStorage.setItem('dt_magnet_mode', m.magnetMode); } catch (e) {} refresh();
    }));
    g3.appendChild(mkBtn('tvltStay', 'stay', 'البقاء في وضع الرسم', () => {
      const m = mgr(); if (!m) return; closeFly(); m.stayInDraw = !m.stayInDraw;
      try { localStorage.setItem('dt_stay_in_draw', m.stayInDraw ? '1' : '0'); } catch (e) {} refresh();
    }));
    g3.appendChild(mkBtn('tvltLock', 'unlock', 'قفل كل الرسومات', () => {
      const m = mgr(); if (!m) return; closeFly();
      const anyUnlocked = m.drawings.some(d => !d.locked); m.drawings.forEach(d => d.locked = anyUnlocked); m._save(); refresh();
    }));
    g3.appendChild(mkBtn('tvltEye', 'eye', 'إخفاء كل الرسومات', () => { const m = mgr(); if (!m) return; closeFly(); m.toggleHideAll(); refresh(); }));

    g4.appendChild(mkBtn('tvltDelete', 'trash', 'حذف الرسومات', () => { const m = mgr(); if (!m) return; closeFly(); m.clearAll(); refresh(); }));
    g4.appendChild(mkBtn('tvltLink', 'link', 'نسخ رابط', () => {
      const m = mgr(); if (!m) return; closeFly();
      if (m.selected) {
        const payload = JSON.stringify(m.selected.toJSON());
        const url = location.href.split('#')[0] + '#drawing=' + encodeURIComponent(btoa(unescape(encodeURIComponent(payload))));
        if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
        alert('تم نسخ رابط الرسمة المحددة');
      } else { if (navigator.clipboard) navigator.clipboard.writeText(location.href).catch(() => {}); alert('تم نسخ رابط الشارت'); }
    }));

    bar.appendChild(g1); bar.appendChild(sep()); bar.appendChild(g2); bar.appendChild(sep()); bar.appendChild(g3); bar.appendChild(sep()); bar.appendChild(g4);
    bar.appendChild(el('div', 'tvlt-spacer'));
    const fav = mkBtn('tvltFav', 'star', 'المفضلة', () => { const m = mgr(); if (!m) return; closeFly(); m._toggleFavBar(); setTimeout(refresh, 0); }, 'tvlt-favbtn');
    const fw = el('div', 'tvlt-group'); fw.appendChild(fav); bar.appendChild(fw);
    document.body.appendChild(bar);

    const old = document.getElementById('dtDrawBtn'); if (old) old.classList.add('tvlt-hidden-old');
    const m = mgr();
    if (m) {
      try { if (localStorage.getItem('dt_stay_in_draw') === '1') m.stayInDraw = true; } catch (e) {}
      refresh();
    }
  }

  function init() {
    build(); setTimeout(build, 400);
    document.addEventListener('dt:toolchange', onToolChange);
    document.addEventListener('mousedown', e => { if (flyout && !flyout.contains(e.target) && !(bar && bar.contains(e.target))) closeFly(); }, true);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeFly(); return; }
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = (e.code || '').replace('Key', '').toLowerCase();
      let tool = HOTKEYS[k];
      if (e.shiftKey && k === 'r') tool = 'rect'; else if (e.shiftKey) return;
      const m = mgr(); if (!tool || !m) return;
      e.preventDefault(); closeFly(); m.setActiveTool(tool);
    });
    setInterval(refresh, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  global.TVLeftToolbar = { GROUPS, refresh, closeFly, icon };
})(window);
