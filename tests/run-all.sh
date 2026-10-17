#!/bin/sh
# يشغّل كل الاختبارات ويفشل عند أي FAIL. اختبارات بياناتك الحقيقية تحتاج: XAU_CSV=/path/DAT_MT_XAUUSD_M1_2019.csv
cd "$(dirname "$0")/.." || exit 1
fail=0
for t in position-calc trading-sim indicators layouts draw-geom session-breaks data-import aggregate strategy compare; do
  out=$(node tests/$t.test.js 2>&1) || fail=1
  printf "%-22s %s\n" "$t" "$(echo "$out" | tail -1)"
done
for t in position-drawing position-levels new-tools drawing-engine drawing-tools-all emoji layouts-multichart ui-integration symbol-availability settings local-import backtest-ui compare-ui; do
  out=$(python3 tests/$t.browser.py 2>&1) || fail=1
  nfail=$(echo "$out" | grep -c "^FAIL\|Traceback\|FAILED")
  nok=$(echo "$out" | grep -c "^ok ")
  skip=$(echo "$out" | grep -c "^SKIPPED")
  [ "$nfail" -gt 0 ] && fail=1
  printf "%-22s ok=%s fail=%s %s\n" "$t" "$nok" "$nfail" "$([ "$skip" -gt 0 ] && echo SKIPPED)"
done
[ $fail -eq 0 ] && echo "ALL SUITES PASSED" || echo "SOME TESTS FAILED"
exit $fail
