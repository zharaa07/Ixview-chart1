/* =========================================================================
   tv-position-calc.js — حسابات أداة الصفقة (Long / Short) — دوال نقية بلا DOM

   افتراضات موثّقة (تُطبَّق صراحةً):
   - عملة الربح = عملة الحساب (لا تحويل بين العملات). لأزواج مثل USDJPY
     أو EURGBP ستكون النتيجة بعملة التسعير وليس بالدولار.
   - حجم الصفقة بالوحدات = qty * lotSize   (lotSize = وحدات لكل لوت؛
     مثال: فوركس 100000، ذهب 100، مؤشرات CFD غالباً 1).
   - قيمة الربح = فرق السعر * الوحدات.
   - الهامش = قيمة الصفقة الاسمية / الرافعة.
   - عند تحديد حجم المركز من نسبة المخاطرة يُقرَّب الحجم للأسفل (floor)
     حسب qtyPrecision حتى لا تتجاوز المخاطرة الفعلية النسبة المطلوبة.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TVPositionCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function floorTo(value, decimals) {
    const f = Math.pow(10, decimals);
    // epsilon يتفادى أخطاء الفاصلة العائمة (مثل 0.29999999 بدل 0.3)
    return Math.floor(value * f + 1e-9) / f;
  }
  function roundTo(value, decimals) {
    const f = Math.pow(10, decimals);
    return Math.round(value * f) / f;
  }

  // عدد النقاط (ticks) بين سعرين
  function ticksBetween(a, b, tickSize) {
    if (!isNum(a) || !isNum(b) || !(tickSize > 0)) return 0;
    return roundTo(Math.abs(a - b) / tickSize, 6);
  }

  // تقريب السعر لأقرب نقطة (tick) لتفادي ضجيج الفاصلة العائمة (مثل 2000.0999999)
  function roundToTick(price, tickSize) {
    if (!(tickSize > 0) || !isNum(price)) return price;
    const decimals = Math.max(0, Math.min(10, Math.round(-Math.log10(tickSize))));
    return roundTo(Math.round(price / tickSize) * tickSize, decimals);
  }

  // السعر المقابل لعدد نقاط من سعر الدخول (اتجاه الصفقة يحدد الإشارة)
  function priceFromTicks(entry, ticks, tickSize, direction /* +1 فوق، -1 تحت */) {
    return entry + direction * ticks * tickSize;
  }

  // حجم المركز (qty) من نسبة المخاطرة
  function sizeFromRisk(p) {
    const dist = Math.abs(p.entry - p.stop);
    if (!(dist > 0) || !(p.accountSize > 0) || !(p.riskPct > 0) || !(p.lotSize > 0)) return 0;
    const riskMoney = p.accountSize * p.riskPct / 100;
    const qty = riskMoney / (dist * p.lotSize);
    return floorTo(qty, p.qtyPrecision == null ? 2 : p.qtyPrecision);
  }

  // الحسابات الكاملة للصفقة
  function compute(p) {
    const isLong = p.side === 'long';
    const lotSize = p.lotSize > 0 ? p.lotSize : 1;
    const leverage = p.leverage > 0 ? p.leverage : 1;
    const tickSize = p.tickSize > 0 ? p.tickSize : 0.01;

    const risk = Math.abs(p.entry - p.stop);
    const reward = Math.abs(p.target - p.entry);
    const units = p.qty * lotSize;

    // صحة الاتجاه: long → stop < entry < target ، short → target < entry < stop
    const validDirection = isLong
      ? (p.stop < p.entry && p.target > p.entry)
      : (p.stop > p.entry && p.target < p.entry);

    const riskAmount = risk * units;
    const rewardAmount = reward * units;
    const notional = p.entry * units;

    const out = {
      validDirection,
      risk, reward,
      rr: risk > 0 ? reward / risk : 0,
      units,
      riskTicks: ticksBetween(p.entry, p.stop, tickSize),
      rewardTicks: ticksBetween(p.entry, p.target, tickSize),
      riskAmount, rewardAmount,
      riskPctOfPrice: p.entry ? risk / p.entry * 100 : 0,
      rewardPctOfPrice: p.entry ? reward / p.entry * 100 : 0,
      riskPctOfAccount: p.accountSize > 0 ? riskAmount / p.accountSize * 100 : 0,
      rewardPctOfAccount: p.accountSize > 0 ? rewardAmount / p.accountSize * 100 : 0,
      notional,
      margin: notional / leverage,
      marginPctOfAccount: p.accountSize > 0 ? (notional / leverage) / p.accountSize * 100 : 0,
      marginExceedsAccount: p.accountSize > 0 ? (notional / leverage) > p.accountSize : false
    };

    // الربح/الخسارة الحالية عند سعر معيّن (اختياري)
    if (isNum(p.currentPrice)) {
      const diff = isLong ? (p.currentPrice - p.entry) : (p.entry - p.currentPrice);
      out.openPnl = diff * units;
      out.openPnlTicks = roundTo(diff / tickSize, 6);
    }
    return out;
  }

  // قفل نسبة المخاطرة/العائد: عند تحريك الوقف أو الهدف يُعاد ضبط الآخر
  // movedLevel: 'stop' | 'target'  ، rr: النسبة المراد الحفاظ عليها (reward/risk)
  function applyRRLock(p, movedLevel, rr) {
    const isLong = p.side === 'long';
    const out = { entry: p.entry, stop: p.stop, target: p.target };
    if (!(rr > 0)) return out;
    if (movedLevel === 'stop') {
      const risk = Math.abs(p.entry - p.stop);
      out.target = isLong ? p.entry + risk * rr : p.entry - risk * rr;
    } else if (movedLevel === 'target') {
      const reward = Math.abs(p.target - p.entry);
      const risk = reward / rr;
      out.stop = isLong ? p.entry - risk : p.entry + risk;
    }
    return out;
  }

  return { compute, sizeFromRisk, ticksBetween, priceFromTicks, roundToTick, applyRRLock, floorTo, roundTo };
});
