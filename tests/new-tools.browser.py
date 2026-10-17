# يختبر أدوات الرسم الجديدة على Canvas حقيقي: الرسم + hitTest + التسجيل في القوائم
import os
from playwright.sync_api import sync_playwright
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
rd=lambda f: open(os.path.join(R,f if os.path.exists(os.path.join(R,f)) else f.replace('.js','-١.js')),encoding='utf-8').read()
src=rd('drawing.js').replace("global.DrawingTools = { init: null };","global.__T={CTORS,POINTS_REQUIRED,TOOL_GROUPS};\nglobal.DrawingTools = { init: null };",1)
JS=r'''
const R=[];const ok=(n,c)=>R.push([n,!!c]);
const cv=document.createElement('canvas');cv.width=600;cv.height=400;document.body.appendChild(cv);const ctx=cv.getContext('2d');
const mgr={width:600,height:400,priceDecimals:()=>2,series:{coordinateToPrice:y=>2000-y},toPixel:p=>({x:p.time,y:2000-p.price,price:p.price}),toData:(x,y)=>({time:x,price:2000-y})};
const px=(x,y)=>({time:x,price:2000-y});
const inkAt=(x,y)=>{const d=ctx.getImageData(x-3,y-3,7,7).data;for(let i=3;i<d.length;i+=4)if(d[i]>0)return true;return false};
const T=window.__T;
const tools={ fibchannel:[px(50,300),px(250,200),px(150,100)], fibfan:[px(50,300),px(200,150)], fibtimezone:[px(100,0),px(120,0)], gannbox:[px(100,100),px(300,300)], pin:[px(300,200)], pricelabel:[px(300,200)] };
for(const id in tools){
  ctx.clearRect(0,0,600,400);
  const d=T.CTORS[id](tools[id],{});
  d.render(ctx,mgr,false);
  const px_=ctx.getImageData(0,0,600,400).data;let n=0;for(let i=3;i<px_.length;i+=4)if(px_[i]>0)n++;
  ok(id+' draws pixels',n>50);
  ok(id+' needs '+T.POINTS_REQUIRED[id]+' points = '+tools[id].length,T.POINTS_REQUIRED[id]===tools[id].length);
}
// hitTest: نقاط على الخطوط حقاً وأخرى بعيدة
let d=T.CTORS.gannbox(tools.gannbox,{}); ok('gannbox hit on edge',d.hitTest(100,200,mgr)); ok('gannbox miss far away',!d.hitTest(500,50,mgr));
d=T.CTORS.fibtimezone(tools.fibtimezone,{}); ok('timezone hit on 2nd line (x=120)',d.hitTest(120,200,mgr)); ok('timezone miss between lines',!d.hitTest(110,200,mgr));
d=T.CTORS.fibfan(tools.fibfan,{}); ok('fan hit on base-ratio ray end',d.hitTest(200,150+0,mgr)||d.hitTest(200,300-0.5*150,mgr)); ok('fan miss',!d.hitTest(30,10,mgr));
d=T.CTORS.fibchannel(tools.fibchannel,{}); ok('channel hit on baseline AB',d.hitTest(150,250,mgr)); ok('channel miss',!d.hitTest(500,380,mgr));
d=T.CTORS.pricelabel(tools.pricelabel,{}); ok('pricelabel hit inside box',d.hitTest(320,200,mgr)); ok('pricelabel miss',!d.hitTest(100,100,mgr));
d=T.CTORS.pin(tools.pin,{}); ok('pin hit on head',d.hitTest(300,180,mgr)); ok('pin miss',!d.hitTest(100,100,mgr));
// 2 نقاط فقط للقناة أثناء الرسم لا تنهار
ctx.clearRect(0,0,600,400);T.CTORS.fibchannel([px(50,300),px(250,200)],{}).render(ctx,mgr,false);ok('channel preview with 2 points does not throw',inkAt(150,250));
// تسجيل في القوائم: لا عناصر "soon" ولا أدوات بلا منشئ
const ids=[].concat(...T.TOOL_GROUPS.map(g=>g.items));
ok('no tool is flagged soon',ids.every(i=>!i.soon));
ok('every menu tool has a constructor and a point count',ids.every(i=>T.CTORS[i.id]&&T.POINTS_REQUIRED[i.id]!=null));
// تسلسل: toJSON يحفظ النوع والنقاط
const j=JSON.parse(JSON.stringify(T.CTORS.gannbox(tools.gannbox,{color:'#ff0000'}).toJSON()));ok('serialisation keeps type, points, color',j.type==='gannbox'&&j.points.length===2&&j.color==='#ff0000');
window.__R=R;
'''
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('http://test.local/',lambda r:r.fulfill(body='<html><body></body></html>',content_type='text/html')); pg.goto('http://test.local/')
    for f in ['tv-draw-geom.js','tv-position-calc.js']: pg.add_script_tag(content=rd(f))
    pg.add_script_tag(content=src); pg.evaluate(JS); res=pg.evaluate('window.__R')
    for n,c in res: print('ok  ' if c else 'FAIL',n)
    print('page errors:',errs); print('ALL OK' if all(c for _,c in res) and not errs else 'FAILED'); b.close()
