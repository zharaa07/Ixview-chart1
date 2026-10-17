# اختبار استيراد البيانات المحلية في Chromium حقيقي (IndexedDB + الواجهة + محرك البيانات) باستخدام ملف XAUUSD 2019 الحقيقي
import os, json, tempfile
from playwright.sync_api import sync_playwright
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'); FX=os.path.join(os.path.dirname(os.path.abspath(__file__)),'fixtures')
def rd(f):
    for b in (R,FX):
        q=os.path.join(b,f)
        if os.path.exists(q): return open(q,encoding='utf-8').read()
    raise FileNotFoundError(f)
REAL=os.environ.get('XAU_CSV','/tmp/xau2019.csv')
HTML='''<div id="tvTopBar"></div><select id="pairSelect"><option value="XAUUSD">Gold</option></select><select id="timeframeSelect"><option value="1">1m</option><option value="5">5m</option><option value="15">15m</option></select>'''
SETUP='''window.SYMBOL_PRECISION={};window.__reg=[];window.__unreg=[];window.MultiChartSymbols={register:(s)=>window.__reg.push(s),unregister:(s)=>window.__unreg.push(s)};
window.__tfCalls=0;document.getElementById('timeframeSelect').onchange=()=>{window.__tfCalls++};'''
if not os.path.exists(REAL):
    print('SKIPPED: set XAU_CSV=/path/to/DAT_MT_XAUUSD_M1_2019.csv'); raise SystemExit(0)
res=[]; ok=lambda n,c: res.append((n,bool(c)))
tmp=tempfile.mkdtemp()
m5=os.path.join(tmp,'M5TEST_M5.csv'); open(m5,'w').write('\n'.join('2022.03.0%d,%02d:%02d,10,11,9,10.5,100'%(1+h//24,h%24,m) for h in range(0,8) for m in range(0,60,5))+'\n')
bad=os.path.join(tmp,'bad.csv'); open(bad,'w').write('hello,world\nfoo,bar\n')
overlap=os.path.join(tmp,'overlap.csv'); open(overlap,'w').write('2019.01.01,18:00,1.0,2.0,0.5,1.5,0\n2019.01.01,18:01,1.0,2.0,0.5,1.7,0\n')
def load(p):
    b=p.chromium.launch(); ctx=b.new_context(); pg=ctx.new_page(); errs=[]; reqs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('request',lambda r:reqs.append(r.url))
    pg.route('**/data/**',lambda r:r.fulfill(status=404))
    pg.route('http://test.local/',lambda r:r.fulfill(body='<!doctype html><html><body>'+HTML+'</body></html>',content_type='text/html')); pg.goto('http://test.local/')
    pg.add_style_tag(content=rd('tv-trade.css')); pg.evaluate(SETUP)
    for f in ['tv-data-engine.js','tv-data-import.js','tv-local-data.js','tv-symbol-availability.js']: pg.add_script_tag(content=rd(f))
    pg.wait_for_timeout(900); return b,ctx,pg,errs,reqs
def do_import(pg,path,sym=None):
    pg.click('#tvImportBtn'); pg.set_input_files('#tvdFile',path)
    pg.wait_for_function("document.querySelector('#tvdGo') && !document.querySelector('#tvdGo').disabled || /غير معروفة|فارغ/.test(document.querySelector('#tvdReport').innerText)",timeout=60000)
    if sym is not None: pg.fill('#tvdSym',sym)
with sync_playwright() as p:
    b,ctx,pg,errs,reqs=load(p)
    ok('import button installed', pg.locator('#tvImportBtn').count()==1)
    # --- ملف خاطئ
    do_import(pg,bad); ok('unrecognized file reports an error and keeps Import disabled', 'صيغة غير معروفة' in pg.inner_text('#tvdReport') and pg.evaluate("document.getElementById('tvdGo').disabled")); pg.click('#tvdClose')
    # --- الملف الحقيقي
    do_import(pg,REAL); rep=pg.inner_text('#tvdReport')
    ok('suggested symbol derived from filename', pg.input_value('#tvdSym')==pg.evaluate("TVDataImport.suggestSymbol('%s')" % os.path.basename(REAL)) and pg.input_value('#tvdSym')!='')
    pg.fill('#tvdSym','XAUTEST')
    ok('report: 352,628 accepted of 352,688 rows', '352' in rep and '688' in rep and '628' in rep)
    ok('report warns about unsorted file and 60 identical duplicates', 'غير مرتب' in rep and '60 صف مكرر' in rep)
    ok('report states volume missing', 'غير موجود في الملف' in rep)
    pg.click('#tvdGo'); pg.wait_for_function("document.querySelector('#tvdReport').innerText.includes('تم الاستيراد')",timeout=60000)
    meta=pg.evaluate("TVLocalData.meta('XAUTEST')")
    ok('meta: count 352628, precision 3, base 60s, no volume', meta['count']==352628 and meta['precision']==3 and meta['baseSec']==60 and meta['hasVolume'] is False)
    chunk=pg.evaluate("TVDataEngine.fetchYearChunk('XAUTEST',2019).then(c=>({n:c.length,first:c[0],last:c[c.length-1],inc:c.every((x,i)=>i===0||x.time>c[i-1].time),vol:c.some(x=>x.volume>0)}))")
    ok('engine serves 352628 candles from IndexedDB', chunk['n']==352628)
    ok('strictly increasing timestamps (DST duplicate hour removed)', chunk['inc'])
    ok('first candle preserved exactly (2019-01-01 18:00 UTC, O=1282.295)', chunk['first']['time']==1546365600 and abs(chunk['first']['open']-1282.295)<1e-9)
    ok('no volume fabricated', chunk['vol'] is False)
    ok('no network request to data/ for the local symbol', not any('/data/DAT_MT_XAUTEST' in u for u in reqs))
    ok('symbol added to pair list and search registry', pg.evaluate("Array.from(document.getElementById('pairSelect').options).some(o=>o.value==='XAUTEST')") and 'XAUTEST' in pg.evaluate("window.__reg"))
    ok('precision registered (3)', pg.evaluate("SYMBOL_PRECISION.XAUTEST")==3)
    av=pg.evaluate("TVSymbolAvailability.check(['XAUTEST','NOPE']).then(()=>[TVSymbolAvailability.get('XAUTEST'),TVSymbolAvailability.get('NOPE')])")
    ok('availability: local symbol ok 2019, unknown symbol none', av[0]['state']=='ok' and av[0]['from']==2019 and av[1]['state']=='none')
    pg.click('#tvdClose')
    # --- دمج: الشموع الجديدة تفوز عند تطابق الوقت
    do_import(pg,overlap,'XAUTEST'); pg.click('#tvdGo'); pg.wait_for_function("document.querySelector('#tvdReport').innerText.includes('تم الاستيراد')")
    c2=pg.evaluate("TVDataEngine.fetchYearChunk('XAUTEST',2019).then(c=>({n:c.length,c0:c[0].close,c1:c[1].close}))")
    ok('merge: count unchanged, overlapping candles replaced', c2['n']==352628 and abs(c2['c0']-1.5)<1e-9 and abs(c2['c1']-1.7)<1e-9)
    pg.click('#tvdClose')
    # --- رمز غير صالح
    do_import(pg,overlap,'bad symbol!'); pg.click('#tvdGo'); ok('invalid symbol name rejected', 'اسم الرمز' in pg.inner_text('#tvdErr')); pg.click('#tvdClose')
    # --- حارس الإطار الزمني (بيانات 5 دقائق)
    do_import(pg,m5,'M5TEST'); rep=pg.inner_text('#tvdReport'); ok('report warns coarse resolution', 'أكبر من دقيقة' in rep); pg.click('#tvdGo'); pg.wait_for_function("document.querySelector('#tvdReport').innerText.includes('تم الاستيراد')"); pg.click('#tvdClose')
    pg.evaluate("document.getElementById('pairSelect').value='M5TEST'")
    dialogs=[]; pg.on('dialog',lambda d:(dialogs.append(d.message),d.accept()))
    pg.evaluate("TVLocalData.symbols(); const s=document.getElementById('timeframeSelect'); s.value='1'; s.onchange({})")
    ok('1m refused on 5m data (dialog + reset to 5)', len(dialogs)==1 and pg.evaluate("document.getElementById('timeframeSelect').value")=='5')
    pg.evaluate("const s=document.getElementById('timeframeSelect'); s.value='15'; s.onchange({})")
    ok('15m accepted on 5m data (multiple)', len(dialogs)==1 and pg.evaluate("window.__tfCalls")>=2)
    ok('allowed() logic: 7m not multiple of 5m', pg.evaluate("TVLocalData.timeframeAllowed('M5TEST',7).reason")=='not_multiple')
    ok('allowed() logic: M1 symbol accepts 1m', pg.evaluate("TVLocalData.timeframeAllowed('XAUTEST',1).ok"))
    # --- حفظ دائم بعد إعادة التحميل
    pg.close(); pg=ctx.new_page(); pg.route('**/data/**',lambda r:r.fulfill(status=404)); pg.route('http://test.local/',lambda r:r.fulfill(body='<!doctype html><html><body>'+HTML+'</body></html>',content_type='text/html')); pg.goto('http://test.local/'); pg.evaluate(SETUP)
    for f in ['tv-data-engine.js','tv-data-import.js','tv-local-data.js']: pg.add_script_tag(content=rd(f))
    pg.wait_for_timeout(900)
    ok('persists after reload: symbols restored', set(pg.evaluate("TVLocalData.symbols()"))=={'XAUTEST','M5TEST'})
    ok('persists after reload: option re-registered', pg.evaluate("Array.from(document.getElementById('pairSelect').options).some(o=>o.value==='XAUTEST')"))
    ok('persists after reload: chunk loads on first request (ready promise)', pg.evaluate("TVDataEngine.fetchYearChunk('XAUTEST',2019).then(c=>c.length)")==352628)
    # --- حذف
    pg.click('#tvImportBtn'); pg.once('dialog',lambda d:d.accept()); pg.locator('#tvdList .tvx-row', has_text='XAUTEST').locator('button').click(); pg.wait_for_timeout(500)
    ok('delete removes only the chosen dataset, its option and chunks', pg.evaluate("TVLocalData.symbols()")==['M5TEST'] and not pg.evaluate("Array.from(document.getElementById('pairSelect').options).some(o=>o.value==='XAUTEST')") and pg.evaluate("TVDataEngine.fetchYearChunk('XAUTEST',2019).then(c=>c.length)")==0)
    for n,c in res: print('ok  ' if c else 'FAIL',n)
    print('page errors:',errs[:3]); print('ALL OK' if all(c for _,c in res) and not errs else 'FAILED'); b.close()
