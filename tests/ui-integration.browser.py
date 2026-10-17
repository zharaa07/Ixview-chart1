# اختبار تكاملي في Chromium حقيقي لواجهة المؤشرات واللوحة التداول، مع محاكاة لمكتبة Lightweight Charts
import json, os
from playwright.sync_api import sync_playwright
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
rd = lambda f: open(os.path.join(R, f), encoding='utf-8').read()
MOCK = r'''
window.__panes=1;
function mkSeries(chart,kind,pane){const s={kind,pane,_d:[],lines:[],
 setData(d){this._d=d.slice()},update(b){const l=this._d[this._d.length-1];if(l&&l.time===b.time)this._d[this._d.length-1]=b;else this._d.push(b)},
 data(){return this._d.slice()},createPriceLine(o){const l=Object.assign({},o);this.lines.push(l);return l},
 removePriceLine(l){this.lines=this.lines.filter(x=>x!==l)},applyOptions(){}};chart._series.push(s);return s}
window.LightweightCharts={LineSeries:'line',HistogramSeries:'hist',CandlestickSeries:'candle'};
window.chart={_series:[],addSeries(k,o,pane){pane=pane||0;if(pane>=window.__panes)window.__panes=pane+1;return mkSeries(this,k,pane)},
 removeSeries(s){this._series=this._series.filter(x=>x!==s)},panes(){return Array.from({length:window.__panes},(_, i)=>({getSeries:()=>this._series.filter(s=>s.pane===i)}))},
 removePane(i){window.__panes--}};
window.candleSeries=mkSeries(window.chart,'candle',0);
window.__bt={isBacktest:false};window.getBacktestState=()=>window.__bt;
window.SYMBOL_PRECISION={XAUUSD:2};
'''
HTML = '''<div id="tvTopBar"><button id="tvIndicatorsBtn" class="tv-topbar-btn tv-disabled">Indicators</button></div>
<div id="controls"><select id="pairSelect"><option value="XAUUSD">XAUUSD</option></select></div>
<button id="startBacktest">go</button><div id="chart" style="position:relative;width:800px;height:500px"></div>'''
def bars(n, t0=1700000000, step=60):
    out=[];p=1900.0
    for i in range(n):
        p+= ((i*37)%11-5)*0.2; out.append(dict(time=t0+i*step,open=p,high=p+1,low=p-1,close=p+0.1))
    return out
res=[]; ok=lambda n,c: res.append((n,bool(c)))
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':900,'height':700}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.route('http://test.local/', lambda r: r.fulfill(body='<!doctype html><html><body>'+HTML+'</body></html>', content_type='text/html')); pg.goto('http://test.local/'); pg.add_style_tag(content=(rd('tv-theme.css') if os.path.exists(os.path.join(R,'tv-theme.css')) else '')+rd('tv-trade.css'))
    pg.evaluate(MOCK)
    for f in ['tv-indicators.js','tv-trading-sim.js','tv-indicators-ui.js','tv-trade-ui.js']: pg.add_script_tag(content=rd(f))
    pg.wait_for_timeout(1200)
    # ---------- المؤشرات ----------
    ok('indicators button enabled', 'tv-disabled' not in pg.eval_on_selector('#tvIndicatorsBtn','e=>e.className'))
    pg.click('#tvIndicatorsBtn'); ok('picker opens', pg.locator('.tvx-modal').count()==1)
    pg.fill('.tvx-search','zzzz'); ok('empty search shows no-results', 'لا توجد نتائج' in pg.inner_text('.tvx-modal'))
    pg.fill('.tvx-search','rsi'); pg.click('.tvx-row'); ok('picker closes after add', pg.locator('.tvx-modal').count()==0)
    pg.evaluate("candleSeries.setData(%s)"%json.dumps(bars(120))); pg.wait_for_timeout(200)
    st=pg.evaluate("TVIndicatorsUI.items().map(i=>({id:i.id,pane:i.paneIndex,n:i.series[0].s._d.length}))")
    ok('RSI in separate pane (index 1)', st and st[0]['pane']==1)
    ok('RSI has 120-14=106 points', st and st[0]['n']==106)
    ok('legend shows RSI', 'Relative Strength Index' in pg.inner_text('#tvIndLegend'))
    pg.evaluate("TVIndicatorsUI.add('ema')"); pg.wait_for_timeout(200)
    ok('EMA overlay pane 0', pg.evaluate("TVIndicatorsUI.items()[1].paneIndex")==0)
    # تحديث شمعة جديدة يعيد الحساب
    pg.evaluate("candleSeries.update(%s)"%json.dumps(dict(time=1700000000+120*60,open=1900,high=1901,low=1899,close=1900.5))); pg.wait_for_timeout(200)
    ok('indicator extends with new bar', pg.evaluate("TVIndicatorsUI.items()[0].series[0].s._d.length")==107)
    # إعدادات: قيمة غير صالحة
    pg.click('#tvIndLegend .tvx-leg:first-child button:nth-of-type(2)'); pg.fill('.tvx-modal input[type=number]','0'); pg.click('.tvx-actions .primary')
    ok('invalid param blocked with error', 'يجب أن تكون' in pg.inner_text('.tvx-err') and pg.locator('.tvx-modal').count()==1)
    pg.fill('.tvx-modal input[type=number]','7'); pg.click('.tvx-actions .primary'); pg.wait_for_timeout(200)
    ok('valid param applied (length 7)', pg.evaluate("TVIndicatorsUI.items()[0].params.length")==7)
    ok('settings persisted', json.loads(pg.evaluate("localStorage.getItem('tv_indicators_v1')"))[0]['params']['length']==7)
    pg.click('#tvIndLegend .tvx-leg:first-child button:nth-of-type(3)'); 
    ok('remove RSI deletes its pane', pg.evaluate("TVIndicatorsUI.items().length")==1 and pg.evaluate("window.__panes")==1)
    # ---------- التداول ----------
    pg.click('#tvTradeBtn'); ok('trade panel opens', pg.evaluate("document.getElementById('tvTradePanel').classList.contains('open')"))
    ok('buttons disabled outside replay', pg.evaluate("document.getElementById('tvtBuy').disabled"))
    pg.evaluate("window.__bt.isBacktest=true; TVTradeUI.newSim(); candleSeries.setData(%s)"%json.dumps(bars(50))); pg.wait_for_timeout(100)
    pg.evaluate("TVTradeUI.render()"); ok('buttons enabled in replay', not pg.evaluate("document.getElementById('tvtBuy').disabled"))
    last=bars(50)[-1]; nxt=lambda i,o,h,l,c: dict(time=last['time']+60*i,open=o,high=h,low=l,close=c)
    pg.fill('#tvtQty','0.1'); pg.fill('#tvtSL',str(round(last['close']-5,2))); pg.fill('#tvtTP',str(round(last['close']+20,2)))
    pg.click('#tvtBuy'); ok('market order queued (no position yet)', pg.evaluate("TVTradeUI.state.sim.positions.length")==0 and pg.evaluate("TVTradeUI.state.sim.orders.length")==1)
    c=last['close']
    pg.evaluate("candleSeries.update(%s)"%json.dumps(nxt(1,c,c+1,c-1,c))); pg.wait_for_timeout(100)
    ok('position opens at next bar open + spread', abs(pg.evaluate("TVTradeUI.state.sim.positions[0].entry")-(c+0.30))<1e-9)
    ok('SL/TP price lines drawn', pg.evaluate("candleSeries.lines.length")>=3)
    pg.evaluate("candleSeries.update(%s)"%json.dumps(nxt(2,c,c+1,c-6,c-5.5))); pg.wait_for_timeout(100)
    ok('SL closes position', pg.evaluate("TVTradeUI.state.sim.positions.length")==0 and pg.evaluate("TVTradeUI.state.sim.history[0].reason")=='sl')
    ok('price lines cleared after close', pg.evaluate("candleSeries.lines.length")==0)
    pg.click('.tvt-tabs button[data-t=his]'); ok('history lists the trade', 'sl' in pg.inner_text('#tvtList'))
    ok('sim never saw bars beyond revealed ones', pg.evaluate("TVTradeUI.state.sim.lastBar.time")==last['time']+120)
    # رفض أمر: SL في الجهة الخاطئة
    pg.fill('#tvtSL',str(round(c+50,2))); pg.fill('#tvtTP',''); pg.click('#tvtBuy'); ok('wrong-side SL shows error', 'أسفل' in pg.inner_text('#tvtMsg'))
    # هامش غير كافٍ
    pg.fill('#tvtSL',''); pg.fill('#tvtQty','1000'); pg.click('#tvtBuy'); ok('insufficient margin message', 'الهامش' in pg.inner_text('#tvtMsg'))
    # الإعدادات تُحفظ وتُعيد ضبط الحساب
    pg.click('.tvt-tabs button[data-t=cfg]'); pg.locator('.tvt-cfg input').nth(1).fill('5000'); pg.click('.tvt-go .primary')
    ok('cfg saved & account reset to 5000', pg.evaluate("TVTradeUI.state.sim.balance")==5000 and json.loads(pg.evaluate("localStorage.getItem('tv_sim_cfg_v1')"))['XAUUSD']['balance']==5000)
    pg.locator('.tvt-cfg input').nth(0).fill('0'); pg.click('.tvt-go .primary'); ok('invalid cfg rejected', 'غير صالحة' in pg.inner_text('.tvt-cfg + .tvt-note'))
    for n,c in res: print('ok  ' if c else 'FAIL', n)
    print('page errors:', errs); print('FAILED' if [1 for _,c in res if not c] or errs else 'ALL OK'); b.close()
