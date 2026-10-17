# يختبر tv-settings.js الحقيقي + فواصل الجلسات + مفتاح المؤشرات مع نسخة وهمية من lightweight-charts v5
import os, json, re
from playwright.sync_api import sync_playwright
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
FX=os.path.join(os.path.dirname(os.path.abspath(__file__)),'fixtures')
def _p(f):
    for base in (R,FX):
        for name in (f,f.replace('.js','-١.js')):
            q=os.path.join(base,name)
            if os.path.exists(q): return q
    raise FileNotFoundError(f)
rd=lambda f: open(_p(f),encoding='utf-8').read()
MOCK=r'''
window.__calls=[];window.__wm=[];window.__lines=[];
const ser=()=>({_d:[],setData(d){this._d=d.slice()},update(b){this._d.push(b)},data(){return this._d.slice()},applyOptions(o){window.__calls.push(['series',o])},createPriceLine(){return {}},removePriceLine(){}});
window.LightweightCharts={LineSeries:'l',HistogramSeries:'h',LineStyle:{Solid:0,Dotted:1,Dashed:2},PriceScaleMode:{Normal:0,Logarithmic:1,Percentage:2,IndexedTo100:3},
 createTextWatermark:(pane,o)=>{const w={o,detached:false,detach(){this.detached=true}};window.__wm.push(w);return w}};
window.chart={_s:[],applyOptions(o){window.__calls.push(['chart',o])},addSeries(){const s=ser();this._s.push(s);return s},removeSeries(){},panes(){return [{}]},
 timeScale(){return {subscribeVisibleLogicalRangeChange(){},timeToCoordinate:t=>(t-1704672000)/600,width:()=>780}}};
window.candleSeries=ser();
'''
BASE='<div id="tvTopBar"><button id="settingsBtn">⚙</button><button id="tvIndicatorsBtn" class="tv-topbar-btn tv-disabled">I</button></div><div id="chart" style="position:relative;width:800px;height:400px"></div>'
def day(d,h=0,m=0): return {'time':int(__import__('datetime').datetime(2024,1,d,h,m,tzinfo=__import__('datetime').timezone.utc).timestamp())}
bars=[dict(day(8,23,50),open=1,high=2,low=0.5,close=1.5),dict(day(9,0,1),open=1,high=2,low=0.5,close=1.5),dict(day(9,12,0),open=1,high=2,low=0.5,close=1.5),dict(day(10,0,3),open=1,high=2,low=0.5,close=1.5)]
res=[]; ok=lambda n,c: res.append((n,bool(c)))
def page(p,seed):
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1000,'height':700}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('http://test.local/',lambda r:r.fulfill(body='<!doctype html><html><body>'+BASE+'</body></html>',content_type='text/html')); pg.goto('http://test.local/')
    if seed: pg.evaluate("s=>localStorage.setItem('chartSettings_v1',s)",json.dumps(seed))
    pg.evaluate(MOCK); pg.evaluate("candleSeries.setData(%s)"%json.dumps(bars))
    css=rd('tv-theme.css')
    pg.add_style_tag(content=css+rd('tv-settings.css')+rd('tv-trade.css')+'#chart{height:400px !important;position:relative !important}')
    return b,pg,errs
with sync_playwright() as p:
    key=re.search(r"STORAGE_KEY\s*=\s*'([^']+)'",rd('tv-settings.js')).group(1)
    b,pg,errs=page(p,{'watermarkVisible':True,'watermarkText':'XAUUSD','sessionBreaks':True,'sessionBreakColor':'#ff0000'})
    for f in ['tv-indicators.js','tv-settings.js','tv-session-breaks.js','tv-indicators-ui.js']: pg.add_script_tag(content=rd(f))
    pg.wait_for_timeout(900)
    wm=pg.evaluate("window.__wm.filter(w=>!w.detached).map(w=>w.o.lines[0].text)")
    ok('watermark via v5 plugin with text XAUUSD',wm==['XAUUSD'])
    ok('no legacy watermark option passed to applyOptions',pg.evaluate("!window.__calls.some(c=>c[1] && c[1].watermark)"))
    # فواصل الجلسات: 2 فاصل (يوم 9 و 10) على x=(t-1704672000)/60
    n=pg.evaluate("""()=>{const c=document.getElementById('tvSessionBreaks');if(!c)return -1;const ctx=c.getContext('2d');const d=ctx.getImageData(0,0,c.width,c.height).data;const cols=new Set();
      for(let y=5;y<6;y++)for(let x=0;x<c.width;x++){const a=d[(y*c.width+x)*4+3];if(a>0)cols.add(x)}return cols.size}""")
    ok('session break canvas draws lines (2 days boundaries)',n>=2)
    red=pg.evaluate("""()=>{const c=document.getElementById('tvSessionBreaks');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=0;i<d.length;i+=4)if(d[i+3]>0)return [d[i],d[i+1],d[i+2]];return null}""")
    ok('session break uses the configured color (red)',red and red[0]>200 and red[1]<60)
    # فتح الحوار
    pg.click('#settingsBtn'); pg.wait_for_timeout(200)
    tabs=pg.eval_on_selector_all('.tvs-tab','e=>e.map(x=>x.innerText.trim())')
    ok('alerts tab is registered',any('التنبيهات' in t for t in tabs))
    pg.click('.tvs-tab:has-text("التنبيهات")'); ok('alerts tab renders content','فتح قائمة التنبيهات' in pg.inner_text('#tvsBody') if pg.locator('#tvsBody').count() else 'فتح قائمة التنبيهات' in pg.inner_text('body'))
    pg.click('.tvs-tab:has-text("الأحداث")'); body=pg.inner_text('body')
    ok('events tab has session-break controls and no dead toggles','فواصل الجلسات' in body and 'Earnings' not in body and 'Dividends' not in body)
    # تعطيل الفواصل ثم موافق
    pg.locator('.tvs-checkbox').first.click(); pg.click('#tvsOk'); pg.wait_for_timeout(200)
    st=json.loads(pg.evaluate("k=>localStorage.getItem(k)",key)); ok('session breaks toggle persisted off',st['sessionBreaks'] is False)
    cleared=pg.evaluate("""()=>{const c=document.getElementById('tvSessionBreaks');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=4)if(d[i]>0)return false;return true}""")
    ok('breaks removed from canvas after disabling',cleared)
    # إلغاء يعيد القيم السابقة
    pg.click('#settingsBtn'); pg.click('.tvs-tab:has-text("الأحداث")'); pg.locator('.tvs-checkbox').first.click(); pg.click('#tvsCancel'); pg.wait_for_timeout(100)
    st=json.loads(pg.evaluate("k=>localStorage.getItem(k)",key)); ok('cancel leaves saved state unchanged',st['sessionBreaks'] is False)
    ok('page errors none',not errs); 
    if errs: print(errs[:3])
    b.close()
    # التدرج + مفتاح المؤشرات
    b,pg,errs=page(p,{'bgType':'gradient','bgColor':'#ffffff','bgColor2':'#000000'})
    for f in ['tv-indicators.js','tv-settings.js','tv-indicators-ui.js']: pg.add_script_tag(content=rd(f))
    pg.wait_for_timeout(900)
    bgt=pg.evaluate("(()=>{const c=window.__calls.filter(x=>x[0]==='chart'&&x[1].layout).pop();return c&&c[1].layout.background.type})()")
    ok("gradient background uses valid type 'gradient'",bgt=='gradient')
    pg.evaluate("TVIndicatorsUI.add('sma')"); pg.wait_for_timeout(200)
    ok('legend shows title by default','Moving Average' in pg.inner_text('#tvIndLegend'))
    pg.click('#settingsBtn'); pg.click('.tvs-tab:has-text("خط الحالة")')
    ok('status-line tab has indicator options','العناوين' in pg.inner_text('body') and 'المدخلات' in pg.inner_text('body'))
    ind_cb=pg.locator('.tvs-row:has-text("العناوين (Titles)") .tvs-checkbox, .tvs-checkbox').nth(7)
    rowt=pg.locator('text=العناوين (Titles)').locator('xpath=ancestor::*[contains(@class,"tvs-row")][1]//button').first
    rowt.click(); pg.click('#tvsOk'); pg.wait_for_timeout(200)
    ok('Titles off hides indicator name in legend','Moving Average' not in pg.inner_text('#tvIndLegend'))
    ok('page errors none (2)',not errs)
    if errs: print(errs[:3])
    b.close()
for n,c in res: print('ok  ' if c else 'FAIL',n)
print('ALL OK' if all(c for _,c in res) else 'FAILED')
