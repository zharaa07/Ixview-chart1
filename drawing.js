/* =========================================================================
   drawing.js — TradingView-style Drawing Tools Engine (v2)
   Single draw button -> categorized tool menu -> floating toolbar ->
   full settings sheet (Style / Coordinates / Text tabs), per TradingView UX.

   USAGE — call once after your chart & series exist (e.g. in backtest.js):

       DrawingTools.init({
           chart:      chart,
           series:     candleSeries,
           container:  document.getElementById('chart'),
           storageKey: 'tv_clone_drawings_v1'   // optional
       });
   ========================================================================= */

(function (global) {
  'use strict';

  // =======================================================================
  // 1. GEOMETRY HELPERS
  // =======================================================================
  const Geo = {
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
    distToSegment(px, py, x1, y1, x2, y2) {
      const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let t = lenSq !== 0 ? dot / lenSq : -1;
      t = Math.max(0, Math.min(1, t));
      const xx = x1 + t * C, yy = y1 + t * D;
      return Geo.dist(px, py, xx, yy);
    },
    pointInRect(px, py, x1, y1, x2, y2) {
      const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
      return px >= minX && px <= maxX && py >= minY && py <= maxY;
    },
    pointNearRectBorder(px, py, x1, y1, x2, y2, tol) {
      const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
      const insideExpanded = px >= minX - tol && px <= maxX + tol && py >= minY - tol && py <= maxY + tol;
      if (!insideExpanded) return false;
      const nearVert = Math.abs(px - minX) <= tol || Math.abs(px - maxX) <= tol;
      const nearHoriz = Math.abs(py - minY) <= tol || Math.abs(py - maxY) <= tol;
      return (nearVert && py >= minY - tol && py <= maxY + tol) ||
             (nearHoriz && px >= minX - tol && px <= maxX + tol);
    },
    uid() { return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
    hexToRgba(hex, alpha) {
      let h = (hex || '#151d2f').replace('#', '');
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha == null ? 1 : alpha) + ')';
    },
    fmt(n, d) {
      if (n === null || n === undefined || isNaN(n)) return '-';
      return Number(n).toFixed(d === undefined ? 5 : d);
    }
  };

  const HANDLE_R = 5;
  const HANDLE_HIT_R = 10;
  const LINE_HIT_TOL = 7;

  // =======================================================================
  // 2. BASE DRAWING CLASS
  // =======================================================================
  class Drawing {
    constructor(type, points, style) {
      this.id = Geo.uid();
      this.type = type;
      this.points = points || [];
      this.color = (style && style.color) || '#2962FF';
      this.width = (style && style.width) || 2;
      this.lineStyle = (style && style.lineStyle) || 'solid';
      this.opacity = (style && style.opacity != null) ? style.opacity : 1;
      this.locked = false;
      this.hidden = false;
      this.text = (style && style.text) || '';
      this.fontSize = (style && style.fontSize) || 14;
      this.bold = !!(style && style.bold);
      this.showBackground = !!(style && style.showBackground);
      this.bgColor = (style && style.bgColor) || 'rgba(21,29,47,0.85)';
      this.extendLeft = !!(style && style.extendLeft);
      this.extendRight = !!(style && style.extendRight);
      this.showLabel = (style && style.showLabel) !== undefined ? style.showLabel : true;
      this.filled = (style && style.filled) !== undefined ? style.filled : true;
      this.fibLevels = (style && style.fibLevels) || Drawing.defaultFibLevels();
      this.reverse = !!(style && style.reverse);
      this.entry = (style && style.entry) || null;
      this.target = (style && style.target) || null;
      this.stop = (style && style.stop) || null;
      this.qty = (style && style.qty) || 1;
      this.extra = (style && style.extra) || {};
      // 'all' = visible on every timeframe, otherwise an array of minute values (see TF_MINUTES)
      this.visibleTimeframes = (style && style.visibleTimeframes) || 'all';
      this.customName = (style && style.customName) || '';
      this.arrowHeadSize = (style && style.arrowHeadSize) || 10;
      this.arrowDirection = (style && style.arrowDirection) || 'end'; // start | end | both
      this.italic = !!(style && style.italic);
      this.underline = !!(style && style.underline);
      this.strike = !!(style && style.strike);
      this.fontFamily = (style && style.fontFamily) || '-apple-system, Segoe UI, Arial';
      this.borderColor = (style && style.borderColor) || null;
      this.sizeUnit = (style && style.sizeUnit) || 'units';
      this.contractMultiplier = (style && style.contractMultiplier) || 1;
this.groupName = (style && style.groupName) || '';
this.fillColor = (style && style.fillColor) || null;
this.showBorder = (style && style.showBorder) !== undefined ? style.showBorder : true;
this.textPos = (style && style.textPos) || null;
this.showFibValues = (style && style.showFibValues) !== undefined ? style.showFibValues : true;
this.profitColor = (style && style.profitColor) || '#26a69a';
this.lossColor = (style && style.lossColor) || '#ef5350';
this.textColor = (style && style.textColor) || '#d7dde8';
this.lineTextAlign = (style && style.lineTextAlign) || 'center';
this.bgOpacity = (style && style.bgOpacity != null) ? style.bgOpacity : 0.85;
}

// Resolves this.bgColor + this.bgOpacity into a paintable fillStyle.
// Backward-compatible: if bgColor is still the old baked-in 'rgba(...)' default
// (drawings saved before this patch), it's used as-is and bgOpacity is ignored
// until the user picks a new color, at which point it becomes a plain hex value.
bgFillStyle() {
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(this.bgColor || '')) {
    return Geo.hexToRgba(this.bgColor, this.bgOpacity);
  }
  return this.bgColor || 'rgba(21,29,47,0.85)';
}

   static defaultFibLevels() {
  return [
    { value: 0, enabled: true, color: '#787B86', width: 1, lineStyle: 'solid' },
    { value: 0.236, enabled: true, color: '#F23645', width: 1, lineStyle: 'solid' },
    { value: 0.382, enabled: true, color: '#FF9800', width: 1, lineStyle: 'solid' },
    { value: 0.5, enabled: true, color: '#4CAF50', width: 1, lineStyle: 'solid' },
    { value: 0.618, enabled: true, color: '#26A69A', width: 1, lineStyle: 'solid' },
    { value: 0.786, enabled: true, color: '#2962FF', width: 1, lineStyle: 'solid' },
    { value: 1, enabled: true, color: '#787B86', width: 1, lineStyle: 'solid' },
    { value: 1.272, enabled: false, color: '#9C27B0', width: 1, lineStyle: 'solid' },
    { value: 1.618, enabled: false, color: '#E91E63', width: 1, lineStyle: 'solid' },
    { value: 2, enabled: false, color: '#795548', width: 1, lineStyle: 'solid' },
    { value: 2.618, enabled: false, color: '#607D8B', width: 1, lineStyle: 'solid' }
  ];
}

    px(mgr) { return this.points.map(p => mgr.toPixel(p)); }

    applyStrokeStyle(ctx) {
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = this.opacity;
      ctx.lineWidth = this.width;
      if (this.lineStyle === 'dashed') ctx.setLineDash([this.width * 3, this.width * 2]);
      else if (this.lineStyle === 'dotted') ctx.setLineDash([this.width, this.width * 2]);
      else ctx.setLineDash([]);
    }
    resetCtx(ctx) { ctx.globalAlpha = 1; ctx.setLineDash([]); }

    drawHandles(ctx, mgr, selected) {
      if (!selected) return;
      this.getHandlePixels(mgr).forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, HANDLE_R, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = this.color;
        ctx.stroke();
      });
    }

    getHandlePixels(mgr) { return this.px(mgr); }
    setHandlePixel(idx, x, y, mgr) { this.points[idx] = mgr.toData(x, y); }

    moveByPixels(dx, dy, mgr) {
      this.points = this.points.map(p => {
        const px = mgr.toPixel(p);
        return mgr.toData(px.x + dx, px.y + dy);
      });
    }

    boundingBoxPixels(mgr) {
      const pts = this.getHandlePixels(mgr);
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
    }

    render(ctx, mgr, selected) { /* abstract */ }
    hitTest(x, y, mgr) { return false; }

    toJSON() {
      return {
        id: this.id, type: this.type, points: this.points, color: this.color,
        width: this.width, lineStyle: this.lineStyle, opacity: this.opacity,
        locked: this.locked, hidden: this.hidden, text: this.text,
        fontSize: this.fontSize, bold: this.bold, showBackground: this.showBackground,
        bgColor: this.bgColor, extendLeft: this.extendLeft, extendRight: this.extendRight,
        showLabel: this.showLabel, filled: this.filled, fibLevels: this.fibLevels,
        reverse: this.reverse, entry: this.entry, target: this.target, stop: this.stop,
        qty: this.qty, extra: this.extra, visibleTimeframes: this.visibleTimeframes,
        customName: this.customName, arrowHeadSize: this.arrowHeadSize, arrowDirection: this.arrowDirection,
        italic: this.italic, underline: this.underline, strike: this.strike,
        fontFamily: this.fontFamily, borderColor: this.borderColor,
   sizeUnit: this.sizeUnit, contractMultiplier: this.contractMultiplier, groupName: this.groupName,
fillColor: this.fillColor, showBorder: this.showBorder, textPos: this.textPos, showFibValues: this.showFibValues,
  profitColor: this.profitColor, lossColor: this.lossColor, textColor: this.textColor,
  lineTextAlign: this.lineTextAlign, bgOpacity: this.bgOpacity
};
}
  }

  function styleFromJSON(item) {
    return {
      color: item.color, width: item.width, lineStyle: item.lineStyle, opacity: item.opacity,
      text: item.text, fontSize: item.fontSize, bold: item.bold, showBackground: item.showBackground,
      bgColor: item.bgColor, extendLeft: item.extendLeft, extendRight: item.extendRight,
      showLabel: item.showLabel, filled: item.filled, fibLevels: item.fibLevels,
      reverse: item.reverse, entry: item.entry, target: item.target, stop: item.stop,
      qty: item.qty, extra: item.extra, visibleTimeframes: item.visibleTimeframes,
      customName: item.customName, arrowHeadSize: item.arrowHeadSize, arrowDirection: item.arrowDirection,
      italic: item.italic, underline: item.underline, strike: item.strike,
      fontFamily: item.fontFamily, borderColor: item.borderColor,
sizeUnit: item.sizeUnit, contractMultiplier: item.contractMultiplier, groupName: item.groupName,
fillColor: item.fillColor, showBorder: item.showBorder, textPos: item.textPos, showFibValues: item.showFibValues,
  profitColor: item.profitColor, lossColor: item.lossColor, textColor: item.textColor,
  lineTextAlign: item.lineTextAlign, bgOpacity: item.bgOpacity
};
}

  // ---- Trend Line (supports extend left/right like TradingView) ----------
  class TrendLine extends Drawing {
    constructor(points, style) { super('trendline', points, style); }
    _ends(mgr) {
      const [a, b] = this.px(mgr);
      let x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const big = (mgr.width + mgr.height) * 2;
      if (this.extendLeft) { x1 = a.x - (dx / len) * big; y1 = a.y - (dy / len) * big; }
      if (this.extendRight) { x2 = b.x + (dx / len) * big; y2 = b.y + (dy / len) * big; }
      return { x1, y1, x2, y2 };
    }
render(ctx, mgr, selected) {
      if (this.points.length < 2) return;
      const { x1, y1, x2, y2 } = this._ends(mgr);
      this.applyStrokeStyle(ctx);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      this.resetCtx(ctx);
      if (this.text) {
        const align = this.lineTextAlign || 'center';
        const ratio = align === 'left' ? 0.08 : (align === 'right' ? 0.92 : 0.5);
        const tx = x1 + (x2 - x1) * ratio;
        const ty = y1 + (y2 - y1) * ratio;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(angle);
        ctx.font = (this.bold ? '700 ' : '600 ') + this.fontSize + 'px ' + this.fontFamily;
        ctx.fillStyle = this.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(this.text, 0, -6);
        ctx.restore();
      }
      this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) {
      if (this.points.length < 2) return false;
      const { x1, y1, x2, y2 } = this._ends(mgr);
      return Geo.distToSegment(x, y, x1, y1, x2, y2) <= LINE_HIT_TOL;
    }
  }

  // ---- Ray -----------------------------------------------------------------
  class Ray extends Drawing {
    constructor(points, style) { super('ray', points, style); }
    render(ctx, mgr, selected) {
      if (this.points.length < 2) return;
      const [a, b] = this.px(mgr);
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const big = (mgr.width + mgr.height) * 2;
      const ex = a.x + (dx / len) * big, ey = a.y + (dy / len) * big;
      this.applyStrokeStyle(ctx);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();
      this.resetCtx(ctx);
      this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) {
      if (this.points.length < 2) return false;
      const [a, b] = this.px(mgr);
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const big = (mgr.width + mgr.height) * 2;
      const ex = a.x + (dx / len) * big, ey = a.y + (dy / len) * big;
      return Geo.distToSegment(x, y, a.x, a.y, ex, ey) <= LINE_HIT_TOL;
    }
  }

  // ---- Horizontal Line ------------------------------------------------------
  class HLine extends Drawing {
    constructor(points, style) { super('hline', points, style); }
    render(ctx, mgr, selected) {
      if (this.points.length < 1) return;
      const p = mgr.toPixel(this.points[0]);
      this.applyStrokeStyle(ctx);
      ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(mgr.width, p.y); ctx.stroke();
      this.resetCtx(ctx);
      if (this.showLabel) {
        const label = Geo.fmt(this.points[0].price, mgr.priceDecimals());
        ctx.font = '600 11px -apple-system, Segoe UI, Arial';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = this.color;
        ctx.fillRect(mgr.width - tw - 14, p.y - 10, tw + 10, 20);
        ctx.fillStyle = '#0b0f1a';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mgr.width - tw - 9, p.y);
      }
      if (selected) {
        ctx.beginPath(); ctx.arc(mgr.width / 2, p.y, HANDLE_R, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = this.color; ctx.stroke();
      }
    }
    hitTest(x, y, mgr) {
      if (this.points.length < 1) return false;
      return Math.abs(y - mgr.toPixel(this.points[0]).y) <= LINE_HIT_TOL;
    }
    getHandlePixels(mgr) { const p = mgr.toPixel(this.points[0]); return [{ x: mgr.width / 2, y: p.y }]; }
    setHandlePixel(idx, x, y, mgr) { this.points[0] = mgr.toData(x, y); }
    moveByPixels(dx, dy, mgr) {
      const p = mgr.toPixel(this.points[0]);
      this.points[0] = mgr.toData(p.x, p.y + dy);
    }
  }

  // ---- Vertical Line ---------------------------------------------------------
  class VLine extends Drawing {
    constructor(points, style) { super('vline', points, style); }
    render(ctx, mgr, selected) {
      if (this.points.length < 1) return;
      const p = mgr.toPixel(this.points[0]);
      this.applyStrokeStyle(ctx);
      ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, mgr.height); ctx.stroke();
      this.resetCtx(ctx);
      if (this.showLabel) {
        const d = this.points[0].time;
        const label = mgr.formatTime(d);
        ctx.font = '600 11px -apple-system, Segoe UI, Arial';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = this.color;
        ctx.fillRect(p.x - tw / 2 - 5, mgr.height - 20, tw + 10, 18);
        ctx.fillStyle = '#0b0f1a';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, p.x - tw / 2, mgr.height - 11);
      }
      if (selected) {
        ctx.beginPath(); ctx.arc(p.x, mgr.height / 2, HANDLE_R, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = this.color; ctx.stroke();
      }
    }
    hitTest(x, y, mgr) {
      if (this.points.length < 1) return false;
      return Math.abs(x - mgr.toPixel(this.points[0]).x) <= LINE_HIT_TOL;
    }
    getHandlePixels(mgr) { const p = mgr.toPixel(this.points[0]); return [{ x: p.x, y: mgr.height / 2 }]; }
    setHandlePixel(idx, x, y, mgr) { this.points[0] = mgr.toData(x, y); }
    moveByPixels(dx, dy, mgr) {
      const p = mgr.toPixel(this.points[0]);
      this.points[0] = mgr.toData(p.x + dx, p.y);
    }
  }

  // ---- Info Line (price / % / bars / time delta, like TradingView) -----------
  class InfoLine extends Drawing {
    constructor(points, style) { super('infoline', points, style); }
    render(ctx, mgr, selected) {
      if (this.points.length < 2) return;
      const [a, b] = this.px(mgr);
      this.applyStrokeStyle(ctx);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      this.resetCtx(ctx);

      const p0 = this.points[0], p1 = this.points[1];
      const priceDiff = (p1.price - p0.price);
      const pct = p0.price ? (priceDiff / p0.price) * 100 : 0;
      const bars = mgr.barsBetween(p0.time, p1.time);
      const up = priceDiff >= 0;
      const lines = [
        (up ? '+' : '') + Geo.fmt(priceDiff, mgr.priceDecimals()) + '  (' + (up ? '+' : '') + Geo.fmt(pct, 2) + '%)',
        bars + ' bars'
      ];
      ctx.font = '600 11px -apple-system, Segoe UI, Arial';
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      const boxW = Math.max(...lines.map(l => ctx.measureText(l).width)) + 14;
      ctx.fillStyle = up ? 'rgba(38,166,154,0.92)' : 'rgba(239,83,80,0.92)';
      ctx.fillRect(midX - boxW / 2, midY - 22, boxW, 34);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(lines[0], midX - boxW / 2 + 7, midY - 22 + 10);
      ctx.font = '500 10px -apple-system, Segoe UI, Arial';
      ctx.fillText(lines[1], midX - boxW / 2 + 7, midY - 22 + 25);
      this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) {
      if (this.points.length < 2) return false;
      const [a, b] = this.px(mgr);
      return Geo.distToSegment(x, y, a.x, a.y, b.x, b.y) <= LINE_HIT_TOL;
    }
  }

  // ---- Rectangle ---------------------------------------------------------------
  class RectDrawing extends Drawing {
    constructor(points, style, extended) {
      super(extended ? 'erect' : 'rect', points, style);
      this.extended = !!extended;
    }
render(ctx, mgr, selected) {
      if (this.points.length < 2) return;
      const [a, b] = this.px(mgr);
      let x1 = a.x, x2 = b.x;
      if (this.extended) { x1 = 0; x2 = mgr.width; }
      const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
      const rx1 = Math.min(x1, x2), rx2 = Math.max(x1, x2);

if (this.filled) {
  ctx.fillStyle = this.fillColor || this.color;
  ctx.globalAlpha = (this.fillOpacity != null ? this.fillOpacity : this.opacity);
  ctx.fillRect(rx1, y1, rx2 - rx1, y2 - y1);
  ctx.globalAlpha = 1;
}
      
      
      if (this.showBorder) {
        ctx.strokeStyle = this.borderColor || this.color;
        ctx.globalAlpha = this.opacity;
        ctx.lineWidth = this.width;
        if (this.lineStyle === 'dashed') ctx.setLineDash([this.width * 3, this.width * 2]);
        else if (this.lineStyle === 'dotted') ctx.setLineDash([this.width, this.width * 2]);
        else ctx.setLineDash([]);
        ctx.strokeRect(rx1, y1, rx2 - rx1, y2 - y1);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (this.text) {
        const pos = this.textPos || { rx: 0.5, ry: 0.5 };
        const tx = rx1 + (rx2 - rx1) * pos.rx;
        const ty = y1 + (y2 - y1) * pos.ry;
        ctx.font = (this.bold ? '700 ' : '600 ') + this.fontSize + 'px ' + this.fontFamily;
        ctx.fillStyle = this.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this.showBackground) {
          const w = ctx.measureText(this.text).width;
          ctx.fillStyle = this.bgColor;
          ctx.fillRect(tx - w / 2 - 4, ty - this.fontSize / 2 - 4, w + 8, this.fontSize + 8);
          ctx.fillStyle = this.color;
        }
        ctx.fillText(this.text, tx, ty);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
      this.drawHandles(ctx, mgr, selected);
    }
    
    hitTest(x, y, mgr) {
      if (this.points.length < 2) return false;
      const [a, b] = this.px(mgr);
      let x1 = a.x, x2 = b.x;
      if (this.extended) { x1 = 0; x2 = mgr.width; }
      const y1 = a.y, y2 = b.y;
      if (this.filled && Geo.pointInRect(x, y, x1, y1, x2, y2)) return true;
      return Geo.pointNearRectBorder(x, y, x1, y1, x2, y2, LINE_HIT_TOL);
    }
    getHandlePixels(mgr) {
      if (this.points.length < 2) return this.px(mgr);
      const [a, b] = this.px(mgr);
      return [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
    }
    setHandlePixel(idx, x, y, mgr) {
      const a = mgr.toPixel(this.points[0]), b = mgr.toPixel(this.points[1]);
      let na = { x: a.x, y: a.y }, nb = { x: b.x, y: b.y };
      if (idx === 0) na = { x, y };
      else if (idx === 1) { nb.x = x; na.y = y; }
      else if (idx === 2) nb = { x, y };
      else if (idx === 3) { na.x = x; nb.y = y; }
      this.points[0] = mgr.toData(na.x, na.y);
      this.points[1] = mgr.toData(nb.x, nb.y);
    }
  }

  // ---- Circle / Ellipse -----------------------------------------------------
  class CircleDrawing extends Drawing {
    constructor(points, style) { super('circle', points, style); }
    render(ctx, mgr, selected) {
      if (this.points.length < 2) return;
      const [a, b] = this.px(mgr);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
      this.applyStrokeStyle(ctx);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      
   if (this.filled) {
  ctx.fillStyle = this.color;
  ctx.globalAlpha = (this.fillOpacity != null ? this.fillOpacity : this.opacity);
  ctx.fill();
  ctx.globalAlpha = this.opacity;
}
      ctx.stroke();
      this.resetCtx(ctx);
      this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) {
      if (this.points.length < 2) return false;
      const [a, b] = this.px(mgr);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2 || 1, ry = Math.abs(b.y - a.y) / 2 || 1;
      const norm = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
      return this.filled ? norm <= 1.05 : Math.abs(norm - 1) < 0.15;
    }
    getHandlePixels(mgr) {
      const [a, b] = this.px(mgr);
      return [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
    }
    setHandlePixel(idx, x, y, mgr) {
      const a = mgr.toPixel(this.points[0]), b = mgr.toPixel(this.points[1]);
      let na = { x: a.x, y: a.y }, nb = { x: b.x, y: b.y };
      if (idx === 0) na = { x, y };
      else if (idx === 1) { nb.x = x; na.y = y; }
      else if (idx === 2) nb = { x, y };
      else if (idx === 3) { na.x = x; nb.y = y; }
      this.points[0] = mgr.toData(na.x, na.y);
      this.points[1] = mgr.toData(nb.x, nb.y);
    }
  }

  // دائرة حقيقية: النقطة 0 = المركز، النقطة 1 = نقطة على المحيط (نصف القطر = المسافة بينهما).
  // (أداة Ellipse تبقى CircleDrawing: شكل بيضاوي داخل مستطيل؛ ونوع 'circle' القديم المحفوظ يبقى كما هو.)
  class TrueCircleDrawing extends Drawing {
    constructor(points, style) { super('circlerad', points, style); }
    _geom(mgr) { const [c, e] = this.px(mgr); return { c, e, r: Math.hypot(e.x - c.x, e.y - c.y) }; }
    render(ctx, mgr, selected) {
      if (this.points.length < 2) return;
      const { c, r } = this._geom(mgr);
      this.applyStrokeStyle(ctx);
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      if (this.filled) { ctx.fillStyle = this.color; ctx.globalAlpha = (this.fillOpacity != null ? this.fillOpacity : this.opacity); ctx.fill(); ctx.globalAlpha = this.opacity; }
      ctx.stroke(); this.resetCtx(ctx); this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) {
      if (this.points.length < 2) return false;
      const { c, r } = this._geom(mgr), d = Math.hypot(x - c.x, y - c.y);
      return this.filled ? d <= r + LINE_HIT_TOL : Math.abs(d - r) <= LINE_HIT_TOL;
    }
    setHandlePixel(idx, x, y, mgr) {
      const { c, e } = this._geom(mgr);
      if (idx === 0) { const dx = x - c.x, dy = y - c.y; this.points[0] = mgr.toData(x, y); this.points[1] = mgr.toData(e.x + dx, e.y + dy); } // تحريك المركز بنفس نصف القطر
      else this.points[1] = mgr.toData(x, y);
    }
  }

  // ---- Arrow --------------------------------------------------------------------
  class ArrowDrawing extends Drawing {
    constructor(points, style) { super('arrow', points, style); }
    _head(ctx, tipX, tipY, angle) {
      const headLen = this.arrowHeadSize + this.width * 2;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - headLen * Math.cos(angle - Math.PI / 7), tipY - headLen * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(tipX - headLen * Math.cos(angle + Math.PI / 7), tipY - headLen * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fillStyle = this.color;
      ctx.fill();
    }
    render(ctx, mgr, selected) {
      if (this.points.length < 2) return;
      const [a, b] = this.px(mgr);
      this.applyStrokeStyle(ctx);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      this.resetCtx(ctx);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (this.arrowDirection === 'end' || this.arrowDirection === 'both') this._head(ctx, b.x, b.y, angle);
      if (this.arrowDirection === 'start' || this.arrowDirection === 'both') this._head(ctx, a.x, a.y, angle + Math.PI);
      this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) {
      if (this.points.length < 2) return false;
      const [a, b] = this.px(mgr);
      return Geo.distToSegment(x, y, a.x, a.y, b.x, b.y) <= LINE_HIT_TOL + 4;
    }
  }

  // ---- Path (free multi-point polyline) --------------------------------------------
  class PathDrawing extends Drawing {
    constructor(points, style) {
      super('path', points, style);
      if (!(style && style.arrowDirection)) this.arrowDirection = 'none';
    }
    _head(ctx, tipX, tipY, angle) {
      const headLen = this.arrowHeadSize + this.width * 2;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - headLen * Math.cos(angle - Math.PI / 7), tipY - headLen * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(tipX - headLen * Math.cos(angle + Math.PI / 7), tipY - headLen * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fillStyle = this.color;
      ctx.fill();
    }
    render(ctx, mgr, selected) {
      if (this.points.length < 2) return;
      const pts = this.px(mgr);
      this.applyStrokeStyle(ctx);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      this.resetCtx(ctx);
      if (this.arrowDirection === 'end' || this.arrowDirection === 'both') {
        const p1 = pts[pts.length - 2], p2 = pts[pts.length - 1];
        this._head(ctx, p2.x, p2.y, Math.atan2(p2.y - p1.y, p2.x - p1.x));
      }
      if (this.arrowDirection === 'start' || this.arrowDirection === 'both') {
        const p1 = pts[1], p2 = pts[0];
        this._head(ctx, p2.x, p2.y, Math.atan2(p2.y - p1.y, p2.x - p1.x));
      }
      this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) {
      const pts = this.px(mgr);
      for (let i = 0; i < pts.length - 1; i++) {
        if (Geo.distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= LINE_HIT_TOL) return true;
      }
      return false;
    }
  }

  // ---- Curve (quadratic bezier through 3 points: start, end, bend) ------------------
  class CurveDrawing extends Drawing {
    constructor(points, style) { super('curve', points, style); }
    render(ctx, mgr, selected) {
      if (this.points.length < 3) {
        if (this.points.length === 2) {
          const [a, b] = this.px(mgr);
          this.applyStrokeStyle(ctx);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          this.resetCtx(ctx);
        }
        return;
      }
      const [a, c, b] = this.px(mgr); // start, control(3rd click), end
      this.applyStrokeStyle(ctx);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.stroke();
      this.resetCtx(ctx);
      this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) {
      if (this.points.length < 3) return false;
      const [a, c, b] = this.px(mgr);
      // sample the quadratic curve
      let prev = a;
      for (let t = 0.05; t <= 1.0001; t += 0.05) {
        const xt = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x;
        const yt = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y;
        if (Geo.distToSegment(x, y, prev.x, prev.y, xt, yt) <= LINE_HIT_TOL) return true;
        prev = { x: xt, y: yt };
      }
      return false;
    }
  }

  // ---- Text label ----------------------------------------------------------------
  class TextDrawing extends Drawing {
    constructor(points, style) {
      super('text', points, style);
      this.text = (style && style.text) || 'Text';
    }
    _font() {
      return (this.italic ? 'italic ' : '') + (this.bold ? '700 ' : '600 ') + this.fontSize + 'px ' + this.fontFamily;
    }
    render(ctx, mgr, selected) {
      if (this.points.length < 1) return;
      const p = mgr.toPixel(this.points[0]);
      ctx.font = this._font();
      const txt = this.text || 'Text';
      const w = ctx.measureText(txt).width;
 if (this.showBackground) {
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.bgFillStyle();
        ctx.fillRect(p.x - 4, p.y - 4, w + 8, this.fontSize + 8);
        if (this.borderColor) { ctx.strokeStyle = this.borderColor; ctx.lineWidth = 1; ctx.strokeRect(p.x - 4, p.y - 4, w + 8, this.fontSize + 8); }
      }
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = this.color;
      ctx.textBaseline = 'top';
      ctx.fillText(txt, p.x, p.y);
      if (this.underline) { ctx.strokeStyle = this.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y + this.fontSize + 2); ctx.lineTo(p.x + w, p.y + this.fontSize + 2); ctx.stroke(); }
      if (this.strike) { ctx.strokeStyle = this.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y + this.fontSize / 2); ctx.lineTo(p.x + w, p.y + this.fontSize / 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
      if (selected) {
        ctx.strokeStyle = this.color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.strokeRect(p.x - 4, p.y - 4, w + 8, this.fontSize + 8);
        ctx.setLineDash([]);
      }
    }
    hitTest(x, y, mgr) {
      if (this.points.length < 1) return false;
      const p = mgr.toPixel(this.points[0]);
      const w = Math.max(30, (this.text || 'Text').length * this.fontSize * 0.6);
      return Geo.pointInRect(x, y, p.x - 4, p.y - 4, p.x + w + 4, p.y + this.fontSize + 8);
    }
    getHandlePixels(mgr) { return [mgr.toPixel(this.points[0])]; }
    setHandlePixel(idx, x, y, mgr) { this.points[0] = mgr.toData(x, y); }
  }

  // ---- Label (Text variant with a pointer nub, always-on background, anchored) -------
  class LabelDrawing extends TextDrawing {
    constructor(points, style) {
      super(points, Object.assign({ showBackground: true, bgColor: '#151d2f' }, style));
      this.type = 'label';
      this.text = (style && style.text) || 'Label';
    }
    render(ctx, mgr, selected) {
      if (this.points.length < 1) return;
      const p = mgr.toPixel(this.points[0]);
      ctx.font = this._font();
      const txt = this.text || 'Label';
      const w = ctx.measureText(txt).width;
 const boxY = p.y - this.fontSize - 16;
ctx.globalAlpha = this.opacity;
ctx.fillStyle = this.bgFillStyle();
ctx.beginPath();
      ctx.moveTo(p.x - 6, boxY);
      ctx.lineTo(p.x + w + 10, boxY);
      ctx.lineTo(p.x + w + 10, boxY + this.fontSize + 10);
      ctx.lineTo(p.x + 6, boxY + this.fontSize + 10);
      ctx.lineTo(p.x, boxY + this.fontSize + 18);
      ctx.lineTo(p.x - 6, boxY + this.fontSize + 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = this.color;
      ctx.textBaseline = 'top';
      ctx.fillText(txt, p.x, boxY + 5);
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = this.color; ctx.fill();
      if (selected) {
        ctx.strokeStyle = this.color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.strokeRect(p.x - 6, boxY, w + 16, this.fontSize + 18);
        ctx.setLineDash([]);
      }
    }
    hitTest(x, y, mgr) {
      if (this.points.length < 1) return false;
      const p = mgr.toPixel(this.points[0]);
      const w = Math.max(30, (this.text || 'Label').length * this.fontSize * 0.6);
      const boxY = p.y - this.fontSize - 16;
      return Geo.pointInRect(x, y, p.x - 6, boxY, p.x + w + 10, p.y);
    }
  }

  // ---- Measure tool (price / percent / bars / time / pips between 2 points) ------------
  class MeasureDrawing extends Drawing {
    constructor(points, style) { super('measure', points, style); }
    render(ctx, mgr, selected) {
      if (this.points.length < 2) return;
      const [a, b] = this.px(mgr);
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
      const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
      
const p0 = this.points[0], p1 = this.points[1];
      const up = p1.price >= p0.price;
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = up ? '#26a69a' : '#ef5350';
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.globalAlpha = 1;
      
      
      this.applyStrokeStyle(ctx);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      this.resetCtx(ctx);

      const priceDiff = p1.price - p0.price;
      const pct = p0.price ? (priceDiff / p0.price) * 100 : 0;
      const bars = mgr.barsBetween(p0.time, p1.time);
      const pip = Math.abs(priceDiff) / 0.0001;
      const timeStr = mgr.formatDuration(p0.time, p1.time);
      const lines = [
        (up ? '+' : '') + Geo.fmt(priceDiff, mgr.priceDecimals()) + '  (' + (up ? '+' : '') + Geo.fmt(pct, 2) + '%)',
        bars + ' bars \u00B7 ' + timeStr,
        '\u2248 ' + Geo.fmt(pip, 1) + ' pips'
      ];
      ctx.font = '600 11px -apple-system, Segoe UI, Arial';
      const midX = (a.x + b.x) / 2;
      const boxW = Math.max(...lines.map(l => ctx.measureText(l).width)) + 14;
      const boxY = Math.min(a.y, b.y) - 54;
      ctx.fillStyle = up ? 'rgba(38,166,154,0.92)' : 'rgba(239,83,80,0.92)';
      ctx.fillRect(midX - boxW / 2, boxY, boxW, 48);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'top';
      lines.forEach((l, i) => {
        ctx.font = i === 0 ? '700 11px -apple-system, Segoe UI, Arial' : '500 10px -apple-system, Segoe UI, Arial';
        ctx.fillText(l, midX - boxW / 2 + 7, boxY + 5 + i * 14);
      });
      this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) {
      if (this.points.length < 2) return false;
      const [a, b] = this.px(mgr);
      return Geo.pointNearRectBorder(x, y, a.x, a.y, b.x, b.y, LINE_HIT_TOL) || Geo.pointInRect(x, y, a.x, a.y, b.x, b.y);
    }
  }

  // ---- Long / Short Position tool (entry / target / stop, R:R calc) -------------------
  class PositionDrawing extends Drawing {
    constructor(points, style, isLong) {
      super(isLong ? 'long' : 'short', points, style);
      this.isLong = isLong;
      // Position sizing — 'units' is literal qty; 'contracts'/'lots' apply contractMultiplier
      // (per-instrument, since a forex lot / futures contract size isn't knowable generically —
      // set contractMultiplier in the Trade tab to match your instrument).
      this.sizeUnit = (style && style.sizeUnit) || 'units';
      this.contractMultiplier = (style && style.contractMultiplier) || 1;
      // entry/target/stop already loaded from saved style if present (base Drawing constructor).
      // Only compute defaults for a brand-new drawing (no saved levels yet).
      if (this.entry == null && points && points.length >= 2) this.updateFromDraftPoints();
    }

    // Recomputes entry/target/stop live from the two draft points — called on every
    // mousemove while the tool is still being drawn (see DrawingManager._onMouseMove),
    // so the zone updates in real time instead of freezing at the first click.
    updateFromDraftPoints() {
      const p0 = this.points[0], p1 = this.points[1];
      if (!p0 || !p1 || p0.price == null || p1.price == null) return;
      this.entry = p0.price;
      this.target = this.isLong ? Math.max(p0.price, p1.price) : Math.min(p0.price, p1.price);
      const diff = Math.abs(p1.price - p0.price) * 0.5;
      this.stop = this.isLong ? p0.price - diff : p0.price + diff;
    }
    // معاملات الصفقة المحفوظة داخل extra.pos (تُحفظ تلقائياً مع الرسم)
    _pp() {
      const e = this.extra || (this.extra = {});
      if (!e.pos) e.pos = {};
      const d = { accountSize: 10000, riskPct: 1, leverage: 1, lockRR: false, lockedRR: null, sizeByRisk: false, qtyPrecision: 3 };
      for (const k in d) if (e.pos[k] === undefined) e.pos[k] = d[k];
      return e.pos;
    }
    _calcInput() {
      const pp = this._pp();
      return {
        side: this.isLong ? 'long' : 'short',
        entry: this.entry, stop: this.stop, target: this.target,
        qty: this.qty, lotSize: this.contractMultiplier || 1,
        tickSize: this._tick || 0.01, leverage: pp.leverage,
        accountSize: pp.accountSize, riskPct: pp.riskPct, qtyPrecision: pp.qtyPrecision
      };
    }
    // عند تفعيل "الحجم من المخاطرة" يُعاد حساب الكمية مع كل تعديل للمستويات
    _syncQty() {
      const pp = this._pp();
      if (!pp.sizeByRisk || !window.TVPositionCalc) return;
      const q = TVPositionCalc.sizeFromRisk(this._calcInput());
      if (q > 0) this.qty = q;
    }
    metrics() {
      this._syncQty();
      const c = window.TVPositionCalc ? TVPositionCalc.compute(this._calcInput()) : null;
      const risk = Math.abs(this.entry - this.stop);
      const reward = Math.abs(this.target - this.entry);
      const size = this.qty * this.contractMultiplier;
      const riskPct = this.entry ? (risk / this.entry) * 100 : 0;
      const rewardPct = this.entry ? (reward / this.entry) * 100 : 0;
      return {
        risk, reward, rr: risk ? (reward / risk) : 0,
        riskPct, rewardPct,
        riskAmount: risk * size, rewardAmount: reward * size,
        profitPct: rewardPct, lossPct: riskPct,
        profitUsd: reward * size, lossUsd: risk * size,
        positionSize: size,
        riskTicks: c ? c.riskTicks : 0, rewardTicks: c ? c.rewardTicks : 0,
        margin: c ? c.margin : 0, marginExceedsAccount: c ? c.marginExceedsAccount : false,
        validDirection: c ? c.validDirection : true,
        riskPctOfAccount: c ? c.riskPctOfAccount : 0
      };
    }
    _zonePixels(mgr) {
      const [a, b] = this.px(mgr);
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x) + 90;
      const entryY = mgr.series.priceToCoordinate(this.entry) ?? a.y;
      const targetY = mgr.series.priceToCoordinate(this.target) ?? (this.isLong ? a.y - 60 : a.y + 60);
      const stopY = mgr.series.priceToCoordinate(this.stop) ?? (this.isLong ? a.y + 30 : a.y - 30);
      return { x1, x2, entryY, targetY, stopY };
    }
render(ctx, mgr, selected) {
      if (this.points.length < 1) return;
      
      
     this._tick = Math.pow(10, -(mgr.priceDecimals() || 2));
     const { x1, x2, entryY, targetY, stopY } = this._zonePixels(mgr);
ctx.globalAlpha = this.opacity;
ctx.fillStyle = this.profitColor;
ctx.fillRect(x1, Math.min(entryY, targetY), x2 - x1, Math.abs(entryY - targetY));
ctx.fillStyle = this.lossColor;
ctx.fillRect(x1, Math.min(entryY, stopY), x2 - x1, Math.abs(entryY - stopY));
ctx.globalAlpha = 1;
      
      
      ctx.strokeStyle = this.borderColor || this.color;
      ctx.lineWidth = this.width;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x1, entryY); ctx.lineTo(x2, entryY); ctx.stroke();

      const m = this.metrics();
      ctx.fillStyle = this.textColor;
      ctx.font = '700 11px -apple-system, Segoe UI, Arial';
      ctx.fillText((this.isLong ? 'Long' : 'Short') + '  ' + Geo.fmt(m.positionSize, 2) + ' ' + this.sizeUnit, x1 + 4, entryY - 40);
      ctx.font = '500 10px -apple-system, Segoe UI, Arial';
      ctx.fillStyle = this.profitColor;
      ctx.fillText('TP ' + Geo.fmt(this.target, mgr.priceDecimals()) + '  +' + Geo.fmt(m.profitUsd, 2) + ' (' + Geo.fmt(m.profitPct, 2) + '%) ' + Geo.fmt(m.rewardTicks, 0) + ' pts', x1 + 4, targetY + (this.isLong ? -4 : 12));
      ctx.fillStyle = this.lossColor;
      ctx.fillText('SL ' + Geo.fmt(this.stop, mgr.priceDecimals()) + '  -' + Geo.fmt(m.lossUsd, 2) + ' (' + Geo.fmt(m.lossPct, 2) + '%) ' + Geo.fmt(m.riskTicks, 0) + ' pts', x1 + 4, stopY + (this.isLong ? 12 : -4));
      ctx.fillStyle = this.textColor;
      ctx.fillText('R:R 1:' + m.rr.toFixed(2) + '   Risk $' + Geo.fmt(m.riskAmount, 2), x1 + 4, entryY - 26);
      ctx.fillText('Entry ' + Geo.fmt(this.entry, mgr.priceDecimals()) + (m.validDirection ? '' : '  ⚠ مستويات غير منطقية'), x1 + 4, entryY - 12);

      this._drawZoneHandle(ctx, x2 - 10, entryY, selected);
      this._drawZoneHandle(ctx, x2 - 10, targetY, selected);
      this._drawZoneHandle(ctx, x2 - 10, stopY, selected);
    }
    _drawZoneHandle(ctx, x, y, selected) {
      if (!selected) return;
      ctx.beginPath(); ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = this.color; ctx.stroke();
    }
    hitTest(x, y, mgr) {
      const { x1, x2, targetY, stopY } = this._zonePixels(mgr);
      return Geo.pointInRect(x, y, x1, Math.min(targetY, stopY), x2, Math.max(targetY, stopY));
    }
    // 3 independently draggable handles: entry / target / stop (resizable zones)
    getHandlePixels(mgr) {
      const { x2, entryY, targetY, stopY } = this._zonePixels(mgr);
      return [{ x: x2 - 10, y: entryY }, { x: x2 - 10, y: targetY }, { x: x2 - 10, y: stopY }];
    }
    setHandlePixel(idx, x, y, mgr) {
      const price = mgr.series.coordinateToPrice(y);
      if (price === null) return;
      const pp = this._pp();
      // عند قفل R:R تُثبَّت النسبة لحظة بدء السحب (أول استدعاء) ثم تُطبَّق على المستوى الآخر
      if (pp.lockRR && !pp.lockedRR) {
        const r0 = Math.abs(this.entry - this.stop);
        pp.lockedRR = r0 > 0 ? Math.abs(this.target - this.entry) / r0 : null;
      }
      if (idx === 0) { this.entry = price; this.points[0] = mgr.toData(mgr.toPixel(this.points[0]).x, y); }
      else if (idx === 1) this.target = price;
      else if (idx === 2) this.stop = price;
      if (pp.lockRR && pp.lockedRR && window.TVPositionCalc && idx !== 0) {
        const r = TVPositionCalc.applyRRLock(
          { side: this.isLong ? 'long' : 'short', entry: this.entry, stop: this.stop, target: this.target },
          idx === 2 ? 'stop' : 'target', pp.lockedRR);
        this.stop = r.stop; this.target = r.target;
      }
    }
    moveByPixels(dx, dy, mgr) {
      super.moveByPixels(dx, dy, mgr);
      const entryPx = mgr.toPixel({ time: this.points[0].time, price: this.entry });
      const newEntryPrice = mgr.series.coordinateToPrice(entryPx.y + dy);
      const newTargetPrice = mgr.series.coordinateToPrice((mgr.series.priceToCoordinate(this.target) || 0) + dy);
      const newStopPrice = mgr.series.coordinateToPrice((mgr.series.priceToCoordinate(this.stop) || 0) + dy);
      if (newEntryPrice !== null) this.entry = newEntryPrice;
      if (newTargetPrice !== null) this.target = newTargetPrice;
      if (newStopPrice !== null) this.stop = newStopPrice;
    }
  }

  // ---- Fibonacci Retracement (editable levels) -------------------------------------
  class FibDrawing extends Drawing {
    constructor(points, style) { super('fib', points, style); }
   render(ctx, mgr, selected) {
      if (this.points.length < 2) return;
      const [a, b] = this.px(mgr);
      const x1 = Math.min(a.x, b.x);
      const x2 = this.extendRight ? mgr.width : Math.max(a.x, b.x);
      ctx.globalAlpha = this.opacity;
      ctx.font = '500 10px -apple-system, Segoe UI, Arial';
      this.fibLevels.forEach(lvl => {
        if (!lvl.enabled) return;
        const ratio = this.reverse ? (1 - lvl.value) : lvl.value;
        const y = a.y + (b.y - a.y) * ratio;
        ctx.strokeStyle = lvl.color;
        ctx.lineWidth = lvl.width || this.width;
        if (lvl.lineStyle === 'dashed') ctx.setLineDash([(lvl.width || this.width) * 3, (lvl.width || this.width) * 2]);
        else if (lvl.lineStyle === 'dotted') ctx.setLineDash([(lvl.width || this.width), (lvl.width || this.width) * 2]);
        else ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        ctx.setLineDash([]);
        if (this.showFibValues) {
          ctx.fillStyle = lvl.color;
          ctx.fillText(lvl.value.toFixed(3) + '  ' + Geo.fmt(a.price !== undefined ? a.price : this.points[0].price + (this.points[1].price - this.points[0].price) * ratio, mgr.priceDecimals()), x2 + 4, y - 10);
        }
      });
      ctx.globalAlpha = 1;
      this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) {
      if (this.points.length < 2) return false;
      const [a, b] = this.px(mgr);
      const x1 = Math.min(a.x, b.x), x2 = this.extendRight ? mgr.width : Math.max(a.x, b.x);
      if (x < x1 - 4 || x > x2 + 4) return false;
      return this.fibLevels.some(lvl => {
        if (!lvl.enabled) return false;
        const ratio = this.reverse ? (1 - lvl.value) : lvl.value;
        const ly = a.y + (b.y - a.y) * ratio;
        return Math.abs(ly - y) <= LINE_HIT_TOL;
      });
    }
  }


  // ------------------------------------------------------------------
  // أدوات Fibonacci/Gann/Annotation الإضافية — الهندسة في tv-draw-geom.js
  // ------------------------------------------------------------------
  function _lvlStroke(ctx, lvl, baseW) {
    const w = lvl.width || baseW;
    ctx.strokeStyle = lvl.color; ctx.lineWidth = w;
    if (lvl.lineStyle === 'dashed') ctx.setLineDash([w * 3, w * 2]);
    else if (lvl.lineStyle === 'dotted') ctx.setLineDash([w, w * 2]);
    else ctx.setLineDash([]);
  }
  function _seg(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function _extendTo(l, xEnd) { // يمدّ القطعة إلى xEnd بنفس الميل
    if (l.x2 === l.x1) return l;
    const m = (l.y2 - l.y1) / (l.x2 - l.x1);
    return { x1: l.x1, y1: l.y1, x2: xEnd, y2: l.y1 + m * (xEnd - l.x1) };
  }
  function _priceAt(d, mgr, ratioPoint) { return mgr.series.coordinateToPrice(ratioPoint); }

  class FibChannelDrawing extends Drawing {
    constructor(points, style) { super('fibchannel', points, style); }
    _geom(mgr) {
      const p = this.px(mgr); if (p.length < 3) return null;
      const lv = this.fibLevels.filter(l => l.enabled);
      return { lv, lines: TVDrawGeom.channelLines(p[0], p[1], p[2], lv.map(l => l.value)) };
    }
    render(ctx, mgr, selected) {
      const p = this.px(mgr); if (p.length < 2) return;
      ctx.globalAlpha = this.opacity;
      const g = this._geom(mgr);
      if (!g) { ctx.strokeStyle = this.color; ctx.lineWidth = this.width; ctx.setLineDash([]); _seg(ctx, p[0].x, p[0].y, p[1].x, p[1].y); }
      else {
        ctx.font = '500 10px -apple-system, Segoe UI, Arial';
        g.lines.forEach((l, i) => {
          const lvl = g.lv[i]; const e = this.extendRight ? _extendTo(l, mgr.width) : l;
          _lvlStroke(ctx, lvl, this.width); _seg(ctx, e.x1, e.y1, e.x2, e.y2); ctx.setLineDash([]);
          if (this.showFibValues) { ctx.fillStyle = lvl.color; ctx.fillText(String(lvl.value), e.x2 + 4, e.y2 - 4); }
        });
      }
      ctx.globalAlpha = 1; this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) {
      const g = this._geom(mgr); if (!g) { const p = this.px(mgr); return p.length > 1 && TVDrawGeom.distToSegment(x, y, p[0].x, p[0].y, p[1].x, p[1].y) <= LINE_HIT_TOL; }
      return g.lines.some(l => { const e = this.extendRight ? _extendTo(l, mgr.width) : l; return TVDrawGeom.distToSegment(x, y, e.x1, e.y1, e.x2, e.y2) <= LINE_HIT_TOL; });
    }
  }

  class FibFanDrawing extends Drawing {
    constructor(points, style) { super('fibfan', points, style); }
    _rays(mgr) {
      const p = this.px(mgr); if (p.length < 2) return null;
      const lv = this.fibLevels.filter(l => l.enabled && l.value > 0);
      return { p, lv, rays: TVDrawGeom.fanRays(p[0], p[1], lv.map(l => l.value), mgr.width) };
    }
    render(ctx, mgr, selected) {
      const r = this._rays(mgr); if (!r) return;
      ctx.globalAlpha = this.opacity; ctx.font = '500 10px -apple-system, Segoe UI, Arial';
      ctx.strokeStyle = this.color; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); _seg(ctx, r.p[0].x, r.p[0].y, r.p[1].x, r.p[1].y); ctx.setLineDash([]);
      r.rays.forEach((ray, i) => {
        const lvl = r.lv[i]; _lvlStroke(ctx, lvl, this.width); _seg(ctx, ray.x1, ray.y1, ray.x2, ray.y2); ctx.setLineDash([]);
        if (this.showFibValues) { ctx.fillStyle = lvl.color; ctx.fillText(String(lvl.value), ray.tx + 3, ray.ty - 3); }
      });
      ctx.globalAlpha = 1; this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) {
      const r = this._rays(mgr); if (!r) return false;
      return r.rays.some(ray => TVDrawGeom.distToSegment(x, y, ray.x1, ray.y1, ray.x2, ray.y2) <= LINE_HIT_TOL);
    }
  }

  class FibTimeZoneDrawing extends Drawing {
    constructor(points, style) { super('fibtimezone', points, style); }
    _zones(mgr) { const p = this.px(mgr); return p.length < 2 ? null : TVDrawGeom.timeZoneXs(p[0].x, p[1].x).filter(z => z.x > -50 && z.x < mgr.width + 50); }
    render(ctx, mgr, selected) {
      const z = this._zones(mgr); if (!z) return;
      ctx.globalAlpha = this.opacity; ctx.font = '500 10px -apple-system, Segoe UI, Arial';
      ctx.strokeStyle = this.color; ctx.lineWidth = this.width;
      if (this.lineStyle === 'dashed') ctx.setLineDash([6, 4]); else if (this.lineStyle === 'dotted') ctx.setLineDash([2, 3]); else ctx.setLineDash([]);
      z.forEach(q => { _seg(ctx, q.x, 0, q.x, mgr.height); });
      ctx.setLineDash([]); ctx.fillStyle = this.color;
      if (this.showFibValues) z.forEach(q => ctx.fillText(String(q.f), q.x + 3, 12));
      ctx.globalAlpha = 1; this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) { const z = this._zones(mgr); return !!z && z.some(q => Math.abs(q.x - x) <= LINE_HIT_TOL); }
  }

  class GannBoxDrawing extends Drawing {
    constructor(points, style) { super('gannbox', points, style); }
    render(ctx, mgr, selected) {
      const p = this.px(mgr); if (p.length < 2) return;
      const [a, b] = p; const g = TVDrawGeom.gannBox(a, b);
      ctx.globalAlpha = this.opacity;
      if (this.filled) { ctx.fillStyle = Geo.hexToRgba(this.color, 0.08); ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); }
      ctx.strokeStyle = this.color; ctx.lineWidth = this.width; ctx.setLineDash([]);
      g.xs.forEach(q => _seg(ctx, q.x, a.y, q.x, b.y));
      g.ys.forEach(q => _seg(ctx, a.x, q.y, b.x, q.y));
      ctx.lineWidth = Math.max(1, this.width - 1); ctx.setLineDash([5, 3]);
      _seg(ctx, a.x, a.y, b.x, b.y); _seg(ctx, a.x, b.y, b.x, a.y); ctx.setLineDash([]);
      if (this.showFibValues) { ctx.fillStyle = this.color; ctx.font = '500 10px -apple-system, Segoe UI, Arial'; g.xs.forEach(q => ctx.fillText(String(q.k), q.x + 2, Math.min(a.y, b.y) - 4)); }
      ctx.globalAlpha = 1; this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) {
      const p = this.px(mgr); if (p.length < 2) return false; const [a, b] = p; const g = TVDrawGeom.gannBox(a, b);
      return g.xs.some(q => TVDrawGeom.distToSegment(x, y, q.x, a.y, q.x, b.y) <= LINE_HIT_TOL) ||
             g.ys.some(q => TVDrawGeom.distToSegment(x, y, a.x, q.y, b.x, q.y) <= LINE_HIT_TOL) ||
             TVDrawGeom.distToSegment(x, y, a.x, a.y, b.x, b.y) <= LINE_HIT_TOL || TVDrawGeom.distToSegment(x, y, a.x, b.y, b.x, a.y) <= LINE_HIT_TOL;
    }
  }

  class PinDrawing extends Drawing {
    constructor(points, style) { super('pin', points, style); }
    render(ctx, mgr, selected) {
      const p = this.px(mgr); if (!p.length) return; const { x, y } = p[0];
      ctx.globalAlpha = this.opacity; ctx.fillStyle = this.color; ctx.strokeStyle = this.color; ctx.lineWidth = 2;
      _seg(ctx, x, y, x, y - 14); ctx.beginPath(); ctx.arc(x, y - 20, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 20, 2.5, 0, Math.PI * 2); ctx.fill();
      if (this.text) { ctx.font = '500 ' + this.fontSize + 'px ' + this.fontFamily; ctx.fillStyle = this.textColor; ctx.fillText(this.text, x + 12, y - 17); }
      ctx.globalAlpha = 1; this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) { const p = this.px(mgr); return !!p.length && Math.hypot(x - p[0].x, y - (p[0].y - 20)) <= 11 || (!!p.length && TVDrawGeom.distToSegment(x, y, p[0].x, p[0].y, p[0].x, p[0].y - 14) <= LINE_HIT_TOL); }
  }

  class PriceLabelDrawing extends Drawing {
    constructor(points, style) { super('pricelabel', points, style); }
    _box(mgr) {
      const p = this.px(mgr); if (!p.length) return null;
      const price = this.points[0].price, label = Geo.fmt(price, mgr.priceDecimals());
      return { x: p[0].x, y: p[0].y, label, w: label.length * 7 + 14, h: 20 };
    }
    render(ctx, mgr, selected) {
      const b = this._box(mgr); if (!b) return;
      ctx.globalAlpha = this.opacity; ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + 6, b.y - b.h / 2); ctx.lineTo(b.x + 6 + b.w, b.y - b.h / 2); ctx.lineTo(b.x + 6 + b.w, b.y + b.h / 2); ctx.lineTo(b.x + 6, b.y + b.h / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '600 11px -apple-system, Segoe UI, Arial'; ctx.fillText(b.label, b.x + 13, b.y + 4);
      ctx.globalAlpha = 1; this.drawHandles(ctx, mgr, selected);
    }
    hitTest(x, y, mgr) { const b = this._box(mgr); return !!b && x >= b.x - 4 && x <= b.x + 6 + b.w && y >= b.y - b.h / 2 && y <= b.y + b.h / 2; }
  }

  const CTORS = {
    trendline: (pts, style) => new TrendLine(pts, style),
    extline: (pts, style) => new TrendLine(pts, Object.assign({ extendLeft: true, extendRight: true }, style)),
    ray: (pts, style) => new Ray(pts, style),
    hline: (pts, style) => new HLine(pts, style),
    vline: (pts, style) => new VLine(pts, style),
    infoline: (pts, style) => new InfoLine(pts, style),
    measure: (pts, style) => new MeasureDrawing(pts, style),
    rect: (pts, style) => new RectDrawing(pts, style, false),
    erect: (pts, style) => new RectDrawing(pts, style, true),
    circle: (pts, style) => new CircleDrawing(pts, style),
    ellipse: (pts, style) => new CircleDrawing(pts, style),
    circlerad: (pts, style) => new TrueCircleDrawing(pts, style),
    arrow: (pts, style) => new ArrowDrawing(pts, style),
    path: (pts, style) => new PathDrawing(pts, style),
    curve: (pts, style) => new CurveDrawing(pts, style),
    text: (pts, style) => new TextDrawing(pts, style),
    label: (pts, style) => new LabelDrawing(pts, style),
    long: (pts, style) => new PositionDrawing(pts, style, true),
    short: (pts, style) => new PositionDrawing(pts, style, false),
    fib: (pts, style) => new FibDrawing(pts, style),
    fibchannel: (pts, style) => new FibChannelDrawing(pts, style),
    fibfan: (pts, style) => new FibFanDrawing(pts, style),
    fibtimezone: (pts, style) => new FibTimeZoneDrawing(pts, style),
    gannbox: (pts, style) => new GannBoxDrawing(pts, style),
    pin: (pts, style) => new PinDrawing(pts, style),
    pricelabel: (pts, style) => new PriceLabelDrawing(pts, style),
    fibext: (pts, style) => new FibDrawing(pts, Object.assign({}, style, {
      fibLevels: (style && style.fibLevels) || Drawing.defaultFibLevels().map(l => ({ ...l, enabled: l.value >= 1 }))
    }))
  };

  const POINTS_REQUIRED = {
    trendline: 2, extline: 2, ray: 2, hline: 1, vline: 1, infoline: 2, measure: 2,
    rect: 2, erect: 2, circle: 2, circlerad: 2, ellipse: 2, arrow: 2, path: Infinity, curve: 3, text: 1, label: 1,
    long: 2, short: 2, fib: 2, fibext: 2,
    fibchannel: 3, fibfan: 2, fibtimezone: 2, gannbox: 2, pin: 1, pricelabel: 1
  };

  // Categorized tool menu — matches TradingView's grouped drawer.
  // Items with soon:true are shown (so the category isn't silently missing)
  // but are visually disabled — real engineering work not yet done for those.
  const TOOL_GROUPS = [
    {
      label: 'Trend Tools', items: [
        { id: 'trendline', label: 'Trend Line', icon: '\u2571' },
        { id: 'ray', label: 'Ray', icon: '\u279A' },
        { id: 'extline', label: 'Extended Line', icon: '\u2194' },
        { id: 'infoline', label: 'Info Line', icon: '\u2139' },
        { id: 'hline', label: 'Horizontal Line', icon: '\u2015' },
        { id: 'vline', label: 'Vertical Line', icon: '\u2502' },
        { id: 'arrow', label: 'Arrow', icon: '\u2197' },
        { id: 'curve', label: 'Curve', icon: '\u301C' },
        { id: 'path', label: 'Path', icon: '\u2301' }
      ]
    },
    {
      label: 'Fibonacci & Gann', items: [
        { id: 'fib', label: 'Fibonacci Retracement', icon: 'Fib' },
        { id: 'fibext', label: 'Fibonacci Extension', icon: 'Ext' },
        { id: 'fibchannel', label: 'Fib Channel', icon: 'Ch' },
        { id: 'fibfan', label: 'Fib Speed Fan', icon: 'Fan' },
        { id: 'fibtimezone', label: 'Fib Time Zone', icon: 'Tz' },
        { id: 'gannbox', label: 'Gann Box', icon: 'Gn' }
      ]
    },
    {
      label: 'Geometric Shapes', items: [
        { id: 'rect', label: 'Rectangle', icon: '\u25AD' },
        { id: 'erect', label: 'Extended Rectangle', icon: '\u25AC' },
        { id: 'circlerad', label: 'Circle', icon: '\u25EF' },
        { id: 'ellipse', label: 'Ellipse', icon: '\u2B2D' }
      ]
    },
    {
      label: 'Annotation Tools', items: [
        { id: 'text', label: 'Text', icon: 'T' },
        { id: 'label', label: 'Label', icon: 'L\u25CF' },
        { id: 'pin', label: 'Pin', icon: '\u{1F4CD}' },
        { id: 'pricelabel', label: 'Price Label', icon: '$' }
      ]
    },
    {
      label: 'Position Tools', items: [
        { id: 'long', label: 'Long Position', icon: 'L' },
        { id: 'short', label: 'Short Position', icon: 'S' }
      ]
    },
    {
      label: 'Measurement Tools', items: [
        { id: 'measure', label: 'Measure', icon: '\u21D4' }
      ]
    },
  ];
  const TOOL_META = {};
  TOOL_GROUPS.forEach(g => g.items.forEach(it => { if (!TOOL_META[it.id]) TOOL_META[it.id] = it; }));

  global.__DT_INTERNAL__ = {
    Drawing, Geo, CTORS, POINTS_REQUIRED, TOOL_GROUPS, TOOL_META,
    HANDLE_HIT_R, LINE_HIT_TOL, styleFromJSON
  };
  global.DrawingTools = { init: null };

})(window);

/* =========================================================================
   PART 2 — DrawingManager: single draw button, categorized tool menu,
   generic multi-click point placement (supports 1/2/3/∞ point tools),
   floating toolbar, full settings sheet, color picker, persistence.
   ========================================================================= */

(function (global) {
  'use strict';

const {
    Geo, CTORS, POINTS_REQUIRED, TOOL_GROUPS, TOOL_META,
    HANDLE_HIT_R, LINE_HIT_TOL, styleFromJSON
  } = global.__DT_INTERNAL__;

  let activeColorPickerOwner = null;
function bindDraggableGeneric(handle, target) {
    if (!handle || !target) return;
    let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      const r = target.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; sl = r.left; st = r.top;
      target.style.position = 'fixed'; target.style.margin = '0';
      target.style.left = sl + 'px'; target.style.top = st + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      const w = target.offsetWidth, h = target.offsetHeight;
      target.style.left = Math.max(4, Math.min(sl + dx, window.innerWidth - w - 4)) + 'px';
      target.style.top = Math.max(4, Math.min(st + dy, window.innerHeight - h - 4)) + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }
  global.__DT_bindDraggableGeneric = bindDraggableGeneric;
  class DrawingManager {
constructor(opts) {
    this.chart = opts.chart;
    this.series = opts.series;
    this.container = opts.container;
    this.storageKey = opts.storageKey || 'tv_clone_drawings_v1';
    this.toolbarContainer = opts.toolbarContainer || null;

      this.drawings = [];
      this.selected = null;
      this.activeTool = 'cursor';
      this.draft = null;          // { drawing, required }
      this.dragMode = null;
      this.dragHandleIdx = null;
      this.dragStart = null;
      this.clipboard = null;
      this.width = 0;
      this.height = 0;
      this._pendingColor = '#2962FF';
this._toolStylesKey = 'dt_tool_styles_' + this.storageKey;
this._toolStyles = this._loadToolStyles();
this._toolMenuPos = null;

      this.magnetMode = localStorage.getItem('dt_magnet_mode') || 'off'; // off|weak|normal|strong
      this.favoriteTools = JSON.parse(localStorage.getItem('dt_favorite_tools') || '[]');
      this.recentTools = JSON.parse(localStorage.getItem('dt_recent_tools') || '[]');

      this._undoStack = [];
      this._redoStack = [];
      this._suspendHistory = false;

this._buildOverlay();
this._buildDrawButton();
this._buildToolMenu();
this._buildFloatingToolbar();
this._buildSettingsModal();
this._buildObjectTree();
this._buildFavBar();
      
      this._bindEvents();

      this._resizeToContainer();
this._load();
this._pushHistory(true);
this._loop();

this._boundResize = () => this._resizeToContainer();
window.addEventListener('resize', this._boundResize);
if (window.ResizeObserver) {
  this._resizeObserver = new ResizeObserver(() => this._resizeToContainer());
  this._resizeObserver.observe(this.container);
}
}

destroy() {
  if (this._boundResize) window.removeEventListener('resize', this._boundResize);
  if (this._resizeObserver) this._resizeObserver.disconnect();
  if (this._boundMouseMove) window.removeEventListener('mousemove', this._boundMouseMove);
  if (this._boundMouseUp) window.removeEventListener('mouseup', this._boundMouseUp);
  if (this._boundKeyDown) window.removeEventListener('keydown', this._boundKeyDown);
 [this.drawBtn, this.toolMenu, this.floatingToolbar, this.settingsOverlay, this.objectTreeOverlay, this.canvas, this.favBarEl]
.forEach(el => { if (el && el.parentNode) el.parentNode.removeChild(el); });
  const list = global.DrawingTools.managers;
  const idx = list.indexOf(this);
  if (idx >= 0) list.splice(idx, 1);
  if (global.DrawingTools.manager === this) global.DrawingTools.manager = list[0] || null;
  if (global.DrawingTools.activeManager === this) global.DrawingTools.activeManager = null;
  if (activeColorPickerOwner === this) activeColorPickerOwner = null;
}

// ---------------------------------------------------------- data helpers
toPixel(point) {
      let x = null, y = null;
      try { x = this.chart.timeScale().timeToCoordinate(point.time); } catch (e) { x = null; }
      if ((x === null || x === undefined) && point._logical != null) {
        try { x = this.chart.timeScale().logicalToCoordinate(point._logical); } catch (e) { x = null; }
      }
      if (x === null || x === undefined) x = point._fallbackX || 0;
      try { y = this.series.priceToCoordinate(point.price); } catch (e) { y = null; }
      if (y === null || y === undefined) y = point._fallbackY || 0;
      return { x, y };
    }
    toData(x, y) {
      let time = null, price = null, logical = null;
      try { time = this.chart.timeScale().coordinateToTime(x); } catch (e) {}
      try { logical = this.chart.timeScale().coordinateToLogical(x); } catch (e) {}
      try { price = this.series.coordinateToPrice(y); } catch (e) {}
      const point = { time, price };
      if (logical !== null && logical !== undefined) point._logical = logical;
      if (time === null && logical !== null && logical !== undefined) {
        const extrapolated = this._extrapolateTime(logical);
        if (extrapolated !== null) point.time = extrapolated;
      }
      if (point.time === null || point.time === undefined) point._fallbackX = x;
      if (price === null) point._fallbackY = y;
      return point;
    }
    // Estimates a real epoch-seconds Time for a logical index beyond the last known bar,
    // using the current timeframe's bar interval. Falls back silently (returns null) if
    // no bar data is available yet — toPixel then uses the logical-coordinate path instead.
    _extrapolateTime(logical) {
      try {
        const bars = (typeof window.visibleData !== 'undefined' && window.visibleData.length)
          ? window.visibleData
          : (typeof window.allData !== 'undefined' ? window.allData : null);
        if (!bars || !bars.length) return null;
        const lastIdx = bars.length - 1;
        const lastBar = bars[lastIdx];
        const barSec = this.timeframeMinutes() * 60;
        const stepsAhead = logical - lastIdx;
        return (this._toMs(lastBar.time) / 1000) + stepsAhead * barSec;
      } catch (e) { return null; }
    }
    priceDecimals() { return 5; }

    // Reads the real candle interval from your #timeframeSelect (values are in
    // minutes, as set up in backtest.js), so bar counts / measure math are exact
    // instead of assumed. Falls back to 1 minute if the element isn't found.
    timeframeMinutes() {
      const el = document.getElementById('timeframeSelect');
      const v = el ? parseFloat(el.value) : NaN;
      return isNaN(v) || v <= 0 ? 1 : v;
    }
    _toMs(t) { return typeof t === 'number' ? (t > 2e10 ? t : t * 1000) : Date.parse(t); }
    formatTime(t) {
      try {
        if (t == null) return '';
        const d = new Date(this._toMs(t));
        return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }) + ' ' +
               d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      } catch (e) { return String(t); }
    }
    barsBetween(t1, t2) {
      try {
        const diffMs = Math.abs(this._toMs(t2) - this._toMs(t1));
        const barMs = this.timeframeMinutes() * 60000;
        return Math.max(1, Math.round(diffMs / barMs));
      } catch (e) { return 0; }
    }
    formatDuration(t1, t2) {
      try {
        let diffMs = Math.abs(this._toMs(t2) - this._toMs(t1));
        const days = Math.floor(diffMs / 86400000); diffMs -= days * 86400000;
        const hours = Math.floor(diffMs / 3600000); diffMs -= hours * 3600000;
        const mins = Math.floor(diffMs / 60000);
        const parts = [];
        if (days) parts.push(days + 'd');
        if (hours) parts.push(hours + 'h');
        if (mins || !parts.length) parts.push(mins + 'm');
        return parts.join(' ');
      } catch (e) { return ''; }
    }

    // ---------------------------------------------------------- magnet mode
    // Snaps a raw pixel position to the nearest candle's O/H/L/C when a
    // drawing tool is actively placing a point. Reads bars from the
    // project's own `visibleData`/`allData` globals (set in backtest.js).
    _magnetTolerancePx() {
      return { weak: 6, normal: 14, strong: 28 }[this.magnetMode] || 0;
    }
    applyMagnet(x, y) {
      if (this.magnetMode === 'off') return this.toData(x, y);
      const bars = (typeof window.visibleData !== 'undefined' && window.visibleData.length)
        ? window.visibleData
        : (typeof window.allData !== 'undefined' ? window.allData : null);
      if (!bars || !bars.length) return this.toData(x, y);

      const rawTime = this.chart.timeScale().coordinateToTime(x);
      if (rawTime === null) return this.toData(x, y);
      // find nearest bar by time
      let nearest = bars[0], bestDiff = Infinity;
      for (let i = 0; i < bars.length; i++) {
        const diff = Math.abs(bars[i].time - rawTime);
        if (diff < bestDiff) { bestDiff = diff; nearest = bars[i]; }
        else if (diff > bestDiff && bars[i].time > rawTime) break; // bars are time-sorted
      }
      const candidates = [nearest.open, nearest.high, nearest.low, nearest.close];
      const py = this.series.priceToCoordinate;
      let bestPrice = candidates[0], bestPxDiff = Infinity;
      candidates.forEach(price => {
        const cy = this.series.priceToCoordinate(price);
        if (cy === null) return;
        const d = Math.abs(cy - y);
        if (d < bestPxDiff) { bestPxDiff = d; bestPrice = price; }
      });
      const tol = this._magnetTolerancePx();
      if (bestPxDiff <= tol) return { time: nearest.time, price: bestPrice };
      return { time: nearest.time, price: this.series.coordinateToPrice(y) };
    }

    // ---------------------------------------------------------- undo / redo
    _snapshot() { return JSON.stringify(this.drawings.map(d => d.toJSON())); }
    _pushHistory(isInitial) {
      if (this._suspendHistory) return;
      const snap = this._snapshot();
      if (!isInitial && this._undoStack.length && this._undoStack[this._undoStack.length - 1] === snap) return;
      this._undoStack.push(snap);
      if (this._undoStack.length > 60) this._undoStack.shift();
      this._redoStack = [];
    }
    _restoreSnapshot(json) {
      const { CTORS, styleFromJSON } = global.__DT_INTERNAL__;
      this._suspendHistory = true;
      const arr = JSON.parse(json);
      this.drawings = arr.map(item => {
        const ctor = CTORS[item.type];
        if (!ctor) return null;
        const d = ctor(item.points, styleFromJSON(item));
        d.id = item.id; d.locked = !!item.locked; d.hidden = !!item.hidden; d.extra = item.extra || {};
        return d;
      }).filter(Boolean);
      this.select(null);
      this._suspendHistory = false;
      this._save(true);
      this._refreshObjectTree();
    }
    undo() {
      if (this._undoStack.length < 2) return;
      this._redoStack.push(this._undoStack.pop());
      this._restoreSnapshot(this._undoStack[this._undoStack.length - 1]);
    }
    redo() {
      if (!this._redoStack.length) return;
      const snap = this._redoStack.pop();
      this._undoStack.push(snap);
      this._restoreSnapshot(snap);
    }

    // ---------------------------------------------------------- overlay canvas
    _buildOverlay() {
      this.container.style.position = this.container.style.position || 'relative';
      const canvas = document.createElement('canvas');
      canvas.id = 'dtOverlay';
      Object.assign(canvas.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none', zIndex: '5' });
      this.container.appendChild(canvas);
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
    }
    _resizeToContainer() {
      const rect = this.container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.width = rect.width; this.height = rect.height;
      this.canvas.style.width = rect.width + 'px';
      this.canvas.style.height = rect.height + 'px';
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ---------------------------------------------------------- single draw button
_buildDrawButton() {
  const btn = document.createElement('button');
  btn.id = 'dtDrawBtn';
  btn.title = 'Drawing Tools';
  btn.innerHTML = '<span class="dtDrawBtnIcon">\u270F\uFE0F</span>';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    global.DrawingTools.activeManager = this;
    if (this.activeTool !== 'cursor') {
      this.setActiveTool('cursor');
      return;
    }
    this._toggleToolMenu();
  });
  this.drawBtnIcon = btn.querySelector('.dtDrawBtnIcon');
  if (this.toolbarContainer) {
    this.toolbarContainer.appendChild(btn);
  } else {
    const controlsBar = document.getElementById('tvTopBar') || document.getElementById('controls');
    if (controlsBar) controlsBar.insertBefore(btn, controlsBar.firstChild);
    else document.body.appendChild(btn);
  }
  this.drawBtn = btn;
}
_updateDrawButton() {
    const meta = TOOL_META[this.activeTool];
    const icon = this.drawBtnIcon;
      if (this.activeTool === 'cursor') {
        icon.textContent = '\u270F\uFE0F';
        this.drawBtn.classList.remove('active');
      } else {
        icon.textContent = meta ? meta.icon : '\u270F\uFE0F';
        this.drawBtn.classList.add('active');
      }
    }

    // ---------------------------------------------------------- tool menu (popup)
    _makeToolItem(t) {
      const item = document.createElement('button');
      item.className = 'dt-menu-item' + (t.soon ? ' soon' : '');
      item.dataset.tool = t.id;
      item.disabled = !!t.soon;
      item.innerHTML =
        '<span class="dt-menu-icon">' + t.icon + '</span>' +
        '<span class="dt-menu-text">' + t.label + '</span>' +
        (t.soon ? '<span class="dt-menu-soon">Soon</span>' :
          '<button class="dt-menu-star' + (this.favoriteTools.includes(t.id) ? ' active' : '') + '" data-star="' + t.id + '">\u2605</button>');
      if (!t.soon) {
        item.addEventListener('click', () => {
          const targetId = t.aliasOf || t.id;
          this._registerRecentTool(targetId);
          this.setActiveTool(targetId);
          this._closeToolMenu();
        });
        item.querySelector('.dt-menu-star').addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggleFavorite(t.id);
        });
      }
      return item;
    }

_toggleFavorite(id) {
      const idx = this.favoriteTools.indexOf(id);
      const wasEmpty = this.favoriteTools.length === 0;
      const adding = idx < 0;
      if (idx >= 0) this.favoriteTools.splice(idx, 1); else this.favoriteTools.push(id);
      localStorage.setItem('dt_favorite_tools', JSON.stringify(this.favoriteTools));
      this._rebuildToolMenuLists();
      // عند إضافة أول عنصر مفضلة (والشريط مغلق)، أظهره تلقائياً وفوراً —
      // بدل انتظار المستخدم يفتحه يدوياً من قائمة الأدوات.
      if (adding && this.favBarEl && this.favBarEl.classList.contains('hidden')) {
        this.favBarEl.classList.remove('hidden');
        localStorage.setItem(this._favBarVisKey(), '1');
      }
      this._renderFavBar();
    }
    
    
    _registerRecentTool(id) {
      this.recentTools = [id, ...this.recentTools.filter(t => t !== id)].slice(0, 6);
      localStorage.setItem('dt_recent_tools', JSON.stringify(this.recentTools));
    }

 _buildToolMenu() {
    const menu = document.createElement('div');
    menu.id = 'dtToolMenu';
    menu.className = 'hidden';
    
    const dragHandle = document.createElement('div');
    dragHandle.className = 'dt-menu-drag-handle';
    dragHandle.innerHTML = '<span></span>';
    menu.appendChild(dragHandle);
    this._bindDragElement(dragHandle, menu, (pos) => { this._toolMenuPos = pos; });
    
    const search = document.createElement('input');
      search.type = 'text';
      search.id = 'dtToolSearch';
      search.placeholder = 'Search tools\u2026';
      search.addEventListener('input', () => this._rebuildToolMenuLists(search.value.trim().toLowerCase()));
      menu.appendChild(search);

      const listsWrap = document.createElement('div');
      listsWrap.id = 'dtToolMenuLists';
     menu.appendChild(listsWrap);
this.toolMenuListsEl = listsWrap;
      const magnetRow = document.createElement('div');
      magnetRow.className = 'dt-menu-magnet-row';
      magnetRow.innerHTML = '<span>\u{1F9F2} Magnet</span><div class="dt-menu-magnet-opts">' +
        ['off', 'weak', 'normal', 'strong'].map(m =>
          '<button class="dt-magnet-opt' + (this.magnetMode === m ? ' active' : '') + '" data-magnet="' + m + '">' + m + '</button>').join('') +
        '</div>';
      magnetRow.querySelectorAll('.dt-magnet-opt').forEach(b => {
        b.addEventListener('click', () => {
          this.magnetMode = b.dataset.magnet;
          localStorage.setItem('dt_magnet_mode', this.magnetMode);
          magnetRow.querySelectorAll('.dt-magnet-opt').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
        });
      });
      menu.appendChild(magnetRow);

   const footer = document.createElement('div');
      footer.className = 'dt-menu-footer';
      footer.innerHTML =
        '<button class="dt-menu-footer-btn" id="dtFavBarToggleBtn">\u2B50 \u0634\u0631\u064a\u0637 \u0627\u0644\u0645\u0641\u0636\u0644\u0629</button>' +
        '<button class="dt-menu-footer-btn" id="dtObjectTreeBtn">\u{1F5C2} Object Tree</button>' +
        '<button class="dt-menu-footer-btn" id="dtHideAllBtn">\u{1F441} Show/Hide All</button>' +
        '<button class="dt-menu-footer-btn" id="dtClearAllBtn">\u{1F5D1} Remove All</button>';
      menu.appendChild(footer);

      document.body.appendChild(menu);
      this.toolMenu = menu;

      menu.querySelector('#dtFavBarToggleBtn').addEventListener('click', () => { this._toggleFavBar(); this._closeToolMenu(); });
      menu.querySelector('#dtObjectTreeBtn').addEventListener('click', () => { this._openObjectTree(); this._closeToolMenu(); });
      menu.querySelector('#dtHideAllBtn').addEventListener('click', () => { this.toggleHideAll(); this._closeToolMenu(); });
      menu.querySelector('#dtClearAllBtn').addEventListener('click', () => { this.clearAll(); this._closeToolMenu(); });

      document.addEventListener('click', (e) => {
        if (!menu.classList.contains('hidden') && !menu.contains(e.target) && e.target !== this.drawBtn) {
          this._closeToolMenu();
        }
      });

      this._rebuildToolMenuLists();
    }

_rebuildToolMenuLists(filter) {
    const wrap = this.toolMenuListsEl;
      if (!wrap) return;
      wrap.innerHTML = '';
      const allItems = [];
      TOOL_GROUPS.forEach(g => g.items.forEach(it => allItems.push(it)));

      const addGroup = (label, items) => {
        if (!items.length) return;
        const g = document.createElement('div');
        g.className = 'dt-menu-group';
        const h = document.createElement('div');
        h.className = 'dt-menu-group-label';
        h.textContent = label;
        g.appendChild(h);
        const list = document.createElement('div');
        list.className = 'dt-menu-list';
        items.forEach(t => list.appendChild(this._makeToolItem(t)));
        g.appendChild(list);
        wrap.appendChild(g);
      };

      if (filter) {
        const matches = allItems.filter(it => it.label.toLowerCase().includes(filter));
        addGroup('Results', matches);
        return;
      }

      if (this.favoriteTools.length) {
        addGroup('Favorites', allItems.filter(it => this.favoriteTools.includes(it.id)));
      }
      if (this.recentTools.length) {
        addGroup('Recently Used', this.recentTools.map(id => TOOL_META[id]).filter(Boolean));
      }
      TOOL_GROUPS.forEach(group => addGroup(group.label, group.items));
    }
// دالة سحب عامة — تُستخدم لأي عنصر عائم (قائمة الأدوات/شريط المفضلة)
    // حتى يتحكم المستخدم بمكانه بحرية بدل موضع ثابت محسوب مسبقاً.
    _bindDragElement(handle, targetEl, onMove) {
      let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
      const onDown = (e) => {
        if (e.target.closest('.dt-favbar-close')) return;
        dragging = true;
        const p = e.touches ? e.touches[0] : e;
        const rect = targetEl.getBoundingClientRect();
        startX = p.clientX; startY = p.clientY;
        startLeft = rect.left; startTop = rect.top;
        targetEl.style.bottom = 'auto';
        e.preventDefault();
      };
      const onDrag = (e) => {
        if (!dragging) return;
        const p = e.touches ? e.touches[0] : e;
        const dx = p.clientX - startX, dy = p.clientY - startY;
        const w = targetEl.offsetWidth, h = targetEl.offsetHeight;
        const left = Math.max(4, Math.min(startLeft + dx, window.innerWidth - w - 4));
        const top = Math.max(4, Math.min(startTop + dy, window.innerHeight - h - 4));
        targetEl.style.left = left + 'px';
        targetEl.style.top = top + 'px';
        if (onMove) onMove({ left, top });
      };
      const onUp = () => { dragging = false; };
      handle.addEventListener('mousedown', onDown);
      handle.addEventListener('touchstart', onDown, { passive: false });
      window.addEventListener('mousemove', onDrag);
      window.addEventListener('touchmove', onDrag, { passive: false });
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchend', onUp);
    }
// ---------------------------------------------------------- شريط الأدوات المفضلة العائم
    _favBarVisKey() { return 'dt_favbar_visible_' + this.storageKey; }
    _favBarPosKey() { return 'dt_favbar_pos_' + this.storageKey; }

    _buildFavBar() {
      const bar = document.createElement('div');
      bar.id = 'dtFavBar';
      bar.className = 'hidden';

      const handle = document.createElement('div');
      handle.className = 'dt-favbar-handle';
      handle.innerHTML = '<span>\u270F\uFE0F \u0627\u0644\u0645\u0641\u0636\u0644\u0629</span>';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'dt-favbar-close';
      closeBtn.textContent = '\u2715';
      closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this._toggleFavBar(); });
      handle.appendChild(closeBtn);
      bar.appendChild(handle);

      const list = document.createElement('div');
      list.className = 'dt-favbar-list';
      bar.appendChild(list);
      this.favBarListEl = list;

      document.body.appendChild(bar);
      this.favBarEl = bar;
      this._bindDragElement(handle, bar, (pos) => localStorage.setItem(this._favBarPosKey(), JSON.stringify(pos)));

      let pos = null;
      try { pos = JSON.parse(localStorage.getItem(this._favBarPosKey()) || 'null'); } catch (e) {}
      if (pos) { bar.style.left = pos.left + 'px'; bar.style.top = pos.top + 'px'; }
      else { bar.style.left = '14px'; bar.style.top = '80px'; }

      if (localStorage.getItem(this._favBarVisKey()) === '1') {
        this._renderFavBar();
        bar.classList.remove('hidden');
      }
    }

    _toggleFavBar() {
      if (!this.favBarEl) this._buildFavBar();
      const showing = !this.favBarEl.classList.contains('hidden');
      if (showing) {
        this.favBarEl.classList.add('hidden');
        localStorage.setItem(this._favBarVisKey(), '0');
      } else {
        this._renderFavBar();
        this.favBarEl.classList.remove('hidden');
        localStorage.setItem(this._favBarVisKey(), '1');
      }
    }

    _renderFavBar() {
      if (!this.favBarListEl) return;
      this.favBarListEl.innerHTML = '';
      if (!this.favoriteTools.length) {
        const empty = document.createElement('div');
        empty.className = 'dt-favbar-empty';
        empty.textContent = '\u0623\u0636\u0641 \u0623\u062f\u0648\u0627\u062a \u0644\u0644\u0645\u0641\u0636\u0644\u0629 (\u2605) \u0645\u0646 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0631\u0633\u0645';
        this.favBarListEl.appendChild(empty);
        return;
      }
      this.favoriteTools.forEach(id => {
        const meta = TOOL_META[id];
        if (!meta) return;
        const btn = document.createElement('button');
        btn.className = 'dt-favbar-item' + (this.activeTool === id ? ' active' : '');
        btn.title = meta.label;
        btn.textContent = meta.icon;
        btn.addEventListener('click', () => {
          this._registerRecentTool(id);
          this.setActiveTool(id);
        });
        this.favBarListEl.appendChild(btn);
      });
    }

    _toggleToolMenu() {
      this.toolMenu.classList.contains('hidden') ? this._openToolMenu() : this._closeToolMenu();
    }

  
_openToolMenu() {
  // لو المستخدم سحب القائمة سابقاً لمكان معيّن، افتحها بنفس المكان
  // بدل إعادة حسابها من موضع زر القلم من جديد.
  if (this._toolMenuPos) {
    this.toolMenu.style.left = this._toolMenuPos.left + 'px';
    this.toolMenu.style.top = this._toolMenuPos.top + 'px';
    this.toolMenu.style.bottom = 'auto';
  } else {
    const r = this.drawBtn.getBoundingClientRect();
    const menuW = 250;
    let left = r.left + r.width / 2 - menuW / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - menuW - 10));
    this.toolMenu.style.left = left + 'px';
    
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    
    if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
      // فيه مساحة كافية تحت الزر — افتحها للأسفل (الوضع الطبيعي بعد
      // نقل الزر للشريط العلوي)
      this.toolMenu.style.top = Math.max(10, r.bottom + 8) + 'px';
      this.toolMenu.style.bottom = 'auto';
    } else {
      // مساحة أعلى الزر أكبر — افتحها للأعلى، لكن مثبّتة داخل حدود
      // الشاشة دائماً (لا تنزلق خارج viewport أبداً)
      this.toolMenu.style.bottom = Math.min(window.innerHeight - r.top + 8, window.innerHeight - 10) + 'px';
      this.toolMenu.style.top = 'auto';
    }
  }
  this.toolMenu.classList.remove('hidden');
  this._rebuildToolMenuLists();
  this.toolMenu.querySelectorAll('.dt-menu-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tool === this.activeTool);
  });
}
    _closeToolMenu() { this.toolMenu.classList.add('hidden'); }

 setActiveTool(id) {
  this._cancelDraft();
  this.activeTool = id;
  if (id !== 'cursor') this.select(null);
  this._updateDrawButton();
  this.canvas.style.cursor = (id === 'cursor') ? 'default' : 'crosshair';
  this._renderFavBar();
}

    // ---------------------------------------------------------- floating toolbar
    _buildFloatingToolbar() {
      const bar = document.createElement('div');
      bar.id = 'dtFloatingToolbar';
      bar.className = 'hidden';
      bar.innerHTML =
        '<button class="dt-ft-btn" id="dtColorSwatch" title="Color"><span class="dt-swatch" id="dtSwatchPreview"></span></button>' +
        '<select class="dt-ft-select" id="dtWidthSelect" title="Line Width">' +
        '<option value="1">1px</option><option value="2" selected>2px</option>' +
        '<option value="3">3px</option><option value="4">4px</option><option value="6">6px</option></select>' +
        '<select class="dt-ft-select" id="dtStyleSelect" title="Line Style">' +
        '<option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select>' +
        '<button class="dt-ft-btn" id="dtSettingsBtn" title="Settings">\u2699</button>' +
        '<button class="dt-ft-btn" id="dtLockBtn" title="Lock">\u{1F512}</button>' +
        '<button class="dt-ft-btn" id="dtHideBtn" title="Hide">\u{1F441}</button>' +
        '<button class="dt-ft-btn" id="dtForwardBtn" title="Bring Forward">\u2B06</button>' +
        '<button class="dt-ft-btn" id="dtBackwardBtn" title="Send Backward">\u2B07</button>' +
        '<button class="dt-ft-btn" id="dtCloneBtn" title="Clone">\u29C9</button>' +
        '<button class="dt-ft-btn" id="dtDeleteBtn" title="Delete">\u{1F5D1}</button>';
      document.body.appendChild(bar);
      this.floatingToolbar = bar;

      bar.querySelector('#dtWidthSelect').addEventListener('change', e => {
        if (this.selected) { this.selected.width = parseInt(e.target.value, 10); this._save(); }
      });
      bar.querySelector('#dtStyleSelect').addEventListener('change', e => {
        if (this.selected) { this.selected.lineStyle = e.target.value; this._save(); }
      });
      bar.querySelector('#dtLockBtn').addEventListener('click', () => {
        if (this.selected) {
          this.selected.locked = !this.selected.locked;
          bar.querySelector('#dtLockBtn').classList.toggle('activeBtn', this.selected.locked);
          this._save();
        }
      });
      bar.querySelector('#dtHideBtn').addEventListener('click', () => {
        if (this.selected) { this.selected.hidden = true; this._save(); this._syncFloatingToolbar(); }
      });
      bar.querySelector('#dtForwardBtn').addEventListener('click', () => this.bringForward());
      bar.querySelector('#dtBackwardBtn').addEventListener('click', () => this.sendBackward());
      bar.querySelector('#dtCloneBtn').addEventListener('click', () => this.cloneSelected());
      bar.querySelector('#dtDeleteBtn').addEventListener('click', () => this.deleteSelected());
      bar.querySelector('#dtColorSwatch').addEventListener('click', (e) => {
        e.stopPropagation(); this._openColorPickerFor(this.selected);
      });
      bar.querySelector('#dtSettingsBtn').addEventListener('click', (e) => {
        e.stopPropagation(); this._openSettingsModal();
      });
    }

    bringForward() {
      if (!this.selected) return;
      const i = this.drawings.indexOf(this.selected);
      if (i < 0 || i === this.drawings.length - 1) return;
      [this.drawings[i], this.drawings[i + 1]] = [this.drawings[i + 1], this.drawings[i]];
      this._save();
    }
    sendBackward() {
      if (!this.selected) return;
      const i = this.drawings.indexOf(this.selected);
      if (i <= 0) return;
      [this.drawings[i], this.drawings[i - 1]] = [this.drawings[i - 1], this.drawings[i]];
      this._save();
    }

    _syncFloatingToolbar() {
      const bar = this.floatingToolbar;
      if (!this.selected || this.selected.hidden) { bar.classList.add('hidden'); return; }
      const box = this.selected.boundingBoxPixels(this);
      const cr = this.container.getBoundingClientRect();
      let top = cr.top + Math.min(box.y1, box.y2) - 46;
      if (top < 8) top = cr.top + Math.max(box.y1, box.y2) + 10;
      let left = cr.left + (box.x1 + box.x2) / 2 - (bar.offsetWidth || 260) / 2;
      left = Math.max(cr.left + 4, Math.min(left, cr.right - (bar.offsetWidth || 260) - 4));
      bar.style.top = top + 'px'; bar.style.left = left + 'px';
      bar.classList.remove('hidden');

      bar.querySelector('#dtSwatchPreview').style.background = this.selected.color;
      bar.querySelector('#dtWidthSelect').value = String(this.selected.width);
      bar.querySelector('#dtStyleSelect').value = this.selected.lineStyle;
      bar.querySelector('#dtLockBtn').classList.toggle('activeBtn', this.selected.locked);
    }

    // ---------------------------------------------------------- settings modal (Style / Coordinates / Text tabs)
    _buildSettingsModal() {
      const overlay = document.createElement('div');
      overlay.id = 'dtSettingsOverlay';
      overlay.className = 'hidden';
      overlay.innerHTML =
        '<div id="dtSettingsModal">' +
        '  <div class="dt-sm-header">' +
        '    <div class="dt-sm-title" id="dtSmTitle">Settings</div>' +
        '    <button class="dt-sm-close" id="dtSmClose">\u2715</button>' +
        '  </div>' +
        '  <div class="dt-sm-tabs" id="dtSmTabs"></div>' +
        '  <div class="dt-sm-body" id="dtSmBody"></div>' +
        '  <div class="dt-sm-footer">' +
        '    <button class="dt-sm-btn primary" id="dtSmOk">Apply</button>' +
        '    <button class="dt-sm-btn" id="dtSmCancel">Cancel</button>' +
        '  </div>' +
        '</div>';
document.body.appendChild(overlay);
this.settingsOverlay = overlay;
this.smTitleEl = overlay.querySelector('#dtSmTitle');
this.smTabsEl = overlay.querySelector('#dtSmTabs');
this.smBodyEl = overlay.querySelector('#dtSmBody');
this._buildTemplatesBar(overlay.querySelector('.dt-sm-header'));
overlay.querySelector('#dtSmClose').addEventListener('click', () => this._closeSettingsModal());
bindDraggableGeneric(overlay.querySelector('.dt-sm-header'), overlay.querySelector('#dtSettingsModal'));


      overlay.querySelector('#dtSmCancel').addEventListener('click', () => this._closeSettingsModal());
      overlay.querySelector('#dtSmOk').addEventListener('click', () => { this._save(); this._closeSettingsModal(); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeSettingsModal(); });
    }

    // ---------------------------------------------------------- object tree
    _buildObjectTree() {
      const overlay = document.createElement('div');
      overlay.id = 'dtObjectTreeOverlay';
      overlay.className = 'hidden';
      overlay.innerHTML =
        '<div id="dtObjectTree">' +
        '  <div class="dt-ot-header">' +
        '    <div class="dt-sm-title">Object Tree</div>' +
        '    <button class="dt-sm-close" id="dtOtClose">\u2715</button>' +
        '  </div>' +
        '  <input type="text" id="dtOtSearch" placeholder="Search drawings\u2026">' +
        '  <div id="dtOtList"></div>' +
        '</div>';
document.body.appendChild(overlay);
this.objectTreeOverlay = overlay;
this.otListEl = overlay.querySelector('#dtOtList');
overlay.querySelector('#dtOtClose').addEventListener('click', () => this._closeObjectTree());
bindDraggableGeneric(overlay.querySelector('.dt-ot-header'), overlay.querySelector('#dtObjectTree'));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeObjectTree(); });
      overlay.querySelector('#dtOtSearch').addEventListener('input', (e) => this._refreshObjectTree(e.target.value.trim().toLowerCase()));
    }
    _openObjectTree() { this.objectTreeOverlay.classList.remove('hidden'); this._refreshObjectTree(); }
    _closeObjectTree() { this.objectTreeOverlay.classList.add('hidden'); }

    _renderObjectRow(d, filter) {
      const name = d.customName || (TOOL_META[d.type] ? TOOL_META[d.type].label : d.type);
      const row = document.createElement('div');
      row.className = 'dt-ot-row' + (d === this.selected ? ' active' : '');
  row.innerHTML =
  '<span class="dt-ot-icon">' + (TOOL_META[d.type] ? TOOL_META[d.type].icon : '\u25CF') + '</span>' +
  '<input class="dt-ot-name" value="' + name.replace(/"/g, '&quot;') + '">' +
  '<button class="dt-ot-btn" data-act="color" title="Color">\u{1F3A8}</button>' +
  '<button class="dt-ot-btn" data-act="duplicate" title="Duplicate">\u29C9</button>' +
  '<button class="dt-ot-btn" data-act="group" title="Move to group">\u{1F4C1}</button>' +
  '<button class="dt-ot-btn" data-act="lock">' + (d.locked ? '\u{1F512}' : '\u{1F513}') + '</button>' +
  '<button class="dt-ot-btn" data-act="hide">' + (d.hidden ? '\u{1F576}' : '\u{1F441}') + '</button>' +
  '<button class="dt-ot-btn" data-act="delete">\u{1F5D1}</button>';

row.querySelector('[data-act="color"]').addEventListener('click', (e) => {
  e.stopPropagation();
  this._openColorPickerFor(d);
});
row.querySelector('[data-act="duplicate"]').addEventListener('click', (e) => {
  e.stopPropagation();
  this._duplicateDrawing(d);
  this._refreshObjectTree(filter);
});
      row.querySelector('.dt-ot-name').addEventListener('change', (e) => { d.customName = e.target.value; this._save(); });
      row.querySelector('.dt-ot-name').addEventListener('click', (e) => e.stopPropagation());
      row.addEventListener('click', () => { this.select(d); this._refreshObjectTree(filter); });
      row.querySelector('[data-act="group"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const g = prompt('Move to group (blank = Ungrouped):', d.groupName || '');
        if (g !== null) { d.groupName = g.trim(); this._save(); this._refreshObjectTree(filter); }
      });
      row.querySelector('[data-act="lock"]').addEventListener('click', (e) => { e.stopPropagation(); d.locked = !d.locked; this._save(); this._refreshObjectTree(filter); });
      row.querySelector('[data-act="hide"]').addEventListener('click', (e) => { e.stopPropagation(); d.hidden = !d.hidden; this._save(); this._refreshObjectTree(filter); });
      row.querySelector('[data-act="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        this.drawings = this.drawings.filter(x => x !== d);
        if (this.selected === d) this.select(null);
        this._save();
        this._refreshObjectTree(filter);
      });
      return row;
    }

    _refreshObjectTree(filter) {
     if (!this.objectTreeOverlay) return;
const list = this.otListEl;
      if (!list) return;
      list.innerHTML = '';
      const rows = this.drawings.slice().reverse(); // top of list = most recently drawn (front-most)
      const matched = rows.filter(d => {
        const name = d.customName || (TOOL_META[d.type] ? TOOL_META[d.type].label : d.type);
        return !filter || name.toLowerCase().includes(filter);
      });
      if (!matched.length) { list.innerHTML = '<div class="dt-ot-empty">No drawings yet</div>'; return; }

      const groups = {};
      matched.forEach(d => {
        const key = d.groupName || 'Ungrouped';
        (groups[key] = groups[key] || []).push(d);
      });
      const groupNames = Object.keys(groups).sort((a, b) => (a === 'Ungrouped') - (b === 'Ungrouped') || a.localeCompare(b));

      groupNames.forEach(gName => {
        if (gName !== 'Ungrouped' || groupNames.length > 1) {
          const header = document.createElement('div');
          header.className = 'dt-ot-group-header';
          header.innerHTML = '<span>\u{1F4C1} ' + gName + '</span>' +
            '<span class="dt-ot-group-actions">' +
            '<button class="dt-ot-btn" data-gact="hide" title="Hide group">\u{1F441}</button>' +
            '<button class="dt-ot-btn" data-gact="lock" title="Lock group">\u{1F512}</button>' +
            '<button class="dt-ot-btn" data-gact="delete" title="Delete group">\u{1F5D1}</button></span>';
          header.querySelector('[data-gact="hide"]').addEventListener('click', () => {
            const anyVisible = groups[gName].some(d => !d.hidden);
            groups[gName].forEach(d => d.hidden = anyVisible);
            this._save(); this._refreshObjectTree(filter);
          });
          header.querySelector('[data-gact="lock"]').addEventListener('click', () => {
            const anyUnlocked = groups[gName].some(d => !d.locked);
            groups[gName].forEach(d => d.locked = anyUnlocked);
            this._save(); this._refreshObjectTree(filter);
          });
          header.querySelector('[data-gact="delete"]').addEventListener('click', () => {
            if (!confirm('Delete all drawings in "' + gName + '"?')) return;
            this.drawings = this.drawings.filter(d => !groups[gName].includes(d));
            this.select(null); this._save(); this._refreshObjectTree(filter);
          });
          list.appendChild(header);
        }
        groups[gName].forEach(d => list.appendChild(this._renderObjectRow(d, filter)));
      });
    }

_openSettingsModal() {
    if (!this.selected) return;
    const d = this.selected;
    const tabsEl = this.smTabsEl;
    const bodyEl = this.smBodyEl;
    this.smTitleEl.textContent = (TOOL_META[d.type] ? TOOL_META[d.type].label : d.type) + ' Settings';

      const tabs = ['Style', 'Coordinates', 'Visibility'];
if (d.type === 'text' || d.type === 'label' || d.type === 'rect' || d.type === 'erect' || d.type === 'trendline') tabs.push('Text');
     
      if (d.type === 'fib' || d.type === 'fibext' || d.type === 'fibchannel' || d.type === 'fibfan') tabs.push('Levels');
      if (d.type === 'long' || d.type === 'short') tabs.push('Trade');

      tabsEl.innerHTML = tabs.map((t, i) => '<button class="dt-sm-tab' + (i === 0 ? ' active' : '') + '" data-tab="' + t + '">' + t + '</button>').join('');
      tabsEl.querySelectorAll('.dt-sm-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          tabsEl.querySelectorAll('.dt-sm-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._renderSettingsTab(btn.dataset.tab, d, bodyEl);
        });
      });
  this._renderSettingsTab(tabs[0], d, bodyEl);
if (this._templatesBarRefresh) this._templatesBarRefresh();
this.settingsOverlay.classList.remove('hidden');
}
    
    _buildTemplatesBar(headerEl) {
      const bar = document.createElement('div');
      bar.className = 'dt-sm-templates-bar';
      const sel = document.createElement('select');
      sel.className = 'dt-sm-templates-select';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'dt-sm-footer-btn'; saveBtn.textContent = '\u{1F4BE} حفظ';
      const renameBtn = document.createElement('button');
      renameBtn.className = 'dt-sm-footer-btn'; renameBtn.textContent = '\u270F\uFE0F';
      const delBtn = document.createElement('button');
      delBtn.className = 'dt-sm-footer-btn'; delBtn.textContent = '\u{1F5D1}';
      const defBtn = document.createElement('button');
      defBtn.className = 'dt-sm-footer-btn'; defBtn.textContent = '\u2B50';

      const refresh = () => {
        if (!this.selected) return;
        const all = this.listTemplates(this.selected.type);
        sel.innerHTML = '<option value="">— قالب —</option>' + Object.keys(all).map(n => '<option value="' + n + '">' + n + '</option>').join('');
      };
      sel.addEventListener('change', () => { if (this.selected && sel.value) this.applyTemplate(this.selected.type, sel.value); });
      saveBtn.addEventListener('click', () => {
        if (!this.selected) return;
        const name = prompt('اسم القالب:');
        if (name) { this.saveTemplate(this.selected.type, name, this.selected.toJSON()); refresh(); }
      });
      renameBtn.addEventListener('click', () => {
        if (!this.selected || !sel.value) return;
        const newName = prompt('اسم جديد:', sel.value);
        if (newName) { this.renameTemplate(this.selected.type, sel.value, newName); refresh(); }
      });
      delBtn.addEventListener('click', () => {
        if (!this.selected || !sel.value) return;
        if (confirm('حذف القالب "' + sel.value + '"؟')) { this.deleteTemplate(this.selected.type, sel.value); refresh(); }
      });
      defBtn.addEventListener('click', () => {
        if (!this.selected || !sel.value) return;
        this.setDefaultTemplate(this.selected.type, sel.value);
      });

      bar.appendChild(sel); bar.appendChild(saveBtn); bar.appendChild(renameBtn); bar.appendChild(delBtn); bar.appendChild(defBtn);
      headerEl.insertAdjacentElement('afterend', bar);
      this._templatesBarRefresh = refresh;
    }
    
    _closeSettingsModal() { this.settingsOverlay.classList.add('hidden'); }

    _renderSettingsTab(tab, d, bodyEl) {
      bodyEl.innerHTML = '';
      if (tab === 'Style') bodyEl.appendChild(this._buildStyleTab(d));
      else if (tab === 'Coordinates') bodyEl.appendChild(this._buildCoordinatesTab(d));
      else if (tab === 'Text') bodyEl.appendChild(this._buildTextTab(d));
      else if (tab === 'Levels') bodyEl.appendChild(this._buildLevelsTab(d));
      else if (tab === 'Trade') bodyEl.appendChild(this._buildTradeTab(d));
      else if (tab === 'Visibility') bodyEl.appendChild(this._buildVisibilityTab(d));
    }

    _buildVisibilityTab(d) {
      const wrap = document.createElement('div');
      const TF_LIST = [
        { m: 1, label: '1m' }, { m: 3, label: '3m' }, { m: 5, label: '5m' }, { m: 15, label: '15m' },
        { m: 30, label: '30m' }, { m: 60, label: '1H' }, { m: 120, label: '2H' }, { m: 240, label: '4H' },
        { m: 1440, label: '1D' }, { m: 10080, label: '1W' }, { m: 43200, label: '1M' }
      ];
      const allBtn = this._checkbox(d.visibleTimeframes === 'all', v => {
        d.visibleTimeframes = v ? 'all' : [];
        rebuildRows();
      });
      wrap.appendChild(this._row('All Timeframes', allBtn));
      const rowsWrap = document.createElement('div');
      wrap.appendChild(rowsWrap);
      const rebuildRows = () => {
        rowsWrap.innerHTML = '';
        if (d.visibleTimeframes === 'all') return;
        TF_LIST.forEach(tf => {
          const checked = Array.isArray(d.visibleTimeframes) && d.visibleTimeframes.includes(tf.m);
          rowsWrap.appendChild(this._row(tf.label, this._checkbox(checked, v => {
            if (!Array.isArray(d.visibleTimeframes)) d.visibleTimeframes = [];
            const i = d.visibleTimeframes.indexOf(tf.m);
            if (v && i < 0) d.visibleTimeframes.push(tf.m);
            if (!v && i >= 0) d.visibleTimeframes.splice(i, 1);
          })));
        });
      };
      rebuildRows();
      return wrap;
    }

    _row(labelText, controlEl) {
      const row = document.createElement('div');
      row.className = 'dt-sm-row';
      const label = document.createElement('span');
      label.className = 'dt-sm-row-label';
      label.textContent = labelText;
      row.appendChild(label);
      row.appendChild(controlEl);
      return row;
    }
    _checkbox(checked, onChange) {
      const b = document.createElement('button');
      b.className = 'dt-sm-checkbox' + (checked ? ' checked' : '');
      b.addEventListener('click', () => {
        const now = !b.classList.contains('checked');
        b.classList.toggle('checked', now);
        onChange(now);
      });
      return b;
    }
    _numberInput(value, onChange, step) {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'dt-sm-input';
      inp.step = step || 'any';
      inp.value = (value === null || value === undefined) ? '' : value;
      inp.addEventListener('change', () => onChange(parseFloat(inp.value)));
      return inp;
    }

    _buildStyleTab(d) {
      const wrap = document.createElement('div');
      const opacityWrap = document.createElement('input');
      opacityWrap.type = 'range'; opacityWrap.min = 0; opacityWrap.max = 100;
      opacityWrap.value = Math.round(d.opacity * 100);
      opacityWrap.addEventListener('input', () => { d.opacity = opacityWrap.value / 100; });
      wrap.appendChild(this._row('Opacity', opacityWrap));

      if (['trendline', 'ray'].includes(d.type)) {
        wrap.appendChild(this._row('Extend Left', this._checkbox(d.extendLeft, v => d.extendLeft = v)));
        wrap.appendChild(this._row('Extend Right', this._checkbox(d.extendRight, v => d.extendRight = v)));
      }
      if (['hline', 'vline', 'infoline'].includes(d.type)) {
        wrap.appendChild(this._row('Show Label', this._checkbox(d.showLabel, v => d.showLabel = v)));
      }
   if (d.type === 'circle' || d.type === 'circlerad') {
  wrap.appendChild(this._row('Filled Background', this._checkbox(d.filled, v => d.filled = v)));
}
if (['rect', 'erect'].includes(d.type)) {
  wrap.appendChild(this._row('Show Border', this._checkbox(d.showBorder, v => d.showBorder = v)));
  const borderSw = document.createElement('button');
  borderSw.className = 'dt-sm-color-sw';
  borderSw.style.background = d.borderColor || d.color;
  borderSw.addEventListener('click', () => this._openColorPickerForField(d, 'borderColor', borderSw));
  wrap.appendChild(this._row('Border Color', borderSw));
  wrap.appendChild(this._row('Show Fill', this._checkbox(d.filled, v => d.filled = v)));
  const fillSw = document.createElement('button');
  fillSw.className = 'dt-sm-color-sw';
  fillSw.style.background = d.fillColor || d.color;
  fillSw.addEventListener('click', () => this._openColorPickerForField(d, 'fillColor', fillSw));
  wrap.appendChild(this._row('Fill Color', fillSw));
}
if (d.type === 'fib' || d.type === 'fibchannel') {
  wrap.appendChild(this._row('Extend Right', this._checkbox(d.extendRight, v => d.extendRight = v)));
}
if (d.type === 'fib') {
  wrap.appendChild(this._row('Reverse', this._checkbox(d.reverse, v => d.reverse = v)));
}
if (d.type === 'arrow' || d.type === 'path') {
  wrap.appendChild(this._row('Arrows', this._select(d.arrowDirection || 'none', ['none', 'start', 'end', 'both'], v => d.arrowDirection = v)));
}
return wrap;
}

_buildCoordinatesTab(d) {
      const wrap = document.createElement('div');
      const LABELS_2PT = {
        trendline: ['Start Price', 'End Price'], extline: ['Start Price', 'End Price'],
        ray: ['Start Price', 'End Price'], infoline: ['Start Price', 'End Price'],
        measure: ['Start Price', 'End Price'], arrow: ['Start Price', 'End Price'],
        fib: ['Start Price', 'End Price'], fibext: ['Start Price', 'End Price']
      };

      // Rectangle / Circle / Ellipse -> Top/Bottom regardless of drag direction
      if (['rect', 'erect', 'circle', 'circlerad', 'ellipse'].includes(d.type) && d.points.length >= 2) {
        const p0 = d.points[0], p1 = d.points[1];
        const topIsP0 = (p0.price || 0) >= (p1.price || 0);
        const topPoint = topIsP0 ? p0 : p1;
        const bottomPoint = topIsP0 ? p1 : p0;
        wrap.appendChild(this._row('Top Price', this._numberInput(topPoint.price, v => { topPoint.price = v; })));
        wrap.appendChild(this._row('Bottom Price', this._numberInput(bottomPoint.price, v => { bottomPoint.price = v; })));
        return wrap;
      }

      // Trend Line / Ray / Arrow / Fib / Info Line / Measure -> Start/End
      if (LABELS_2PT[d.type] && d.points.length >= 2) {
        LABELS_2PT[d.type].forEach((label, i) => {
          wrap.appendChild(this._row(label, this._numberInput(d.points[i].price, v => { d.points[i].price = v; })));
        });
        return wrap;
      }

      // Path / Curve -> price of every point
      if (d.type === 'path' || d.type === 'curve') {
        d.points.forEach((p, i) => {
          wrap.appendChild(this._row('Point ' + (i + 1) + ' Price', this._numberInput(p.price, v => { d.points[i].price = v; })));
        });
        return wrap;
      }

      // Horizontal Line / Text / Label -> single anchor price
      if (d.type === 'hline' || d.type === 'text' || d.type === 'label') {
        wrap.appendChild(this._row('Price', this._numberInput(d.points[0].price, v => { d.points[0].price = v; })));
        return wrap;
      }

      // Fallback for any other type (e.g. vline has no meaningful price)
      d.points.forEach((p, i) => {
        wrap.appendChild(this._row('Point ' + (i + 1) + ' Price', this._numberInput(p.price, v => { d.points[i].price = v; })));
      });
      return wrap;
    }

   _buildTextTab(d) {
      const wrap = document.createElement('div');
      const txt = document.createElement('input');
      txt.type = 'text'; txt.className = 'dt-sm-input'; txt.value = d.text || '';
      txt.addEventListener('input', () => d.text = txt.value);
      wrap.appendChild(this._row('Content', txt));

      if (d.type === 'trendline') {
        wrap.appendChild(this._row('Text Position', this._select(d.lineTextAlign || 'center', ['left', 'center', 'right'], v => d.lineTextAlign = v)));
      }

      const size = document.createElement('input');
      size.type = 'range'; size.min = 10; size.max = 40; size.value = d.fontSize;
      size.addEventListener('input', () => d.fontSize = parseInt(size.value, 10));
      wrap.appendChild(this._row('Font Size', size));

      wrap.appendChild(this._row('Bold', this._checkbox(d.bold, v => d.bold = v)));

      if (d.type !== 'trendline') {
        wrap.appendChild(this._row('Background', this._checkbox(d.showBackground, v => d.showBackground = v)));

        const bgSw = document.createElement('button');
        bgSw.className = 'dt-sm-color-sw';
        bgSw.style.background = /^#/.test(d.bgColor || '') ? d.bgColor : '#151d2f';
        bgSw.addEventListener('click', () => this._openColorPickerForField(d, 'bgColor', bgSw));
        wrap.appendChild(this._row('Background Color', bgSw));

        const bgOp = document.createElement('input');
        bgOp.type = 'range'; bgOp.min = 0; bgOp.max = 100;
        bgOp.value = Math.round((d.bgOpacity != null ? d.bgOpacity : 0.85) * 100);
        bgOp.addEventListener('input', () => {
          if (!/^#/.test(d.bgColor || '')) d.bgColor = '#151d2f';
          d.bgOpacity = bgOp.value / 100;
        });
        wrap.appendChild(this._row('Background Opacity', bgOp));
      }
      return wrap;
    }

    _buildLevelsTab(d) {
      const wrap = document.createElement('div');
      wrap.appendChild(this._row('Show Levels Values', this._checkbox(d.showFibValues, v => d.showFibValues = v)));

      const listWrap = document.createElement('div');
      wrap.appendChild(listWrap);

      const renderLevels = () => {
        listWrap.innerHTML = '';
        d.fibLevels.forEach((lvl) => {
          const row = document.createElement('div');
          row.className = 'dt-sm-level-row';

          const chk = this._checkbox(lvl.enabled, v => lvl.enabled = v);

          const colorSw = document.createElement('button');
          colorSw.className = 'dt-sm-color-sw';
          colorSw.style.background = lvl.color;
          colorSw.addEventListener('click', () => this._openColorPickerForFibLevel(lvl, colorSw));

          const valueInp = this._numberInput(lvl.value, v => { lvl.value = v; }, '0.001');

          const widthSel = this._select(String(lvl.width || 1), ['1', '2', '3', '4', '6'], v => lvl.width = parseInt(v, 10));

          const styleSel = this._select(lvl.lineStyle || 'solid', ['solid', 'dashed', 'dotted'], v => lvl.lineStyle = v);

          const delBtn = document.createElement('button');
          delBtn.className = 'dt-sm-level-del';
          delBtn.textContent = '\u2715';
          delBtn.title = 'Delete level';
          delBtn.addEventListener('click', () => {
            d.fibLevels = d.fibLevels.filter(l => l !== lvl);
            renderLevels();
          });

          row.appendChild(chk); row.appendChild(colorSw); row.appendChild(valueInp);
          row.appendChild(widthSel); row.appendChild(styleSel); row.appendChild(delBtn);
          listWrap.appendChild(row);
        });
      };
      renderLevels();

      const addBtn = document.createElement('button');
      addBtn.className = 'dt-sm-level-add';
      addBtn.textContent = '+ Add Level';
      addBtn.addEventListener('click', () => {
        d.fibLevels.push({ value: 0.5, enabled: true, color: this._pendingColor || '#2962FF', width: 1, lineStyle: 'solid' });
        renderLevels();
      });
      wrap.appendChild(addBtn);

      return wrap;
    }

    _select(value, options, onChange) {
      const sel = document.createElement('select');
      sel.className = 'dt-sm-input';
      options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (opt === value) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => onChange(sel.value));
      return sel;
    }

    _buildTradeTab(d) {
      const wrap = document.createElement('div');
      const readout = document.createElement('div');
      readout.className = 'dt-sm-readout';

      const refresh = () => {
        const m = d.metrics();
        readout.innerHTML =
          '<div class="dt-sm-metric"><span>Risk %</span><b>' + Geo.fmt(m.riskPct, 2) + '%</b></div>' +
          '<div class="dt-sm-metric"><span>Reward %</span><b>' + Geo.fmt(m.rewardPct, 2) + '%</b></div>' +
          '<div class="dt-sm-metric"><span>Risk Amount</span><b>$' + Geo.fmt(m.riskAmount, 2) + '</b></div>' +
          '<div class="dt-sm-metric"><span>Reward Amount</span><b>$' + Geo.fmt(m.rewardAmount, 2) + '</b></div>' +
          '<div class="dt-sm-metric"><span>R:R Ratio</span><b>1 : ' + m.rr.toFixed(2) + '</b></div>' +
          '<div class="dt-sm-metric"><span>Position Size</span><b>' + Geo.fmt(m.positionSize, 2) + ' ' + d.sizeUnit + '</b></div>' +
          '<div class="dt-sm-metric profit"><span>Profit</span><b>+$' + Geo.fmt(m.profitUsd, 2) + ' (' + Geo.fmt(m.profitPct, 2) + '%)</b></div>' +
          '<div class="dt-sm-metric loss"><span>Loss</span><b>-$' + Geo.fmt(m.lossUsd, 2) + ' (' + Geo.fmt(m.lossPct, 2) + '%)</b></div>' +
          '<div class="dt-sm-metric"><span>Risk / Reward (pts)</span><b>' + Geo.fmt(m.riskTicks, 0) + ' / ' + Geo.fmt(m.rewardTicks, 0) + '</b></div>' +
          '<div class="dt-sm-metric"><span>Account risk</span><b>' + Geo.fmt(m.riskPctOfAccount, 2) + '%</b></div>' +
          '<div class="dt-sm-metric' + (m.marginExceedsAccount ? ' loss' : '') + '"><span>Margin' + (m.marginExceedsAccount ? ' ⚠ > account' : '') + '</span><b>$' + Geo.fmt(m.margin, 2) + '</b></div>' +
          (m.validDirection ? '' : '<div class="dt-sm-metric loss"><span>⚠</span><b>Entry/SL/TP order invalid for this side</b></div>');
      };

      const tickSz = () => d._tick || 0.01;
      const markBad = (el, bad) => { el.style.outline = bad ? '1px solid #ef5350' : ''; el.title = bad ? 'قيمة غير صالحة لاتجاه الصفقة' : ''; };
      wrap.appendChild(this._row('Entry Price', this._numberInput(d.entry, v => {
        if (!(v > 0)) return; d.entry = v; if (d.points[0]) d.points[0].price = v; refresh();
      })));
      // مستوى الربح / الوقف: حقل نقاط (ticks) + حقل سعر، كل منهما يحدّث الآخر ويُتحقَّق من اتجاه الصفقة
      const levelSync = {};
      const syncAllLevels = () => Object.keys(levelSync).forEach(k => levelSync[k]());
      const levelRow = (label, key, sign) => {
        const box = document.createElement('div'); box.style.cssText = 'display:flex;gap:6px';
        const tIn = this._numberInput(TVPositionCalc.ticksBetween(d.entry, d[key], tickSz()), v => apply(TVPositionCalc.priceFromTicks(d.entry, v, tickSz(), sign)));
        const pIn = this._numberInput(d[key], v => apply(v));
        levelSync[key] = () => { tIn.value = TVPositionCalc.ticksBetween(d.entry, d[key], tickSz()); pIn.value = d[key]; };
        function apply(price) {
          const okSide = key === 'target' ? (d.isLong ? price > d.entry : price < d.entry) : (d.isLong ? price < d.entry : price > d.entry);
          const bad = !(price > 0) || !okSide; markBad(tIn, bad); markBad(pIn, bad); if (bad) return;
          const ppl = d._pp();
          const rrBefore = ppl.lockedRR || d.metrics().rr || 0; // النسبة تُؤخذ قبل التعديل
          d[key] = TVPositionCalc.roundToTick(price, tickSz());
          if (ppl.lockRR) { // قفل R:R: تعديل أحد المستويين يعيد ضبط الآخر بنفس النسبة
            const rr = rrBefore;
            const r = TVPositionCalc.applyRRLock({ side: d.isLong ? 'long' : 'short', entry: d.entry, stop: d.stop, target: d.target }, key, rr);
            d.stop = TVPositionCalc.roundToTick(r.stop, tickSz()); d.target = TVPositionCalc.roundToTick(r.target, tickSz());
          }
          syncAllLevels(); refresh();
        }
        tIn.title = 'عدد النقاط (ticks)'; pIn.title = 'السعر'; tIn.style.width = '45%'; pIn.style.width = '55%';
        box.appendChild(tIn); box.appendChild(pIn);
        wrap.appendChild(this._row(label, box));
      };
      levelRow('Profit level (ticks | price)', 'target', d.isLong ? 1 : -1);
      levelRow('Stop level (ticks | price)', 'stop', d.isLong ? -1 : 1);
      wrap.appendChild(this._row('Quantity', this._numberInput(d.qty, v => { d.qty = v; refresh(); })));
      wrap.appendChild(this._row('Size Unit', this._select(d.sizeUnit, ['units', 'contracts', 'lots'], v => { d.sizeUnit = v; refresh(); })));
 wrap.appendChild(this._row('Lot size (units per lot)', this._numberInput(d.contractMultiplier, v => { if (v > 0) { d.contractMultiplier = v; refresh(); } })));
      const pp = d._pp();
      wrap.appendChild(this._row('Account size', this._numberInput(pp.accountSize, v => { if (v > 0) { pp.accountSize = v; refresh(); } })));
      wrap.appendChild(this._row('Risk %', this._numberInput(pp.riskPct, v => { if (v > 0 && v <= 100) { pp.riskPct = v; refresh(); } })));
      wrap.appendChild(this._row('Size from risk %', this._checkbox(pp.sizeByRisk, v => { pp.sizeByRisk = v; refresh(); })));
      wrap.appendChild(this._row('Lock R:R', this._checkbox(pp.lockRR, v => { pp.lockRR = v; pp.lockedRR = null; })));
      wrap.appendChild(this._row('Leverage', this._numberInput(pp.leverage, v => { if (v >= 1) { pp.leverage = v; refresh(); } })));
      wrap.appendChild(this._row('Qty precision', this._numberInput(pp.qtyPrecision, v => { if (v >= 0 && v <= 8) { pp.qtyPrecision = Math.round(v); refresh(); } })));

      const profitSw = document.createElement('button');
      profitSw.className = 'dt-sm-color-sw';
      profitSw.style.background = d.profitColor;
      profitSw.addEventListener('click', () => this._openColorPickerForField(d, 'profitColor', profitSw));
      wrap.appendChild(this._row('Profit Color', profitSw));

      const lossSw = document.createElement('button');
      lossSw.className = 'dt-sm-color-sw';
      lossSw.style.background = d.lossColor;
      lossSw.addEventListener('click', () => this._openColorPickerForField(d, 'lossColor', lossSw));
      wrap.appendChild(this._row('Loss Color', lossSw));

      const textSw = document.createElement('button');
      textSw.className = 'dt-sm-color-sw';
      textSw.style.background = d.textColor;
      textSw.addEventListener('click', () => this._openColorPickerForField(d, 'textColor', textSw));
      wrap.appendChild(this._row('Text Color', textSw));

      const borderSw = document.createElement('button');
      borderSw.className = 'dt-sm-color-sw';
      borderSw.style.background = d.borderColor || d.color;
      borderSw.addEventListener('click', () => this._openColorPickerForField(d, 'borderColor', borderSw));
      wrap.appendChild(this._row('Border Color', borderSw));

      wrap.appendChild(readout);
      refresh();
      return wrap;
    }

    // ---------------------------------------------------------- color picker (existing #colorPicker markup)
    
_openColorPickerFor(drawing) {
  if (!drawing) return;
  const swatchBtnEl = this.floatingToolbar.querySelector('#dtColorSwatch');
  window.UnifiedColorPicker.open({
    anchorEl: swatchBtnEl,
    color: drawing.color,
    opacity: Math.round((drawing.opacity != null ? drawing.opacity : 1) * 100),
    onChange: (hex, opacity) => {
      drawing.color = hex;
      drawing.opacity = opacity / 100;
      this._pendingColor = hex;
      this._save();
    }
  });
}
    
    
_openColorPickerForFibLevel(lvl, swatchEl) {
  window.UnifiedColorPicker.open({
    anchorEl: swatchEl,
    color: lvl.color,
    opacity: 100,
    onChange: (hex) => {
      lvl.color = hex;
      swatchEl.style.background = hex;
      this._save();
    }
  });
}


_openColorPickerForField(drawing, field, swatchEl) {
  if (!drawing) return;
  window.UnifiedColorPicker.open({
    anchorEl: swatchEl,
    color: drawing[field] || drawing.color,
    opacity: 100,
    onChange: (hex) => {
      drawing[field] = hex;
      swatchEl.style.background = hex;
      this._save();
    }
  });
}
    
  
    // ---------------------------------------------------------- events
_bindEvents() {
  const target = this.container;
  this._boundMouseMove = (e) => this._onMouseMove(e);
  this._boundMouseUp = (e) => this._onMouseUp(e);
  this._boundKeyDown = (e) => this._onKeyDown(e);
  target.addEventListener('mousedown', (e) => this._onMouseDown(e));
  window.addEventListener('mousemove', this._boundMouseMove);
  window.addEventListener('mouseup', this._boundMouseUp);
  target.addEventListener('dblclick', (e) => this._onDblClick(e));
  window.addEventListener('keydown', this._boundKeyDown);
}
    _relPos(e) {
      const rect = this.container.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    _findHit(x, y) {
      for (let i = this.drawings.length - 1; i >= 0; i--) {
        const d = this.drawings[i];
        if (d.hidden || !this._visibleOnCurrentTimeframe(d)) continue;
        const handles = d.getHandlePixels(this);
        for (let hIdx = 0; hIdx < handles.length; hIdx++) {
          if (Geo.dist(x, y, handles[hIdx].x, handles[hIdx].y) <= HANDLE_HIT_R) return { drawing: d, handleIdx: hIdx };
        }
        if (d.hitTest(x, y, this)) return { drawing: d, handleIdx: null };
      }
      return null;
    }

_onMouseDown(e) {
    if (e.button !== 0) return;
    const { x, y } = this._relPos(e);
    if (x < 0 || y < 0 || x > this.width || y > this.height) return;
    global.DrawingTools.activeManager = this;
    
    if (this.activeTool === 'cursor' || this.activeTool === 'crosshair') {
        const hit = this._findHit(x, y);
        if (hit && !hit.drawing.hidden) {
          this.select(hit.drawing);
          if (!hit.drawing.locked) {
            this.dragMode = hit.handleIdx !== null ? 'handle' : 'move';
            this.dragHandleIdx = hit.handleIdx;
            this.dragStart = { x, y };
            this.chart.applyOptions({ handleScroll: false, handleScale: false });
          }
        } else this.select(null);
        return;
      }

      const required = POINTS_REQUIRED[this.activeTool] || 2;
      const dataPoint = this.applyMagnet(x, y);

if (this.activeTool === 'text' || this.activeTool === 'label') {
  const defaultVal = this._pendingEmojiText || (this.activeTool === 'label' ? 'Label' : 'Text');
  const val = this._pendingEmojiText ? defaultVal : prompt(this.activeTool === 'label' ? 'Label:' : 'Text:', defaultVal);
  this._pendingEmojiText = null;
  if (val === null) { this.setActiveTool('cursor'); return; }
  const d = CTORS[this.activeTool]([dataPoint], { color: this._pendingColor, text: val });
        
        this.drawings.push(d);
        this._save(); this.select(d); this.setActiveTool('cursor');
        return;
      }

if (!this.draft) {
  const savedStyle = this._getToolStyle(this.activeTool);
  const style = savedStyle ? Object.assign({}, savedStyle) : { color: this._pendingColor, width: 2, lineStyle: 'solid', opacity: 1 };
  const initialPoints = required === 1 ? [dataPoint] : [dataPoint, dataPoint];
  const d = CTORS[this.activeTool](initialPoints, style);
        
        
        this.draft = { drawing: d, required };
        this.drawings.push(d);
        if (required === 1) { this._finalizeDraft(); return; }
      } else {
        const dr = this.draft.drawing;
        dr.points[dr.points.length - 1] = dataPoint; // confirm current live point
        if (this.draft.required !== Infinity && dr.points.length >= this.draft.required) {
          this._finalizeDraft();
        } else {
          dr.points.push(dataPoint); // open a new live preview slot
        }
      }
    }

_finalizeDraft() {
  if (!this.draft) return;
  const d = this.draft.drawing;
  this.draft = null;
  this._saveToolStyle(d.type, d.toJSON());
  this._save();
  this.select(d);
  this.setActiveTool('cursor');
}
    
    
    _cancelDraft() {
      if (this.draft) {
        this.drawings = this.drawings.filter(d => d !== this.draft.drawing);
        this.draft = null;
      }
    }

_onMouseMove(e) {
    const { x, y } = this._relPos(e);
    if (this.draft) {
      const dr = this.draft.drawing;
      dr.points[dr.points.length - 1] = this.applyMagnet(x, y);
      if (typeof dr.updateFromDraftPoints === 'function') dr.updateFromDraftPoints();
      return;
    }
      if (this.dragMode && this.selected && !this.selected.locked) {
        if (this.dragMode === 'handle') this.selected.setHandlePixel(this.dragHandleIdx, x, y, this);
        else if (this.dragMode === 'move' && this.dragStart) {
          const dx = x - this.dragStart.x, dy = y - this.dragStart.y;
          this.selected.moveByPixels(dx, dy, this);
          this.dragStart = { x, y };
        }
      }
      if (this.activeTool === 'cursor' && !this.dragMode) {
        const hit = this._findHit(x, y);
        this.canvas.style.cursor = hit ? (hit.handleIdx !== null ? 'pointer' : 'move') : 'default';
      }
    }

    _onMouseUp() {
      if (this.dragMode) { this.chart.applyOptions({ handleScroll: true, handleScale: true }); this._save(); }
      this.dragMode = null; this.dragHandleIdx = null; this.dragStart = null;
    }

    _onDblClick(e) {
      if (this.draft && this.draft.required === Infinity) {
        // finish a Path: drop the trailing live-preview point, keep the confirmed ones
        const dr = this.draft.drawing;
        if (dr.points.length > 2) dr.points.pop();
        this._finalizeDraft();
        return;
      }
      const { x, y } = this._relPos(e);
      const hit = this._findHit(x, y);
if (hit && (hit.drawing.type === 'text' || hit.drawing.type === 'label')) {
  const val = prompt(hit.drawing.type === 'label' ? 'Label:' : 'Text:', hit.drawing.text);
  if (val !== null) { hit.drawing.text = val; this._save(); }
}
}
  _onKeyDown(e) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (global.DrawingTools.activeManager && global.DrawingTools.activeManager !== this) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) { e.preventDefault(); this.deleteSelected(); }
      
      else if (e.key === 'Enter' && this.draft && this.draft.required === Infinity) {
        const dr = this.draft.drawing;
        if (dr.points.length > 2) dr.points.pop();
        this._finalizeDraft();
      } else if (e.key === 'Escape') {
        this._cancelDraft();
        this.setActiveTool('cursor');
        this.select(null);
        this._closeToolMenu();
        this._closeSettingsModal();
        this._closeObjectTree();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && this.selected) {
        e.preventDefault();
        this.clipboard = JSON.parse(JSON.stringify(this.selected.toJSON()));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && this.selected) {
        e.preventDefault();
        this.clipboard = JSON.parse(JSON.stringify(this.selected.toJSON()));
        this.deleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && this.clipboard) {
        e.preventDefault();
        this._pasteClipboard();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo(); else this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this._openObjectTree(); // TradingView-style "select all" is best expressed via the object tree for bulk actions here
      }
    }

    // ---------------------------------------------------------- actions
    select(drawing) { this.selected = drawing; this._syncFloatingToolbar(); }
    deleteSelected() {
      if (!this.selected || this.selected.locked) return;
      this.drawings = this.drawings.filter(d => d !== this.selected);
      this.select(null); this._save();
    }
    cloneSelected() {
      if (!this.selected) return;
      this.clipboard = JSON.parse(JSON.stringify(this.selected.toJSON()));
      this._pasteClipboard(20);
    }
    
    _duplicateDrawing(d) {
  const data = JSON.parse(JSON.stringify(d.toJSON()));
  const ctor = CTORS[data.type];
  if (!ctor) return;
  const nd = ctor(data.points, styleFromJSON(data));
  nd.extra = data.extra || {};
  nd.moveByPixels(20, 20, this);
  this.drawings.push(nd);
  this.select(nd);
  this._save();
}
    _pasteClipboard(pixelOffset) {
      const data = JSON.parse(JSON.stringify(this.clipboard));
      const ctor = CTORS[data.type];
      if (!ctor) return;
      const d = ctor(data.points, styleFromJSON(data));
      d.extra = data.extra || {};
      d.moveByPixels(pixelOffset || 20, pixelOffset || 20, this);
      this.drawings.push(d); this.select(d); this._save();
    }
    toggleHideAll() {
      const anyVisible = this.drawings.some(d => !d.hidden);
      this.drawings.forEach(d => d.hidden = anyVisible);
      this._save();
    }
    clearAll() {
      if (this.drawings.length && !confirm('Remove all drawings?')) return;
      this.drawings = []; this.select(null); this._save();
    }

    // ---------------------------------------------------------- persistence
_save(skipHistory) {
  try { localStorage.setItem(this.storageKey, JSON.stringify(this.drawings.map(d => d.toJSON()))); }
  catch (e) {}
  if (this.selected) this._saveToolStyle(this.selected.type, this.selected.toJSON());
  if (!skipHistory) this._pushHistory(false);
  this._refreshObjectTree();
}
    
    
    _load() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) return;
        const arr = JSON.parse(raw);
        this.drawings = arr.map(item => {
          const ctor = CTORS[item.type];
          if (!ctor) return null;
          const d = ctor(item.points, styleFromJSON(item));
          d.id = item.id; d.locked = !!item.locked; d.hidden = !!item.hidden; d.extra = item.extra || {};
          return d;
        }).filter(Boolean);
      } catch (e) {}
    }

_loadToolStyles() {
  try { return JSON.parse(localStorage.getItem(this._toolStylesKey) || '{}'); } catch (e) { return {}; }
}
_saveToolStyle(toolId, style) {
  this._toolStyles[toolId] = style;
  try { localStorage.setItem(this._toolStylesKey, JSON.stringify(this._toolStyles)); } catch (e) {}
}
_getToolStyle(toolId) {
  return this._toolStyles[toolId] || null;
}

// ---------------------------------------------------------- Templates لكل نوع أداة
_templatesKey(toolId) { return 'dt_templates_' + toolId; }
listTemplates(toolId) {
  try { return JSON.parse(localStorage.getItem(this._templatesKey(toolId)) || '{}'); } catch (e) { return {}; }
}
saveTemplate(toolId, name, style) {
  const all = this.listTemplates(toolId);
  all[name] = style;
  localStorage.setItem(this._templatesKey(toolId), JSON.stringify(all));
}
renameTemplate(toolId, oldName, newName) {
  const all = this.listTemplates(toolId);
  if (!all[oldName] || all[newName]) return false;
  all[newName] = all[oldName];
  delete all[oldName];
  localStorage.setItem(this._templatesKey(toolId), JSON.stringify(all));
  return true;
}
deleteTemplate(toolId, name) {
  const all = this.listTemplates(toolId);
  delete all[name];
  localStorage.setItem(this._templatesKey(toolId), JSON.stringify(all));
}
applyTemplate(toolId, name) {
  const all = this.listTemplates(toolId);
  const tpl = all[name];
  if (!tpl) return;
  this._saveToolStyle(toolId, tpl);
  if (this.selected && this.selected.type === toolId) {
    Object.assign(this.selected, styleFromJSON(tpl));
    this._save();
  }
}
setDefaultTemplate(toolId, name) {
  const all = this.listTemplates(toolId);
  if (!all[name]) return;
  localStorage.setItem('dt_default_template_' + toolId, name);
  this.applyTemplate(toolId, name);
}

    // ---------------------------------------------------------- render loop
    _loop() { this._render(); requestAnimationFrame(() => this._loop()); }
    _visibleOnCurrentTimeframe(d) {
      if (d.visibleTimeframes === 'all' || !Array.isArray(d.visibleTimeframes)) return true;
      if (!d.visibleTimeframes.length) return false;
      return d.visibleTimeframes.includes(this.timeframeMinutes());
    }
_render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      // منطقة محمية لمحور السعر (يمين/يسار) ومحور الوقت (أسفل) — أي رسم
      // (مستطيلات/فيبوناتشي/خطوط/صفقات) يُقصّ تلقائياً عند حدودها فلا
      // يمكنه الظهور فوق الأسعار أو الـ Labels، بغض النظر عن نوع الأداة.
      let rightScaleW = 0, leftScaleW = 0, timeScaleH = 0;
      try { rightScaleW = this.chart.priceScale('right').width() || 0; } catch (e) {}
      try { leftScaleW = this.chart.priceScale('left').width() || 0; } catch (e) {}
      try { timeScaleH = this.chart.timeScale().height() || 0; } catch (e) {}

      ctx.save();
      ctx.beginPath();
      ctx.rect(
        leftScaleW, 0,
        Math.max(0, this.width - rightScaleW - leftScaleW),
        Math.max(0, this.height - timeScaleH)
      );
      ctx.clip();

      this.drawings.forEach(d => {
        if (d.hidden || !this._visibleOnCurrentTimeframe(d)) return;
        try { d.render(ctx, this, d === this.selected); } catch (e) {}
      });

      ctx.restore();
      if (this.selected) this._syncFloatingToolbar();
    }
  }

global.DrawingTools = {
manager: null,
managers: [],
activeManager: null,
init(opts) {
  if (!opts || !opts.chart || !opts.series || !opts.container) {
    console.error('DrawingTools.init requires { chart, series, container }');
    return null;
  }
  const mgr = new DrawingManager(opts);
  this.managers.push(mgr);
  if (!this.manager) this.manager = mgr;
  this.activeManager = mgr;
  return mgr;
}
};

})(window);


function bindPopupDrag(handle, target) {
    let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      const r = target.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; sl = r.left; st = r.top;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      const w = target.offsetWidth, h = target.offsetHeight;
      target.style.left = Math.max(4, Math.min(sl + dx, window.innerWidth - w - 4)) + 'px';
      target.style.top = Math.max(4, Math.min(st + dy, window.innerHeight - h - 4)) + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }