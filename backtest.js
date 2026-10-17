let currentBacktestTime = null;

let visibleData = [];

let isBacktest = false;
let loadedStart = 0;
const CHUNK_SIZE = 2000;

let backtestStartTime = null;

let allData = [];
let originalData = [];

let currentIndex = 0;
let playInterval = null;

// Exposes this script's otherwise-inaccessible top-level `let` state to
// other scripts (multichart.js) loaded after this one — needed for
// cross-chart crosshair/time sync and Synchronized Replay. Since this is a
// plain closure over the variables above (not a snapshot), callers always
// see the current live values.
window.getBacktestState = function () {
    return { allData, visibleData, currentIndex, currentBacktestTime, isBacktest };
};

window.chart = LightweightCharts.createChart(
    document.getElementById("chart"),
    {
        autoSize: true,

crosshair: {
    mode: LightweightCharts.CrosshairMode.Normal
},

      layout: {
    background: {
        color: "#ffffff"
    },
    textColor: "#131722"
},

timeScale: {
    timeVisible: true,
    secondsVisible: false,
    borderColor: "rgba(255,255,255,0.2)",
    rightOffset: 20
},

        grid: {
    vertLines: {
        color: "rgba(0,0,0,0.06)"
    },
    horzLines: {
        color: "rgba(0,0,0,0.06)"
    }
}
    }
);

window.chart.applyOptions({
    layout: {
        attributionLogo: false
    }
});

window.candleSeries =
    window.chart.addSeries(
        LightweightCharts.CandlestickSeries,
        {
            upColor: '#26A69A',
            downColor: '#EF5350',
            borderUpColor: '#26A69A',
            borderDownColor: '#EF5350',
            wickUpColor: '#26A69A',
            wickDownColor: '#EF5350'
        }
    );
const SYMBOL_PRECISION = {
  XAUUSD: 2, XAGUSD: 3, EURUSD: 5, GBPUSD: 5, USDJPY: 3,
  AUDUSD: 5, USDCAD: 5, USDCHF: 5, NZDUSD: 5,
  BTCUSD: 2, NAS100: 1, US30: 1, OIL: 2
};
window.SYMBOL_PRECISION = SYMBOL_PRECISION; // متاحة لـ multichart.js لتطبيقها على شاشات المقارنة أيضاً
function applySymbolPrecision(symbol, targetSeries) {
  const p = SYMBOL_PRECISION[symbol];
  if (p == null) return;
  (targetSeries || candleSeries).applyOptions({ priceFormat: { type: 'price', precision: p, minMove: 1 / Math.pow(10, p) } });
}

// يعرض آخر ~120 شمعة فقط بمجال الرؤية الأولي، بدل ضغط كل البيانات
// المحمّلة (حتى 5000 شمعة) بمجال رؤية واحد كما كانت تفعله fitContent().
// هذا يطابق سلوك TradingView الافتراضي عند فتح أي رمز لأول مرة.
function applyDefaultChartView(chart, totalBars) {
    const DEFAULT_VISIBLE_BARS = 120;
    // نقرأ rightOffset الفعلي المضبوط حالياً بالشارت (من نافذة الإعدادات،
    // افتراضياً 20) بدل هامش ثابت صغير — هذا بالضبط ما يجعل المساحة
    // المستقبلية تتناسب تلقائياً مع الفريم: 20 شمعة فارغة تعني عدة ساعات
    // بفريم 1 دقيقة، وعدة أسابيع بفريم يومي، وهكذا — لأن الوحدة "شمعة"
    // وليست وقتاً ثابتاً.
    let rightOffsetBars = 20;
    try {
        const opts = chart.options();
        if (opts && opts.timeScale && typeof opts.timeScale.rightOffset === 'number') {
            rightOffsetBars = opts.timeScale.rightOffset;
        }
    } catch (e) {}
    const from = Math.max(0, totalBars - DEFAULT_VISIBLE_BARS);
    const to = totalBars + rightOffsetBars;
    try { chart.timeScale().setVisibleLogicalRange({ from, to }); } catch (e) {}
}

// يُستدعى من زر "Reset Chart View" — يحدد الشارت النشط حالياً (الرئيسي أو
// أي شاشة مقارنة) ويعيد ضبط تكبيره/إزاحته فقط، دون المساس بأي شارت آخر.
window.resetActiveChartView = function() {
    const active = (window.MultiChart && window.MultiChart.getActivePane) ? window.MultiChart.getActivePane() : null;
    if (!active || active.isPrimary) {
        if (primaryInitialViewState) {
            try { window.chart.timeScale().setVisibleLogicalRange(primaryInitialViewState); return; } catch (e) {}
        }
        applyDefaultChartView(window.chart, isBacktest ? currentIndex : allData.length); // احتياطي فقط لو لم تُلتقَط اللقطة لأي سبب
    } else if (active.chart) {
        if (active._initialViewState) {
            try { active.chart.timeScale().setVisibleLogicalRange(active._initialViewState); return; } catch (e) {}
        }
        const len = active.allData ? active.allData.length : 0;
        applyDefaultChartView(active.chart, len);
    }
};

function convertTimeframe(
    data,
    minutes
) {
    
    let result = [];
    
    let bucket = null;
    let bucketKey = null;
    
    function keyFor(time, minutes) {
        
        const d = new Date(time * 1000);
        
        if (minutes === 1440) {
            return Date.UTC(
                d.getUTCFullYear(),
                d.getUTCMonth(),
                d.getUTCDate()
            ) / 1000;
        }
        
        if (minutes === 10080) {
            const day = d.getUTCDay();
            const diffToMonday = (day + 6) % 7;
            const monday = new Date(
                Date.UTC(
                    d.getUTCFullYear(),
                    d.getUTCMonth(),
                    d.getUTCDate() - diffToMonday
                )
            );
            return monday.getTime() / 1000;
        }
        
        if (minutes === 43200) {
            return Date.UTC(
                d.getUTCFullYear(),
                d.getUTCMonth(),
                1
            ) / 1000;
        }
        
        const tfSec = minutes * 60;
        return Math.floor(time / tfSec) * tfSec;
    }
    
    data.forEach(candle => {
        
        const time = keyFor(candle.time, minutes);
        
        if (
            bucketKey !== time
        ) {
            
            if (bucket)
                result.push(bucket);
            
            bucket = {
                
                time: time,
                
                open: candle.open,
                
                high: candle.high,
                
                low: candle.low,
                
                close: candle.close,
                
                volume: candle.volume || 0
                
            };
            
            bucketKey = time;
            
        } else {
            
            bucket.high =
                Math.max(
                    bucket.high,
                    candle.high
                );
            
            bucket.low =
                Math.min(
                    bucket.low,
                    candle.low
                );
            
            bucket.volume += candle.volume || 0;
            
            bucket.close =
                candle.close;
            
        }
        
    });
    
    if (bucket)
        result.push(bucket);
    
    return result;
    
}

document
    .getElementById("backtestBtn")
    .onclick = () => {
        
        document
            .getElementById("backtestModal")
            .style.display = "block";
        
    };
    
    function closeBacktestModal() {
    document.getElementById("backtestModal").style.display = "none";
}
document.getElementById("backtestModalClose").onclick = closeBacktestModal;
document.getElementById("backtestModal").addEventListener("click", (e) => {
    if (e.target.id === "backtestModal") closeBacktestModal();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("backtestModal").style.display === "block") {
        closeBacktestModal();
    }
});

document
    .getElementById("startBacktest")
    .onclick = async () => {
            
            const value =
                document
                .getElementById("startDate")
                .value;
            
            if (!value)
                return;
            
            const selectedYear =
                new Date(value)
                .getFullYear();
            
            document
                .getElementById(
                    "exitBacktestBtn"
                )
                .classList.remove(
                    "hidden"
                );
            
            
            isBacktest = true;

document
    .getElementById(
        "backtestModal"
    )
    .style.display = "none";

document
    .getElementById(
        "loading"
    )
    .style.display = "flex";

const targetTime =
    Math.floor(
        new Date(value).getTime() / 1000
    );

const tf =
    Number(
        document.getElementById(
            "timeframeSelect"
        ).value
    );

let historyCandles = 5000;

if (tf === 1440)
    historyCandles = 1000;

if (tf === 10080)
    historyCandles = 300;

if (tf === 43200)
    historyCandles = 120;

// تحميل مباشر حول التاريخ المطلوب فقط — بدل تحميل كل السنوات من
// startYear إلى 2025، نحمّل فقط ما يلزم من سنوات (خلفاً وأماماً) حتى
// نضمن historyCandles قبل نقطة البداية و200 بعدها، بغض النظر عن كون
// التاريخ سنة 2005 أو 2024.
dataStream = new TVDataEngine.SymbolDataStream(
    document.getElementById("pairSelect").value
);
originalData = await dataStream.loadAroundDate(targetTime, historyCandles * (tf === 1 ? 1 : Math.max(1, tf)), 200 * (tf === 1 ? 1 : Math.max(1, tf)));

if (tf !== 1)
{
    allData =
        convertTimeframe(
            originalData,
            tf
        );
} else {
    allData = originalData;
}

const index =
    allData.findIndex(
        c =>
        c.time >= targetTime
    );

// إخفاء شاشة التحميل — كانت الدالة القديمة loadAllYears تُخفيها
// بنفسها بنهايتها، وبعد استبدالها بـ loadAroundDate الجديدة لم يعد
// شيء يُخفيها، فتبقى ظاهرة للأبد رغم نجاح التحميل فعلياً.
document.getElementById("loading").style.display = "none";

if (index === -1) {
    
    alert("Date not found — قد لا تتوفر بيانات لهذا الرمز بهذا التاريخ");
    
    return;
    
}

currentIndex = index;
        
        currentBacktestTime =
    allData[index].time;
        
        backtestStartTime =
            allData[index].time;
        
const start =
    Math.max(
        0,
        currentIndex - historyCandles
    );
    
candleSeries.setData(
    allData.slice(
        start,
        currentIndex + 1
    )
);
        
        document
            .getElementById("backtestControls")
            .classList.remove("hidden");
        
        document
            .getElementById("backtestModal")
            .style.display = "none";
        
    };

document
    .getElementById("prevBtn")
    .onclick = () => {
        
        if (currentIndex <= 1)
            return;
        
        currentIndex--;
        
        currentBacktestTime =
    allData[currentIndex].time;
        
const start =
    Math.max(
        0,
        currentIndex - 5000
    );

candleSeries.setData(
    allData.slice(
        start,
        currentIndex + 1
    )
);
        
    };

document
    .getElementById("nextBtn")
    .onclick = () => {
        
        if (
            currentIndex <
            allData.length - 1
        )
        {
            currentIndex++;
            
            candleSeries.update(
                allData[currentIndex]
            );
        }
        
        currentBacktestTime =
            allData[currentIndex].time;
    };

document
    .getElementById("playBtn")
    .onclick = () => {
        
        clearInterval(
            playInterval
        );
        currentBacktestTime =
    allData[currentIndex].time;
    
        document
            .getElementById("playBtn")
            .classList.add("activeBtn");
        
        document
            .getElementById("pauseBtn")
            .classList.remove("activeBtn");
        
        const speed =
            Number(
                document
                .getElementById(
                    "speedSelect"
                ).value
            );
        
        playInterval =
            setInterval(() => {
                
                if (
                    currentIndex <
                    allData.length - 1
                ) {
                    
                    currentIndex++;
                    
                    candleSeries.update(
                        allData[currentIndex]
                    );
                    
window.chart.timeScale().scrollToRealTime();

                    currentBacktestTime =
    allData[currentIndex].time;
                    
                }
                
            }, speed);
        
    };

document
    .getElementById("pauseBtn")
    .onclick = () => {
        
        clearInterval(
            playInterval
        );
        
        document
            .getElementById("pauseBtn")
            .classList.add("activeBtn");
        
        document
            .getElementById("playBtn")
            .classList.remove("activeBtn");
        
    };

document
    .getElementById("exitBacktestBtn")
    .onclick = () => {
        
        document
    .getElementById(
        "exitBacktestBtn"
    )
    .classList.add(
        "hidden"
    );
        
        clearInterval(
            playInterval
        );
        
        currentIndex =
            allData.length;
        
     candleSeries.setData(
    allData.slice(-5000)
);
       
       isBacktest = false;
        
        document
            .getElementById("backtestControls")
            .classList.add("hidden");
        
        document
            .getElementById("playBtn")
            .classList.remove("activeBtn");
        
        document
            .getElementById("pauseBtn")
            .classList.remove("activeBtn");
        
        backtestStartTime =
            null;
        
     applyDefaultChartView(window.chart, allData.length);
        
    };
    


document.getElementById("timeframeSelect").onchange = () => {
        const selEl = document.getElementById("timeframeSelect");
        if (selEl.value === 'custom') {
            const mins = promptCustomTimeframe();
            if (mins == null) { selEl.value = '1'; return; }
            selEl.value = String(mins);
        }
        if (selEl.value.startsWith('tick') || selEl.value.startsWith('sec')) {
            alert('هذا الفريم غير مدعوم حالياً — يتطلب مصدر بيانات Tick/ثانوي غير متوفر بالمشروع.');
            selEl.value = '1';
            return;
        }
        
        function promptCustomTimeframe() {
    const val = prompt('أدخل الفريم بالدقائق (مثال: 90 لفريم 90 دقيقة):', '');
    const mins = parseInt(val, 10);
    if (!val || isNaN(mins) || mins <= 0) return null;
    const sel = document.getElementById('timeframeSelect');
    let opt = sel.querySelector('option[value="' + mins + '"]');
    if (!opt) {
        opt = document.createElement('option');
        opt.value = String(mins);
        opt.textContent = mins + 'm (Custom)';
        sel.appendChild(opt);
    }
    return mins;
}
        
if (window.__mcSyncingLabelOnly) return; // ← حدث مزامنة عرض فقط، وليس اختياراً حقيقياً
if (window.MultiChart && !window.MultiChart.isPrimaryActive() && !window.__mcForcePrimary) return;

const tf =
    Number(
        document
        .getElementById(
            "timeframeSelect"
        ).value
    );

if (window.MultiChart && window.MultiChart.panes[0]) {
    window.MultiChart.panes[0].timeframe = tf;
}

allData =
    convertTimeframe(
        originalData,
        tf
    );
            
            loadedStart =
    Math.max(
        0,
        allData.length - CHUNK_SIZE
    );

visibleData =
    allData.slice(
        loadedStart
    );
        
if (
    isBacktest
) {
            
   let index =
    allData.findIndex(
        c =>
        c.time >=
        currentBacktestTime
    );
            
            if (
                index === -1
            ) {
                index = 0;
            }
            
            currentIndex =
                index;
            
        const start =
    Math.max(
        0,
        currentIndex - 5000
    );

candleSeries.setData(
    allData.slice(
        start,
        currentIndex + 1
    )
);
            
        }
        
        else {
            
            currentIndex =
                allData.length;
            
   candleSeries.setData(
    visibleData
);


            
        }
        
applyDefaultChartView(window.chart, isBacktest ? currentIndex : allData.length);

if (window.MultiChart && !window.__mcForcePrimary) {
    window.MultiChart.broadcastTimeframeFromPane(window.MultiChart.panes[0]);
}

};
let primaryInitialViewState = null; // لقطة حرفية لحالة العرض لحظة أول فتح فعلي للموقع — لا تُكتب فوقها لاحقاً أبداً

let dataStream = null; // TVDataEngine.SymbolDataStream النشطة حالياً

window.onload = () => {
    
    loadSymbolLazy(
        document
        .getElementById("pairSelect")
        .value
    );
    
};

document.getElementById("pairSelect").onchange = () => {
    if (window.__mcSyncingLabelOnly) return; // ← حدث مزامنة عرض فقط (تفعيل شارت)، وليس اختياراً حقيقياً من المستخدم
    if (window.MultiChart && !window.MultiChart.isPrimaryActive() && !window.__mcForcePrimary) return;
    if (window.MultiChart && window.MultiChart.panes[0]) {
        window.MultiChart.panes[0].pair = document.getElementById("pairSelect").value;
    }
    loadSymbolLazy(document.getElementById("pairSelect").value);
    applySymbolPrecision(document.getElementById("pairSelect").value);
    if (window.MultiChart && !window.__mcForcePrimary) {
        window.MultiChart.broadcastSymbolFromPane(window.MultiChart.panes[0]);
    }
};

// التحميل الجديد الكسول — يستبدل loadAllYears/loadYear القديمين بالكامل.
async function loadSymbolLazy(pair) {
        
        document.getElementById("loading").style.display = "flex";
        applySymbolPrecision(pair);
        
        dataStream = new TVDataEngine.SymbolDataStream(pair);
        originalData = await dataStream.loadInitial(2000);
    
    const tf = Number(document.getElementById("timeframeSelect").value);
    
    allData = tf !== 1 ? convertTimeframe(originalData, tf) : originalData;
    
    currentIndex = allData.length;
    
    // loadedStart = مؤشر بداية الجزء المعروض حالياً من allData. البيانات
    // بين 0 وloadedStart موجودة بالذاكرة فعلاً (originalData/allData) لكن
    // غير معروضة بعد — تُكشف تدريجياً عند السحب للخلف بدون أي تحميل شبكة.
    loadedStart = Math.max(0, allData.length - 5000);
    visibleData = allData.slice(loadedStart);
    
    candleSeries.setData(visibleData);
    
setTimeout(() => {
    applyDefaultChartView(window.chart, visibleData.length);
    // يُلتقَط مرة واحدة فقط — أول استدعاء لـ loadSymbolLazy بعمر الصفحة
    // (window.onload). أي استدعاء لاحق (تغيير رمز) لن يكتب فوق هذي القيمة.
    if (!primaryInitialViewState) {
        try { primaryInitialViewState = window.chart.timeScale().getVisibleLogicalRange(); } catch (e) {}
    }
    document.getElementById("loading").style.display = "none";
}, 200);
}


document
    .getElementById(
        "loading"
    )
    .style.display = "none";

let loadingOlderChunk = false;

window.chart.timeScale().subscribeVisibleLogicalRangeChange(
    async range => {
        
        if (!range || isBacktest || !dataStream || loadingOlderChunk)
            return;
        
        if (range.from >= 100)
            return;
        
        loadingOlderChunk = true;
        
        try {
            
            if (loadedStart > 0) {
                
                // الحالة الصحيحة الأشيع: البيانات الأقدم موجودة أصلاً بالذاكرة
                // (نفس السنة المحمّلة) وغير معروضة فقط — نكشفها فوراً بدون
                // أي طلب شبكة. هذا بالضبط الجزء اللي كان مفقوداً ويسبب
                // القفز المباشر لسنة كاملة أقدم.
                const newStart = Math.max(0, loadedStart - CHUNK_SIZE);
                const olderChunk = allData.slice(newStart, loadedStart);
                
                visibleData = [...olderChunk, ...visibleData];
                loadedStart = newStart;
                
                candleSeries.setData(visibleData);
                
            } else if (!dataStream.exhaustedBackward) {
                
                // وصلنا فعلياً لبداية كل ما هو محمّل بالذاكرة — الآن فقط
                // نطلب سنة أقدم جديدة من الملفات.
                const grew = await dataStream.loadOlderIfNeeded(0);
                
                if (grew) {
                    const tf = Number(document.getElementById("timeframeSelect").value);
                    originalData = dataStream.data;
                
                    const prevVisibleLen = visibleData.length;
                    allData = tf !== 1 ? convertTimeframe(originalData, tf) : originalData;
                    
                    // نكشف قدر CHUNK_SIZE واحد فقط من التاريخ المُضاف حديثاً،
                    // بدل عرض السنة الجديدة كاملة دفعة واحدة.
                    const revealStart = Math.max(0, allData.length - prevVisibleLen - CHUNK_SIZE);
                    const newVisible = allData.slice(revealStart);
                    const addedCount = newVisible.length - prevVisibleLen;
                    
                    visibleData = newVisible;
                    loadedStart = revealStart;
                    
                    candleSeries.setData(visibleData);
                    
                    if (addedCount > 0) {
                        const currentRange = window.chart.timeScale().getVisibleLogicalRange();
                        if (currentRange) {
                            window.chart.timeScale().setVisibleLogicalRange({
                                from: currentRange.from + addedCount,
                                to: currentRange.to + addedCount
                            });
                        }
                    }
                }
            }
            
        } catch (err) {
            console.error('[DataEngine] فشل تحميل/كشف بيانات أقدم:', err);
        }
        
        loadingOlderChunk = false;
        
    }
);

if (window.DrawingTools && typeof window.DrawingTools.init === 'function') {
    window.DrawingTools.init({
        chart: window.chart,
        series: window.candleSeries,
        container: document.getElementById('chart')
    });
} else {
    console.error('[backtest.js] DrawingTools غير معرّف — تحقق من drawing.js (SyntaxError محتمل يمنع تحميله بالكامل)');
}