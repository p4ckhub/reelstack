## gpt-image-1 (OpenAI Image) prompt rules

gpt-image-1 inherits GPT-4's language understanding — it follows detailed,
natural-language descriptions better than DALL-E 3 did. Treat it like
you're briefing a photographer, not writing keywords.

### What works

- **Subject + action + environment + light** in a complete sentence.
  "Close-up of a developer's hands resting on a mechanical keyboard,
  dark office, single warm desk lamp from camera-right, blue monitor
  glow reflecting off the keys."
- **Lens + camera framing tokens** (85mm portrait, shallow depth of field,
  macro, etc.) — same vocabulary as our other image tools.
- **Explicit negative list** inside the prompt: "no visible faces", "no
  text overlays", "no logos" — the model respects these reliably.
- **One clear subject per image**. gpt-image-1 handles a second element
  but degrades when you pack 3+ distinct things into one frame.

### What to avoid

- Forbidden words we ban for every tool: cinematic, epic, masterpiece,
  stunning, beautiful, 8K, 4K, hyper-realistic, photorealistic,
  ultra-real, award-winning, breathtaking, amazing, professional.
- Abstract metaphors without grounding ("the essence of productivity").
  Name the concrete scene instead.
- Over-specifying output format ("4:3", "square", "vertical") — the
  aspect ratio is set via the API size param, not via prompt.

### gpt-image-1 specifics

- Sizes available: 1024x1024 (square), 1024x1536 (portrait 2:3),
  1536x1024 (landscape 3:2). There is NO true 9:16 — for vertical reels
  we pick 1024x1536 and crop/letterbox in Remotion.
- Quality levels: low / medium / high. Default medium. High triples the
  cost and is usually overkill for 2-second b-roll cuts.
- Output: base64 PNG returned in response JSON. No URL route.
- Knows text rendering — ok to ask for short in-frame text (under 12
  chars) like a street sign or screen label. Don't ask for paragraphs.

### gpt-image-2 specifics (April 2026)

Same API surface as gpt-image-1, newer model string. Three practical
differences when the brief calls for gpt-image-2:

- **Text rendering is dramatically better.** Full multilingual sentences,
  short paragraphs, infographic layouts, slide-style compositions,
  even manga panels with legible dialogue. If the shot needs in-frame
  text longer than a label, gpt-image-2 beats gpt-image-1 decisively.
- **~2× faster** at equivalent sizes and quality. Drops shot generation
  from ~20s to ~10s, useful when the pipeline has 8+ image shots.
- **Up to 4096×4096 output** if the spec allows. For reels we stay at
  1024x1536 because Remotion downsamples anyway; set
  OPENAI_IMAGE_SIZE=2048x3072 when the brief needs print-grade detail.

Everything else (replacement vocabulary, forbidden words, single-subject
framing) applies identically to both models.
