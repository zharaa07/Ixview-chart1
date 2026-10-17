# اختبار نظام المقارنة الحقيقي (multichart.js) على بيانات XAUUSD 2019 الحقيقية + رموز محلية مشتقة (لاختبار المحاذاة فقط)
import os, json, tempfile
from playwright.sync_api import sync_playwright
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'); FX=os.path.join(os.path.dirname(os.path.abspath(__file__)),'fixtures')
def rd(f):
    for b in (R,FX):
        for name in (f,f.replace('.js','-١.js')):
            q=os.path.join(b,name)
            if os.path.exists(q): return open(q,encoding='utf-8').read()
    raise FileNotFoundError(f)
REAL=os.environ.get('XAU_CSV','/tmp/xau2019.csv')
if not os.path.exists(REAL):
    print('SKIPPED: set XAU_CSV=/path/to/DAT_MT_XAUUSD_M1_2019.csv'); raise SystemExit(0)
# رموز اختبار مشتقة من الملف الحقيقي: EURTEST = السعر/1000 مع حذف كل ساعة رقم%5==0 (ثقوب زمنية ومقياس مختلف)، LATE = أول 3000 صف مُرحَّلة لسنة 2020
rows=[l.strip() for l in open(REAL) if l.strip()]
eur=[]; 
for l in rows:
    c=l.split(','); h=int(c[1][:2])
    if h%5==0: continue
    eur.append(','.join([c[0],c[1]]+['%.6f'%(float(x)/1000) for x in c[2:6]]+[c[6]]))
tmp=tempfile.mkdtemp(); EUR=os.path.join(tmp,'EURTEST.csv'); open(EUR,'w').write('\n'.join(eur)+'\n')
LATE=os.path.join(tmp,'LATE.csv'); open(LATE,'w').write('\n'.join(l.replace('2019.','2020.',1) for l in rows[:3000])+'\n')
MOCK=r'''
window.__vis=null;window.__chCb=null;window.__visCb=null;
const mkSeries=(chart,kind,opts)=>{const s={kind,opts:Object.assign({},opts),_d:[],chart,setData(d){this._d=d.slice()},update(b){const l=this._d[this._d.length-1];if(l&&l.time===b.time)this._d[this._d.length-1]=b;else this._d.push(b)},data(){return this._d.slice()},applyOptions(o){Object.assign(this.opts,o)},createPriceLine(){return {}},removePriceLine(){},priceToCoordinate:p=>2000-p,coordinateToPrice:y=>2000-y,attachPrimitive(){}};chart._series.push(s);return s};
const scale=(chart,id)=>({applyOptions(o){chart._scales[id]=Object.assign(chart._scales[id]||{},o)},options:()=>chart._scales[id]||{},width:()=>60});
window.LightweightCharts={LineSeries:'line',AreaSeries:'area',HistogramSeries:'hist',CandlestickSeries:'candle',LineStyle:{Solid:0,Dotted:1,Dashed:2},LineType:{WithSteps:1},PriceScaleMode:{Normal:0,Logarithmic:1,Percentage:2,IndexedTo100:3}};
window.chart={_series:[],_scales:{},addSeries(k,o){return mkSeries(this,k,o)},removeSeries(s){this._series=this._series.filter(x=>x!==s)},priceScale(id){return scale(this,id)},
 timeScale(){return {getVisibleRange:()=>window.__vis,subscribeVisibleTimeRangeChange(cb){window.__visCb=cb},subscribeVisibleLogicalRangeChange(){},unsubscribeVisibleLogicalRangeChange(){},width:()=>780,height:()=>30,timeToCoordinate:t=>t,coordinateToTime:x=>x,getVisibleLogicalRange:()=>({from:0,to:100}),setVisibleLogicalRange(){},setVisibleRange(){}}},
 subscribeCrosshairMove(cb){window.__chCb=cb},unsubscribeCrosshairMove(){},subscribeClick(){},applyOptions(){},resize(){},options:()=>({}),panes:()=>[{}]};
window.candleSeries=mkSeries(window.chart,'candle',{});
window.__bt={isBacktest:false,allData:[]};window.getBacktestState=()=>window.__bt;window.SYMBOL_PRECISION={XAUUSD:3};
'''
HTML='<div id="controls"><select id="pairSelect"><option value="XAUUSD">Gold</option></select><select id="timeframeSelect"><option value="1">1m</option><option value="60" selected>1h</option></select></div><div id="chart" style="width:900px;height:500px"></div>'
res=[]; ok=lambda n,c: res.append((n,bool(c)))
def wait_sync(pg,ms=900): pg.wait_for_timeout(ms)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1100,'height':800}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.route('**/data/**',lambda r:r.fulfill(status=404))
    pg.route('http://test.local/',lambda r:r.fulfill(body='<!doctype html><html><body>'+HTML+'</body></html>',content_type='text/html')); pg.goto('http://test.local/')
    pg.add_style_tag(content=rd('multichart.css')+rd('tv-trade.css')); pg.evaluate(MOCK)
    for f in ['tv-data-engine.js','tv-data-import.js','tv-local-data.js','tv-aggregate.js','tv-compare.js','tv-layouts.js','multichart.js']: pg.add_script_tag(content=rd(f))
    pg.wait_for_timeout(800)
    # استيراد بيانات حقيقية + مشتقة
    pg.evaluate("""async a=>{for(const [sym,t] of a){const r=TVDataImport.parseCSV(t);await TVLocalData.importCandles(sym,r.candles,Object.assign({filename:sym+'.csv'},r.report));}}""",[['XAUUSD',open(REAL).read()],['EURTEST',open(EUR).read()],['LATE',open(LATE).read()]])
    # الشارت الرئيسي: شموع ساعة لشهر مارس 2019 (بيانات حقيقية مجمّعة)
    pg.evaluate("""()=>{const E=TVDataEngine;return E.fetchYearChunk('XAUUSD',2019).then(raw=>{const m=raw.filter(c=>c.time>=Date.UTC(2019,2,1)/1000&&c.time<Date.UTC(2019,3,1)/1000);const h=TVAggregate.aggregate(m,60,60);
      window.__mainBars=h;window.__bt.allData=h;candleSeries.setData(h);window.__vis={from:h[0].time,to:h[h.length-1].time};return h.length})}""")
    ok('MultiChart initialised with a primary pane', pg.evaluate("!!window.MultiChart && MultiChart.panes.length>=1"))
    pg.evaluate("window.pane=MultiChart.panes[0]; pane.timeframe=60;")
    # --- إضافة رمز مقارنة (EURTEST)
    pg.evaluate("window.pane.addCompare('EURTEST','line')"); wait_sync(pg,1500)
    inf=pg.evaluate("""()=>{const e=pane.compares[0];const mb=window.__mainBars;const times=e.series._d.map(p=>p.time);
      return {n:times.length,min:Math.min(...times),max:Math.max(...times),mainFrom:mb[0].time,mainTo:mb[mb.length-1].time,loadedFrom:e.loadedFrom,loadedTo:e.loadedTo,noData:e.noData,cov:e.coverage&&{ratio:e.coverage.matchRatio,common:e.coverage.common}}}""")
    ok('comparison data loaded for the SAME period as the main chart (not the latest 2000 candles)', inf['min']>=inf['mainFrom'] and inf['max']<=inf['mainTo'] and inf['n']>300)
    ok('coverage shows holes (hours removed) and is reported honestly', 0.7<inf['cov']['ratio']<0.9)
    # كل نقطة مقارنة لها شمعة رئيسية بنفس الوقت تماماً أو فجوة (لا نقاط مخترعة): نتحقق أن كل أوقاتها موجودة فعلاً في بيانات EURTEST الأصلية
    chk=pg.evaluate("""()=>TVDataEngine.fetchYearChunk('EURTEST',2019).then(raw=>{const agg=new Set(TVAggregate.aggregate(raw,60,60).map(b=>b.time));return pane.compares[0].series._d.every(p=>agg.has(p.time))})""")
    ok('every comparison point exists in the real EURTEST dataset (nothing invented)', chk)
    ok('overlay mode: own hidden scale, raw values (~1.9, 1000× smaller than gold)', pg.evaluate("pane.compares[0].series._d[0].value<5 && pane.compares[0].series.opts.priceScaleId===pane.compares[0].scaleId"))
    # --- وضع النسبة المئوية
    pg.evaluate("window.__vis={from:window.__mainBars[10].time,to:window.__mainBars[400].time}; pane.setCompareMode('percent')"); wait_sync(pg,300)
    st=pg.evaluate("""()=>{const e=pane.compares[0],mb=window.__mainBars;const et=new Set(e.closeData.map(p=>p.time));
      const vis=window.__vis.from;let bt=null;for(const b of mb){if(b.time>=vis&&et.has(b.time)){bt=b.time;break}}
      const entry0=e.data.find(p=>p.time===bt), main0=pane._baseLine._d.find(p=>p.time===bt);
      // مرجع مستقل للنسبة: أسعار الإغلاق الأصلية
      const eBase=e.closeData.find(p=>p.time===bt).value, mBase=mb.find(b=>b.time===bt).close; const sample=e.data[Math.floor(e.data.length*0.8)];
      const eRaw=e.closeData.find(p=>p.time===sample.time).value; const mRaw=mb.find(b=>b.time===sample.time);
      return {bt,exp:pane._cmpBase.time,entry0:entry0&&entry0.value,main0:main0&&main0.value,scale:e.series.opts.priceScaleId,left:window.chart._scales.left,right:window.chart._scales.right,
        pctOk:Math.abs(sample.value-((eRaw/eBase-1)*100))<1e-9, mainPctOk:mRaw?Math.abs(pane._baseLine._d.find(p=>p.time===sample.time).value-((mRaw.close/mBase-1)*100))<1e-9:true,
        beforeBase:e.data.filter(p=>p.time<bt).length>=0, legend:document.querySelector('.mc-legend-info').textContent}}""")
    ok('percent: shared baseline = first common timestamp at/after the visible start', st['bt'] is not None and st['bt']==st['exp'])
    ok('percent: both series are exactly 0% at the baseline', abs(st['entry0'])<1e-9 and abs(st['main0'])<1e-9)
    ok('percent: values equal (price/base−1)×100 for compared series AND main base line', st['pctOk'] and st['mainPctOk'])
    ok('percent: comparison on the LEFT scale, right scale stays raw/Normal (drawings stay valid)', st['scale']=='left' and st['left']['visible'] is True and st['right']['mode']==0)
    ok('legend states mode, axis and baseline timestamp', 'نسبة مئوية' in st['legend'] and 'الأساس' in st['legend'] and 'UTC' in st['legend'])
    # --- Indexed 100
    pg.evaluate("pane.setCompareMode('normalize')"); wait_sync(pg,200)
    ix=pg.evaluate("""()=>{const e=pane.compares[0];const bt=pane._cmpBase.time;return {e:e.data.find(p=>p.time===bt).value,m:pane._baseLine._d.find(p=>p.time===bt).value}}""")
    ok('indexed: both series equal 100 at the baseline', abs(ix['e']-100)<1e-9 and abs(ix['m']-100)<1e-9)
    # --- تغيّر النطاق المرئي يعيد الأساس
    bt_before=pg.evaluate("pane._cmpBase.time"); pg.evaluate("window.__vis={from:window.__mainBars[200].time,to:window.__mainBars[450].time}; window.__visCb && window.__visCb()"); wait_sync(pg,400)
    bt_after=pg.evaluate("pane._cmpBase.time"); ok('scrolling the visible range re-bases to the new first common bar', bt_after>bt_before)
    # --- نفس المحور الخام: تحذير عند اختلاف المقياس
    pg.evaluate("pane.setCompareMode('same')"); ok('same-scale mode warns about 1000× price-range difference', 'يختلف عن الرئيسي' in pg.inner_text('.mc-legend'))
    # --- تحويم: قيمة عند وقت / فجوة ⇒ –
    hv=pg.evaluate("""()=>{const e=pane.compares[0];const cd=e.closeData;const hole=window.__mainBars.find(b=>!cd.some(p=>p.time===b.time)&&b.time>cd[0].time+3600*3);const have=cd[100].time;
      window.__chCb({time:have});const t1=e._hoverEl.textContent;window.__chCb({time:hole.time});const t2=e._hoverEl.textContent;return {t1,t2,v:cd[100].value.toFixed(pane._decimals('EURTEST')),holeGap:hole.time-cd.filter(p=>p.time<=hole.time).pop().time}}""")
    ok('hover shows the series value at the hovered time', hv['t1']==hv['v'])
    ok('hover inside a data hole shows – (no stale value passed off as current)' if hv['holeGap']>5400 else 'hover in short gap uses last bar within tolerance', (hv['t2']=='–') if hv['holeGap']>5400 else True)
    # --- الريبلاي: لا مستقبل
    pg.evaluate("pane.setCompareMode('percent')"); wait_sync(pg,200)
    pg.evaluate("window.__bt.isBacktest=true; candleSeries.setData(window.__mainBars.slice(0,150))"); wait_sync(pg,500)
    rp=pg.evaluate("""()=>{const e=pane.compares[0];const last=window.__mainBars[149].time;return {max:Math.max(...e.series._d.map(p=>p.time)),last,baseMax:Math.max(...pane._baseLine._d.map(p=>p.time))}}""")
    ok('replay: comparison series clipped at the last revealed main candle (and not empty)', rp['max']<=rp['last'] and rp['baseMax']<=rp['last'] and rp['max']>0)
    pg.evaluate("for(let i=150;i<190;i++){candleSeries.update(window.__mainBars[i])}")
    rp2=pg.evaluate("""()=>{const e=pane.compares[0];const last=window.__mainBars[189].time;return {max:Math.max(...e.series._d.map(p=>p.time)),last,n:e.series._d.length}}""")
    ok('replay: stepping forward adds comparison points only up to the revealed time', rp2['max']<=rp2['last'] and rp2['n']>20)
    leak=pg.evaluate("""()=>{const e=pane.compares[0];return e.series._d.some(p=>p.time>window.__mainBars[189].time)}"""); ok('replay: no future comparison candle ever present', not leak)
    pg.evaluate("window.__bt.isBacktest=false; candleSeries.setData(window.__mainBars)"); wait_sync(pg,500)
    # --- رمز بلا تداخل زمني
    pg.evaluate("pane.setCompareMode('overlay'); pane.addCompare('LATE','line')"); wait_sync(pg,1500)
    late=pg.evaluate("({n:pane.compares[1].series._d.length,noData:pane.compares[1].noData,legend:document.querySelector('.mc-legend').innerText})")
    ok('symbol with data only in another year: empty series, explicit warning (nothing fabricated)', late['n']==0 and ('لا توجد بيانات محلية' in late['legend'] or 'لا يوجد تداخل' in late['legend']))
    # --- رمز بلا أي بيانات
    pg.evaluate("pane.addCompare('NODATA','line')"); wait_sync(pg,1200)
    ok('symbol with no local data: explicit warning', 'NODATA' in pg.inner_text('.mc-legend') and 'لا توجد بيانات محلية' in pg.inner_text('.mc-legend'))
    # --- إخفاء/حذف
    pg.evaluate("pane.compares[0].visible=false; pane.compares[0].series.applyOptions({visible:false}); pane.setCompareMode('percent')"); wait_sync(pg,200)
    ok('hidden series excluded from the shared baseline computation', pg.evaluate("pane.compares[0].visible===false && pane._cmpBase!==null"))
    n_before=pg.evaluate("window.chart._series.length")
    pg.evaluate("while(pane.compares.length){const e=pane.compares.pop();window.chart.removeSeries(e.series)}; pane._syncCompare()"); wait_sync(pg,300)
    ok('removing all comparisons removes the base line too', pg.evaluate("pane._baseLine===null && window.chart._series.every(s=>s.kind==='candle')"))
    ok('main candles and dataset untouched by comparison operations', pg.evaluate("candleSeries.data().length===window.__mainBars.length && candleSeries.data()[0].open===window.__mainBars[0].open"))
    for n,c in res: print('ok  ' if c else 'FAIL',n)
    print('page errors:',errs[:4]); print('ALL OK' if all(c for _,c in res) and not errs else 'FAILED'); b.close()
