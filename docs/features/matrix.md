# Matrix render — N variants from one POST

Matrix mode renders multiple variants of the same base reel across one
or more dimensions in a single request. Universal across every reel
mode (`generate`, `n8n-explainer`, `slideshow`, `captions`,
`presenter-explainer`, `talking-object`, `ai-tips`, `ai-short-film`,
…).

Built on top of the fork-based resume API: ONE base full pipeline runs
per `BASE` dimension combination, then the worker hook spawns a fork
(via `forkReelJob` + `copyJobContext`) for every remaining cell. Forks
re-render from the cached `assemble-props` step at zero API cost.

## Endpoint

```
POST /api/v1/reel/matrix
{
  "base": {
    "mode": "n8n-explainer",
    "workflowUrl": "https://n8n.io/workflows/2813-...",
    "runtime": "hyperframes",
    "endCard": { "durationSeconds": 4 }
  },
  "dimensions": {
    "language": ["pl", "en"],
    "endCard.platform": ["ig", "fb", "tiktok", "youtube", "linkedin", "universal"]
  },
  "callbackUrl": "https://you/webhook"
}
→ 202 {
  "batchId": "uuid",
  "totalCells": 12,
  "baseJobs": 2,
  "forkJobs": 10,
  "estimatedCost": { "credits": 20, "fullPipelines": 2, "freeForks": 10 },
  "jobs": [
    { "cellKey": "fb|pl", "role": "base", "jobId": "...", "status": "queued" },
    { "cellKey": "fb|en", "role": "base", "jobId": "...", "status": "queued" },
    { "cellKey": "ig|pl", "role": "fork", "jobId": null, "status": "pending-base" },
    ...
  ]
}
```

## Status + cancel

```
GET    /api/v1/reel/matrix/{batchId}    — aggregated status + outputs map
DELETE /api/v1/reel/matrix/{batchId}    — cancel pending bases + forks
```

`outputs` is a `cellKey → outputUrl` map populated as cells complete:

```json
{
  "outputs": {
    "fb|pl": "https://r2/.../pl-fb.mp4",
    "fb|en": "https://r2/.../en-fb.mp4",
    "ig|pl": "https://r2/.../pl-ig.mp4",
    ...
  }
}
```

## Dimension classification

The server splits dims into BASE (cache-invalidating, full pipeline per
value, paid) and FORK_FREE (zero-cost re-render from `assemble-props`):

| Class     | Keys                                                                       |
| --------- | -------------------------------------------------------------------------- |
| BASE      | `language`                                                                 |
| FORK_FREE | `endCard`, `captionStyle`, `brandPreset`, `scrollStopper`, `highlightMode` |

Anything else (`workflowUrl`, `mode`, `runtime`, `tts.voice`, …) → 400
with hint to submit separate `/generate` requests. Nested keys
(e.g. `endCard.platform`, `endCard.cardSlug`, `captionStyle.position`)
classify by their root.

## Hard caps

- `totalCells ≤ 20` (sanity, blocks `10 langs × 6 plats = 60`)
- `baseJobs ≤ 5` (cost guard — bases are paid)

Going beyond returns 400. Split into separate matrix requests if needed.

## Cost model

```
totalCells     = product of all dimension cardinalities
fullPipelines  = product of BASE-dim cardinalities    (paid, ≤ 5)
freeForks      = totalCells − fullPipelines           (free, ≤ 15)
estimatedCost.credits = fullPipelines × creditsPerBase  (default: 10)
```

Example: `language: [pl, en]` × `endCard.platform: [ig, fb, tt, yt, li, universal]`
→ 2 base full pipelines + 10 forks = 12 cells, 20 credits.

## Cell key

Pipe-joined dimension values in dim-key sort order. For
`{language: pl, endCard.platform: fb}`:

- Sorted dim keys: `endCard.platform`, `language` (e<l alphabetical)
- Values in that order: `fb`, `pl`
- Cell key: `fb|pl`

Used by status endpoint's `outputs` map and by `tryAdvanceMatrix` to
identify cells.

## Architecture

`packages/agent/src/orchestrator/matrix.ts` — `createMatrix()`:

1. Validates dims + caps
2. Splits BASE vs FORK_FREE, computes cells
3. Picks first-alphabetical FORK_FREE values as the base cell
4. Creates `ReelBatch` + N base `ReelJob`s in single Prisma `$transaction`
5. Enqueues bases on BullMQ
6. Returns full cell summary (forks have `jobId: null` until spawned)

`packages/agent/src/orchestrator/matrix-advance.ts` — `tryAdvanceMatrix()`:

- Called by worker (`apps/web/src/lib/worker/reel-pipeline-worker.ts`) after
  each terminal status (COMPLETED/FAILED)
- Base COMPLETED → spawn forks for cells sharing same BASE-dim values via
  existing `forkReelJob` + `copyJobContext`
- Base FAILED → no forks; cells in that group remain pending
- Idempotent — skips cells with existing jobs
- CANCELLED batches never resurrected

## Database schema

```prisma
model ReelBatch {
  id          String      @id @default(uuid())
  userId      String
  mode        String
  baseInput   Json        // base config from request
  dimensions  Json        // dimension map from request
  status      BatchStatus @default(QUEUED)
  callbackUrl String?
  jobs        ReelJob[]   // children (bases + forks)
  ...
}

enum BatchStatus { QUEUED RUNNING COMPLETED PARTIAL FAILED CANCELLED }
```

`ReelJob` adds `batchId String? + batchRole String? ('base'|'fork') +
batchCellKey String?`. Status endpoint computes aggregates LIVE from
the `jobs[]` count rather than reading `batch.status` (only updated on
terminal events).

## Webhook

Per-job `callbackUrl` fires for every cell that reaches a terminal
status (12-cell matrix → 12 webhooks). Use `batchId` + `batchCellKey`
to group. There's no batch-level "all done" event yet — call
`GET /matrix/{batchId}` to see aggregate.

See `bruno/reelstack/recipes/WEBHOOK-PAYLOADS.md` for payload shapes.

## Bruno collection

- `bruno/reelstack/reel/matrix-create.bru` — basic submit
- `bruno/reelstack/reel/matrix-status.bru` — poll
- `bruno/reelstack/reel/matrix-cancel.bru` — abort
- `bruno/reelstack/matrix-extra/matrix-cardslug-ab.bru` — visual A/B test
- `bruno/reelstack/matrix-extra/matrix-multi-dim.bru` — language × platform × card
- `bruno/reelstack/matrix-extra/matrix-fork-only.bru` — single language, all platforms
- `bruno/reelstack/matrix-extra/matrix-caption-style.bru` — caption color × position
- `bruno/reelstack/matrix-extra/matrix-brand-ab.bru` — brand color A/B
- `bruno/reelstack/matrix-extra/matrix-scrollstopper-ab.bru` — intro animation A/B
- `bruno/reelstack/matrix-extra/matrix-highlight-mode-ab.bru` — caption highlight A/B
- `bruno/reelstack/recipes/viral-content-{1,2,3}-*.bru` — multi-step recipe (submit → poll → publish)
