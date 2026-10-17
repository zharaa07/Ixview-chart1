const assert = require('assert'); const G = require('../tv-draw-geom.js');
let n = 0; const t = (m, f) => { f(); n++; console.log('ok -', m); };
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
t('channel: level 0 is AB, level 1 passes through C', () => {
  const a = { x: 0, y: 100 }, b = { x: 100, y: 50 }, c = { x: 50, y: 10 }; // AB at x=50 -> y=75 ; offset = -65
  const L = G.channelLines(a, b, c, [0, 1, 0.5]);
  near(L[0].y1, 100); near(L[0].y2, 50);
  near(L[1].y1 + (L[1].y2 - L[1].y1) * 0.5, 10);           // لمس C
  near(L[2].y1, 100 - 32.5);                                 // منتصف الإزاحة
  assert.ok(L.every(l => near((l.y2 - l.y1) / (l.x2 - l.x1), -0.5) || true));
  L.forEach(l => near((l.y2 - l.y1) / (l.x2 - l.x1), -0.5)); // كلها موازية لـ AB
});
t('fan: ray at ratio 1 passes through B; ratio 0 is horizontal', () => {
  const a = { x: 0, y: 100 }, b = { x: 50, y: 0 };
  const R = G.fanRays(a, b, [0, 0.5, 1], 100);
  near(R[0].y2, 100);                       // أفقي
  near(R[2].y2, 100 - 200);                 // ميل -2 عند x=100
  near(R[1].ty, 50); near(R[1].y2, 100 - 100); // ratio .5: ميل -1
});
t('fan: vertical baseline (dx=0) yields no rays instead of NaN', () => { assert.deepStrictEqual(G.fanRays({ x: 5, y: 1 }, { x: 5, y: 9 }, [0.5], 50), []); });
t('time zones follow Fibonacci multiples of the unit', () => {
  const z = G.timeZoneXs(10, 20); assert.deepStrictEqual(z.map(q => q.x), [10, 20, 30, 40, 60, 90, 140, 220, 350, 560, 900]);
  const back = G.timeZoneXs(20, 10); near(back[1].x, 10); near(back[2].x, 0); // اتجاه عكسي مدعوم
});
t('gann box lines span the rectangle exactly', () => {
  const g = G.gannBox({ x: 0, y: 0 }, { x: 200, y: 100 }); near(g.xs[0].x, 0); near(g.xs[6].x, 200); near(g.ys[3].y, 50); near(g.xs[1].x, 50);
});
t('distance to segment', () => {
  near(G.distToSegment(5, 5, 0, 0, 10, 0), 5); near(G.distToSegment(-3, 4, 0, 0, 10, 0), 5); near(G.distToSegment(5, 0, 0, 0, 0, 0), 5);
});
console.log(`\n${n} tests passed`);
