/* =========================================================================
   tv-draw-geom.js — هندسة أدوات الرسم الجديدة (بكسل) كدوال نقية قابلة للاختبار
   تُستخدم من drawing.js لأدوات: Fib Channel / Fib Fan / Fib Time Zone / Gann Box
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TVDrawGeom = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FIB_SEQ = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  const GANN_RATIOS = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1];

  function lineYAt(a, b, x) { return b.x === a.x ? a.y : a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x); }

  // قناة فيبوناتشي: الخط AB هو المستوى 0، والنقطة C تحدد المستوى 1 (إزاحة رأسية عن AB عند C.x)
  function channelLines(a, b, c, levels) {
    const off = c.y - lineYAt(a, b, c.x);
    return levels.map(v => ({ v, x1: a.x, y1: a.y + off * v, x2: b.x, y2: b.y + off * v }));
  }

  // مروحة فيبوناتشي: أشعة من A تمر بنقاط على الخط العمودي عند B.x بنسب المستويات، وتمتد حتى xEnd
  function fanRays(a, b, levels, xEnd) {
    const dx = b.x - a.x; if (dx === 0) return [];
    return levels.map(v => {
      const ty = a.y + (b.y - a.y) * v, slope = (ty - a.y) / dx;
      return { v, x1: a.x, y1: a.y, x2: xEnd, y2: a.y + slope * (xEnd - a.x), tx: b.x, ty };
    });
  }

  // مناطق زمن فيبوناتشي: خطوط رأسية عند ax + unit * (0,1,2,3,5,8,...)
  function timeZoneXs(ax, bx, seq) {
    const unit = bx - ax; return (seq || FIB_SEQ).map(f => ({ f, x: ax + unit * f }));
  }

  // صندوق غان: شبكة داخل المستطيل بين A وB
  function gannBox(a, b, ratios) {
    const r = ratios || GANN_RATIOS;
    return { xs: r.map(k => ({ k, x: a.x + (b.x - a.x) * k })), ys: r.map(k => ({ k, y: a.y + (b.y - a.y) * k })) };
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2; t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy; return Math.hypot(px - cx, py - cy);
  }

  return { FIB_SEQ, GANN_RATIOS, lineYAt, channelLines, fanRays, timeZoneXs, gannBox, distToSegment };
});
