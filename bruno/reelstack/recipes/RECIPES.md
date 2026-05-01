# Bruno Recipes

Multi-step workflows that exercise several endpoints back-to-back. Each
recipe lives as its own folder; run sequentially in Bruno (the `seq:`
front-matter sets order). Variables flow between calls via
`bru.setVar()`.

| Recipe                        | Story                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `viral-content-batch.bru`     | Solo creator pipeline: 1 n8n workflow URL → 6 platforms × 2 langs → check status → download all.   |
| `iterate-and-publish.bru`     | Iterate on a base reel: generate → preview → fork with 3 different end-cards → publish best to IG. |
| `cost-aware-batch.bru`        | Check usage → budget batch size → submit matrix → monitor. Refuses if would exceed quota.          |
| `cardslug-ab-pick-winner.bru` | A/B 5 card animations → tag the best one back into user preferences as the new default.            |

These are reference scripts; copy and adapt. None of them are tested by
CI — they hit the live dev server.
