#!/usr/bin/env bash
# Post-deploy smoke test (spec 13.2). Usage: ./scripts/smoke.sh https://<api-id>.execute-api.ap-south-1.amazonaws.com
set -uo pipefail
API="${1:?usage: smoke.sh <api_url>}"
API="${API%/}"
fail=0
check() { if [[ "$2" == "ok" ]]; then echo "PASS  $1"; else echo "FAIL  $1  ($2)"; fail=1; fi; }

code=$(curl -s -o /tmp/jt_health.json -w "%{http_code}" "$API/health")
check "/health returns 200" "$([[ $code == 200 ]] && echo ok || echo "HTTP $code")"

curl -s "$API/risk/heat" -o /tmp/jt_heat.json
n=$(python3 -c "import json;print(len(json.load(open('/tmp/jt_heat.json')).get('cells',[])))" 2>/dev/null || echo 0)
check "/risk/heat returns 36 cells" "$([[ $n == 36 ]] && echo ok || echo "$n cells")"

start=$(python3 -c "import time;print(time.time())")
code=$(curl -s -m 30 -o /tmp/jt_chat.json -w "%{http_code}" -X POST "$API/chat" -H "content-type: application/json" \
  -d '{"session_id":"smoke-test-0001","message":"आज नजफगढ़ में काम कब करूं?"}')
secs=$(python3 -c "import time;print(round(time.time()-$start,1))")
hindi=$(python3 -c "import json,re;r=json.load(open('/tmp/jt_chat.json')).get('reply','');print('ok' if re.search('[ऀ-ॿ]',r) else 'no devanagari')" 2>/dev/null || echo "bad json")
check "/chat answers a Hindi heat question in ${secs}s (<25 s)" "$([[ $code == 200 && $hindi == ok ]] && python3 -c "print('ok' if $secs < 25 else 'too slow')" || echo "HTTP $code, $hindi")"

grounded=$(python3 -c "import json;print('ok' if json.load(open('/tmp/jt_chat.json')).get('data_updated_at') else 'no forecast data in reply (Bedrock or Open-Meteo unavailable?)')" 2>/dev/null || echo "bad json")
check "/chat reply is based on forecast data (data_updated_at set)" "$grounded"

code=$(curl -s -o /tmp/jt_replay.json -w "%{http_code}" "$API/replay/heat-2026-05-22")
hours=$(python3 -c "import json;print(len(json.load(open('/tmp/jt_replay.json')).get('hours',[])))" 2>/dev/null || echo 0)
check "/replay/heat-2026-05-22 loads" "$([[ $code == 200 && $hours -gt 0 ]] && echo ok || echo "HTTP $code, $hours hours")"

[[ $fail == 0 ]] && echo "Smoke test passed." || echo "Smoke test FAILED."
exit $fail
