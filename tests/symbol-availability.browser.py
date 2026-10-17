import os, json
from playwright.sync_api import sync_playwright
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'); src=open(os.path.join(R,'tv-symbol-availability.js'),encoding='utf-8').read()
res=[]; ok=lambda n,c: res.append((n,bool(c)))
def run(manifest):
    with sync_playwright() as p:
        b=p.chromium.launch(); pg=b.new_page(); reqs=[]
        def h(route):
            u=route.request.url; reqs.append(u)
            if u.endswith('/'): return route.fulfill(body='<html></html>',content_type='text/html')
            if u.endswith('manifest.json'): return route.fulfill(body=json.dumps(manifest),content_type='application/json') if manifest else route.fulfill(status=404)
            if 'DAT_MT_XAUUSD_M1_2019.csv' in u: return route.fulfill(body='x',content_type='text/csv')
            route.fulfill(status=404)
        pg.route('**/*',h); pg.goto('http://test.local/'); pg.add_script_tag(content=src)
        out=pg.evaluate("""async()=>{let n=0;TVSymbolAvailability.onChange(()=>n++);
          const before=TVSymbolAvailability.get('XAUUSD').state;
          await TVSymbolAvailability.check(['XAUUSD','EURUSD']);
          const a=TVSymbolAvailability.get('XAUUSD'),e=TVSymbolAvailability.get('EURUSD');
          await TVSymbolAvailability.check(['XAUUSD','EURUSD']); // من الكاش
          return {before,a,e,n}}""")
        b.close(); return out,reqs
o,reqs=run(None)
ok('initial state is checking (not assumed available)', o['before']=='checking')
ok('probe finds XAUUSD 2019 only', o['a']['state']=='ok' and o['a']['from']==2019 and o['a']['to']==2019)
ok('EURUSD (no files) marked none', o['e']['state']=='none')
ok('listeners fire once; cached second call does not re-notify', o['n']==1)
ok('no repeated probing on cache hit', len([r for r in reqs if 'DAT_MT_EURUSD_M1_2000' in r])==1)
o2,_=run({'XAUUSD':{'from':2010,'to':2024}})
ok('manifest takes precedence', o2['a']['from']==2010 and o2['a']['to']==2024 and o2['e']['state']=='none')
for n,c in res: print('ok  ' if c else 'FAIL',n)
print('ALL OK' if all(c for _,c in res) else 'FAILED')
