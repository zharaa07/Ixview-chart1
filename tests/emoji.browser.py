# اختبار نافذة الإيموجي مع محرك الرسم الحقيقي وشريط الأدوات الحقيقي
import os
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
window.mkChart=()=>({timeScale:()=>({timeToCoordinate:t=>t*window.__scale,coordinateToTime:x=>Math.round(x/window.__scale),subscribeVisibleLogicalRangeChange(){},subscribeVisibleTimeRangeChange(){},unsubscribeVisibleLogicalRangeChange(){},width:()=>740,height:()=>30,getVisibleRange:()=>({from:0,to:740}),getVisibleLogicalRange:()=>({from:0,to:100}),scrollPosition:()=>0}),subscribeCrosshairMove(){},unsubscribeCrosshairMove(){},subscribeClick(){},priceScale:()=>({width:()=>60,applyOptions(){},options:()=>({})}),applyOptions(){},resize(){},options:()=>({})});
window.mkSeries=()=>({coordinateToPrice:y=>2000-y,priceToCoordinate:p=>2000-p,data:()=>[],applyOptions(){},options:()=>({}),priceFormatter:()=>({format:v=>String(v)}),attachPrimitive(){}});
'''
res=[]; ok=lambda n,c: res.append((n,bool(c)))
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1000,'height':700}); errs=[]; dialogs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:(dialogs.append(d.type),d.dismiss()))
    pg.route('http://test.local/',lambda r:r.fulfill(body='<!doctype html><html><body style="margin:0"><div id="chart" style="position:fixed;left:50px;top:50px;width:800px;height:500px"></div></body></html>',content_type='text/html')); pg.goto('http://test.local/')
    pg.evaluate(MOCK); pg.add_style_tag(content=rd('tv-left-toolbar.css')+rd('tv-trade.css'))
    for f in ['tv-draw-geom.js','tv-position-calc.js','drawing.js','tv-emoji-picker.js','tv-left-toolbar.js']: pg.add_script_tag(content=rd(f))
    pg.evaluate("window.m=DrawingTools.init({chart:mkChart(),series:mkSeries(),container:document.getElementById('chart'),storageKey:'t_em'})"); pg.wait_for_timeout(800)
    pg.click('#tvltEmoji'); ok('emoji button opens a popup (not a prompt)', pg.locator('#tvEmojiPicker').count()==1 and 'prompt' not in dialogs)
    ok('five category tabs, first category active with a title', pg.locator('.tve-tab').count()==5 and 'الوجوه' in pg.inner_text('.tve-title') and pg.locator('.tve-tab.on').count()==1)
    n1=pg.locator('.tve-item').count(); pg.click('.tve-tab[data-cat=trading]'); t2=pg.inner_text('.tve-title'); n2=pg.locator('.tve-item').count()
    ok('switching category changes title and the symbols grid', 'التداول' in t2 and n2!=n1 and pg.locator('.tve-tab[data-cat=trading].on').count()==1)
    ok('every symbol is a real single emoji (no empty/broken cells)', pg.evaluate("Array.from(document.querySelectorAll('.tve-item')).every(b=>b.textContent.length>0)"))
    pg.keyboard.press('Escape'); ok('Escape closes without activating any tool', pg.locator('#tvEmojiPicker').count()==0 and pg.evaluate("m.activeTool")=='cursor')
    pg.click('#tvltEmoji'); pg.mouse.click(600,300); ok('click outside closes the popup', pg.locator('#tvEmojiPicker').count()==0)
    pg.click('#tvltEmoji'); pg.click('.tve-tab[data-cat=trading]'); em=pg.evaluate("document.querySelectorAll('.tve-item')[0].textContent"); pg.locator('.tve-item').first.click()
    ok('picking a symbol closes popup and arms the text tool with it', pg.locator('#tvEmojiPicker').count()==0 and pg.evaluate("m.activeTool")=='text' and pg.evaluate("m._pendingEmojiText")==em)
    pg.mouse.click(50+300,50+250)
    st=pg.evaluate("(()=>{const d=m.drawings[m.drawings.length-1];return d&&{type:d.type,text:d.text,t:d.points[0].time,p:d.points[0].price,tool:m.activeTool,pending:m._pendingEmojiText}})()")
    ok('click on chart places the emoji as an annotation with that symbol', st and st['type']=='text' and st['text']==em and st['tool']=='cursor' and st['pending'] is None)
    ok('anchored to chart time/price coordinates (x=300→time 300, y=250→price 1750)', st['t']==300 and st['p']==1750)
    ok('no browser prompt dialog was shown at any point', 'prompt' not in dialogs)
    px1=pg.evaluate("m.drawings[0].px(m)[0].x"); pg.evaluate("window.__scale=2"); px2=pg.evaluate("m.drawings[0].px(m)[0].x"); pg.evaluate("window.__scale=1")
    ok('emoji position follows zoom (anchored, not fixed pixels)', abs(px2-2*px1)<1e-9)
    pg.evaluate("m.select(m.drawings[0]); m.deleteSelected()"); ok('emoji annotation can be deleted', pg.evaluate("m.drawings.length")==0); pg.evaluate("m.undo()"); ok('and restored with undo', pg.evaluate("m.drawings.length")==1 and pg.evaluate("m.drawings[0].text")==em)
    for n,c in res: print('ok  ' if c else 'FAIL',n)
    print('page errors:',errs[:3]); print('ALL OK' if all(c for _,c in res) and not errs else 'FAILED'); b.close()
