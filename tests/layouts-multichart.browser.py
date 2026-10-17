# يشغّل multichart.js الحقيقي (مع مكتبة شارت وهمية شاملة) ويبدّل كل تخطيط ويقيس مربعات الشاشات
import os, json
from playwright.sync_api import sync_playwright
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'); FX=os.path.join(os.path.dirname(os.path.abspath(__file__)),'fixtures')
def _p(f):
    for base in (R,FX):
        for name in (f,f.replace('.js','-١.js')):
            q=os.path.join(base,name)
            if os.path.exists(q): return q
    raise FileNotFoundError(f)
rd=lambda f: open(_p(f),encoding='utf-8').read()
PROXY=r'''
const mk=()=>new Proxy(function(){}, {get:(t,k)=>{ if(k==='then')return undefined; if(k===Symbol.toPrimitive)return()=>0; if(k==='data')return()=>[]; if(k==='length')return 0; return mk();}, apply:()=>mk(), construct:()=>mk(), set:()=>true});
window.LightweightCharts=new Proxy({}, {get:(t,k)=>k==='createChart'?(()=>mk()):k});
window.chart=mk(); window.candleSeries=mk(); window.getBacktestState=()=>({isBacktest:false}); window.SYMBOL_PRECISION={};
'''
HTML='''<div id="controls"><select id="pairSelect"><option>XAUUSD</option></select><select id="timeframeSelect"><option value="1">1m</option></select></div><div id="chart" style="width:100%;height:100%"></div>'''
css=rd('multichart.css')+rd('tv-trade.css')
res=[]; ok=lambda n,c: res.append((n,bool(c)))
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':800}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('http://test.local/',lambda r:r.fulfill(body='<!doctype html><html><body style="margin:0;height:100vh">'+HTML+'</body></html>',content_type='text/html'))
    pg.route('**/data/**',lambda r:r.fulfill(status=404))
    pg.goto('http://test.local/'); pg.add_style_tag(content=css); pg.evaluate(PROXY)
    for f in ['tv-data-engine.js','tv-layouts.js','multichart.js']:
        pg.add_script_tag(content=rd(f))
    pg.wait_for_timeout(500)
    ok('MultiChart initialised', pg.evaluate("!!window.MultiChart"))
    ok('layout menu has 13 rows (counts 1..16)', pg.evaluate("document.querySelectorAll('#mcLayoutMenu .tvl-row').length")==13)
    keys=pg.evaluate("Array.from(document.querySelectorAll('#mcLayoutMenu .tvl-item')).map(e=>e.dataset.layout)")
    ok('all %d layout buttons rendered'%len(keys), len(keys)==sum(len(g) for g in [[0]*1,[0]*2,[0]*6,[0]*7,[0]*7,[0]*6,[0]*2,[0]*4,[0]*2,[0]*3,[0]*4,[0]*1,[0]*2]))
    bad=[]
    for k in keys:
        pg.evaluate("document.querySelector('#mcLayoutMenu .tvl-item[data-layout=\"%s\"]').click()"%k); pg.wait_for_timeout(60)
        info=pg.evaluate("""()=>{const mc=window.MultiChart;const boxes=mc.panes.map(p=>{const r=p.el? p.el.getBoundingClientRect():null;return r});
          const slots=Array.from(document.querySelectorAll('.mc-grid > .mc-pane')).map(e=>{const r=e.getBoundingClientRect();return [r.left,r.top,r.width,r.height]});
          return {n:mc.panes.length,layout:mc.layout,slots}}""")
        exp=pg.evaluate("window.TVLayouts.table['%s'].panes"%k)
        good=info['n']==exp and len(info['slots'])>=1 and all(w>5 and h>5 for _,_,w,h in info['slots'])
        # لا تداخل بين المربعات
        S=info['slots']
        for i in range(len(S)):
            for j in range(i+1,len(S)):
                a,c=S[i],S[j]
                if a[0]<c[0]+c[2]-1 and c[0]<a[0]+a[2]-1 and a[1]<c[1]+c[3]-1 and c[1]<a[1]+a[3]-1: good=False
        if not good: bad.append((k,info['n'],exp,len(S)))
    ok('every layout creates the right number of non-overlapping visible panes', not bad)
    if bad: print('BAD',bad[:5])
    pg.evaluate("document.querySelector('#mcLayoutMenu .tvl-item[data-layout=\"16\"]').click()"); pg.wait_for_timeout(100)
    ok('16-pane layout has 16 panes', pg.evaluate("window.MultiChart.panes.length")==16)
    ok('active layout highlighted', pg.evaluate("document.querySelector('#mcLayoutMenu .tvl-item.active').dataset.layout")=='16')
    pg.evaluate("document.querySelector('#mcLayoutMenu .tvl-item[data-layout=\"1\"]').click()"); pg.wait_for_timeout(100)
    ok('back to 1 pane destroys extras', pg.evaluate("window.MultiChart.panes.length")==1)
    for n,c in res: print('ok  ' if c else 'FAIL',n)
    print('page errors:',errs[:3]); print('ALL OK' if all(c for _,c in res) and not errs else 'FAILED'); b.close()
