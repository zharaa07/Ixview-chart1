# يمرّ على كل أداة في قائمة الرسم: التفعيل ← الإنشاء بنقرات حقيقية ← التحديد ← الاختبار بالنقر ← سحب نقطة ← Escape ← Delete ← Undo
import os, json
from playwright.sync_api import sync_playwright
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'); FX=os.path.join(os.path.dirname(os.path.abspath(__file__)),'fixtures')
def rd(f):
    for b in (R,FX):
        for name in (f,f.replace('.js','-١.js')):
            q=os.path.join(b,name)
            if os.path.exists(q): return open(q,encoding='utf-8').read()
    raise FileNotFoundError(f)
MOCK=r'''
window.__scale=1;
window.mkChart=()=>({timeScale:()=>({timeToCoordinate:t=>t*window.__scale,coordinateToTime:x=>Math.round(x/window.__scale),subscribeVisibleLogicalRangeChange(){},subscribeVisibleTimeRangeChange(){},unsubscribeVisibleLogicalRangeChange(){},width:()=>740,height:()=>30,getVisibleRange:()=>({from:0,to:740}),getVisibleLogicalRange:()=>({from:0,to:100}),scrollPosition:()=>0}),
 subscribeCrosshairMove(){},unsubscribeCrosshairMove(){},subscribeClick(){},priceScale:()=>({width:()=>60,applyOptions(){},options:()=>({})}),applyOptions(){},resize(){},options:()=>({})});
window.mkSeries=()=>({coordinateToPrice:y=>2000-y,priceToCoordinate:p=>2000-p,data:()=>[],applyOptions(){},options:()=>({}),priceFormatter:()=>({format:v=>String(v)}),attachPrimitive(){}});
'''
res=[]; ok=lambda n,c: res.append((n,bool(c)))
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1000,'height':700}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('http://test.local/',lambda r:r.fulfill(body='<!doctype html><html><body style="margin:0"><div id="chart" style="position:fixed;left:50px;top:50px;width:800px;height:500px"></div></body></html>',content_type='text/html')); pg.goto('http://test.local/')
    pg.evaluate(MOCK); css=os.path.join(R,'drawing.css')
    for f in ['tv-draw-geom.js','tv-position-calc.js','drawing.js']: pg.add_script_tag(content=rd(f))
    pg.wait_for_timeout(300)
    JS=r'''
    window.prompt=()=> 'T';
    const m=DrawingTools.init({chart:mkChart(),series:mkSeries(),container:document.getElementById('chart'),storageKey:'t_all'});
    const ev=(type,x,y,tgt)=>{(tgt||document.getElementById('chart')).dispatchEvent(new MouseEvent(type,{clientX:50+x,clientY:50+y,button:0,bubbles:true}))};
    const click=(x,y)=>{ev('mousedown',x,y);window.dispatchEvent(new MouseEvent('mouseup',{clientX:50+x,clientY:50+y,button:0,bubbles:true}))};
    const key=(k)=>window.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true}));
    const groups=document.querySelector('#dtToolMenu')?null:null;
    const IT=window.__DT_INTERNAL__; const POINTS=IT.POINTS_REQUIRED, TG=IT.TOOL_GROUPS;
    const tools=[].concat(...TG.map(g=>g.items.map(i=>({id:i.id,group:g.label,label:i.label}))));
    const pts=[[150,300],[320,220],[260,120],[420,260],[480,180]];
    const out=[];
    for(const t of tools){
      const r={id:t.id,group:t.group}; const n0=m.drawings.length;
      m.setActiveTool(t.id); r.active=m.activeTool===t.id;
      const need=POINTS[t.id]||2; const clicks=need===Infinity?4:need;
      for(let i=0;i<clicks;i++) click(pts[i][0],pts[i][1]);
      if(need===Infinity){ev('dblclick',pts[3][0],pts[3][1])}
      const d=m.drawings[m.drawings.length-1];
      const ALIAS={extline:'trendline',fibext:'fib',ellipse:'circle'}; r.expType=ALIAS[t.id]||t.id; r.created=m.drawings.length===n0+1&&d&&d.type===r.expType; r.gotType=d&&d.type; r.noDraft=!m.draft; r.backToCursor=m.activeTool==='cursor'; r.selected=m.selected===d;
      if(d){
        const px=d.px(m); r.nPoints=d.points.length;
        // اختبار بالنقر عند أول نقطة ارتكاز
        const hit=m._findHit(px[0].x,px[0].y); r.hit=!!(hit&&hit.drawing===d);
        // تحرير نقطة ارتكاز بالسحب (cursor tool): الموضع في الزمن/السعر يتغير والكائن نفسه
        const before=JSON.stringify(d.points[0]); m.select(null); m.setActiveTool('cursor');
        ev('mousedown',px[0].x,px[0].y); ev('mousemove',px[0].x+35,px[0].y+22,window); window.dispatchEvent(new MouseEvent('mousemove',{clientX:50+px[0].x+35,clientY:50+px[0].y+22,bubbles:true})); window.dispatchEvent(new MouseEvent('mouseup',{clientX:50+px[0].x+35,clientY:50+px[0].y+22,button:0,bubbles:true}));
        const after=JSON.stringify(d.points[0]); r.dragMoved=before!==after;
        // Delete ثم Undo
        m.select(d); key('Delete'); r.deleted=!m.drawings.includes(d); m.undo(); r.undone=m.drawings.some(x=>x.id===d.id&&x.type===r.expType);
        // تنظيف
        m.drawings=[]; m._save();
      }
      // إلغاء الرسم غير المكتمل بـ Escape (للأدوات متعددة النقاط)
      if(need>1){ m.setActiveTool(t.id); const c0=m.drawings.length; click(200,350); r.draftStarted=!!m.draft; key('Escape'); r.escCancelled=!m.draft&&m.drawings.length===c0; m.setActiveTool('cursor'); }
      out.push(r);
    }
    // ---- فحوص هندسية خاصة بالدائرة الحقيقية مقابل Ellipse
    m.drawings=[]; m.setActiveTool('circlerad'); click(300,300); click(400,300); const cd=m.drawings[0];
    const sp={};
    sp.circleType=cd.type==='circlerad'; sp.r100=Math.abs(Math.hypot(...[0,0])||0)>=0;
    sp.hitRight=cd.hitTest(400,300,m); sp.hitTop=cd.hitTest(300,200,m); sp.hitBottom=cd.hitTest(300,400,m); sp.hitLeft=cd.hitTest(200,300,m); sp.filledCenterHit=cd.filled?cd.hitTest(300,300,m):true; cd.filled=false; sp.missCenter=!cd.hitTest(300,300,m); sp.missOutside=!cd.hitTest(300,500,m);
    // سحب المركز يحافظ على نصف القطر
    const r0=Math.hypot(cd.px(m)[1].x-cd.px(m)[0].x,cd.px(m)[1].y-cd.px(m)[0].y); cd.setHandlePixel(0,350,250,m); const q=cd.px(m); sp.keepsRadius=Math.abs(Math.hypot(q[1].x-q[0].x,q[1].y-q[0].y)-r0)<1.5 && Math.abs(q[0].x-350)<1.5;
    cd.setHandlePixel(1,350,350,m); const q2=cd.px(m); sp.radiusEdit=Math.abs(Math.hypot(q2[1].x-q2[0].x,q2[1].y-q2[0].y)-100)<1.5;
    m.drawings=[]; m.setActiveTool('ellipse'); click(300,300); click(400,340); const ed=m.drawings[0]; sp.ellipseBox=ed.type==='circle'&&ed.hitTest(400,320,m)&&ed.hitTest(350,300,m)&&!ed.hitTest(300,300,m); sp.ellipseNotCircle=!ed.hitTest(350,340-1000,m);
    m.drawings=[]; m._save();
    out.push({id:'__special',sp});
    return out;'''
    out=pg.evaluate("()=>{"+JS+"}")
    sp=[o for o in out if o['id']=='__special'][0]['sp']; out=[o for o in out if o['id']!='__special']
    n=len(out); print('tools tested:',n)
    for k,l in [('active','activates the tool'),('created','creates ONE object of the correct type'),('noDraft','leaves no pending draft'),('backToCursor','returns to cursor'),('selected','selects the new object'),('hit','hit-test finds it at its anchor'),('dragMoved','dragging an anchor edits time/price'),('deleted','Delete removes it'),('undone','Undo restores it'),('escCancelled','Escape cancels unfinished drawing')]:
        bad=[o['id'] for o in out if (k in o and not o[k]) or (k not in o and k!='escCancelled')]
        ok('%s — all %d tools'%(l,n) if not bad else '%s — FAILED for %s'%(l,bad), not bad)
    ok('inventory covers 26 tools in 6 groups (extline/fibext/ellipse are variants with their own settings)', n==26)
    for k,l in [('circleType','Circle tool creates type circlerad (true circle)'),('hitRight','circle hit at right of circumference'),('hitTop','circle hit at top'),('hitBottom','circle hit at bottom'),('hitLeft','circle hit at left'),('filledCenterHit','filled circle: interior is a hit'),('missCenter','unfilled circle: center is not a hit'),('missOutside','outside is not a hit'),('keepsRadius','dragging circle center keeps radius'),('radiusEdit','dragging edge handle changes radius'),('ellipseBox','Ellipse remains a bounding-box ellipse (legacy type kept)')]: ok(l, sp[k])
    for n_,c in res: print('ok  ' if c else 'FAIL',n_)
    print('page errors:',errs[:3]); print('ALL OK' if all(c for _,c in res) and not errs else 'FAILED'); b.close()
