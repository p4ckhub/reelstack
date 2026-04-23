NanoBanana 2 (Gemini Imagen) prompt guidelines:

BEST AT: photoreal scenes, infographics, conversational iterative editing (Gemini understands "make it warmer" without re-prompting), Google Search grounding (can pull real-world references like brand color schemes or recent product photos to ground generation).

WEAK AT: complex JSON layouts at small sizes, vector/icon work (Recraft wins), heavy text rendering (Ideogram wins).

KEY INSIGHT: Both plain text with structured sections AND JSON prompts work well. Choose based on use case:

- **Structured plain text** (Pattern A): best for B-roll, lifestyle, editorial — more natural, flexible
- **JSON prompt** (Pattern B): best for product photography, commercial shots — precise control over each aspect, prevents "concept bleeding" between adjectives

ITERATIVE EDITING (unique strength): if a generation is 80% correct, do NOT regenerate from scratch. Send a follow-up like "keep everything the same but make the lighting warmer and shift the subject left" — Gemini holds context and applies the change. Saves cost vs cold regeneration.

GOOGLE SEARCH GROUNDING: when describing branded/real-world subjects, you can ask the model to ground on current reality: "use the official Polestar 4 silhouette" or "match the current Apple AirPods Pro 2 form factor". Use sparingly — only for accuracy, not for replicating logos (logos are still unreliable; describe the concept).

### Pattern A — Structured plain text (recommended for most shots)

```
Scene: [brief scene description]
Subject: [who/what, pose, expression, clothing]
Environment: [setting, background, atmosphere]
Lighting: [type, direction, intensity, color temperature]
Camera: [lens mm, framing, focus/DOF]
Negative: [what to avoid]
```

### Pattern B — JSON prompt (recommended for product / commercial shots)

```json
{
  "scene_type": "commercial product photography",
  "product": { "type": "...", "material": "...", "finish": "..." },
  "composition": "centered / rule-of-thirds / off-center dynamic",
  "lighting": "soft diffused studio / dramatic rim / golden hour",
  "background": "seamless white / gradient / contextual environment",
  "camera": "85mm macro, f/2.8 shallow depth, sharp focus on product",
  "mood": "luxury editorial / clean minimal / aspirational lifestyle",
  "negative": "blurry, distorted, text, watermarks, clutter"
}
```

LIGHTING PARAMETERS (most impactful field — always include):

- Type: natural | studio | golden hour | neon | dramatic
- Direction: front | side | back | rim
- Intensity: soft / diffused | hard | harsh
- Temperature: warm amber | cool blue | neutral white

CAMERA PARAMETERS:

- Lens: 24mm (wide) | 35mm (street) | 50mm (natural) | 85mm (portrait) | 135mm (telephoto)
- Framing: extreme close-up | close-up | medium shot | wide shot | bird's eye
- Focus: sharp | shallow depth of field (f/1.4–f/2.8) | tilt-shift
- Layout: centered | rule of thirds | symmetrical | negative space on right

STYLE KEYWORDS: `documentary realism` | `lifestyle photography` | `editorial` | `vintage film` | `product shot` | `isometric illustration` | `technical blueprint`

NEGATIVE PROMPT PATTERNS (always include):

- For photos: `blurry, distorted, low quality, text, watermarks, logos, uncanny`
- For clean product shots: `clutter, busy background, harsh shadows, overexposed`
- Add `No text` at the end if no text wanted in frame

ASPECT RATIOS: 1:1, 4:5, 9:16, 16:9. Native up to 2048×2048 (NanoBanana 2). For reels use 9:16.

Good for: thumbnails, infographics, product shots, title card backgrounds, editorial stills, iterative refinement workflows
Avoid for: logos with text (use Ideogram), animation, vector exports (use Recraft)
