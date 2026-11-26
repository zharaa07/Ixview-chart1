/* =========================================================================
   Tv-topbar.js — الشريط العلوي لـ IXVIEW (مطابق لمواصفات PDF: فاتح، RTL، 1728×1080)

   مبدأ العمل: واجهة جديدة فوق الوظائف الموجودة فعلاً، بلا إعادة كتابة لها.
     - Undo/Redo      → DrawingTools.(activeManager|manager).undo()/redo()
     - التخطيط والمزامنة والحفظ → MultiChart (setLayout, sync*, saveLayout...)
     - الفاصل الزمني   → select#timeframeSelect (حدث change كما كان)
     - الرمز / المقارنة → MultiChartSymbolSearch + pane._openCompareTypePicker
     - المؤشرات        → TVIndicatorsUI.openPicker
     - الإعدادات        → زر settingsBtn الأصلي (TVSettings.open)
     - Replay          → backtestBtn / exitBacktestBtn الأصليان
     - التنبيهات        → alAlertsBtn الأصلي
   ما لا يملك المشروع له وظيفة (نشر أفكار، تداول، نوع الرسم، التحليلات الفنية...)
   لا يُحاكى: يُعرض إشعار صريح بأنه غير مدعوم.

   يُحمَّل أخيراً بعد drawing/backtest/multichart/alerts (كما كان الملف القديم).
   ========================================================================= */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const REF_W = 1728;
  const LS = { name: 'ix_layout_name', auto: 'ix_autosave', tfFav: 'ix_tf_favs', tfCustom: 'ix_tf_custom', fold: 'ix_tf_fold' };
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let U = 1;

  /* ------------------------------------------------------------ أيقونات (SVG خطية، سماكة 2) */
  const P = {
    bulb: '<path d="M10 20h8M11 23.5h6M14 3.5a7 7 0 0 0-4 12.7V18h8v-1.8A7 7 0 0 0 14 3.5z"/><path d="M14 8v6M11 11h6"/>',
    camera: '<path d="M3.5 9h4.5l2-3h8l2 3h4.5v13h-21z"/><circle cx="14" cy="15" r="4.2"/>',
    full: '<path d="M5 10V5h5M18 5h5v5M23 18v5h-5M10 23H5v-5"/>',
    gear: '<path d="M14 3l9.5 5.5v11L14 25l-9.5-5.5v-11z"/><circle cx="14" cy="14" r="4"/>',
    quick: '<circle cx="11.5" cy="11.5" r="7.5"/><path d="M17 17l7 7"/><path d="M12.5 7.5l-3 4.5h4l-2.5 4"/>',
    redo: '<path d="M21 12H11.5a5.5 5.5 0 0 0 0 11H16M21 12l-4.5-4.5M21 12l-4.5 4.5"/>',
    undo: '<path d="M7 12h9.5a5.5 5.5 0 0 1 0 11H12M7 12l4.5-4.5M7 12l4.5 4.5"/>',
    replay: '<path d="M14 6.5L5 14l9 7.5zM23.5 6.5L14.5 14l9 7.5z" stroke-linejoin="round"/>',
    alarm: '<circle cx="13" cy="15" r="8"/><path d="M13 10.5V15l3 2M3.5 7L8 3.5M22.5 7L18 3.5"/><path d="M22 19.5l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" stroke-width="1.4"/>',
    ind: '<path d="M3 11c4-7 7 4 11-2s6-1 10-4"/><path d="M6 25v-7M13 25v-9M20 25v-6"/>',
    candles: '<path d="M8 3.5v21M5 8h6v10H5zM20 5v21M17 10h6v9h-6z"/>',
    plusc: '<circle cx="14" cy="14" r="11"/><path d="M14 8.5v11M8.5 14h11"/>',
    chev: '<path d="M1.5 1.5l4 4 4-4"/>',
    video: '<rect x="3.5" y="7" width="15" height="14" rx="3"/><path d="M18.5 12l6-3.5v11l-6-3.5z"/>',
    cloud: '<path d="M8 21a5 5 0 0 1-.8-9.9A7 7 0 0 1 20.6 10 5.5 5.5 0 0 1 20 21z"/><path d="M14 11v7M10.5 14.5h7"/>',
    save: '<path d="M5 4h14l4 4v16H5z"/><path d="M9 4v6h8V4M9 24v-8h10v8"/>',
    copy: '<rect x="9" y="9" width="14" height="14" rx="2.5"/><path d="M5 19V6.5A2.5 2.5 0 0 1 7.5 4H19"/>',
    pen: '<path d="M4 24l1-5L19.5 4.5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L9 23z"/>',
    dl: '<path d="M14 4v14M8.5 13l5.5 5.5 5.5-5.5M5 23h18"/>',
    plus: '<path d="M14 5v18M5 14h18"/>',
    share: '<path d="M14 4v13M9 8l5-5 5 5M6 13v10h16V13"/>',
    folder: '<path d="M3.5 7h7l2.5 3h11v13h-20.5z"/>',
    star: '<path d="M14 4l3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1z" stroke-linejoin="round"/>',
    trash: '<path d="M5 8h18M11 8V5h6v3M7 8l1 15h12l1-15M12 12v8M16 12v8"/>',
    news: '<rect x="4" y="4" width="20" height="20" rx="3"/><path d="M9 10h10M9 14h10M9 18h6"/>',
    season: '<circle cx="14" cy="14" r="10"/><path d="M14 8v6l4 3"/>',
    people: '<circle cx="10" cy="10" r="3.5"/><circle cx="19" cy="11" r="2.8"/><path d="M3.5 22c0-4 3-6.5 6.5-6.5s6.5 2.5 6.5 6.5M17 16c3-.5 7 1.2 7 5.5"/>',
    tech: '<path d="M4 22l6-8 5 4 9-12"/><path d="M4 25h20"/>',
    check: '<path d="M6 14.5l5.5 5.5L22 9"/>'
  };
  const ic = (n, w, h, extra) => '<svg width="' + (w || 24) + '" height="' + (h || w || 24) + '" viewBox="' + (n === 'chev' ? '0 0 11 7' : '0 0 28 28') + '" fill="none" stroke="currentColor" stroke-width="' + (n === 'chev' ? 1.8 : 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + P[n] + '</svg>';
  const icu = (n, w, h) => ic(n, Math.round(w * U), Math.round((h || w) * U));

  /* ------------------------------------------------------------ مساعدات */
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MC = () => window.MultiChart;
  const drawMgr = () => { const D = window.DrawingTools; return D && (D.activeManager || D.manager); };
  const activePane = () => { const M = MC(); try { return (M && M.getActivePane && M.getActivePane()) || (M && M.panes && M.panes[0]) || null; } catch (e) { return null; } };

  function setU() {
    U = Math.max(0.6, Math.min(1.2, window.innerWidth / REF_W));
    const r = document.documentElement.style;
    r.setProperty('--tb-u', U.toFixed(4));
    r.setProperty('--tv-header-height', (57 * U).toFixed(2) + 'px');
  }

  let toastTimer = null;
  function toast(msg, opts) {
    opts = opts || {};
    let t = $('ixToast');
    if (!t) { t = el('div'); t.id = 'ixToast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.className = opts.err ? 'err' : '';
    t.innerHTML = '<span>' + esc(msg) + '</span><span class="tic"><svg width="16" height="16" viewBox="0 0 28 28" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round">' + (opts.err ? '<path d="M14 6v10M14 22v.1"/>' : P.check) + '</svg></span>';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), opts.ms || 3200);
  }
  // ميزة بلا دعم حقيقي في المشروع: لا نحاكيها، نقول ذلك بوضوح.
  const unsupported = what => toast('غير مدعوم حالياً: ' + what, { err: true, ms: 3800 });

  function infoModal(title, text) {
    const bg = el('div', 'ix-modal-bg'), m = el('div', 'ix-modal');
    m.innerHTML = '<h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>';
    const ok = el('button', 'ok', 'حسناً'); ok.addEventListener('click', () => bg.remove());
    m.appendChild(ok); bg.appendChild(m);
    bg.addEventListener('mousedown', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg); ok.focus();
  }

  /* ------------------------------------------------------------ مدير القوائم (واحدة مفتوحة فقط) */
  const Menus = {
    cur: null, anchor: null, name: null,
    close() {
      if (this.cur) { this.cur.remove(); this.cur = null; }
      if (this.anchor) { this.anchor.classList.remove('ix-open'); this.anchor = null; }
      this.name = null;
    },
    toggle(name, anchor, build, opts) {
      opts = opts || {};
      if (this.name === name) { this.close(); return; }      // الضغط على الزر المفتوح يغلق قائمته
      this.close();                                           // فتح قائمة يغلق السابقة
      const m = el('div', 'ix-menu'); m.dataset.menu = name;
      m.style.width = Math.min(window.innerWidth - 16, Math.round((opts.w || 300) * Math.max(U, 0.85))) + 'px';
      build(m);
      document.body.appendChild(m);
      this.cur = m; this.anchor = anchor; this.name = name;
      if (anchor) anchor.classList.add('ix-open');
      const top = Math.round(57 * U) - 2;
      m.style.top = top + 'px';
      m.style.maxHeight = (window.innerHeight - top - 8) + 'px';
      if (opts.tall) m.style.height = (window.innerHeight - top - 8) + 'px';
      const ar = anchor ? anchor.getBoundingClientRect() : { left: 8, width: 0 };
      const w = m.offsetWidth;
      let left = opts.alignRight ? ar.left + ar.width - w : ar.left + ar.width / 2 - w / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      m.style.left = left + 'px';
    }
  };
  document.addEventListener('pointerdown', e => {
    if (!Menus.cur) return;
    if (Menus.cur.contains(e.target)) return;
    if (Menus.anchor && Menus.anchor.contains(e.target)) return; // زر القائمة نفسه يتولى الإغلاق
    Menus.close();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') Menus.close(); });
  window.addEventListener('resize', () => { setU(); Menus.close(); relayout(); });

  function row(o) {
    const r = el('button', 'ix-row' + (o.big ? ' big' : '') + (o.sel ? ' sel' : '') + (o.off ? ' off' : ''));
    r.type = 'button';
    let h = '';
    if (o.icon) h += '<span class="ic">' + ic(o.icon, 26) + '</span>';
    h += '<span class="tx"><div class="tt">' + esc(o.title) + '</div>' + (o.sub ? '<div class="sub">' + esc(o.sub) + '</div>' : '') + '</span>';
    if (o.key) h += '<span class="key">' + esc(o.key) + '</span>';
    if (o.toggle != null) h += '<span class="ix-tog' + (o.toggle ? ' on' : '') + '"></span>';
    r.innerHTML = h;
    r.addEventListener('click', e => { e.stopPropagation(); o.onClick && o.onClick(r, e); });
    return r;
  }
  const sec = t => el('div', 'ix-sec', esc(t));

  /* ------------------------------------------------------------ حالة التنسيق (الاسم/الحفظ) */
  const Fmt = {
    get name() { return lsGet(LS.name, 'بدون اسم'); },
    set name(v) { lsSet(LS.name, v); },
    get auto() { return lsGet(LS.auto, false); },
    set auto(v) { lsSet(LS.auto, !!v); },
    save(silent) {
      const M = MC(); if (!M || !M.saveLayout) { unsupported('حفظ التنسيق (MultiChart غير جاهز)'); return false; }
      try { M.saveLayout(this.name); } catch (e) { console.error(e); toast('تعذّر حفظ التنسيق', { err: true }); return false; }
      if (!silent) toast('تم حفظ التنسيق');
      refreshFmt(); return true;
    },
    saved() { const M = MC(); try { return !!(M && M._layoutIndex().includes(this.name)); } catch (e) { return false; } }
  };
  function askName(msg, def) { const v = window.prompt(msg, def || ''); return v && v.trim() ? v.trim() : null; }

  /* ------------------------------------------------------------ بناء الشريط */
  let bar, inner, btns = {}, seps = [];
  const GEOM = {}; // id -> [cx, width]

  function addBtn(id, cx, w, html, cls, onClick, title) {
    const b = el('button', 'ix-btn ' + (cls || ''), html);
    b.type = 'button'; b.dataset.ix = id; b.setAttribute('aria-label', title || id); b.title = '';
    b.addEventListener('click', e => { e.stopPropagation(); onClick && onClick(b, e); });
    inner.appendChild(b); btns[id] = b; GEOM[id] = [cx, w];
    return b;
  }
  function addSep(cx) { const s = el('div', 'ix-sep'); s.setAttribute('aria-hidden', 'true'); inner.appendChild(s); seps.push([s, cx]); }

  function relayout() {
    if (!inner) return;
    Object.keys(btns).forEach(id => {
      const [cx, w] = GEOM[id], b = btns[id];
      b.style.left = ((cx - w / 2) * U).toFixed(2) + 'px';
      b.style.width = (w * U).toFixed(2) + 'px';
    });
    seps.forEach(([s, cx]) => { s.style.left = (cx * U).toFixed(2) + 'px'; });
    rebuildIcons();
  }

  // الأيقونات تُرسم بحجم مرتبط بالمقياس
  const ICON_SPEC = {
    ideas: ['bulb', 28], shot: ['camera', 29, 23], full: ['full', 22], set: ['gear', 28], quick: ['quick', 26, 24],
    fmtarrow: ['chev', 9, 5], redo: ['redo', 22], undo: ['undo', 22], addcmp: ['plusc', 26], type: ['candles', 24, 27]
  };
  function rebuildIcons() {
    Object.keys(ICON_SPEC).forEach(id => {
      const b = btns[id]; if (!b) return; const [n, w, h] = ICON_SPEC[id];
      b.innerHTML = icu(n, w, h);
    });
    if (btns.layout) refreshLayoutIcon(true);
    if (btns.replay) btns.replay.innerHTML = '<span>إعادة التشغيل</span>' + icu('replay', 22);
    if (btns.alert) btns.alert.innerHTML = '<span>تنبيه</span>' + icu('alarm', 28);
    if (btns.ind) btns.ind.innerHTML = '<span>مؤشرات</span>' + icu('ind', 26);
    if (btns.indarrow) btns.indarrow.innerHTML = icu('chev', 10, 6);
    if (btns.cap) { const ci = btns.cap.querySelector('.cap-ic'); if (ci) ci.innerHTML = icu('candles', 17, 22); }
    refreshFmt(); refreshUndoRedo(); refreshInterval(); refreshSymbol();
  }

  function build() {
    bar = el('div'); bar.id = 'ixTopBar'; bar.setAttribute('dir', 'ltr');
    inner = el('div'); inner.id = 'ixBarInner'; bar.appendChild(inner);

    // 1) الصورة الشخصية + تداول
    const av = addBtn('avatar', 35, 34, 'M', 'ix-avatar', b => Menus.toggle('avatar', b, m => {
      m.appendChild(sec('الحساب'));
      m.appendChild(el('div', 'ix-empty', 'قائمة الحساب غير متاحة: المشروع لا يحتوي نظام حسابات/تسجيل دخول لربطها به.'));
    }, { w: 300 }), 'الحساب');
    av.setAttribute('aria-haspopup', 'true');
    addBtn('trade', 247, 71, 'تداول', '', () => {
      infoModal('تداول', 'لوحة التداول غير مرتبطة بحساب وسيط في هذا المشروع. يوجد محاكي تداول داخلي (tv-trade-ui.js) متاح من قائمة «أدوات إضافية».');
    }, 'تداول');

    // "أدوات إضافية": تحتفظ بأزرار الوحدات القديمة (رسم، باكتيست، ارتباط، قائمة مراقبة...) بدل حذفها
    addBtn('more', 135, 44, '<svg width="22" height="22" viewBox="0 0 28 28" fill="currentColor"><circle cx="5" cy="14" r="2.4"/><circle cx="14" cy="14" r="2.4"/><circle cx="23" cy="14" r="2.4"/></svg>', '', (b) => {
      const lg = $('tvTopBar'); if (!lg) return;
      const open = lg.classList.toggle('ix-open'); b.classList.toggle('ix-open', open);
      if (open) { Menus.close(); const r = b.getBoundingClientRect(); lg.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 240)) + 'px'; }
    }, 'أدوات إضافية');

    // 2) أدوات سريعة
    addBtn('ideas', 336, 46, '', '', b => Menus.toggle('ideas', b, buildIdeas, { w: 332 }), 'نشر الأفكار');
    addBtn('shot', 388, 46, '', '', takeShot, 'لقطة الشاشة');
    addBtn('full', 440, 46, '', '', toggleFullscreen, 'ملء الشاشة');
    addBtn('set', 492, 46, '', '', () => { Menus.close(); const sb = $('settingsBtn'); if (sb) sb.click(); else if (window.TVSettings) window.TVSettings.open(); else unsupported('نافذة الإعدادات'); }, 'الإعدادات');
    addBtn('quick', 544, 46, '', '', () => { Menus.close(); unsupported('البحث والإجراءات السريعة (لا يوجد مرجع لوظيفتها)'); }, 'بحث سريع');
    addSep(576);

    // 3) التنسيق
    addBtn('fmtarrow', 599, 26, '', '', b => Menus.toggle('fmt', b, buildFmtMenu, { w: 299 }), 'قائمة التنسيق');
    addBtn('fmtname', 664, 92, '', 'ix-fmtname', b => Menus.toggle('fmt', b, buildFmtMenu, { w: 299 }), 'اسم التنسيق');
    addBtn('layout', 737, 46, '', '', b => Menus.toggle('layout', b, buildLayoutMenu, { w: 587 }), 'تخطيط الرسوم البيانية');
    addBtn('redo', 802, 40, '', '', () => { Menus.close(); const m = drawMgr(); if (m) { m.redo(); refreshUndoRedo(); } }, 'إعادة الإجراء');
    addBtn('undo', 854.5, 40, '', '', () => { Menus.close(); const m = drawMgr(); if (m) { m.undo(); refreshUndoRedo(); } }, 'تراجع');
    addSep(887);

    // 4) إعادة التشغيل + التنبيه
    addBtn('replay', 979.5, 161, '', 'ix-replay', onReplay, 'إعادة التشغيل');
    addBtn('alert', 1120.5, 91, '', '', () => { Menus.close(); const a = $('alAlertsBtn'); if (a) a.click(); else unsupported('نظام التنبيهات'); }, 'تنبيه');
    addSep(1174);

    // 5) المؤشرات
    addBtn('indarrow', 1196, 30, '', '', b => Menus.toggle('ind', b, buildIndMenu, { w: 423 }), 'المؤشرات المفضلة والقوالب');
    addBtn('ind', 1280, 124, '', '', () => { Menus.close(); if (window.TVIndicatorsUI) window.TVIndicatorsUI.openPicker(); else unsupported('نظام المؤشرات (TVIndicatorsUI غير محمّل)'); }, 'المؤشرات');
    addSep(1351);

    // 6) نوع الرسم
    addBtn('type', 1384, 40, '', '', () => { Menus.close(); unsupported('تغيير نوع الرسم: محرك الشارت الحالي يدعم الشموع اليابانية فقط'); }, 'نوع الرسم البياني');
    addSep(1415);

    // 7) الفاصل الزمني
    addBtn('tf', 1449.5, 62, '', '', b => Menus.toggle('tf', b, buildTfMenu, { w: 290, tall: true, alignRight: false }), 'الفاصل الزمني');
    addSep(1483);

    // 8) المقارنة + كبسولة الرمز
    const cmp = addBtn('addcmp', 1514.5, 40, '', '', openCompare, 'مقارنة / إضافة رمز'); cmp.id = 'tvAddCompareBtn';
    const cap = addBtn('cap', 1635, 174, '', 'ix-capsule', null, 'الرمز'); cap.style.direction = 'ltr';
    cap.innerHTML = '<button type="button" class="cap-ic" aria-label="الرسوم البيانية"></button><button type="button" class="cap-txt" aria-label="بحث الرموز"></button>';
    cap.querySelector('.cap-ic').addEventListener('click', e => { e.stopPropagation(); Menus.toggle('charts', cap, buildChartsMenu, { w: 171, alignRight: true }); });
    cap.querySelector('.cap-txt').addEventListener('click', e => { e.stopPropagation(); openSymbolSearch(); });

    document.body.insertBefore(bar, document.body.firstChild);
    relayout();
  }

  /* ------------------------------------------------------------ تحديث الحالات */
  function refreshFmt() {
    const b = btns.fmtname; if (!b) return;
    b.innerHTML = '<span class="n">' + esc(Fmt.name) + '</span><span class="s">حفظ</span>';
  }
  function refreshUndoRedo() {
    const m = drawMgr(); if (!btns.undo) return;
    const canU = !!(m && m._undoStack && m._undoStack.length >= 2), canR = !!(m && m._redoStack && m._redoStack.length);
    btns.undo.classList.toggle('ix-disabled', !canU); btns.undo.setAttribute('aria-disabled', String(!canU));
    btns.redo.classList.toggle('ix-disabled', !canR); btns.redo.setAttribute('aria-disabled', String(!canR));
  }
  let lastLayoutKey = null;
  function refreshLayoutIcon(force) {
    const M = MC(); if (!btns.layout) return;
    const key = (M && M.layout) || '1';
    if (!force && key === lastLayoutKey) return;
    lastLayoutKey = key;
    const s = Math.round(26 * U);
    let svg = '';
    try { svg = window.TVLayouts ? window.TVLayouts.previewSVG(key, s, s) : ''; } catch (e) {}
    if (svg) btns.layout.innerHTML = svg.replace('<svg', '<svg width="' + s + '" height="' + s + '"').replace(/stroke-width="[\d.]+"/g, 'stroke-width="1.8"');
    else btns.layout.innerHTML = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="22" height="22" rx="6"/></svg>';
  }
  function tfLabel(v) { try { return window.TVTimeframeMenu ? window.TVTimeframeMenu.labelFor(v) : String(v); } catch (e) { return String(v); } }
  const TF_NAMES = { 1440: 'يوم', 10080: 'أسبوع', 43200: 'شهر' };
  function tfShort(v) { v = Number(v); if (TF_NAMES[v]) return TF_NAMES[v]; if (v < 60) return v + ' د'; if (v < 1440 && v % 60 === 0) return (v / 60) + ' س'; return tfLabel(v); }
  function refreshInterval() {
    const sel = $('timeframeSelect'); if (!btns.tf || !sel) return;
    btns.tf.innerHTML = '<span>' + esc(tfShort(sel.value)) + '</span>';
  }
  function refreshSymbol() {
    const sel = $('pairSelect'); if (!btns.cap || !sel) return;
    const t = btns.cap.querySelector('.cap-txt'); if (t) t.textContent = sel.value;
  }
  function refreshReplay() {
    const b = btns.replay; if (!b) return;
    let on = false; try { on = !!(window.getBacktestState && window.getBacktestState().isBacktest); } catch (e) {}
    b.classList.toggle('ix-on', on);
  }

  /* ------------------------------------------------------------ الإجراءات */
  function onReplay() {
    Menus.close();
    let on = false; try { on = !!(window.getBacktestState && window.getBacktestState().isBacktest); } catch (e) {}
    if (on) { const x = $('exitBacktestBtn'); if (x) x.click(); return; }
    const b = $('backtestBtn'); if (b) b.click(); else unsupported('وضع Replay');
  }

  function toggleFullscreen() {
    Menus.close();
    const d = document, root = d.documentElement;
    if (!d.fullscreenEnabled && !d.webkitFullscreenEnabled) { unsupported('ملء الشاشة غير متاح في هذا المتصفح'); return; }
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    const p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
    if (p && p.catch) p.catch(() => toast('تعذّر تفعيل ملء الشاشة', { err: true }));
  }
  function onFsChange() {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (btns.full) btns.full.classList.toggle('ix-on', on);
    if (on) toast('وضع ملء الشاشة مفعل');
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  function takeShot() {
    Menus.close();
    const p = activePane(); const ch = p && p.chart ? p.chart : window.chart;
    if (!ch || typeof ch.takeScreenshot !== 'function') { unsupported('لقطة الشاشة (الشارت لا يوفّر takeScreenshot)'); return; }
    try {
      const cv = ch.takeScreenshot();
      cv.toBlob(blob => {
        if (!blob) { toast('تعذّر إنشاء اللقطة', { err: true }); return; }
        const a = el('a'); a.href = URL.createObjectURL(blob);
        const sym = ($('pairSelect') || {}).value || 'chart';
        a.download = 'IXVIEW_' + sym + '_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast('تم حفظ لقطة الشاشة');
      }, 'image/png');
    } catch (e) { console.error(e); toast('تعذّر إنشاء اللقطة', { err: true }); }
  }

  function setSymbol(sym) {
    const sel = $('pairSelect'); if (!sel || !sym) return;
    if (![...sel.options].some(o => o.value === sym)) { const o = el('option'); o.value = sym; o.textContent = sym; sel.appendChild(o); }
    sel.value = sym; sel.dispatchEvent(new Event('change'));
  }
  function openSymbolSearch() {
    Menus.close();
    if (!window.MultiChartSymbolSearch) { unsupported('نافذة بحث الرموز'); return; }
    window.MultiChartSymbolSearch.open(setSymbol);
  }
  function openCompare() {
    Menus.close();
    const M = MC();
    if (!M || !M.panes || !M.panes[0] || !window.MultiChartSymbolSearch) { unsupported('المقارنة (MultiChart غير جاهز)'); return; }
    window.MultiChartSymbolSearch.open(sym => { const p = activePane() || M.panes[0]; p._openCompareTypePicker(sym); });
  }

  /* ------------------------------------------------------------ القوائم */
  function buildIdeas(m) {
    const items = [
      ['bulb', 'نشر التحليل', 'شارك فكرة تداولك التالية'],
      ['video', 'تسجيل فيديو للفكرة', 'إنشاء مقاطع فيديو لتحركات السوق'],
      ['cloud', 'عبر عن أفكارك', 'اكتب ملاحظات عامة عن الرموز المفضلة لديك']
    ];
    items.forEach(([i, t, s]) => m.appendChild(row({ icon: i, title: t, sub: s, big: true, onClick: () => { Menus.close(); unsupported('نشر الأفكار (لا توجد خدمة نشر/مجتمع في IXVIEW)'); } })));
  }

  function buildFmtMenu(m) {
    const M = MC();
    m.appendChild(row({ icon: 'save', title: 'حفظ التنسيق', key: 'Ctrl + S', onClick: () => { Menus.close(); Fmt.save(); } }));
    const au = row({ icon: 'save', title: 'حفظ تلقائي', toggle: Fmt.auto, onClick: (r) => { Fmt.auto = !Fmt.auto; r.querySelector('.ix-tog').classList.toggle('on', Fmt.auto); toast(Fmt.auto ? 'الحفظ التلقائي مفعّل' : 'الحفظ التلقائي متوقف'); } });
    au.querySelector('.ic').innerHTML = '';
    m.appendChild(au);
    m.appendChild(row({ icon: 'share', title: 'مشاركة التنسيق', off: true, onClick: () => { Menus.close(); unsupported('مشاركة التنسيق (لا يوجد خادم/روابط مشاركة)'); } }));
    m.appendChild(row({ icon: 'copy', title: 'إنشاء نسخة...', onClick: () => {
      Menus.close(); if (!M) return unsupported('إنشاء نسخة');
      if (!Fmt.saved() && !Fmt.save(true)) return;
      M.duplicateLayout(Fmt.name); toast('تم إنشاء نسخة من التنسيق');
    } }));
    m.appendChild(row({ icon: 'pen', title: 'تغيير الاسم...', onClick: () => {
      Menus.close(); if (!M) return; const n = askName('اسم التنسيق:', Fmt.name); if (!n || n === Fmt.name) return;
      const old = Fmt.name, had = Fmt.saved(); Fmt.name = n;
      if (had) { Fmt.save(true); M.deleteLayout(old); } refreshFmt(); toast('تم تغيير الاسم');
    } }));
    m.appendChild(row({ icon: 'dl', title: 'تحميل بيانات الرسم البياني...', off: true, onClick: () => { Menus.close(); unsupported('تصدير بيانات الشارت'); } }));
    m.appendChild(el('div', 'ix-div'));
    m.appendChild(row({ icon: 'plus', title: 'إنشاء تنسيق جديد...', onClick: () => {
      Menus.close(); if (!M) return; const n = askName('اسم التنسيق الجديد:', ''); if (!n) return;
      Fmt.name = n; Fmt.save(true); refreshFmt(); toast('تم إنشاء التنسيق «' + n + '» من الحالة الحالية');
    } }));
    let idx = []; try { idx = M ? M._layoutIndex() : []; } catch (e) {}
    m.appendChild(el('div', 'ix-div'));
    m.appendChild(sec('مستخدم حديثاً'));
    if (!idx.length) m.appendChild(el('div', 'ix-empty', 'لا توجد تنسيقات محفوظة بعد. اضغط «حفظ التنسيق».'));
    idx.slice().reverse().slice(0, 8).forEach(n => {
      const cur = n === Fmt.name;
      m.appendChild(row({ icon: 'star', title: n, sub: 'محفوظ', sel: cur, onClick: () => { Menus.close(); Fmt.name = n; M.loadLayout(n); refreshFmt(); toast('تم فتح التنسيق «' + n + '»'); } }));
    });
  }

  function buildLayoutMenu(m) {
    const M = MC(), TL = window.TVLayouts;
    if (!TL || !M) { m.appendChild(el('div', 'ix-empty', 'نظام التخطيطات غير محمّل.')); return; }
    TL.groups.forEach(g => {
      const r = el('div', 'ix-lay-row'); r.appendChild(el('span', 'cnt', String(g.count)));
      g.keys.forEach(key => {
        const b = el('button', 'ix-lay-item' + (M.layout === key ? ' cur' : ''), TL.previewSVG(key, 28, 28));
        b.type = 'button'; b.title = g.count + (g.count === 1 ? ' شاشة' : ' شاشات');
        b.addEventListener('click', e => { e.stopPropagation(); Menus.close(); M.setLayout(key); lastLayoutKey = null; refreshLayoutIcon(); });
        r.appendChild(b);
      });
      m.appendChild(r);
    });
    m.appendChild(sec('مزامنة مع كل الرسوم البيانية'));
    [['الرمز', 'syncSymbol'], ['الفاصل الزمني', 'syncTimeframe'], ['مؤشر التقاطع', 'syncCrosshair'], ['الوقت (التمرير)', 'syncScroll'], ['المدى الزمني (التكبير)', 'syncZoom']].forEach(([lbl, key]) => {
      m.appendChild(row({ title: lbl, toggle: !!M[key], onClick: r => {
        M[key] = !M[key]; r.querySelector('.ix-tog').classList.toggle('on', !!M[key]);
        if (key === 'syncCrosshair' && !M[key]) M.panes.forEach(p => { try { p.chart && p.chart.clearCrosshairPosition(); } catch (e) {} });
        if (M._refreshSyncButtonState) M._refreshSyncButtonState();
      } }));
    });
  }

  /* قائمة الفواصل: أقسام قابلة للطي + مفضلة + مخصصة. ما لا تدعمه بيانات M1 (تيكات/ثواني) معطّل. */
  const TF_GROUPS = [
    { k: 'ticks', t: 'تيكات', off: true, items: [['tick1', '1 تيك'], ['tick10', '10 تيك'], ['tick100', '100 تيك'], ['tick1000', '1000 تيك']] },
    { k: 'sec', t: 'ثانية', off: true, items: [['sec1', '1 ثانية'], ['sec5', '5 ثوان'], ['sec10', '10 ثوان'], ['sec15', '15 ثانية'], ['sec30', '30 ثانية'], ['sec45', '45 ثانية']] },
    { k: 'min', t: 'دقائق', items: [[1, '1 دقيقة'], [3, '3 دقائق'], [5, '5 دقائق'], [10, '10 دقائق'], [15, '15 دقيقة'], [30, '30 دقيقة'], [45, '45 دقيقة']] },
    { k: 'hr', t: 'ساعة', items: [[60, '1 ساعة'], [120, '2 ساعة'], [180, '3 ساعات'], [240, '4 ساعات'], [360, '6 ساعات'], [480, '8 ساعات'], [720, '12 ساعة']] },
    { k: 'day', t: 'أيام', items: [[1440, '1 يوم'], [10080, '1 أسبوع'], [43200, '1 شهر'], [129600, '3 أشهر'], [259200, '6 أشهر'], [518400, '12 شهر']] }
  ];
  function pickTf(val) {
    const sel = $('timeframeSelect'); if (!sel) return;
    let o = sel.querySelector('option[value="' + val + '"]');
    if (!o) { o = el('option'); o.value = String(val); o.textContent = tfLabel(val); sel.appendChild(o); }
    sel.value = String(val); sel.dispatchEvent(new Event('change')); refreshInterval();
  }
  function buildTfMenu(m) {
    const cur = ($('timeframeSelect') || {}).value;
    const favs = lsGet(LS.tfFav, ['1', '5', '15', '60', '240', '1440']).map(String);
    const custom = lsGet(LS.tfCustom, []).map(String);
    const fold = lsGet(LS.fold, {});
    const body = el('div'); m.appendChild(body);
    function render() {
      body.innerHTML = '';
      body.appendChild(row({ icon: 'plus', title: 'إضافة فترة زمنية مخصصة...', onClick: () => {
        const v = window.prompt('أدخل الفاصل بالدقائق (مثال: 2 أو 90):', '');
        const n = Math.round(Number(v));
        if (!v || !isFinite(n) || n < 1 || n > 518400) { if (v) toast('قيمة غير صالحة', { err: true }); return; }
        const c = lsGet(LS.tfCustom, []).map(String); if (!c.includes(String(n))) { c.push(String(n)); lsSet(LS.tfCustom, c); }
        Menus.close(); pickTf(n);
      } }));
      body.appendChild(el('div', 'ix-div'));
      const mk = (val, label, off, removable) => {
        const r = el('div', 'ix-tf-row' + (String(val) === String(cur) ? ' cur' : '') + (off ? ' off' : ''));
        const st = el('button', 'st' + (favs.includes(String(val)) ? ' on' : ''), ic('star', 20)); st.type = 'button'; st.setAttribute('aria-label', 'مفضلة');
        st.addEventListener('click', e => { e.stopPropagation(); const i = favs.indexOf(String(val)); if (i >= 0) favs.splice(i, 1); else favs.push(String(val)); lsSet(LS.tfFav, favs); render(); });
        r.appendChild(el('span', 'lbl', esc(label)));
        if (removable) { const rm = el('button', 'rm', ic('trash', 20)); rm.type = 'button'; rm.setAttribute('aria-label', 'حذف');
          rm.addEventListener('click', e => { e.stopPropagation(); lsSet(LS.tfCustom, lsGet(LS.tfCustom, []).filter(x => String(x) !== String(val))); custom.splice(custom.indexOf(String(val)), 1); render(); }); r.appendChild(rm); }
        r.appendChild(st);
        r.addEventListener('click', e => { e.stopPropagation(); if (off) { unsupported('هذا الفاصل غير متوفر (البيانات المتاحة بدقة دقيقة واحدة)'); return; } Menus.close(); pickTf(val); });
        return r;
      };
      const favRows = favs.filter(f => !isNaN(Number(f)));
      if (favRows.length) { body.appendChild(sec('المفضلة')); favRows.forEach(f => body.appendChild(mk(f, tfLabel(f) === String(f) ? f + ' دقيقة' : tfLabel(f), false, false))); }
      if (custom.length) { body.appendChild(sec('مخصص')); custom.forEach(c => body.appendChild(mk(c, tfShort(c) === c ? c + ' دقيقة' : tfShort(c), false, true))); }
      TF_GROUPS.forEach(g => {
        const h = el('div', 'ix-sec fold', '<span>' + esc(g.t) + '</span><span>' + (fold[g.k] ? '˅' : '˄') + '</span>');
        h.addEventListener('click', e => { e.stopPropagation(); fold[g.k] = !fold[g.k]; lsSet(LS.fold, fold); render(); });
        body.appendChild(h);
        if (!fold[g.k]) g.items.forEach(([v, l]) => body.appendChild(mk(v, l, g.off, false)));
      });
    }
    render();
  }

  function buildIndMenu(m) {
    const seg = el('div', 'ix-seg'); const a = el('button', 'act', 'مؤشرات'), b = el('button', '', 'قوالب');
    a.type = b.type = 'button'; seg.appendChild(a); seg.appendChild(b); m.appendChild(seg);
    const body = el('div'); m.appendChild(body);
    function show(tab) {
      a.classList.toggle('act', tab === 'i'); b.classList.toggle('act', tab === 'm'); body.innerHTML = '';
      if (tab === 'i') {
        const items = (window.TVIndicatorsUI && window.TVIndicatorsUI.items && window.TVIndicatorsUI.items()) || [];
        body.appendChild(sec('المؤشرات المفضلة'));
        body.appendChild(el('div', 'ix-empty', 'لا يوجد نظام مفضلة للمؤشرات في المشروع حالياً.'));
        body.appendChild(sec('المؤشرات المضافة على الشارت'));
        if (!items.length) body.appendChild(el('div', 'ix-empty', 'لا توجد مؤشرات مضافة.'));
        items.forEach(it => body.appendChild(row({ title: it.label || it.name || it.id || 'مؤشر', onClick: () => { Menus.close(); if (window.TVIndicatorsUI) window.TVIndicatorsUI.openPicker(); } })));
        body.appendChild(el('div', 'ix-div'));
        body.appendChild(row({ icon: 'ind', title: 'فتح قائمة المؤشرات', onClick: () => { Menus.close(); window.TVIndicatorsUI ? window.TVIndicatorsUI.openPicker() : unsupported('نظام المؤشرات'); } }));
      } else {
        body.appendChild(el('div', 'ix-empty', 'قوالب المؤشرات غير مدعومة: لا يوجد في المشروع حفظ/تطبيق لمجموعات مؤشرات.'));
      }
    }
    a.addEventListener('click', e => { e.stopPropagation(); show('i'); }); b.addEventListener('click', e => { e.stopPropagation(); show('m'); });
    show('i');
  }

  function buildChartsMenu(m) {
    m.appendChild(el('div', 'ix-row', '<span class="ic">' + ic('candles', 24) + '</span><span class="tx"><div class="tt">الرسوم البيانية</div></span>')).style.cursor = 'default';
    m.appendChild(sec('التحليل'));
    [['tech', 'تحليلات فنية'], ['season', 'الموسمية'], ['news', 'الأخبار'], ['people', 'المجتمع']].forEach(([i, t], n) => {
      m.appendChild(row({ icon: i, title: t, sel: n === 0, onClick: () => {
        Menus.close();
        if (n === 0) infoModal('تحليلات فنية', 'غير متاحة: لا توجد في المشروع بيانات مؤشرات مجمّعة (متذبذبات/متوسطات متحركة بإشارات شراء وبيع) لعرضها، ولن تُعرض أرقام مختلقة. يمكن ربطها لاحقاً بحساب فعلي من TVIndicators على بيانات الشارت.');
        else unsupported(t + ' (لا يوجد مصدر بيانات)');
      } }));
    });
  }

  /* ------------------------------------------------------------ الحفظ التلقائي واستعادة التنسيق */
  function setupAutosave() {
    setInterval(() => { if (Fmt.auto && MC() && MC().panes && MC().panes.length) { try { MC().saveLayout(Fmt.name); } catch (e) {} } }, 15000);
    window.addEventListener('beforeunload', () => { if (Fmt.auto) { try { MC().saveLayout(Fmt.name); } catch (e) {} } });
    // استعادة عند التحميل (فقط إذا فعّل المستخدم الحفظ التلقائي وكان له تنسيق محفوظ)
    let tries = 0;
    const t = setInterval(() => {
      const M = MC();
      if (M && M.panes && M.panes[0] && M.panes[0].chart) {
        clearInterval(t);
        if (Fmt.auto && Fmt.saved()) setTimeout(() => { try { M.loadLayout(Fmt.name); } catch (e) { console.error(e); } }, 600);
      } else if (++tries > 100) clearInterval(t);
    }, 150);
  }
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
      const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.type !== 'checkbox') return;
      e.preventDefault(); Fmt.save();
    }
  });

  /* ------------------------------------------------------------ التهيئة */
  function init() {
    if ($('ixTopBar')) return;
    const controls = $('controls');
    setU();

    // الحاوية القديمة تبقى (وحدات أخرى تضيف أزرارها إليها) لكنها صارت لوحة «أدوات إضافية»
    const legacy = el('div'); legacy.id = 'tvTopBar';
    document.body.insertBefore(legacy, controls || document.body.firstChild);
    // مخزن مخفي للعناصر التي ما زالت وظائفها تعتمد عليها (select ها تُقرأ قيمتها، وأزرار أصلية نستدعيها بـ click())
    const hold = el('div'); hold.id = 'ixLegacyHold'; hold.hidden = true; hold.style.display = 'none'; document.body.appendChild(hold);

    const mv = (id, to) => { const e = $(id); if (e) to.appendChild(e); };
    ['pairSelect', 'timeframeSelect', 'mcLayoutBtn', 'mcSyncBtn', 'alAlertsBtn', 'backtestBtn', 'settingsBtn'].forEach(id => mv(id, hold));
    ['mcCorrBtn', 'mcWatchlistBtn'].forEach(id => mv(id, legacy));   // ميزات موجودة: ارتباط، قائمة مراقبة
    const rv = el('button', 'tv-topbar-btn', 'إعادة ضبط العرض'); rv.id = 'tvResetViewBtn'; rv.type = 'button';
    rv.addEventListener('click', () => { if (window.resetActiveChartView) window.resetActiveChartView(); });
    legacy.appendChild(rv);
    const ps = $('pairSelect'), ts = $('timeframeSelect');
    if (ps) ps.classList.add('mc-hidden-select'); if (ts) ts.classList.add('mc-hidden-select');

    build();
    if (ps) ps.addEventListener('change', refreshSymbol);
    if (ts) ts.addEventListener('change', refreshInterval);
    document.addEventListener('pointerdown', e => {   // إغلاق لوحة «أدوات إضافية» عند الضغط خارجها
      if (legacy.classList.contains('ix-open') && !legacy.contains(e.target) && !(btns.more && btns.more.contains(e.target))) { legacy.classList.remove('ix-open'); btns.more && btns.more.classList.remove('ix-open'); }
    }, true);
    // بدء المراقبة الخفيفة للحالات (Undo/Redo، التخطيط، Replay، الرمز)
    setInterval(() => { refreshUndoRedo(); refreshLayoutIcon(); refreshReplay(); refreshSymbol(); refreshInterval(); }, 400);
    setupAutosave();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
