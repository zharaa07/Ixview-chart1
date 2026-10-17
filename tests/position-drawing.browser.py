# يحمّل drawing.js الحقيقي ويكشف الكلاس PositionDrawing لاختباره (بدون تعديل الملف الأصلي)
from playwright.sync_api import sync_playwright
src=open('drawing.js',encoding='utf-8').read()
src=src.replace("global.DrawingTools = { init: null };","global.__PD = PositionDrawing;\nglobal.DrawingTools = { init: null };",1)
calc=open('tv-position-calc.js',encoding='utf-8').read()
js='''
const R=[]; const ok=(n,c)=>R.push([n,!!c]);
const near=(a,b)=>Math.abs(a-b)<1e-6;
const d=new __PD([{time:1,price:2000},{time:2,price:2020}],{},true);
d.entry=2000;d.stop=1990;d.target=2030;d.qty=1;d.contractMultiplier=100;d._tick=0.01;
let m=d.metrics();
ok('rr=3',near(m.rr,3)); ok('riskTicks=1000',near(m.riskTicks,1000)); ok('riskAmount=1000',near(m.riskAmount,1000)); ok('valid',m.validDirection);
const pp=d._pp(); pp.sizeByRisk=true; pp.accountSize=10000; pp.riskPct=1;
m=d.metrics(); ok('qty from risk=0.1',near(d.qty,0.1)); ok('risk amount=100 (1%)',near(m.riskAmount,100));
d.stop=1993; m=d.metrics(); ok('qty re-sized after stop move =0.142',near(d.qty,0.142));
// lock R:R via fake mgr
pp.sizeByRisk=false; pp.lockRR=true; pp.lockedRR=null; d.entry=2000;d.stop=1990;d.target=2030;
const mgr={series:{coordinateToPrice:y=>y},toData:(x,y)=>({time:1,price:y}),toPixel:p=>({x:0,y:p.price})};
d.setHandlePixel(2,0,1995,mgr); // stop -> 1995 ; rr locked 3 => target 2015
ok('lock: target=2015',near(d.target,2015));
const j=JSON.parse(JSON.stringify(d.toJSON())); ok('pos params persisted in toJSON',j.extra.pos.lockRR===true && j.extra.pos.accountSize===10000);
d.stop=2005; ok('invalid direction flagged',d.metrics().validDirection===false);
window.__R=R;'''
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.set_content('<div id=c></div>')
    pg.add_script_tag(content=calc); pg.add_script_tag(content=src)
    pg.evaluate(js)
    for n,c in pg.evaluate('window.__R'): print('ok  ' if c else 'FAIL',n)
    print('page errors:',errs); b.close()
