#!/usr/bin/env bash
#
# E2E smoke test — runs all 7 modules through PipelineEngine with:
# - MODEL_PRESET=testing (cheapest LLM models)
# - PEXELS_ENABLED=true (free stock footage instead of AI gen)
# - Short scripts (3 sentences max)
#
# Verifies: API submission, pipeline steps, job completion.
# Does NOT verify visual quality — that's manual.
#
# Usage:
#   bash scripts/e2e-smoke-test.sh
#
# Prerequisites:
#   - Web server running on :3000
#   - Docker: redis, minio, postgres
#   - Worker will be started by this script with testing preset
#
set -euo pipefail

API="http://localhost:3000/api/v1"
AUTH="Authorization: Bearer rs_test_devSeedKey00000000000000000001"
RESULTS=()
PASS=0
FAIL=0

# ── Helpers ────────────────────────────────────────────────────

check_health() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$API/health" 2>/dev/null)
  if [ "$code" != "200" ]; then
    echo "❌ Web server not running on :3000"
    exit 1
  fi
  echo "✓ Web server healthy"
}

start_worker() {
  # Kill existing worker
  pkill -f "reel-worker" 2>/dev/null || true
  sleep 2

  cd "$(dirname "$0")/.."

  # Start with testing preset + Pexels enabled (free stock instead of AI gen)
  MODEL_PRESET=testing \
  PEXELS_ENABLED=true \
  REMOTION_RENDERER=local \
    bun run apps/web/worker/reel-worker.ts > /tmp/reelstack-e2e-worker.log 2>&1 &

  WORKER_PID=$!
  sleep 4

  if kill -0 $WORKER_PID 2>/dev/null; then
    echo "✓ Worker started (PID $WORKER_PID, preset=testing)"
  else
    echo "❌ Worker failed to start. Check /tmp/reelstack-e2e-worker.log"
    exit 1
  fi
}

submit_job() {
  local mode="$1"
  local payload="$2"
  local result

  result=$(curl -s -X POST "$API/reel/generate" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null)

  echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['jobId'])" 2>/dev/null
}

poll_job() {
  local job_id="$1"
  local mode="$2"
  local max_polls="${3:-60}"
  local poll_interval="${4:-10}"

  for i in $(seq 1 "$max_polls"); do
    sleep "$poll_interval"
    local status
    status=$(curl -s "$API/reel/render/$job_id" -H "$AUTH" 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d['status'])" 2>/dev/null)

    if [ "$status" = "completed" ]; then
      # Check steps
      local steps
      steps=$(curl -s "$API/reel/render/$job_id/steps" -H "$AUTH" 2>/dev/null | \
        python3 -c "
import sys,json
d=json.load(sys.stdin)
completed = sum(1 for s in d.get('data',[]) if s.get('status')=='completed')
total = len(d.get('data',[]))
print(f'{completed}/{total}')
" 2>/dev/null)

      echo "completed|$steps"
      return 0
    elif [ "$status" = "failed" ]; then
      local error
      error=$(curl -s "$API/reel/render/$job_id" -H "$AUTH" 2>/dev/null | \
        python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('error','')[:80])" 2>/dev/null)
      echo "failed|$error"
      return 1
    fi
  done

  echo "timeout|exceeded ${max_polls} polls"
  return 1
}

run_test() {
  local mode="$1"
  local payload="$2"
  local max_polls="${3:-40}"

  printf "  %-22s " "$mode"

  local job_id
  job_id=$(submit_job "$mode" "$payload")

  if [ -z "$job_id" ] || [ "$job_id" = "null" ]; then
    echo "❌ submit failed"
    FAIL=$((FAIL + 1))
    RESULTS+=("❌ $mode: submit failed")
    return
  fi

  local result
  result=$(poll_job "$job_id" "$mode" "$max_polls" 10) || true

  local status="${result%%|*}"
  local detail="${result#*|}"

  if [ "$status" = "completed" ]; then
    echo "✓ ($detail steps)"
    PASS=$((PASS + 1))
    RESULTS+=("✓ $mode: completed ($detail steps)")
  else
    echo "❌ $status: $detail"
    FAIL=$((FAIL + 1))
    RESULTS+=("❌ $mode: $status — $detail")
  fi
}

# ── Main ───────────────────────────────────────────────────────

echo "ReelStack E2E Smoke Test"
echo "─────────────────────────────────────"
echo "Preset: testing (cheapest models)"
echo "Video gen: Pexels stock (free)"
echo ""

check_health
start_worker

echo ""
echo "Running tests..."
echo ""

# 1. Generate
run_test "generate" '{
  "script": "AI zmienia wszystko. Chatbot sugeruje. Agent robi.",
  "mode": "generate", "layout": "fullscreen", "style": "calm",
  "tts": {"provider": "edge-tts", "voice": "pl-PL-MarekNeural"}
}'

# 2. Captions (transcribe)
run_test "captions" '{
  "mode": "captions",
  "videoUrl": "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "highlightMode": "pill"
}'

# 3. Slideshow
run_test "slideshow" '{
  "mode": "slideshow",
  "topic": "3 sposoby na szybszy kod",
  "tts": {"provider": "edge-tts", "voice": "pl-PL-MarekNeural"}
}'

# 4. Compose
run_test "compose" '{
  "mode": "compose",
  "script": "AI zmienia przyszłość.",
  "assets": [{"id": "v1", "url": "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4", "type": "video", "description": "Demo", "isPrimary": true}],
  "tts": {"provider": "edge-tts", "voice": "pl-PL-MarekNeural"}
}'

# 5. N8N Explainer (needs Docker n8n-ss running)
if docker ps --format '{{.Names}}' | grep -q n8n-ss; then
  run_test "n8n-explainer" '{
    "mode": "n8n-explainer",
    "script": "Ten workflow wysyła maile.",
    "workflowUrl": "https://n8n.io/workflows/1",
    "tts": {"provider": "edge-tts", "voice": "pl-PL-MarekNeural"}
  }' 60
else
  echo "  n8n-explainer          ⏭ skipped (n8n-ss not running)"
  RESULTS+=("⏭ n8n-explainer: skipped (n8n-ss not running)")
fi

# 6. Talking Object
# NOTE: Requires AI image + video gen (NanoBanana + Veo). Costs ~$1 per run.
# Skip in cheap mode (no --full flag)
if [ "${1:-}" = "--full" ]; then
  run_test "talking-object" '{
    "mode": "talking-object",
    "script": "Ctrl+Z cofa ostatnią akcję.",
    "topic": "Jeden skrót klawiaturowy",
    "numberOfTips": 1,
    "tts": {"provider": "edge-tts", "voice": "pl-PL-MarekNeural"}
  }' 60

  # 7. Presenter Explainer (costs ~$2 per run)
  run_test "presenter-explainer" '{
    "mode": "presenter-explainer",
    "script": "RAM to pamięć operacyjna.",
    "topic": "Co to jest RAM",
    "tts": {"provider": "edge-tts", "voice": "pl-PL-MarekNeural"}
  }' 60
else
  echo "  talking-object         ⏭ skipped (use --full to test, costs ~\$1)"
  echo "  presenter-explainer    ⏭ skipped (use --full to test, costs ~\$2)"
  RESULTS+=("⏭ talking-object: skipped (use --full)")
  RESULTS+=("⏭ presenter-explainer: skipped (use --full)")
fi

echo ""
echo "─────────────────────────────────────"
echo "Results: $PASS passed, $FAIL failed"
echo ""
for r in "${RESULTS[@]}"; do echo "  $r"; done
echo ""

# Cleanup
kill $WORKER_PID 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo "❌ SMOKE TEST FAILED"
  exit 1
else
  echo "✓ ALL SMOKE TESTS PASSED"
  exit 0
fi
