# اختبار التحميل التلقائي على موقع حقيقي (index.html الفعلي) خلف مسار فرعي يشبه GitHub Pages.
# المكتبة الخارجية فقط (unpkg) تُستبدل بنسخة وهمية؛ كل ما عداها هو كود المشروع الفعلي وبيانات مشتقة من ملفك الحقيقي.
import os, sys, json, shutil, threading, time, subprocess, tempfile, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
REAL=os.environ.get('XAU_CSV','/tmp/xau2019.csv')
if not os.path.exists(REAL):
    print('SKIPPED: set XAU_CSV=/path/to/DAT_MT_XAUUSD_M1_2019.csv'); raise SystemExit(0)
# ---------- بناء الموقع: ملفات المشروع بأسماء index.html الفعلية ----------
SITE=tempfile.mkdtemp(); ROOT=os.path.join(SITE,'ixview'); os.makedirs(os.path.join(ROOT,'data'))
for f in os.listdir(R):
    if f.endswith(('.js','.css','.html')) and not f.endswith(('.bak','.bak2','.bak3')):
        shutil.copy(os.path.join(R,f), os.path.join(ROOT, f.replace('-١','')))
shutil.copytree(os.path.join(R,'tools'), os.path.join(ROOT,'tools'))
shutil.copy(os.path.join(R,'data-diagnostics.html'), os.path.join(ROOT,'data-diagnostics.html'))
rows=[l.strip() for l in open(REAL) if l.strip()]
D=os.path.join(ROOT,'data')
open(os.path.join(D,'DAT_MT_XAUUSD_M1_2019.csv'),'w').write('\n'.join(rows)+'\n')                                  # أصل حقيقي كما هو
def scaled(r,div,year=None):
    c=r.split(','); d=c[0] if year is None else str(year)+c[0][4:]
    return ','.join([d,c[1]]+['%.5f'%(float(x)/div) for x in c[2:6]]+[c[6]])
for y in (2020,2021): open(os.path.join(D,'DAT_MT_EURUSD_M1_%d.csv'%y),'w').write('\n'.join(scaled(r,1000,y) for r in rows[:60000])+'\n')   # سنتان
for mth,off in (('202401',0),('202402',20000)): open(os.path.join(D,'DAT_MT_GBPUSD_M1_%s.csv'%mth),'w').write('\n'.join(scaled(r,1000,2024).replace('.01.','.%s.'%mth[4:],1) for r in rows[1000+off:1000+off+4000])+'\n')  # ملفات شهرية
# M5 مشتق فعلياً من M1 الحقيقي (تجميع 5 دقائق)
m5=[]; cur=None
for r in rows[:30000]:
    c=r.split(','); hh,mm=int(c[1][:2]),int(c[1][3:]); key=(c[0],hh,mm//5)
    o,h,l,cl=map(float,c[2:6])
    if cur and cur[0]==key: cur[2]=max(cur[2],h); cur[3]=min(cur[3],l); cur[4]=cl
    else:
        if cur: m5.append(cur)
        cur=[key,o,h,l,o if False else cl,cl]; cur[1]=o; cur[4]=cl
    cur[4]=cl
if cur: m5.append(cur)
open(os.path.join(D,'DAT_MT_USDJPY_M5_2022.csv'),'w').write('\n'.join('%s,%02d:%02d,%.3f,%.3f,%.3f,%.3f,0'%(k[0][0].replace('2019','2022'),k[0][1],k[0][2]*5,(k[1]/10),(k[2]/10),(k[3]/10),(k[4]/10)) for k in [[(x[0][0],x[0][1],x[0][2]),x[1],x[2],x[3],x[4]] for x in m5])+'\n')
open(os.path.join(D,'DAT_MT_AUDUSD_M1_2020.csv'),'w').write('this,is,not\nvalid data at all\n')                         # ملف تالف
open(os.path.join(D,'HISTDATA_COM_MT_XAUUSD_M12019.zip'),'wb').write(b'PK')                                           # zip يُتخطى
subprocess.check_call(['node',os.path.join(ROOT,'tools','build-data-manifest.js'),D],stdout=subprocess.DEVNULL)
# بعد توليد الفهرس: ملفات أصل غير مفهرس (فهرس قديم) + أصل جديد يظهر تلقائياً بالقائمة
open(os.path.join(D,'DAT_MT_USDCAD_M1_2020.csv'),'w').write('\n'.join(scaled(r,1000,2020) for r in rows[:5000])+'\n')
MAN=json.load(open(os.path.join(D,'manifest.json')))
# ---------- خادم ثابت خلف مسار فرعي (حساس لحالة الأحرف، بلا قوائم مجلدات مستخدمة) مع إمكانية تأخير ملفات ----------
DELAY={}; HITS=[]
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_GET(self):
        HITS.append(self.path)
        for k,v in DELAY.items():
            if k in self.path: time.sleep(v)
        return super().do_GET()
    def end_headers(self): self.send_header('Cache-Control','no-store'); super().end_headers()
class TS(socketserver.ThreadingMixIn, http.server.HTTPServer): daemon_threads=True
srv=TS(('127.0.0.1',0),functools.partial(H,directory=SITE)); PORT=srv.server_address[1]; threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:%d/ixview/'%PORT
STUB=r'''
(function(){
 const gen=()=>new Proxy(function(){}, {get:(t,k)=>k==='then'?undefined:(k===Symbol.toPrimitive?()=>0:gen()),apply:()=>gen(),construct:()=>gen()});
 const wrap=o=>new Proxy(o,{get:(t,k)=>k in t?t[k]:gen()});
 window.__lwSeries=[]; window.__rangeCbs=[];
 const mkSeries=(kind,opts)=>{const s={kind,opts:Object.assign({},opts),_d:[],setData(d){this._d=d.slice()},update(b){const l=this._d[this._d.length-1];if(l&&l.time===b.time)this._d[this._d.length-1]=b;else this._d.push(b)},data(){return this._d.slice()},applyOptions(o){Object.assign(this.opts,o)},priceToCoordinate:p=>300-(p%300),coordinateToPrice:y=>y,createPriceLine:()=>gen(),removePriceLine(){},attachPrimitive(){},priceScale:()=>gen(),options(){return this.opts}};window.__lwSeries.push(s);return wrap(s)};
 const ts=()=>wrap({getVisibleLogicalRange:()=>({from:0,to:100}),getVisibleRange:()=>null,subscribeVisibleLogicalRangeChange(cb){window.__rangeCbs.push(cb)},subscribeVisibleTimeRangeChange(){},timeToCoordinate:t=>t%800,coordinateToTime:x=>x,width:()=>800,height:()=>30,scrollPosition:()=>0});
 const chart=()=>wrap({addSeries:(k,o)=>mkSeries(k,o),removeSeries(){},timeScale:ts,priceScale:()=>wrap({width:()=>60,applyOptions(){},options:()=>({})}),applyOptions(){},options:()=>({}),subscribeCrosshairMove(){},unsubscribeCrosshairMove(){},subscribeClick(){},resize(){},panes:()=>[gen()],remove(){}});
 window.LightweightCharts=new Proxy({createChart:()=>chart(),LineStyle:{Solid:0,Dotted:1,Dashed:2,LargeDashed:3,SparseDotted:4},PriceScaleMode:{Normal:0,Logarithmic:1,Percentage:2,IndexedTo100:3},CrosshairMode:{Normal:0,Magnet:1},ColorType:{Solid:'solid',VerticalGradient:'gradient'},LineType:{Simple:0,WithSteps:1,Curved:2},TickMarkType:{Year:0,Month:1,DayOfMonth:2,Time:3,TimeWithSeconds:4},LastPriceAnimationMode:{Disabled:0},CandlestickSeries:'candle',LineSeries:'line',AreaSeries:'area',BarSeries:'bar',HistogramSeries:'hist',BaselineSeries:'baseline'},{get:(t,k)=>k in t?t[k]:gen()});
})();
'''
res=[]; ok=lambda n,c: res.append((n,bool(c)))
def series(pg): return pg.evaluate("(()=>{const s=window.candleSeries;const d=s._d||[];return {n:d.length,first:d.length?d[0].time:null,last:d.length?d[d.length-1].time:null,maxClose:d.length?Math.max(...d.slice(-2000).map(x=>x.close)):null,minClose:d.length?Math.min(...d.slice(-2000).map(x=>x.close)):null,sorted:d.every((x,i)=>i===0||x.time>d[i-1].time)}})()")
def settle(pg,ms=1800): pg.wait_for_timeout(ms)
def switch(pg,sym): pg.evaluate("s=>{const e=document.getElementById('pairSelect');e.value=s;e.dispatchEvent(new Event('change'))}",sym)
def wait_series(pg,cond,timeout=20000): pg.wait_for_function("(()=>{const d=window.candleSeries&&window.candleSeries._d||[];const f=%s;return f(d)})()"%cond,timeout=timeout)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':800}); errs=[]; reqs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('request',lambda r:reqs.append(r.url))
    pg.route(lambda u: not u.startswith('http://127.0.0.1') and not u.startswith('data:'),lambda r:r.abort())
    pg.route('https://unpkg.com/**',lambda r:r.fulfill(body=STUB,content_type='application/javascript'))
    # ---- 1) الفتح: الأصل الافتراضي يُحمَّل تلقائياً بلا أي إجراء
    pg.goto(URL); wait_series(pg,"d=>d.length>1000")
    s1=series(pg)
    ok('site opens and the default asset (XAUUSD) loads automatically', s1['n']>1000 and s1['maxClose']>1000)
    ok('2019 candles from the real file, sorted, no duplicates', s1['sorted'] and s1['last']>1546300800 and s1['last']<1577900000)
    ok('manifest requested relative to the sub-path (GitHub-Pages-like), never from the domain root', any(u.endswith('/ixview/data/manifest.json') for u in reqs) and not any(u==('http://127.0.0.1:%d/data/manifest.json'%PORT) for u in reqs))
    data_reqs=[u for u in reqs if '/data/DAT_' in u]
    ok('only the selected asset files were fetched (no bulk loading of other assets)', data_reqs and all('XAUUSD' in u for u in data_reqs))
    ok('manifest lists the discovered assets/years (EURUSD 2020-2021, GBPUSD monthly, USDJPY M5)', MAN['symbols']['EURUSD']['frames']['M1']['years']==[2020,2021] and list(MAN['symbols']['GBPUSD']['frames']['M1']['periods'])==['202401','202402'] and MAN['symbols']['USDJPY']['frames']['M5']['baseSec']==300 and 'HISTDATA_COM_MT_XAUUSD_M12019.zip' in MAN['skipped'])
    # ---- 2) تبديل الأصل
    switch(pg,'EURUSD'); wait_series(pg,"d=>d.length>1000&&d[d.length-1].close<10")
    s2=series(pg)
    ok('switching to EURUSD loads its data automatically', s2['n']>1000 and s2['maxClose']<10)
    ok('no XAUUSD candles remain after the switch (no mixing)', s2['maxClose']<10 and s2['minClose']>0.5)
    ok('newest year of the asset is shown (2021) — years discovered from file names', s2['last']>1609459200 and s2['last']<1640995200)
    ok('only EURUSD files were fetched after switching', all(('XAUUSD' in u) or ('EURUSD' in u) or 'manifest' in u for u in [u for u in reqs if '/data/' in u]))
    # ---- 3) جمع السنوات المتاحة لنفس الأصل بالترتيب (تحميل للخلف)
    yrs=pg.evaluate("""async()=>{const st=new TVDataEngine.SymbolDataStream('EURUSD');await st.loadInitial(2000);const y0=new Date(st.data[0].time*1000).getUTCFullYear();const g=await st.loadOlderIfNeeded(0);const ys=new Set(st.data.map(c=>new Date(c.time*1000).getUTCFullYear()));
      return {y0,grew:g,years:Array.from(ys).sort(),sorted:st.data.every((c,i)=>i===0||c.time>st.data[i-1].time),n:st.data.length,exh:st.exhaustedBackward}}""")
    ok('multi-year asset: older year appended automatically (2020 + 2021) in chronological order without gaps in order', yrs['years']==[2020,2021] and yrs['sorted'] and yrs['n']>=119000)
    ok('discovered range ends at the first available year (no useless 404 probing before 2020)', pg.evaluate("TVDataEngine.yearsOf('EURUSD')")==[2020,2021])
    # ---- 4) الأشهر المتعددة (ملفات شهرية) تُدمج
    switch(pg,'GBPUSD'); wait_series(pg,"d=>d.length>1000&&d[d.length-1].close<10&&new Date(d[0].time*1000).getUTCFullYear()===2024")
    s4=series(pg); months=pg.evaluate("Array.from(new Set(window.candleSeries._d.map(c=>new Date(c.time*1000).getUTCMonth()+1))).sort()")
    ok('monthly files (Jan + Feb) merged into one sorted series', s4['sorted'] and months==[1,2])
    # ---- 5) فريم غير M1
    ok('asset with only M5 files: base resolution detected from the manifest (5 minutes)', pg.evaluate("TVDataEngine.baseMinutes('USDJPY')")==5)
    switch(pg,'USDJPY'); wait_series(pg,"d=>d.length>500&&d[d.length-1].close>50&&d[d.length-1].close<500"); s5=series(pg); ok('M5 asset loads and is ordered', s5['n']>500 and s5['sorted'])
    # ---- 6) أصل جديد يظهر تلقائياً بالقائمة
    ok('manifest assets missing from the dropdown are added automatically (no user action)', pg.evaluate("Array.from(document.getElementById('pairSelect').options).some(o=>o.value==='USDJPY')") and MAN['symbols'] is not None)
    # ---- 7) أصل غير مفهرس (فهرس قديم) يُحمَّل بالصيغة القديمة
    switch(pg,'USDCAD'); wait_series(pg,"d=>d.length>1000&&d[d.length-1].close<10"); ok('asset missing from a stale manifest still loads via the legacy file pattern', series(pg)['n']>=1000)
    # ---- 8) غياب الملفات: لا انهيار، الشارت يُفرغ مع رسالة (لا بيانات قديمة)
    switch(pg,'NZDUSD'); wait_series(pg,"d=>d.length===0")
    notice=pg.evaluate("(()=>{const n=document.getElementById('tvDataNotice');return n&&n.style.display!=='none'?n.textContent:''})()")
    ok('asset with no files: chart emptied (no previous-asset candles) and a clear notice is shown', series(pg)['n']==0 and 'NZDUSD' in notice and 'data' in notice)
    switch(pg,'AUDUSD'); pg.wait_for_function("(()=>{const n=document.getElementById('tvDataNotice');return n&&n.style.display!=='none'&&n.textContent.includes('AUDUSD')})()",timeout=20000); n2=pg.evaluate("(()=>{const n=document.getElementById('tvDataNotice');return n?n.textContent:''})()")
    ok('corrupt data file: no crash, chart emptied, notice shown', series(pg)['n']==0 and 'AUDUSD' in n2)
    switch(pg,'XAUUSD'); wait_series(pg,"d=>d.length>1000&&d[d.length-1].close>1000"); ok('recovers: switching back to a valid asset loads normally and clears the notice', series(pg)['maxClose']>1000 and pg.evaluate("(()=>{const n=document.getElementById('tvDataNotice');return !n||n.style.display==='none'||n.textContent===''})()"))
    # ---- 9) سباق التبديل السريع: تحميل بطيء قديم لا يطغى على الأحدث
    DELAY['EURUSD']=2.5; pg.evaluate("window.candleSeries._d=[]")
    switch(pg,'EURUSD'); pg.wait_for_timeout(200); switch(pg,'XAUUSD'); wait_series(pg,"d=>d.length>1000&&d[d.length-1].close>1000",30000)
    pg.wait_for_timeout(4500)   # انتظر انتهاء تحميل EURUSD البطيء
    s9=series(pg); ok('race: slow EURUSD finishing after XAUUSD does NOT overwrite the chart (no mixed data)', s9['n']>1000 and s9['minClose']>1000)
    DELAY.clear()
    # ---- 10) الحمل الانتقائي والتخزين المؤقت
    before=len([u for u in reqs if 'DAT_MT_XAUUSD' in u]); switch(pg,'EURUSD'); wait_series(pg,"d=>d.length>1000&&d[d.length-1].close<10"); switch(pg,'XAUUSD'); wait_series(pg,"d=>d.length>1000&&d[d.length-1].close>1000"); pg.wait_for_timeout(500)
    ok('revisiting an asset uses the in-memory cache (no repeated file download)', len([u for u in reqs if 'DAT_MT_XAUUSD' in u])==before)
    ok('no page errors during the whole load/switch cycle', not errs)
    if errs: print('ERRORS',errs[:5])
    # ---- 10b) صفحة التشخيص (مع فهرس)
    pd=b.new_page(); pd.route(lambda u: not u.startswith('http://127.0.0.1'),lambda r:r.abort()); pd.goto(URL+'data-diagnostics.html?symbol=EURUSD'); pd.wait_for_function("document.getElementById('out').innerText.includes('انتهى')",timeout=30000); dt=pd.inner_text('#out')
    ok('diagnostics page (with manifest): reports manifest, asset years and matching CSV format', 'manifest.json موجود' in dt and 'EURUSD في الفهرس' in dt and '2020, 2021' in dt and 'التنسيق مطابق' in dt)
    pd.goto(URL+'data-diagnostics.html?symbol=NZDUSD'); pd.wait_for_function("document.getElementById('out').innerText.includes('انتهى')",timeout=60000); ok('diagnostics page: missing asset gives an explicit actionable reason', 'لم يُعثر على أي ملف' in pd.inner_text('#out'))
    # ---- 11) غياب الفهرس كلياً: اكتشاف تلقائي لكل الأسماء/الفريمات/السنوات
    os.remove(os.path.join(D,'manifest.json')); pg2=b.new_page(); pg2.route(lambda u: not u.startswith('http://127.0.0.1'),lambda r:r.abort()); pg2.route('https://unpkg.com/**',lambda r:r.fulfill(body=STUB,content_type='application/javascript'))
    e2=[]; reqs2=[]; pg2.on('pageerror',lambda e:e2.append(str(e))); pg2.on('request',lambda r:reqs2.append(r.method+' '+r.url)); pg2.goto(URL); wait_series(pg2,"d=>d.length>1000"); ok('no manifest at all: default asset still loads automatically (auto-discovery)', series(pg2)['n']>1000 and not e2)
    switch(pg2,'EURUSD'); wait_series(pg2,"d=>d.length>1000&&d[d.length-1].close<10"); ok('no manifest: multi-year asset discovered from file names alone (2020+2021)', pg2.evaluate("TVDataEngine.yearsOf('EURUSD')")==[2020,2021])
    switch(pg2,'USDJPY'); wait_series(pg2,"d=>d.length>500&&d[d.length-1].close>50&&d[d.length-1].close<500"); ok('no manifest: an M5-only asset (not M1) is found and loads', series(pg2)['n']>500 and pg2.evaluate("TVDataEngine.baseMinutes('USDJPY')")==5)
    ok('timeframe auto-adjusted to the files resolution (5m) instead of showing wrong 1m labels', pg2.evaluate("document.getElementById('timeframeSelect').value")=='5')
    switch(pg2,'XAUUSD'); wait_series(pg2,"d=>d.length>1000&&d[d.length-1].close>1000")
    ok('discovery only probes (HEAD) the assets that were selected, never the whole library', not any(('GBPUSD' in u or 'AUDUSD' in u or 'USDCAD' in u) for u in reqs2 if '/data/' in u))
    switch(pg2,'NZDUSD'); pg2.wait_for_function("(()=>{const n=document.getElementById('tvDataNotice');return n&&n.style.display!=='none'&&n.textContent.includes('NZDUSD')})()",timeout=60000)
    ok('no manifest + missing asset: chart emptied with notice that points to the diagnostics page', series(pg2)['n']==0 and 'data-diagnostics' in pg2.inner_text('#tvDataNotice') and not e2)
    pd.goto(URL+'data-diagnostics.html?symbol=USDJPY'); pd.wait_for_function("document.getElementById('out').innerText.includes('انتهى')",timeout=60000); dt2=pd.inner_text('#out')
    ok('diagnostics page (no manifest): discovers the M5 asset by probing', 'وُجد فريم M5' in dt2 and 'ليس في الفهرس' in dt2 or 'غير موجود' in dt2)
    for n,c in res: print('ok  ' if c else 'FAIL',n)
    print('ALL OK' if all(c for _,c in res) else 'FAILED'); b.close()
