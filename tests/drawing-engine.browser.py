# اختبار محرك الرسم الحقيقي (drawing.js): Undo/Redo، النسخ، القفل/الإخفاء، الحفظ والاستعادة، شجرة الكائنات، الثبات مع التكبير
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
window.__scale=1; // معامل "تكبير": يغيّر تحويل الزمن→بكسل فقط
const gen=()=>new Proxy(function(){}, {get:(t,k)=>k==='then'?undefined:gen(),apply:()=>gen()});
window.mkChart=()=>({timeScale:()=>({timeToCoordinate:t=>t*window.__scale,coordinateToTime:x=>Math.round(x/window.__scale),subscribeVisibleLogicalRangeChange(){},subscribeVisibleTimeRangeChange(){},unsubscribeVisibleLogicalRangeChange(){},width:()=>800,getVisibleRange:()=>({from:0,to:800}),getVisibleLogicalRange:()=>({from:0,to:100}),scrollPosition:()=>0,height:()=>30}),
 subscribeCrosshairMove(){},unsubscribeCrosshairMove(){},subscribeClick(){},priceScale:()=>({width:()=>60,applyOptions(){},options:()=>({})}),applyOptions(){},resize(){},options:()=>({})});
window.mkSeries=()=>({coordinateToPrice:y=>2000-y,priceToCoordinate:p=>2000-p,data:()=>[],applyOptions(){},options:()=>({}),priceFormatter:()=>({format:v=>String(v)}),attachPrimitive(){}});
'''
res=[]; ok=lambda n,c: res.append((n,bool(c)))
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1000,'height':700}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('http://test.local/',lambda r:r.fulfill(body='<!doctype html><html><body><div id="chart" style="position:fixed;left:50px;top:50px;width:800px;height:500px"></div></body></html>',content_type='text/html')); pg.goto('http://test.local/')
    pg.evaluate(MOCK); pg.add_style_tag(content=(rd('drawing.css') if os.path.exists(os.path.join(R,'drawing.css')) else '')+'/* css */')
    for f in ['tv-draw-geom.js','tv-position-calc.js','drawing.js']: pg.add_script_tag(content=rd(f))
    pg.wait_for_timeout(300)
    JS=r'''
    const out={};
    const C=window.__DT_INTERNAL__.CTORS;
    window.mgr=DrawingTools.init({chart:mkChart(),series:mkSeries(),container:document.getElementById('chart'),storageKey:'t_draw_1'});
    const m=window.mgr; const P=(t,pr)=>({time:t,price:pr});
    const add=(type,pts,style)=>{const d=C[type](pts,style||{}); d.id=d.id||('d'+Math.random().toString(36).slice(2,8)); m.drawings.push(d); m._save(); return d};
    const ids=()=>m.drawings.map(d=>d.id+':'+d.type);
    out.initialUndoNoop=(m.undo(),m.drawings.length===0);
    const a=add('trendline',[P(100,1900),P(300,1950)]); const b2=add('hline',[P(200,1920)]);
    out.after2=m.drawings.length;
    m.undo(); out.undo1=ids().join(',')===a.id+':trendline';
    m.undo(); out.undo2=m.drawings.length===0; m.undo(); out.undo3noop=m.drawings.length===0;
    m.redo(); out.redo1=m.drawings.length===1&&m.drawings[0].id===a.id; m.redo(); out.redo2=m.drawings.length===2; m.redo(); out.redo3noop=m.drawings.length===2;
    // تعديل إحداثيات ثم Undo يعيد القيم الدقيقة
    const t=m.drawings[0]; const before=JSON.stringify(t.toJSON()); t.points[1]={time:333,price:1999.5}; m._save();
    out.moved=JSON.stringify(m.drawings[0].toJSON())!==before; m.undo(); out.undoMove=JSON.stringify(m.drawings[0].toJSON())===before; m.redo(); out.redoMove=m.drawings[0].points[1].price===1999.5;
    // حذف ثم Undo
    m.select(m.drawings[1]); const delJson=JSON.stringify(m.drawings[1].toJSON()); m.deleteSelected(); out.deleted=m.drawings.length===1; m.undo(); out.undoDelete=m.drawings.length===2&&JSON.stringify(m.drawings[1].toJSON())===delJson;
    // قفل: الحذف ممنوع
    m.drawings[1].locked=true; m._save(); m.select(m.drawings[1]); m.deleteSelected(); out.lockedNotDeleted=m.drawings.length===2;
    m.undo(); out.undoLock=m.drawings[1].locked===false;
    // إخفاء
    m.drawings[0].hidden=true; m._save(); m.undo(); out.undoHide=!m.drawings[0].hidden;
    // عمل جديد بعد Undo يمسح Redo
    m.undo(); m.redo(); out.redoAfterUndoRedo=true; m.undo(); const x=add('vline',[P(250,1900)]); out.redoClearedByNewAction=(m._redoStack.length===0);
    // نسخ
    m.select(x); const n0=m.drawings.length; m.cloneSelected(); out.cloned=m.drawings.length===n0+1&&m.drawings[m.drawings.length-1].id!==x.id&&m.drawings[m.drawings.length-1].type==='vline';
    m.undo(); out.undoClone=m.drawings.length===n0;
    // أداة الصفقة: معاملات extra تنجو من Undo/Redo
    const pos=add('long',[P(100,1900),P(300,1910)]); pos.entry=1900; pos.stop=1890; pos.target=1930; pos._pp().riskPct=2; pos._pp().lockRR=true; m._save();
    pos.target=1940; m._save(); m.undo(); const lp=m.drawings.find(d=>d.type==='long'); out.posUndoTarget=lp.target===1930; out.posParamsKept=lp._pp().riskPct===2&&lp._pp().lockRR===true;
    // شجرة الكائنات
    out.treeRows=document.querySelectorAll('#dtOtList > *').length; out.count=m.drawings.length;
    // الثبات: نقاط البيانات لا تتغير مع التكبير بينما البكسل يتغير
    const d0=m.drawings.find(d=>d.type==='trendline'); const pj=JSON.stringify(d0.points); const px1=d0.px?d0.px(m)[0].x:null; window.__scale=2; const px2=d0.px?d0.px(m)[0].x:null; window.__scale=1;
    out.anchoredData=JSON.stringify(d0.points)===pj; out.pixelFollowsZoom=px1!=null&&Math.abs(px2-2*px1)<1e-9;
    out.saved=JSON.parse(localStorage.getItem('t_draw_1')).length===m.drawings.length;
    out.snapshot=localStorage.getItem('t_draw_1'); out.history=m._undoStack.length;
    return out;'''
    o=pg.evaluate("()=>{"+JS+"}")
    for k,l in [('initialUndoNoop','undo on empty history is a no-op'),('undo1','undo removes last object'),('undo2','undo again → empty'),('undo3noop','extra undo is a no-op'),('redo1','redo restores first'),('redo2','redo restores second'),('redo3noop','extra redo is a no-op'),('moved','editing anchor changes object'),('undoMove','undo restores exact coordinates'),('redoMove','redo re-applies edit'),('deleted','delete removes object'),('undoDelete','undo restores deleted object identically'),('lockedNotDeleted','locked object cannot be deleted'),('undoLock','undo reverts lock'),('undoHide','undo reverts hide'),('redoClearedByNewAction','new action clears redo stack'),('cloned','clone creates a new object of same type'),('undoClone','undo removes the clone'),('posUndoTarget','position tool: undo reverts target'),('posParamsKept','position tool: risk params survive undo'),('anchoredData','drawing points stay in time/price coordinates'),('pixelFollowsZoom','pixel position follows zoom (anchored to chart coords)'),('saved','persisted to localStorage consistently')]: ok(l,o[k])
    ok('object tree lists all drawings (%d rows for %d objects)'%(o['treeRows'],o['count']), o['treeRows']>=o['count'] and o['count']>0)
    # الاستعادة بعد إعادة التحميل (نفس storageKey)
    saved=o['snapshot']; pg.reload(); pg.evaluate(MOCK)
    pg.evaluate("s=>localStorage.setItem('t_draw_1',s)",saved)
    for f in ['tv-draw-geom.js','tv-position-calc.js','drawing.js']: pg.add_script_tag(content=rd(f))
    o2=pg.evaluate("()=>{const m=DrawingTools.init({chart:mkChart(),series:mkSeries(),container:document.getElementById('chart'),storageKey:'t_draw_1'});return {n:m.drawings.length,types:m.drawings.map(d=>d.type),json:JSON.stringify(m.drawings.map(d=>d.toJSON()))}}")
    ok('reload restores same objects (types & coordinates)', o2['json']==json.dumps(json.loads(saved),separators=(',',':'),ensure_ascii=False) or json.loads(o2['json'])==json.loads(saved))
    for n,c in res: print('ok  ' if c else 'FAIL',n)
    print('page errors:',errs[:3]); print('ALL OK' if all(c for _,c in res) and not errs else 'FAILED'); b.close()
