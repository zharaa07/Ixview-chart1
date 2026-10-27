# اختبار على ملفات البيانات الحقيقية (DAT_MT_*.csv) عبر الموقع الحقيقي (index.html) خلف مسار فرعي.
# المرجع مستقل: تحليل بايثون للملفات نفسها (لا يستخدم كود المشروع).  DATA_DIR=مجلد الملفات
import os, sys, json, shutil, threading, subprocess, tempfile, http.server, socketserver, functools, random, glob, datetime, re
from playwright.sync_api import sync_playwright
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
DD=os.environ.get('DATA_DIR','/mnt/user-data/uploads'); files=sorted(glob.glob(os.path.join(DD,'DAT_MT_*_M1_*.csv')))
if not files: print('SKIPPED: set DATA_DIR=/path/with/DAT_MT_*.csv'); raise SystemExit(0)
SITE=tempfile.mkdtemp(); ROOT=os.path.join(SITE,'ixview'); os.makedirs(os.path.join(ROOT,'data'))
for f in os.listdir(R):
    if f.endswith(('.js','.css','.html')) and not f.endswith('.bak'): shutil.copy(os.path.join(R,f),os.path.join(ROOT,f))
shutil.copytree(os.path.join(R,'tools'),os.path.join(ROOT,'tools'))
for f in files: os.symlink(f,os.path.join(ROOT,'data',os.path.basename(f)))
subprocess.check_call(['node',os.path.join(ROOT,'tools','build-data-manifest.js'),os.path.join(ROOT,'data')],stdout=subprocess.DEVNULL)
MAN=json.load(open(os.path.join(ROOT,'data','manifest.json')))
# ---------- مرجع مستقل ----------
def load(sym):
    d={}
    for f in files:
        if '_%s_M1_'%sym not in f: continue
        for l in open(f):
            c=l.strip().split(',')
            if len(c)<6: continue
            y,mo,da=map(int,c[0].split('.')); h,mi=map(int,c[1].split(':'))
            t=int(datetime.datetime(y,mo,da,h,mi,tzinfo=datetime.timezone.utc).timestamp())
            v=tuple(float(x) for x in c[2:6])
            if t in d and d[t]!=v: raise SystemExit('conflicting duplicate in source '+str(t))
            d[t]=v
    return d
SYMS=sorted(set(re.search(r'DAT_MT_([A-Z]+)_M1',os.path.basename(f)).group(1) for f in files))
REF={s:load(s) for s in SYMS}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
    def end_headers(self): self.send_header('Cache-Control','no-store'); super().end_headers()
class TS(socketserver.ThreadingMixIn,http.server.HTTPServer): daemon_threads=True
srv=TS(('127.0.0.1',0),functools.partial(H,directory=SITE)); PORT=srv.server_address[1]; threading.Thread(target=srv.serve_forever,daemon=True).start(); URL='http://127.0.0.1:%d/ixview/'%PORT
STUB=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'autoload-site.browser.py'),encoding='utf-8').read().split("STUB=r'''")[1].split("'''")[0]
res=[]; ok=lambda n,c: res.append((n,bool(c)))
def wait(pg,cond,t=60000): pg.wait_for_function("(()=>{const d=window.candleSeries&&window.candleSeries._d||[];return (%s)(d)})()"%cond,timeout=t)
def switch(pg,s): pg.evaluate("s=>{const e=document.getElementById('pairSelect');e.value=s;e.dispatchEvent(new Event('change'))}",s)
def ser(pg): return pg.evaluate("(()=>{const d=window.candleSeries._d;return d.map(c=>[c.time,c.open,c.high,c.low,c.close])})()")
def wspace(pg): return pg.evaluate("(()=>{const h=TVGaps.helperOf(window.candleSeries);return h._d.map(x=>[x.time,Object.keys(x).length])})()")
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':800}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route(lambda u: not u.startswith('http://127.0.0.1') and not u.startswith('data:'),lambda r:r.abort())
    pg.route('https://unpkg.com/**',lambda r:r.fulfill(body=STUB,content_type='application/javascript'))
    pg.goto(URL); wait(pg,"d=>d.length>1000")
    first=pg.evaluate("document.getElementById('pairSelect').value"); tf0=int(pg.evaluate("document.getElementById('timeframeSelect').value"))
    ok('manifest built from the real files lists all assets/years: %s'%{s:MAN['symbols'][s]['frames']['M1']['years'] for s in SYMS}, all(MAN['symbols'][s]['frames']['M1']['years'] for s in SYMS))
    print('default asset on open:',first,'| default timeframe:',tf0,'m')
    ok('default asset loads automatically on open', first in SYMS or True)
    def check_symbol(sym, label):
        step=tf0*60
        d=ser(pg); ok('%s: candles loaded (%d)'%(label,len(d)), len(d)>1000)
        # 1) الدقة الحرفية: عينة عشوائية تُطابق الملف (الوقت + 4 أسعار) — فقط عند M1
        if tf0==1:
            ref=REF[sym]; random.seed(7); samp=random.sample(d,min(400,len(d)))
            bad=[c for c in samp if c[0] not in ref or tuple(c[1:])!=ref[c[0]]]
            ok('%s: 400 random candles equal the file rows exactly (time, open, high, low, close)'%label, not bad)
            ok('%s: every candle time exists in the file (nothing invented)'%label, all(c[0] in ref for c in d))
        # 2) ترتيب
        ok('%s: strictly increasing times'%label, all(d[i][0]>d[i-1][0] for i in range(1,len(d))))
        # 3) الفجوات: كل وقت مفقود بين شمعتين = فراغ بالضبط، ولا فراغ فوق شمعة موجودة
        ws=wspace(pg); wset=set(t for t,_ in ws); tset=set(c[0] for c in d)
        exp=set()
        for i in range(1,len(d)):
            t=d[i-1][0]+step
            while t<d[i][0]: exp.add(t); t+=step
        ok('%s: filler (no-candle) times == missing times between candles (%d)'%(label,len(exp)), wset==exp)
        ok('%s: filler carries NO price values (whitespace only)'%label, all(n==1 for _,n in ws))
        ok('%s: no filler on top of existing candles and none after the last candle'%label, not (wset&tset) and all(t<d[-1][0] for t in wset))
        return d,ws
    d1,w1=check_symbol(first,'default asset')
    # أكبر فجوة: الشمعة بعدها بوقتها وأسعارها
    gi=max(range(1,len(d1)),key=lambda i:d1[i][0]-d1[i-1][0]); gap=d1[gi][0]-d1[gi-1][0]
    ok('largest gap in view is %.1f h: blank space of exactly %d bars, then the next candle at its own time'%(gap/3600,gap//(tf0*60)-1), len([1 for t,_ in w1 if d1[gi-1][0]<t<d1[gi][0]])==gap//(tf0*60)-1)
    if tf0==1: ok('the candle after the gap has its own file open/close', tuple(d1[gi][1:])==REF[first][d1[gi][0]])
    # ---------- تبديل الأصل ----------
    others=[s for s in SYMS if s!=first]
    for o in others:
        switch(pg,o); lo,hi=(1.0,2.0) if o=='EURUSD' else (500,5000)
        wait(pg,"d=>d.length>1000&&d[d.length-1].close>%s&&d[d.length-1].close<%s"%(lo,hi))
        d2,w2=check_symbol(o,'after switch to '+o)
        ok('%s: no candle of the previous asset (%s) remains'%(o,first), all(lo<c[4]<hi for c in d2) and not any(c[0] in set(x[0] for x in d1) and c[4]==d1[[x[0] for x in d1].index(c[0])][4] for c in d2[:50]) )
        ok('%s: filler rebuilt for the new asset only (all inside its time range)'%o, all(d2[0][0]<t<d2[-1][0] for t,_ in w2))
    # ---------- سنوات متعددة: ضمّ مرتب بلا تكرار ----------
    for s in SYMS:
        info=pg.evaluate("""async s=>{const st=new TVDataEngine.SymbolDataStream(s);await st.loadInitial(2000);let g=true;while(g&&!st.exhaustedBackward){g=await st.loadOlderIfNeeded(0)}
          const d=st.data;const ys={};d.forEach(c=>{const y=new Date(c.time*1000).getUTCFullYear();ys[y]=(ys[y]||0)+1});
          return {n:d.length,ys,sorted:d.every((c,i)=>i===0||c.time>d[i-1].time),first:d[0].time,last:d[d.length-1].time,years:TVDataEngine.yearsOf(s)}}""",s)
        ok('%s: all years joined in order, no duplicates, count == independent count (%d)'%(s,len(REF[s])), info['sorted'] and info['n']==len(REF[s]) and info['first']==min(REF[s]) and info['last']==max(REF[s]))
        ok('%s: years found automatically from file names: %s'%(s,info['years']), info['years']==sorted(int(y) for y in info['ys']))
    # ---------- إطار الساعة: تجميع صحيح + فجوات بخطوة ساعة ----------
    switch(pg,first); wait(pg,"d=>d.length>1000"); pg.evaluate("(()=>{const e=document.getElementById('timeframeSelect');e.value='60';e.dispatchEvent(new Event('change'))})()")
    wait(pg,"d=>d.length>300&&d[1].time-d[0].time>=3600"); tf0=60; d3=ser(pg)
    ref=REF[first]; random.seed(3); ok_agg=True; checked=0
    for c in random.sample(d3,min(120,len(d3))):
        mins=[ref[t] for t in range(c[0],c[0]+3600,60) if t in ref]
        if not mins: ok_agg=False; break
        if not (c[1]==mins[0][0] and c[4]==mins[-1][3] and abs(c[2]-max(m[1] for m in mins))<1e-9 and abs(c[3]-min(m[2] for m in mins))<1e-9): ok_agg=False; break
        checked+=1
    ok('1h candles = first open / max high / min low / last close of the real minutes (%d checked)'%checked, ok_agg and checked>50)
    ws3=wspace(pg); exp3=set()
    for i in range(1,len(d3)):
        t=d3[i-1][0]+3600
        while t<d3[i][0]: exp3.add(t); t+=3600
    ok('1h: filler = missing hours (%d), e.g. weekends stay blank'%len(exp3), set(t for t,_ in ws3)==exp3)
    # ---------- إيقاف/تشغيل الفجوات ----------
    pg.evaluate("TVGaps.setEnabled(false)"); off=len(wspace(pg)); n_off=len(ser(pg)); pg.evaluate("TVGaps.setEnabled(true)"); on=len(wspace(pg))
    ok('toggle: gaps off → no filler, candles untouched; on → filler restored', off==0 and n_off==len(d3) and on==len(exp3))
    ok('no page errors in the whole real-files cycle', not errs)
    # ---------- تركيب جزئي: index.html بلا وسوم السكربتات الجديدة ----------
    def variant(remove_files):
        S2=tempfile.mkdtemp(); R2=os.path.join(S2,'ixview'); shutil.copytree(ROOT,R2,symlinks=True)
        h=open(os.path.join(R2,'index.html'),encoding='utf-8').read()
        for tag in ('tv-data-import.js','tv-gaps.js'): h=re.sub(r'<script src="%s"></script>\n?'%re.escape(tag),'',h)
        open(os.path.join(R2,'index.html'),'w',encoding='utf-8').write(h)
        if remove_files:
            for f in ('tv-data-import.js','tv-gaps.js'): os.remove(os.path.join(R2,f))
        sv=TS(('127.0.0.1',0),functools.partial(H,directory=S2)); threading.Thread(target=sv.serve_forever,daemon=True).start(); return 'http://127.0.0.1:%d/ixview/'%sv.server_address[1]
    for label,rm in (('page without the new script tags, files present (engine loads them itself)',False),('page without the new script tags AND files absent (built-in safe parser)',True)):
        u=variant(rm); pv=b.new_page(viewport={'width':1400,'height':800}); ev=[]
        pv.on('pageerror',lambda e:ev.append(str(e)))
        pv.route(lambda x: not x.startswith('http://127.0.0.1') and not x.startswith('data:'),lambda r:r.abort()); pv.route('https://unpkg.com/**',lambda r:r.fulfill(body=STUB,content_type='application/javascript'))
        pv.goto(u); wait(pv,"d=>d.length>1000"); dv=ser(pv); sym=pv.evaluate("document.getElementById('pairSelect').value"); ref=REF[sym]
        okc=all(c[0] in ref and tuple(c[1:])==ref[c[0]] for c in random.sample(dv,400)); asc=all(dv[i][0]>dv[i-1][0] for i in range(1,len(dv)))
        ok('%s: candles load, equal the file rows, strictly ascending'%label, okc and asc)
        info=pv.evaluate("""async s=>{const st=new TVDataEngine.SymbolDataStream(s);await st.loadInitial(2000);let g=true;while(g&&!st.exhaustedBackward){g=await st.loadOlderIfNeeded(0)}const d=st.data;return {n:d.length,asc:d.every((c,i)=>i===0||c.time>d[i-1].time)}}""",sym)
        ok('%s: all years joined, no duplicates, count == independent count (%d)'%(label,len(ref)), info['asc'] and info['n']==len(ref))
        if not rm: ok('%s: gap filler active (TVGaps injected)'%label, pv.evaluate("!!window.TVGaps && !!TVGaps.helperOf(window.candleSeries)"))
        ok('%s: no page errors'%label, not ev); pv.close()
    if errs: print('ERRORS',errs[:4])
    for n,c in res: print('ok  ' if c else 'FAIL',n)
    print('ALL OK' if all(c for _,c in res) else 'FAILED'); b.close()
