/* =========================================================================
   tv-trading-sim.js — محرك التداول الورقي (محاكاة فقط، ليست أوامر وسيط حقيقي)

   القواعد التنفيذية (كلها مطبّقة في الكود وتغطيها الاختبارات):
   1. أسعار الشموع تُعامل كسعر BID. السعر ASK = BID + spread (سبريد ثابت
      بوحدات السعر). الشراء يُنفَّذ عند ASK ويُغلق عند BID، والبيع العكس.
   2. أمر السوق لا يُنفَّذ على الشمعة الحالية (منعاً لاستخدام معلومة غير
      متاحة): يُنفَّذ عند سعر افتتاح الشمعة التالية التي تصل عبر onBar().
   3. الأوامر المعلّقة (limit/stop) تُفحص على كل شمعة جديدة:
        Buy Limit  : يُنفَّذ إذا ask_low <= السعر؛ عند فجوة (open <= السعر) → open.
        Buy Stop   : يُنفَّذ إذا ask_high >= السعر؛ عند فجوة (open >= السعر) → open.
        Sell Limit / Sell Stop: بالعكس على سعر BID.
   4. وقف الخسارة / جني الربح:
        الصفقة الشراء تُغلق عند BID، البيع عند ASK.
        عند فجوة تتجاوز المستوى يكون التنفيذ عند سعر الافتتاح (لا عند المستوى).
        إذا لمست الشمعة الوقف والهدف معاً → يُفترض أن الوقف أولاً (تحفظ).
        الفحص يتم أيضاً على شمعة التنفيذ نفسها بعد الفتح.
   5. العمولة: commissionPerLot هي عمولة الدورة الكاملة (فتح+إغلاق)؛ يُخصم
      نصفها عند الفتح ونصفها عند الإغلاق.
   6. السواب: عند عبور كل حدّ تدوير (rolloverHourUTC) تُخصم/تُضاف قيمة
      swapLong/swapShort لكل لوت (موجبة = ربح للحساب). تُضرَب ×3 ليلة تدوير
      الأربعاء (rolloverTripleDay=3). السبت والأحد لا يُحتسب لهما تدوير.
   7. الهامش المطلوب = (الوحدات × سعر التنفيذ) / الرافعة. يُرفض أي أمر جديد
      إذا زاد الهامش المطلوب عن الهامش الحر.
   8. Stop-out: إذا كان مستوى الهامش (equity / usedMargin) ≤ stopOutLevel ‎%
      تُغلق الصفقات الأكثر خسارة أولاً عند BID/ASK الحالي حتى يرتفع المستوى.
   10. الانزلاق (slippage، بوحدات السعر، افتراضي 0): يُطبَّق عكس مصلحة المتداول على
       أوامر السوق وأوامر Stop عند الدخول، وعلى الخروج بالوقف (SL) وعلى الإغلاق عند
       الافتتاح (closeAtOpen). لا ينطبق على أوامر Limit ولا على جني الربح (TP).
   9. الحساب بنظام Hedging: كل صفقة مستقلة، والربح بعملة الحساب بدون تحويل.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TVTradingSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    balance: 10000, leverage: 100, lotSize: 100000,
    spread: 0, commissionPerLot: 7,
    swapLong: 0, swapShort: 0, rolloverHourUTC: 22, rolloverTripleDay: 3,
    stopOutLevel: 50, slippage: 0
  };
  const isNum = v => typeof v === 'number' && isFinite(v);

  class Sim {
    constructor(cfg) {
      this.cfg = Object.assign({}, DEFAULTS, cfg || {});
      this.reset();
    }

    reset(balance) {
      if (balance != null) this.cfg.balance = balance;
      this.balance = this.cfg.balance;
      this.positions = []; this.orders = []; this.history = []; this.log = [];
      this.lastBar = null; this._id = 1; this._lastRolloverKey = null;
    }

    // ---------------- مساعدات ----------------
    ask(bid) { return bid + this.cfg.spread; }
    _units(qty) { return qty * this.cfg.lotSize; }
    _note(msg) { this.log.push(msg); }

    _unrealized(p, bid) {
      const close = p.side === 'long' ? bid : this.ask(bid);
      const diff = p.side === 'long' ? close - p.entry : p.entry - close;
      return diff * this._units(p.qty);
    }
    usedMargin() { return this.positions.reduce((s, p) => s + p.margin, 0); }
    equity() {
      if (!this.lastBar) return this.balance;
      return this.balance + this.positions.reduce((s, p) => s + this._unrealized(p, this.lastBar.close) + p.swap, 0);
    }
    freeMargin() { return this.equity() - this.usedMargin(); }
    marginLevel() { const m = this.usedMargin(); return m > 0 ? this.equity() / m * 100 : null; }

    // ---------------- الأوامر ----------------
    // o: { type:'market'|'limit'|'stop', side:'long'|'short', qty, price?, sl?, tp? }
    placeOrder(o) {
      const err = this._validate(o);
      if (err) return { ok: false, error: err };
      const order = { id: this._id++, type: o.type, side: o.side, qty: o.qty,
        price: o.price == null ? null : o.price, sl: o.sl == null ? null : o.sl, tp: o.tp == null ? null : o.tp };
      // فحص الهامش المبدئي بسعر تقديري
      const ref = o.type === 'market' ? (this.lastBar ? this.lastBar.close : null) : o.price;
      if (ref != null) {
        const need = this._units(o.qty) * ref / this.cfg.leverage;
        if (need > this.freeMargin() + 1e-9) return { ok: false, error: 'insufficient_margin', required: need, free: this.freeMargin() };
      }
      this.orders.push(order);
      return { ok: true, order };
    }

    _validate(o) {
      if (!o || (o.side !== 'long' && o.side !== 'short')) return 'invalid_side';
      if (['market', 'limit', 'stop'].indexOf(o.type) < 0) return 'invalid_type';
      if (!isNum(o.qty) || o.qty <= 0) return 'invalid_qty';
      if (o.type !== 'market' && (!isNum(o.price) || o.price <= 0)) return 'invalid_price';
      if (o.sl != null && !isNum(o.sl)) return 'invalid_sl';
      if (o.tp != null && !isNum(o.tp)) return 'invalid_tp';
      const ref = o.type === 'market' ? (this.lastBar && this.lastBar.close) : o.price;
      if (ref != null) {
        if (o.side === 'long') {
          if (o.sl != null && o.sl >= ref) return 'sl_must_be_below_entry';
          if (o.tp != null && o.tp <= ref) return 'tp_must_be_above_entry';
        } else {
          if (o.sl != null && o.sl <= ref) return 'sl_must_be_above_entry';
          if (o.tp != null && o.tp >= ref) return 'tp_must_be_below_entry';
        }
      }
      if (o.type === 'limit' || o.type === 'stop') {
        const last = this.lastBar ? this.lastBar.close : null;
        if (last != null) {
          const below = o.price < last;
          const okDir = (o.side === 'long' && o.type === 'limit') || (o.side === 'short' && o.type === 'stop') ? below : !below;
          if (!okDir) return 'pending_price_wrong_side_of_market';
        }
      }
      return null;
    }

    cancelOrder(id) {
      const i = this.orders.findIndex(x => x.id === id);
      if (i < 0) return false; this.orders.splice(i, 1); return true;
    }

    modifyPosition(id, { sl, tp }) {
      const p = this.positions.find(x => x.id === id); if (!p) return { ok: false, error: 'not_found' };
      const ref = this.lastBar ? this.lastBar.close : p.entry;
      if (sl != null) {
        if (p.side === 'long' ? sl >= ref : sl <= ref) return { ok: false, error: 'invalid_sl' };
        p.sl = sl;
      }
      if (tp != null) {
        if (p.side === 'long' ? tp <= ref : tp >= ref) return { ok: false, error: 'invalid_tp' };
        p.tp = tp;
      }
      if (sl === null) p.sl = null; if (tp === null) p.tp = null;
      return { ok: true, position: p };
    }

    // إغلاق يدوي عند سعر الإغلاق الحالي (BID للشراء / ASK للبيع)
    closePosition(id) {
      const p = this.positions.find(x => x.id === id);
      if (!p || !this.lastBar) return { ok: false, error: 'not_found_or_no_data' };
      const bid = this.lastBar.close;
      const price = p.side === 'long' ? bid : this.ask(bid);
      return { ok: true, trade: this._close(p, price, this.lastBar.time, 'manual') };
    }

    // إعادة تثبيت مرجع السعر بعد قفز/إعادة تحميل البيانات — مسموح فقط عندما
    // لا توجد صفقات/أوامر/سجل (لا يوجد شيء معرّض للتخطي). يُرجع true عند النجاح.
    rebase(bar) {
      if (this.positions.length || this.orders.length || this.history.length) return false;
      this.lastBar = null; this._lastRolloverKey = null; this.onBar(bar); return true;
    }

    // إغلاق صفقة عند افتتاح الشمعة التالية (قرار اتُّخذ عند إغلاق الشمعة الحالية)
    closeAtOpen(id) {
      if (!this.positions.some(p => p.id === id)) return false;
      if (this.orders.some(o => o.type === 'close' && o.positionId === id)) return false;
      this.orders.push({ id: this._id++, type: 'close', positionId: id }); return true;
    }

    // ---------------- المعالجة مع كل شمعة ----------------
    onBar(bar) {
      if (!bar || ![bar.open, bar.high, bar.low, bar.close].every(isNum)) return;
      if (this.lastBar && bar.time <= this.lastBar.time) return; // تجاهل التكرار/الرجوع
      this._applyRollover(bar);
      this._fillOrders(bar);
      this._checkExits(bar);
      this.lastBar = bar;
      this._checkStopOut(bar);
    }

    _fillOrders(bar) {
      const sp = this.cfg.spread;
      const remaining = [];
      const slip = this.cfg.slippage || 0;
      this.orders.forEach(o => {
        if (o.type === 'close') {
          const p = this.positions.find(x => x.id === o.positionId);
          if (p) this._close(p, p.side === 'long' ? bar.open - slip : bar.open + sp + slip, bar.time, 'signal');
          return;
        }
        let fill = null;
        if (o.type === 'market') fill = o.side === 'long' ? bar.open + sp + slip : bar.open - slip;
        else if (o.side === 'long') {
          if (o.type === 'limit' && bar.low + sp <= o.price) fill = (bar.open + sp <= o.price) ? bar.open + sp : o.price;
          if (o.type === 'stop' && bar.high + sp >= o.price) fill = ((bar.open + sp >= o.price) ? bar.open + sp : o.price) + slip;
        } else {
          if (o.type === 'limit' && bar.high >= o.price) fill = (bar.open >= o.price) ? bar.open : o.price;
          if (o.type === 'stop' && bar.low <= o.price) fill = ((bar.open <= o.price) ? bar.open : o.price) - slip;
        }
        if (fill == null) { remaining.push(o); return; }
        const margin = this._units(o.qty) * fill / this.cfg.leverage;
        if (margin > this.freeMargin() + 1e-9) { this._note('order ' + o.id + ' rejected at fill: insufficient margin'); return; }
        const commission = this.cfg.commissionPerLot * o.qty / 2;
        this.balance -= commission;
        this.positions.push({ id: o.id, side: o.side, qty: o.qty, entry: fill, entryTime: bar.time,
          sl: o.sl, tp: o.tp, margin, commission, swap: 0 });
      });
      this.orders = remaining;
    }

    _checkExits(bar) {
      const sp = this.cfg.spread, slip = this.cfg.slippage || 0;
      this.positions.slice().forEach(p => {
        // أسعار الإغلاق: شراء عند BID ، بيع عند ASK (= BID + spread)
        const hi = p.side === 'long' ? bar.high : bar.high + sp;
        const lo = p.side === 'long' ? bar.low : bar.low + sp;
        const op = p.side === 'long' ? bar.open : bar.open + sp;
        let exit = null, reason = null;
        if (p.side === 'long') {
          if (p.sl != null && lo <= p.sl) { exit = (op <= p.sl ? op : p.sl) - slip; reason = 'sl'; }
          else if (p.tp != null && hi >= p.tp) { exit = op >= p.tp ? op : p.tp; reason = 'tp'; }
        } else {
          if (p.sl != null && hi >= p.sl) { exit = (op >= p.sl ? op : p.sl) + slip; reason = 'sl'; }
          else if (p.tp != null && lo <= p.tp) { exit = op <= p.tp ? op : p.tp; reason = 'tp'; }
        }
        if (exit != null) this._close(p, exit, bar.time, reason);
      });
    }

    _close(p, price, time, reason) {
      const diff = p.side === 'long' ? price - p.entry : p.entry - price;
      const gross = diff * this._units(p.qty);
      const commission = this.cfg.commissionPerLot * p.qty / 2;
      const net = gross - commission + p.swap - p.commission; // يشمل عمولة الفتح
      this.balance += gross - commission + p.swap;
      this.positions = this.positions.filter(x => x.id !== p.id);
      const trade = { id: p.id, side: p.side, qty: p.qty, entry: p.entry, exit: price,
        entryTime: p.entryTime, exitTime: time, reason, gross,
        commission: p.commission + commission, swap: p.swap, net };
      this.history.push(trade);
      return trade;
    }

    _applyRollover(bar) {
      const d = new Date(bar.time * 1000);
      const day = Math.floor(bar.time / 86400);
      const hour = d.getUTCHours();
      // رقم "ليلة" التدوير: اليوم الذي يبدأ عنده الحد 22:00 (الساعات قبله تنتمي لليلة السابقة)
      const night = hour >= this.cfg.rolloverHourUTC ? day : day - 1;
      if (this._lastRolloverKey == null) { this._lastRolloverKey = night; return; }
      for (let n = this._lastRolloverKey + 1; n <= night; n++) {
        const wd = new Date(n * 86400000).getUTCDay(); // يوم الأسبوع لليلة التدوير
        if (wd === 6 || wd === 0) continue;
        const mult = wd === this.cfg.rolloverTripleDay ? 3 : 1;
        this.positions.forEach(p => {
          const per = p.side === 'long' ? this.cfg.swapLong : this.cfg.swapShort;
          p.swap += per * p.qty * mult;
        });
      }
      this._lastRolloverKey = night;
    }

    _checkStopOut(bar) {
      let guard = 50;
      while (guard-- > 0 && this.positions.length) {
        const lvl = this.marginLevel();
        if (lvl == null || lvl > this.cfg.stopOutLevel) break;
        const worst = this.positions.slice().sort((a, b) => this._unrealized(a, bar.close) - this._unrealized(b, bar.close))[0];
        const price = worst.side === 'long' ? bar.close : this.ask(bar.close);
        this._close(worst, price, bar.time, 'stop_out');
      }
    }

    getState() {
      return {
        balance: this.balance, equity: this.equity(), usedMargin: this.usedMargin(),
        freeMargin: this.freeMargin(), marginLevel: this.marginLevel(),
        positions: this.positions.map(p => Object.assign({ unrealized: this.lastBar ? this._unrealized(p, this.lastBar.close) : 0 }, p)),
        orders: this.orders.slice(), history: this.history.slice()
      };
    }
    toJSON() { return { cfg: this.cfg, balance: this.balance, positions: this.positions, orders: this.orders, history: this.history, id: this._id }; }
    static fromJSON(j) {
      const s = new Sim(j.cfg); s.balance = j.balance; s.positions = j.positions || [];
      s.orders = j.orders || []; s.history = j.history || []; s._id = j.id || 1; return s;
    }
  }

  return { Sim, DEFAULTS };
});
