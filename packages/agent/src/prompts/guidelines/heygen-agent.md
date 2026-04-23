HeyGen Video Agent (Seedance 2.0 backbone) prompt guidelines:

This is a PROMPT-BASED tool, not script-based. The agent decides shots, cuts, camera angles, and B-roll automatically from your description.

DISAMBIGUATION:

- `heygen-agent` (this) → describe the VIDEO you want; agent generates multi-shot reel with avatar woven in. Backbone = Seedance 2.0 (cinematic motion, physics-accurate lighting).
- `heygen` (Studio) → write the SCRIPT for the avatar to read; one continuous take. Use heygen.md for script rules.

PROMPT PATTERN: describe scene + mood + visual style + what the avatar is doing. The agent interprets these into shots.

GOOD prompt:

```
A tech entrepreneur explains why self-hosting beats SaaS, walking through a modern home office with plants and a standing desk, camera follows them naturally with a slow handheld push, warm afternoon light from a large window, muted desaturated grade
```

BAD prompt (this is a script — use heygen Studio instead):

```
Hello, today I want to talk about why self-hosting beats SaaS...
```

UNDERLYING MODEL = SEEDANCE: see `seedance.md` for the full 5-layer framework, complexity levels, forbidden words, and camera/lighting vocabulary. heygen-agent inherits all of those rules — the only difference is the avatar is automatically present in the scene.

CONSTRAINTS:

- Max 12 seconds per Seedance clip; agent stitches up to 3 minutes total.
- Orientation: portrait (9:16) or landscape (16:9).
- Reference avatar must be pre-trained in HeyGen account.

BEST FOR: cinematic intros, dynamic B-roll with avatar, multi-shot sequences where the avatar is woven into the scene rather than centered as a talking head.

NOT FOR: precise script delivery (use `heygen` Studio), tight script-to-frame timing, dialogue-heavy explainers.
