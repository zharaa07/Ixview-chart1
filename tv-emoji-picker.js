/* =========================================================================
   tv-emoji-picker.js — نافذة اختيار الإيموجي (بديل prompt): فئات + شبكة رموز
   الاختيار يُفعّل أداة النص بالرمز المختار؛ النقر على الشارت يضعه مرتبطاً بالزمن/السعر
   (يتحرك مع التكبير والتحريك). Escape أو النقر خارج النافذة يغلقها دون وضع شيء.
   ========================================================================= */
(function (root, factory) {
  const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TVEmojiPicker = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const split = s => (typeof Intl !== 'undefined' && Intl.Segmenter) ? Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s), x => x.segment) : Array.from(s);
  const CATS = [
    { id: 'faces', icon: '😀', title: 'الوجوه والمشاعر', list: '😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😋😛😝😜🤪🤨🧐🤓😎🥳😏😒😞😔😟😕🙁😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫😶😐😑😬🙄😯😦😧😮😲😴🤤😪😵🤐🥴🤢🤮🤧😷' },
    { id: 'people', icon: '👍', title: 'الإيماءات والأشخاص', list: '👍👎👌✌️🤞🤟🤘🤙👈👉👆👇☝️✋🤚🖐️🖖👋🤝🙏💪👏🙌👐🤲✍️🧠👀👂👃👅👄💁🙋🤷🤦' },
    { id: 'trading', icon: '📈', title: 'التداول والتنبيه', list: '📈📉📊💹💰💵💲🏦💎🎯🔥⚡⚠️🚨✅❌❗❓🔔🔕📌📍🚀🛑🟢🔴🟡🔵⬆️⬇️↗️↘️➡️🏁' },
    { id: 'sports', icon: '⚽', title: 'الرياضة والأشياء', list: '⚽🏀🏈⚾🎾🏐🏉🎱🏓🥊🏆🥇🥈🥉🎖️🎲🎰🧩🎮🎧💡🔑🔒🔓⏰⌛📅📝📎✂️🔍' },
    { id: 'symbols', icon: '❤️', title: 'القلوب والرموز', list: '❤️🧡💛💚💙💜🖤🤍💔💕💞💓💗💖⭐🌟✨💫☀️🌙☁️❄️🌈🔶🔷◼️◻️▪️▫️' }
  ];
  CATS.forEach(c => { c.items = split(c.list); });

  let pop = null, offDoc = null, offKey = null;
  function close() {
    if (pop) { pop.remove(); pop = null; }
    if (offDoc) { document.removeEventListener('mousedown', offDoc, true); offDoc = null; }
    if (offKey) { document.removeEventListener('keydown', offKey, true); offKey = null; }
  }
  function open(anchor, onPick) {
    close();
    pop = document.createElement('div'); pop.id = 'tvEmojiPicker'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'اختيار إيموجي');
    const tabs = document.createElement('div'); tabs.className = 'tve-tabs';
    const title = document.createElement('div'); title.className = 'tve-title';
    const grid = document.createElement('div'); grid.className = 'tve-grid';
    const show = id => {
      const c = CATS.find(x => x.id === id) || CATS[0]; title.textContent = c.title; grid.innerHTML = '';
      tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.cat === c.id));
      c.items.forEach(ch => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tve-item'; b.textContent = ch; b.setAttribute('aria-label', ch); b.addEventListener('click', e => { e.stopPropagation(); close(); onPick(ch); }); grid.appendChild(b); });
    };
    CATS.forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tve-tab'; b.dataset.cat = c.id; b.textContent = c.icon; b.title = c.title; b.addEventListener('click', e => { e.stopPropagation(); show(c.id); }); tabs.appendChild(b); });
    pop.appendChild(tabs); pop.appendChild(title); pop.appendChild(grid); document.body.appendChild(pop); show(CATS[0].id);
    const r = anchor ? anchor.getBoundingClientRect() : { right: 40, top: 100 };
    const h = pop.offsetHeight || 300; pop.style.left = (r.right + 6) + 'px'; pop.style.top = Math.max(6, Math.min(r.top, innerHeight - h - 8)) + 'px';
    offDoc = e => { if (pop && !pop.contains(e.target)) close(); }; offKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    // تسجيل فوري: حدث mousedown الذي سبق النقر على الزر قد انتهى فلا يغلق النافذة
    document.addEventListener('mousedown', offDoc, true); document.addEventListener('keydown', offKey, true);
    return pop;
  }
  return { open, close, CATS, isOpen: () => !!pop };
});
