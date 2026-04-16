# Modules

ReelStack's reel-generation capabilities (slideshow, captions, n8n-explainer, etc.) live in a **catalog** backed by the `Module` table. Each row defines:

- **`slug`** — matches the API `mode` value, so the API parameter maps directly to a catalog row. No translation table.
- **`creditCost`** — charged per successful render. Different modules have different costs because some use more AI (e.g. Talking Head spins up HeyGen/Kling; Captions only needs Whisper).
- **`requiredTier`** — optional tier-rank gate. `null` means "available to everyone". `PRO`, `AGENCY`, `OWNER` mean "only tiers at or above this rank".
- **`enabled`** — kill-switch for operators.

## Access control

`canUserAccessModule(user, slug)` — the single source of truth. Resolution order:

1. **Explicit grant:** a non-expired row in `UserModuleAccess` unlocks the module for that user regardless of tier. Created by:
   - Seed (for `OWNER_EMAILS` users, as a defensive belt-and-suspenders)
   - Future: Stripe webhook on standalone module purchase
   - Admin tools (manual, gifts, promos)

2. **Tier rank:** `TIER_RANK[user.tier] >= TIER_RANK[module.requiredTier]`. Ranks: `FREE=0, SOLO=1, PRO=2, AGENCY=3, OWNER=4`. `OWNER` sits above every paid tier so owner users automatically pass every gate without a special code path.

3. **Open module:** `requiredTier === null` → accessible to everyone.

Denied otherwise.

## Owner mode

Users listed in the `OWNER_EMAILS` env var (comma-separated) are promoted to the `OWNER` tier on sign-in. `isUnlimited(user)` returns `true` for them, which:

- Skips `consumeCredits` in `/api/v1/reel/generate` — owner renders don't count against any budget.
- Surfaces `unlimited: true` in `/api/v1/user/usage` so the dashboard can render an "OWNER" banner instead of a progress bar.
- Tier-rank comparison unlocks every module regardless of `requiredTier`.

Owner tier is **not a sellable plan**. It's a hard-gated admin privilege driven entirely by env config.

## Current catalog (seeded by `scripts/seed-modules.ts`)

Each module is a plug-in: code + its own `README.md` live together. Load
the module-specific doc only when you actually call that mode.

| Slug                  | Cost | Gate   | Doc (lazy-load)                                                                                                |
| --------------------- | ---- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `generate`            | 15   | —      | [`AGENTS.md § API Endpoints`](../AGENTS.md)                                                                    |
| `compose`             | 12   | —      | [`AGENTS.md § API Endpoints`](../AGENTS.md)                                                                    |
| `slideshow`           | 10   | —      | [`slideshow/README`](../packages/modules/src/slideshow/README.md)                                              |
| `captions`            | 8    | —      | [`captions/README`](../packages/modules/src/captions/README.md)                                                |
| `talking-object`      | 15   | —      | [`ai-tips-module.md`](../packages/modules/src/private/agent/modules/ai-tips-module.md)                         |
| `n8n-explainer`       | 20   | AGENCY | [`n8n-explainer-module.md`](../packages/modules/src/private/agent/modules/n8n-explainer-module.md)             |
| `presenter-explainer` | 30   | PRO    | [`presenter-explainer-module.md`](../packages/modules/src/private/agent/modules/presenter-explainer-module.md) |

### Shared polish layers (apply to every module)

These wrap every composition — any module can opt in by passing the field.
Agents should read only the one they're configuring:

- [`scrollStopper`](./features/scroll-stopper.md) — intro attention grab
- [`endCard`](./features/end-card.md) — closing CTA overlay
- [`captionPreset`](./features/caption-presets.md) — premium caption renderers

Changing a cost or gate: edit `MODULE_DEFAULTS` in `packages/database/src/modules.ts` and redeploy. Seed is idempotent and runs every deploy.

## Private modules

Some modules (n8n-explainer, talking-objects, etc.) live in a **separate private repository** (`jurczykpawel/reelstack-modules`) because they ship closed-source. They are NOT in the public reelstack monorepo.

### Local development

`scripts/sync-private-modules.sh` rsyncs `~/workspace/projects/reelstack-modules/src/` into `packages/modules/src/private/` (gitignored) and regenerates `apps/web/remotion-entry.local.ts` so the local Remotion renderer picks them up.

### CI

`.github/workflows/docker-build.yml` clones the private repo using the `MODULES_DEPLOY_KEY` secret (a read-only deploy key configured on `reelstack-modules`). Missing secret → warning, not failure — forks still build with public core modules only.

The key lives in Vaultwarden as `reelstack-modules CI Deploy Key`.

## Roadmap

- **Phase 2** — tier-gating UI + Stripe subscription. Locked modules shown as disabled with "Upgrade" tooltip; `/pricing` page; webhook-driven tier changes. See `vault/personal/_db-tasks/reelstack-phase-2-tier-ui.md`.
- **Phase 3** — runtime bundle loading via R2 + per-module Stripe checkout → marketplace. See `vault/personal/_db-tasks/reelstack-phase-3-marketplace.md`. Fields already in schema (`bundleUrl`, `version`, `thumbnailUrl`, `previewUrl`) are placeholders for this phase.

## Files

- `packages/database/prisma/schema.prisma` — `Module`, `UserModuleAccess`, `Tier` enum
- `packages/database/src/modules.ts` — `isUnlimited`, `canUserAccessModule`, `listAccessibleModules`, `grantModuleAccess`, `MODULE_DEFAULTS`, `seedModuleDefaults`
- `scripts/seed-modules.ts` — seed runner, honors `OWNER_EMAILS`
- `apps/web/src/app/api/v1/modules/route.ts` — `GET /api/v1/modules`
- `apps/web/src/app/api/v1/reel/generate/route.ts` — access check + per-module pricing
- `apps/web/src/app/api/v1/user/usage/route.ts` — surfaces `unlimited` flag
- `apps/web/src/lib/auth.ts` — `syncOwnerTier()`
