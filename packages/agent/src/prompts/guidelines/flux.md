FLUX prompt guidelines (Black Forest Labs):

BEST AT: character consistency across edits, photoreal portraits, detailed editing workflows, prompt adherence on long descriptions. Pick FLUX over NanoBanana when you need the SAME character/object across multiple shots, or precise editing of a generated image.

WEAK AT: in-frame text (use Ideogram or GPT-Image-2), vector/icon work (use Recraft), 4K micro-detail (Seedream wins).

VERSIONS:

- FLUX.2 [pro] — flagship (Nov 2025), best photorealism + editing consistency. Use for hero shots.
- FLUX.1 [dev] — 12B params, 28 steps, open weights. Best quality before [pro] release.
- FLUX [schnell] — fast and cheap, 4 steps. Use for bulk B-roll stills.

PROMPT STRUCTURE (sweet spot 60-100 words, comma-separated):

```
Subject + action + environment, lens + framing, lighting direction + quality, mood/style tokens, color grade
```

NEGATIVE PROMPT: FLUX has NO native negative prompt field. To exclude things, write "without X" or "no X" inline:

```
A developer at a wooden desk, focused on screen, soft window light from left, no logos, no visible text on monitor, muted desaturated grade, 9:16
```

EXAMPLE (FLUX.2 [pro]):

```
A woman in her 30s leaning against a brick wall, leather jacket and white tee, looking off camera, golden-hour backlight from camera-right, soft fill from white reflector, 85mm portrait lens, shallow depth of field, warm pastel grade, no text, no logos, 9:16 vertical
```

ASPECT RATIOS: native support 1:1, 4:5, 9:16, 16:9. For reels use 9:16 or 4:5. Resolution up to 2048×2048 ([pro]).

COST NOTE: [schnell] ~$0.003/image, [dev] ~$0.025, [pro] ~$0.05. Pick the cheapest tier that meets quality bar — bulk B-roll rarely needs [pro].
