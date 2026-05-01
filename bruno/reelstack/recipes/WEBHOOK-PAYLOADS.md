# Webhook Payload Reference

When you set `callbackUrl` on `/generate`, `/matrix`, or `/multi-lang`,
the worker POSTs to that URL after each child job reaches a terminal
status. Signed with HMAC-SHA256 over the raw body.

## Headers

```
X-ReelStack-Signature: sha256=<hex digest>
X-ReelStack-Event:     reel.completed | reel.failed
X-ReelStack-Delivery:  <uuid>          # for dedup
Content-Type:          application/json
```

Verify by computing `hmac_sha256(YOUR_WEBHOOK_SECRET, raw_body)` and
constant-time-comparing the hex digest.

## reel.completed payload

```json
{
  "event": "reel.completed",
  "jobId": "uuid",
  "status": "completed",
  "outputUrl": "https://r2.example.com/reels/<jobId>/output.mp4?...signed...",
  "language": "pl",
  "parentJobId": null,            // populated for /multi-lang batch siblings
  "sourceJobId": null,            // populated for forks created via /resume or /matrix
  "batchId": null,                // populated for /matrix children
  "batchRole": null,              // "base" | "fork"
  "batchCellKey": null,           // e.g. "fb|pl"
  "completedAt": "2026-05-01T08:35:35.184Z",
  "creditCost": 10,
  "productionMeta": {
    "totalDurationMs": 312000,
    "steps": [{ "name": "TTS", "durationMs": 5400 }, ...],
    "costs": [{ "step": "tts", "provider": "gemini-tts", "costUSD": 0.012 }, ...]
  }
}
```

## reel.failed payload

Same shape minus `outputUrl`/`productionMeta`, plus:

```json
{
  "event": "reel.failed",
  "status": "failed",
  "error": "Reel rendering failed", // generic; details stay in DB + logs
  "failedAt": "2026-05-01T08:35:35.184Z"
}
```

## Per-batch behavior

For `/matrix` requests:

- Each child job fires its own webhook (12-cell matrix → 12 webhooks).
- Use `batchId` to group. There's no batch-level "all done" event yet
  (call `GET /matrix/{batchId}` to see aggregate).
- `batchCellKey` lets you map results back to dimension values without
  re-parsing reelConfig.
