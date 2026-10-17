# اختبار واجهة الباكتيست في Chromium: بيانات XAUUSD 2019 الحقيقية عبر IndexedDB، وتطابق أرقام الواجهة مع تشغيل Node المستقل
import os, json, subprocess
from playwright.sync_api import sync_playwright
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'); FX=os.path.join(os.path.dirname(os.path.abspath(__file__)),'fixtures')
def rd(f):
    for b in (R,FX):
        q=os.path.join(b,f)
        if os.path.exists(q): return open(q,encoding='utf-8').read()
    raise FileNotFoundError(f)
REAL=os.environ.get('XAU_CSV','/tmp/xau2019.csv')
HTML='<div id="tvTopBar"></div><select id="pairSelect"><option value="XAUUSD">Gold</option><option value="EURUSD">EUR</option></select><select id="timeframeSelect"><option value="1">1m</option></select>'
SETUP='''window.SYMBOL_PRECISION={};window.MultiChartSymbols={register(){},unregister(){}};window.__mk=[];window.__vr=[];
window.candleSeries={update(){},setData(){},data(){return []}};window.LightweightCharts={createSeriesMarkers:(s,m)=>{window.__mk.push(m);return {setMarkers:(x)=>window.__mk.push(x)}}};
window.chart={timeScale(){return {setVisibleRange(r){window.__vr.push(r)}}}};'''
if not os.path.exists(REAL):
    print('SKIPPED: set XAU_CSV=/path/to/DAT_MT_XAUUSD_M1_2019.csv'); raise SystemExit(0)
# مرجع مستقل من Node بنفس الإعدادات
ref=json.loads(subprocess.check_output(['node','-e','''
const I=require("%s/tv-data-import.js"),A=require("%s/tv-aggregate.js"),S=require("%s/tv-strategy.js");
const h=A.aggregate(I.parseCSV(require("fs").readFileSync("%s","utf8")).candles,60,60);
const r=S.run({bars:h,strategy:{type:"macross",params:{fast:10,slow:30,maType:0}},account:{lotSize:100,balance:10000,leverage:100,spread:0.3,commissionPerLot:0},risk:{sizing:"risk",riskPct:1,slMode:"atr",slValue:2,atrLen:14,tpR:2}});
console.log(JSON.stringify({n:r.trades.length,net:r.metrics.netProfit,dd:r.metrics.maxDrawdown,wr:r.metrics.winRate}))'''%(R,R,R,REAL)]))
res=[]; ok=lambda n,c: res.append((n,bool(c)))
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1100,'height':900}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.route('**/data/**',lambda r:r.fulfill(status=404))
    pg.route('http://test.local/',lambda r:r.fulfill(body='<!doctype html><html><body>'+HTML+'</body></html>',content_type='text/html')); pg.goto('http://test.local/')
    pg.add_style_tag(content=rd('tv-trade.css')); pg.evaluate(SETUP)
    for f in ['tv-position-calc.js','tv-trading-sim.js','tv-indicators.js','tv-data-engine.js','tv-data-import.js','tv-local-data.js','tv-aggregate.js','tv-strategy.js','tv-backtest-ui.js']: pg.add_script_tag(content=rd(f))
    pg.wait_for_timeout(1000)
    # استيراد بيانات حقيقية
    pg.evaluate("TVLocalData.ready")
    txt=open(REAL).read()
    pg.evaluate("""async t=>{const r=TVDataImport.parseCSV(t);await TVLocalData.importCandles('XAUUSD',r.candles,Object.assign({filename:'x.csv'},r.report));}""",txt)
    ok('backtest button installed', pg.locator('#tvBtBtn').count()==1)
    pg.click('#tvBtBtn'); ok('panel opens', pg.locator('#tvBtPanel').count()==1)
    ok('dates default to dataset range', pg.input_value('#tvbFrom')=='2019-01-01' and pg.input_value('#tvbTo')=='2019-12-31')
    ok('strategy params rendered with defaults', pg.input_value('#tvbp_fast')=='10' and pg.input_value('#tvbp_slow')=='30')
    # إعدادات مطابقة لمرجع Node
    pg.select_option('#tvbTf','60'); pg.select_option('#tvbSizing','risk'); pg.select_option('#tvbSl','atr'); pg.fill('#tvbSlV','2'); pg.fill('#tvbTp','2'); pg.fill('#tvbSpread','0.3')
    # أخطاء التحقق
    pg.fill('#tvbp_fast','50'); pg.click('#tvbRun'); pg.wait_for_function("document.querySelector('.tvx-err').innerText.length>0",timeout=30000)
    ok('invalid params (fast>=slow) shown as error, no results', 'السريع' in pg.inner_text('.tvx-err') and pg.locator('.tvb-metrics').count()==0)
    pg.fill('#tvbp_fast','10'); pg.select_option('#tvbSl','none'); pg.click('#tvbRun'); pg.wait_for_function("document.querySelector('.tvx-err').innerText.length>0",timeout=30000)
    ok('risk sizing without stop rejected', 'وقف' in pg.inner_text('.tvx-err')); pg.select_option('#tvbSl','atr')
    # تشغيل فعلي
    pg.click('#tvbRun'); pg.wait_for_selector('.tvb-metrics',timeout=60000)
    rows=pg.locator('.tvb-table tbody tr.tvb-row').count()
    ok('trade table rows == Node reference trades (%d)'%ref['n'], rows==ref['n'])
    mt=pg.inner_text('.tvb-metrics'); import re
    net=pg.evaluate("TVBacktestUI.last().metrics.netProfit"); dd=pg.evaluate("TVBacktestUI.last().metrics.maxDrawdown"); wr=pg.evaluate("TVBacktestUI.last().metrics.winRate")
    ok('UI net profit == independent Node run (%.2f)'%ref['net'], abs(net-ref['net'])<1e-6)
    ok('UI max drawdown and win rate match Node run', abs(dd-ref['dd'])<1e-6 and abs(wr-ref['wr'])<1e-9)
    ok('metrics grid shows trade count', str(ref['n']) in mt)
    ok('equity curve canvas drawn', pg.evaluate("(()=>{const c=document.querySelector('#tvBtPanel canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n>200})()"))
    ok('markers pushed to chart: 2 per trade', len(pg.evaluate("window.__mk[window.__mk.length-1]"))==2*ref['n'])
    ok('CSV export enabled', not pg.evaluate("document.getElementById('tvbCsv').disabled"))
    h1=pg.evaluate("TVBacktestUI.last().fingerprint.hash")
    pg.click('#tvbRun'); pg.wait_for_function("1",timeout=1000); pg.wait_for_timeout(2500)
    ok('re-run is reproducible (same hash)', pg.evaluate("TVBacktestUI.last().fingerprint.hash")==h1)
    pg.locator('.tvb-table tbody tr.tvb-row').nth(3).click(); ok('clicking a trade moves chart visible range', len(pg.evaluate("window.__vr"))==1)
    pg.click('#tvbClear'); ok('clear markers works', pg.evaluate("window.__mk[window.__mk.length-1].length")==0)
    # ---- الإضافات: المقاييس الجديدة، الهوية، جودة البيانات، الفاحص
    body=pg.inner_text('#tvBtPanel')
    ok('long vs short table present and consistent with totals', pg.evaluate("(()=>{const m=TVBacktestUI.last().metrics;return m.bySide.long.trades+m.bySide.short.trades===m.trades})()") and 'الشراء مقابل البيع' in body)
    ok('test identity line shows symbol, timeframe, range and dataset size', 'هوية الاختبار' in body and 'XAUUSD' in body and '352' in body and 'UTC' in body)
    ok('data-quality note shown (gaps reported, not filled)', 'فجوات زمنية' in body or 'لا فجوات' in body)
    pg.locator('.tvb-table tbody tr.tvb-row').nth(5).click(); det=pg.inner_text('#tvbDetail')
    ok('trade inspector shows decision/execution times, SL, exit and cost breakdown', 'الإشارة عند إغلاق شمعة' in det and 'الوقف' in det and 'الربح الإجمالي' in det and 'macross' in det)
    t5=pg.evaluate("TVBacktestUI.last().trades[5]"); ok('inspector net equals the stored trade net', ('%.2f'%abs(t5['net'])) in det.replace(',','').replace('-',''))
    ok('decision precedes execution (signal at bar close, fill at next open)', pg.evaluate("TVBacktestUI.last().trades.every(x=>x.entryTime-x.decisionTime>=3600 && x.entryTime-x.decisionTime<=3600*72)"))
    # ---- الإعدادات المحفوظة
    pg.fill('#tvbPresetName','قياسي'); pg.fill('#tvbp_fast','12'); pg.click('#tvbPSave'); ok('preset saved and listed', 'قياسي' in pg.evaluate("Array.from(document.querySelectorAll('#tvbPreset option')).map(o=>o.textContent).join('|')"))
    pg.fill('#tvbp_fast','20'); pg.select_option('#tvbPreset','قياسي'); pg.click('#tvbPLoad'); ok('loading preset restores parameters', pg.input_value('#tvbp_fast')=='12')
    ok('preset persisted in localStorage', 'قياسي' in pg.evaluate("localStorage.getItem('tv_bt_presets_v1')"))
    pg.click('#tvbPDel'); ok('preset deleted', 'قياسي' not in pg.evaluate("localStorage.getItem('tv_bt_presets_v1')"))
    # ---- أقصى صفقات متزامنة
    pg.fill('#tvbp_fast','10'); pg.fill('#tvbMaxPos','0'); pg.click('#tvbRun'); pg.wait_for_function("document.querySelector('.tvx-err').innerText.includes('متزامنة')",timeout=30000); ok('invalid maxPositions rejected with message', True)
    pg.fill('#tvbMaxPos','2'); pg.click('#tvbRun'); pg.wait_for_function("TVBacktestUI.last().maxPositions===2",timeout=60000)
    ok('maxPositions=2 applied and recorded in the result', pg.evaluate("TVBacktestUI.last().maxPositions")==2)
    ok('with 2 slots never more than 2 positions open at once', pg.evaluate("(()=>{const t=TVBacktestUI.last().trades;const ev=[];t.forEach(x=>{ev.push([x.entryTime,1]);ev.push([x.exitTime,-1])});ev.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let c=0,mx=0;ev.forEach(e=>{c+=e[1];if(c>mx)mx=c});return mx<=2})()"))
    # ---- إيقاف التشغيل (M1 = شموع كثيرة)
    pg.fill('#tvbMaxPos','1'); pg.select_option('#tvbTf','1'); pg.click('#tvbRun'); pg.wait_for_selector('#tvbStop:visible',timeout=60000); pg.click('#tvbStop')
    pg.wait_for_function("document.querySelector('.tvx-err').innerText.includes('أُوقف')",timeout=60000)
    ok('stop cancels the run: no results shown, clear message, Run re-enabled', pg.locator('.tvb-metrics').count()==0 and not pg.evaluate("document.getElementById('tvbRun').disabled"))
    pg.select_option('#tvbTf','60')
    # بلا بيانات
    pg.evaluate("document.getElementById('tvBtPanel').remove(); document.getElementById('pairSelect').value='EURUSD'"); pg.click('#tvBtBtn'); pg.click('#tvbRun'); pg.wait_for_function("document.querySelector('.tvx-err').innerText.length>0",timeout=30000)
    ok('symbol without local data → clear message', 'لا توجد بيانات' in pg.inner_text('.tvx-err'))
    for n,c in res: print('ok  ' if c else 'FAIL',n)
    print('page errors:',errs[:3]); print('ALL OK' if all(c for _,c in res) and not errs else 'FAILED'); b.close()
