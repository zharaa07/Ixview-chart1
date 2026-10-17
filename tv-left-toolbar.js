/* =========================================================================
   tv-left-toolbar.js — الشريط الجانبي بنفس ترتيب الصورة المرفقة بالضبط:

   Cursor → Trend Line → Measure Grid → Scissors → List → Rectangle → Text
   → Emoji → Ruler → Zoom → Magnet → Link → Lock → Eye → Delete
   ثم ⭐ Favorites بأسفل كل شيء تماماً.

   الأزرار المطلوب تفعيلها فعلياً حسب طلب المستخدم: مسطرة (Ruler)،
   إيموجي، تكبير (Zoom)، مغناطيس (Magnet)، نسخ رابط (Link)، قفل (Lock)،
   عين (Eye)، قلم (رسم/Cursor toggle)، حذف (Delete). الباقي يظهر بنفس
   المكان لمطابقة الشكل حتى لو لم تُبنَ ميزته بعد.

   Load this LAST, after drawing.js, tv-topbar.js.
   ========================================================================= */

(function(global) {
  'use strict';
  
  // [id, أيقونة, tooltip, type]
  const MAIN_GROUP = [
    ['tvltCursor', '\u2013', 'تحديد', 'cursor'],
    ['tvltTrend', '\u2571', 'خط اتجاه', 'tool:trendline'],
  ['tvltPen',     '\u270F\uFE0F', 'كل أدوات الرسم',    'menu'],
    ['tvltList', '\u2261', 'خطوط أفقية', 'tool:hline'],
    ['tvltRect', '\u25AD', 'مستطيل', 'tool:rect'],
    ['tvltText', 'T', 'نص', 'tool:text'],
    ['tvltEmoji', '\u{1F642}', 'إيموجي', 'emoji'],
    ['tvltRuler', '\u{1F4CF}', 'مسطرة', 'tool:measure'],
    ['tvltZoom', '\u{1F50D}', 'تكبير', 'zoom'],
    ['tvltMagnet', '\u{1F9F2}', 'مغناطيس', 'magnet'],
    ['tvltLink', '\u{1F517}', 'نسخ رابط', 'link'],
    ['tvltLock', '\u{1F512}', 'قفل الكل', 'lock'],
    ['tvltEye', '\u{1F441}', 'إظهار/إخفاء الكل', 'hide'],
    ['tvltDelete', '\u{1F5D1}', 'حذف الكل', 'trash']
  ];
  
  const FAV_GROUP = [
    ['tvltFav', '\u2605', 'المفضلة', 'fav']
  ];
  
  function mgr() {
    return (global.DrawingTools && global.DrawingTools.activeManager) || (global.DrawingTools && global.DrawingTools.manager);
  }
  
  // يزامن موضع/أبعاد الزر القديم المخفي (dtDrawBtn) مع زر القلم الجديد
// كل مرة قبل فتح القائمة — لأن _openToolMenu() بـ drawing.js تحسب
// مكان القائمة اعتماداً على getBoundingClientRect() لـ drawBtn، وبدون
// هذي المزامنة تفتح القائمة بموضع خاطئ (0,0) لأن الزر القديم مخفي.
function syncHiddenDrawBtnPosition(referenceBtn) {
  const old = document.getElementById('dtDrawBtn');
  if (!old) return;
  const r = referenceBtn.getBoundingClientRect();
  old.style.left = r.left + 'px';
  old.style.top = r.top + 'px';
  old.style.width = r.width + 'px';
  old.style.height = r.height + 'px';
}
  
  function makeBtn(id, icon, title, type) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.className = 'tvlt-btn';
    btn.title = title;
    btn.innerHTML = '<span>' + icon + '</span>';
    
btn.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const m = mgr();
      if (!m) { console.warn('[tv-left-toolbar] DrawingTools غير جاهز — تحقق من نجاح تحميل drawing.js بالكامل'); return; }
      
      if (type === 'cursor') {
        m.setActiveTool('cursor');
        highlightActive(btn);
      } else if (type.startsWith('tool:')) {
        m.setActiveTool(type.split(':')[1]);
        highlightActive(btn);
      } else if (type === 'menu') {
        syncHiddenDrawBtnPosition(btn);
        global.DrawingTools.activeManager = m;
        m._toggleToolMenu();
      } else if (type === 'emoji') {
        // نافذة الإيموجي: الاختيار يفعّل أداة النص بالرمز، والنقر على الشارت يضعه (مرتبطاً بالزمن/السعر)
        if (!global.TVEmojiPicker) return;
        global.TVEmojiPicker.open(btn, (emoji) => {
          m.setActiveTool('cursor');
          m._pendingEmojiText = emoji;
          m.setActiveTool('text');
          highlightActive(btn);
        });
      } else if (type === 'zoom') {
        try {
          const ts = m.chart.timeScale();
          const range = ts.getVisibleLogicalRange();
          if (range) {
            const mid = (range.from + range.to) / 2;
            const half = (range.to - range.from) / 4;
            ts.setVisibleLogicalRange({ from: mid - half, to: mid + half });
          }
        } catch (e) {}
      } else if (type === 'magnet') {
        const order = ['off', 'weak', 'normal', 'strong'];
        const idx = order.indexOf(m.magnetMode || 'off');
        m.magnetMode = order[(idx + 1) % order.length];
        localStorage.setItem('dt_magnet_mode', m.magnetMode);
        btn.classList.toggle('tvlt-active', m.magnetMode !== 'off');
      } else if (type === 'link') {
        if (m.selected) {
          const payload = JSON.stringify(m.selected.toJSON());
          const url = location.href.split('#')[0] + '#drawing=' + encodeURIComponent(btoa(unescape(encodeURIComponent(payload))));
          if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
          alert('تم نسخ رابط الرسمة المحددة');
        } else {
          if (navigator.clipboard) navigator.clipboard.writeText(location.href).catch(() => {});
          alert('تم نسخ رابط الشارت');
        }
      } else if (type === 'lock') {
        const anyUnlocked = m.drawings.some(d => !d.locked);
        m.drawings.forEach(d => d.locked = anyUnlocked);
        m._save();
        btn.classList.toggle('tvlt-active', anyUnlocked);
      } else if (type === 'hide') {
        m.toggleHideAll();
      } else if (type === 'trash') {
        m.clearAll();
      } else if (type === 'fav') {
        m._toggleFavBar();
        btn.classList.toggle('tvlt-active');
      }
    });
    return btn;
  }
  
  function highlightActive(activeBtn) {
    document.querySelectorAll('#tvLeftToolbar .tvlt-btn').forEach(b => b.classList.remove('tvlt-tool-active'));
    activeBtn.classList.add('tvlt-tool-active');
  }
  
  function build() {
    if (document.getElementById('tvLeftToolbar')) return;
    const bar = document.createElement('div');
    bar.id = 'tvLeftToolbar';
    
    const topWrap = document.createElement('div');
    topWrap.className = 'tvlt-group';
    MAIN_GROUP.forEach(([id, icon, title, type]) => topWrap.appendChild(makeBtn(id, icon, title, type)));
    bar.appendChild(topWrap);
    
    const spacer = document.createElement('div');
    spacer.className = 'tvlt-spacer';
    bar.appendChild(spacer);
    
    const favWrap = document.createElement('div');
    favWrap.className = 'tvlt-group';
    FAV_GROUP.forEach(([id, icon, title, type]) => favWrap.appendChild(makeBtn(id, icon, title, type)));
    bar.appendChild(favWrap);
    
    document.body.appendChild(bar);
    
    const oldDrawBtn = document.getElementById('dtDrawBtn');
    if (oldDrawBtn) oldDrawBtn.classList.add('tvlt-hidden-old');
  }
  
  function init() {
    build();
    setTimeout(build, 400);
  }
  
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  
})(window);