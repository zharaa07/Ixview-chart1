# يختبر حقول "Profit level / Stop level" (نقاط + سعر) في تبويب Trade على كود drawing.js الحقيقي
import os
from playwright.sync_api import sync_playwright
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
rd=lambda f: open(os.path.join(R,f if os.path.exists(os.path.join(R,f)) else f.replace('.js','-١.js')),encoding='utf-8').read()
src=rd('drawing.js').replace("const CTORS = {","global.__getPD=()=>PositionDrawing;\n  const CTORS = {",1).replace("  class DrawingManager {","  global.__getDM=()=>DrawingManager;\n  class DrawingManager {",1)
JS=r'''
const R=[];const ok=(n,c)=>R.push([n,!!c]);const near=(a,b)=>Math.abs(a-b)<1e-6;
const DM=__getDM(), PD=__getPD();
function open(isLong){
  const d=new PD([{time:1,price:2000},{time:2,price:2020}],{},isLong); d.entry=2000;d.stop=isLong?1990:2010;d.target=isLong?2030:1970;d._tick=0.01;
  const fake=Object.create(DM.prototype); const el=fake._buildTradeTab(d); document.body.appendChild(el); return {d,el};
}
const rows=el=>Array.from(el.querySelectorAll('input[type=number]'));
const find=(el,title)=>Array.from(el.querySelectorAll('input[title="'+title+'"]'));
const setv=(inp,v)=>{inp.value=v;inp.dispatchEvent(new Event('change'))};
let {d,el}=open(true);
let [tT,sT]=find(el,'عدد النقاط (ticks)'), [tP,sP]=find(el,'السعر');
ok('target ticks shown = 3000',near(+tT.value,3000)); ok('target price shown = 2030',near(+tP.value,2030));
ok('stop ticks shown = 1000',near(+sT.value,1000));
setv(tT,500); ok('ticks→price: target=2005',near(d.target,2005)&&near(+tP.value,2005));
setv(tP,2012.5); ok('price→ticks: 1250 ticks',near(d.target,2012.5)&&near(+tT.value,1250));
setv(tP,1995); ok('invalid target (below entry for long) rejected',near(d.target,2012.5)&&tP.style.outline!=='');
setv(tP,2020); ok('valid price clears error outline',tP.style.outline==='');
setv(sT,200); ok('stop ticks 200 → stop=1998',near(d.stop,1998)&&near(+sP.value,1998));
setv(sP,2005); ok('invalid stop (above entry for long) rejected',near(d.stop,1998));
setv(sT,0); ok('zero ticks rejected',near(d.stop,1998));
// قفل R:R
d.target=2030; d.stop=1990; d._pp().lockRR=true; d._pp().lockedRR=null; ({d,el}=(function(){const e=el;return {d,el:e}})());
const o=open(true); const dd=o.d; dd._pp().lockRR=true; dd._pp().lockedRR=null;
const [,sT2]=find(o.el,'عدد النقاط (ticks)'); const [tP2,sP2]=find(o.el,'السعر');
setv(sP2,1995); ok('lock R:R: stop 1995 → target 2015 (rr=3 kept)',near(dd.target,2015)&&near(+tP2.value,2015));
setv(tP2,2030); ok('lock R:R: target 2030 → stop 1990 (rr=3 kept)',near(dd.stop,1990)&&near(+sP2.value,1990));
// short
const s=open(false); const [stT]=find(s.el,'عدد النقاط (ticks)'); const [stP,ssP]=find(s.el,'السعر');
ok('short: target below entry shown 3000 ticks',near(+stT.value,3000));
setv(stP,2005); ok('short: target above entry rejected',near(s.d.target,1970));
setv(ssP,2020); ok('short: stop 2020 accepted',near(s.d.stop,2020));
// حقل الدخول
const ent=rows(o.el)[0]; setv(ent,2001); ok('entry edit updates entry and anchor point',near(dd.entry,2001)&&near(dd.points[0].price,2001));
setv(ent,-5); ok('negative entry ignored',near(dd.entry,2001));
window.__R=R;
'''
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('http://test.local/',lambda r:r.fulfill(body='<html><body></body></html>',content_type='text/html')); pg.goto('http://test.local/')
    for f in ['tv-draw-geom.js','tv-position-calc.js']: pg.add_script_tag(content=rd(f))
    pg.add_script_tag(content=src); pg.evaluate(JS)
    for n,c in pg.evaluate('window.__R'): print('ok  ' if c else 'FAIL',n)
    print('page errors:',errs); b.close()
