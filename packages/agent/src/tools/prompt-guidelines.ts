/**
 * Shared prompt guidelines per AI model.
 * Each model has ONE canonical guideline, imported by all provider wrappers
 * (piapi, kie, fal, wavespeed, replicate, direct API).
 *
 * Source research:
 * - Seedance: vault/brands/_shared/reference/video-prompting-seedance.md (GitHub: Emily2040/seedance-2.0)
 * - NanoBanana: vault/brands/_shared/reference/json-prompting-image-generation.md (GitHub: YouMind-OpenLab)
 * - Veo3: veo3-tool.ts (Google documentation)
 * - Kling: kling-tool.ts (community best practices)
 */

// ── VIDEO MODELS ────────────────────────────────────────────────

export const SEEDANCE_GUIDELINES = `Seedance 2.0 prompt framework (5 layers):
SUBJECT + ACTION + CAMERA + STYLE + SOUND

CRITICAL RULE: Subject + Action must appear in the FIRST 20-30 words. The model weights early tokens heavily.

Complexity levels (use L2 for most B-roll shots):
- L1 (≤30 words): atmospheric, let the model decide — "Foggy mountain lake at dawn, still water, bird call. Locked wide shot."
- L2 (30-100 words): directed shot with clear subject + camera + lighting — DEFAULT for agent
- L3 (100-300 words): timestamped multi-scene — "[00:00-00:05] Wide shot of city at dusk, drone descending. [00:05-00:10] Medium close-up, camera tracks subject walking. [00:10-00:15] ECU on hands typing, shallow DOF."
- L4 (300-1000w): full choreography per shot with physics and reactions

Bracket-annotated format (alternative to L2, good for complex shots):
\`\`\`
[Subject]: developer typing on mechanical keyboard, face lit by monitor glow
[Camera]: medium close-up, slow dolly push, eye level, handheld drift
[Lighting]: cool blue monitor fill from front, warm amber rim from window-right, low-key
[Style]: digital clean, muted tones
\`\`\`

Camera parameters:
- Framing: wide | medium | close-up | ECU | over-shoulder | full body
- Movement: locked-off | dolly push | dolly pull | pan | tilt | orbit | handheld | crane | tracking
- Speed: slow | moderate | fast | "over 8 seconds"
- Angle: eye level | low angle | high angle | bird's eye | Dutch angle

Lighting parameters:
- Direction: camera-left | camera-right | above | below | behind (rim)
- Contrast: low-key (shadows) | high-key (bright, flat)
- Temperature: warm amber | cool blue | neutral white
- Shadows: hard-edged | soft wrap | absent

Style tokens (max 2-3): anamorphic | film grain | digital clean | muted | neon-saturated | warm/cold contrast

FORBIDDEN words (these literally degrade Seedance output quality — NEVER use them):
cinematic, epic, masterpiece, ultra-real, award-winning, stunning, 8K, 4K, beautiful, breathtaking, immersive, ethereal, magical, hyper-realistic, photorealistic, high quality, professional, amazing

Replace with MEASURABLE descriptions:
- WRONG: "cinematic lighting" → RIGHT: "45-degree hard key camera-left, warm amber, deep shadow"
- WRONG: "epic scale" → RIGHT: "wide shot, subject occupies 10% of frame, mountain backdrop"
- WRONG: "cinematic aerial shot" → RIGHT: "bird's eye crane descending, wide shot"
- WRONG: "cinematic 4K" → RIGHT: "digital clean, locked wide shot"

MANDATORY STRUCTURE for every prompt:
1. SUBJECT + ACTION (first 20-30 words — model weights these heavily)
2. CAMERA: framing (wide/medium/close-up/ECU) + movement (locked-off/dolly push/pan/orbit/crane) + speed + angle
3. LIGHTING: direction (camera-left/above/behind) + contrast (low-key/high-key) + temperature (warm amber/cool blue) + shadows (hard-edged/soft wrap)
4. STYLE: max 2-3 tokens (anamorphic, film grain, muted, neon-saturated)

Good for: product reveals, lifestyle B-roll, mood pieces, architecture, social proof moments`;

export const KLING_GUIDELINES = `Kling prompt guidelines:
- Lead with the primary action, not the scene: "a hand slams a coffee cup onto a desk" not "a desk with a coffee cup"
- Short and punchy works best: 20-40 words, one clear moment
- Subject must be unambiguous: "a young woman with dark hair runs through rain" not "a person running"
- Motion verbs drive quality: slam, pour, explode, unfold, sweep, cascade
- Style tags that work well: "cinematic", "4K", "slow motion", "macro shot"
- Good at: dramatic gestures, product interactions, nature close-ups, urban scenes
- Weak at: complex multi-person scenes, long continuous shots over 8s, abstract art`;

export const VEO3_GUIDELINES = `Google Veo 3.1 prompt patterns (pick one per shot):

PATTERN A — Detailed cinematic direction (60-150 words):
"Film stock: Kodak Vision3 500T 5219. INT. BASEMENT LAB — NIGHT.
Locked medium-shot. A developer hunches over a monitor, face lit by 500-line terminal green.
Coffee mug, circuit boards, sticky notes fill the desk. Low hum of server fans."
Use for: hero shots, opening sequences, product reveals.

PATTERN B — Film stock + camera language (30-60 words):
"35mm, Kodak Portra 400. EXT. ROOFTOP — GOLDEN HOUR.
Slow dolly push on a woman gazing over city skyline. Wind catches her hair. Warm backlight, lens flare."
Use for: atmospheric B-roll, mood-setting shots.

PATTERN C — Simple one-liner (≤20 words):
"Close-up of rain hitting a neon sign, reflections on wet asphalt."
Use for: quick filler B-roll, transitions.

For person shots add negative context: "No deformed hands, no extra fingers."
Supports native dialogue — write spoken text in quotes within prompt.`;

export const HAILUO_GUIDELINES = `MiniMax Hailuo prompt guidelines:
- Lead with subject + action: "A woman walks through a neon-lit market" not "A market with a woman"
- Camera hints work: "slow push-in", "tracking shot", "locked wide"
- Keep under 200 words — model reads full prompt but quality drops after ~100 words
- Best at: cinematic short clips, lifestyle, product reveals, urban/nature scenes
- video-01-live: more dynamic motion, good for action
- video-01: smoother, better for calm/atmospheric shots`;

export const RUNWAY_GUIDELINES = `Runway Gen-4 excels at cinematic camera moves, smooth transitions, and photorealistic scenes. Focus on: motion type (push, pull, pan, dolly), lighting quality (golden hour, studio, overcast), and subject clarity. Keep prompts under 50 words. Avoid: people's faces (copyright), text in frame, logo requests.`;

export const HUNYUAN_GUIDELINES = `Hunyuan Video (Tencent): excellent cinematic quality, strong motion realism.
Natural language prompts work well. Good for: people, urban scenes, product videos.
Keep prompts descriptive but not too long — 50-100 words optimal.`;

export const WAN_GUIDELINES = `WAN 2.6 (Alibaba): advanced video with native audio support, 720p.
Stronger than WAN 2.1 in motion quality and character consistency.
Good for: lifestyle, nature, urban scenes. Supports multi-shot descriptions.`;

export const PIKA_GUIDELINES = `Pika 2.2: cinematic text-to-video, up to 1080p. Great for transitions and product reveals.
Lead with action: "A coffee cup slides into frame on a marble surface".
Duration: 5s or 10s. Supports camera motion hints: "slow zoom", "pan left", "tracking shot".`;

export const LTX_GUIDELINES = `LTX-2.3 (Lightricks): open-source, fast, up to 4K, up to 20s, native audio support.
Good for: atmospheric B-roll, nature, abstract, motion graphics.
Negative prompt important: always include "blurry, low quality, distorted, flickering".`;

export const LUMA_GUIDELINES = `Luma Dream Machine: smooth cinematic motion, great physics simulation.
Strengths: fluid motion, reflections, caustics, natural environments.
Keep prompt focused on one scene: "Ocean waves crash on rocky shore at golden hour, slow motion, handheld".
Duration: "5s" or "10s" (as string).`;

export const SORA_GUIDELINES = `Sora 2 (OpenAI): accurate physics, sharp realism, synchronized audio.
State-of-the-art for photorealistic video. Expensive — use for hero shots only.
Prompts: cinematic scene descriptions work best. Avoid vague adjectives.`;

// ── IMAGE MODELS ────────────────────────────────────────────────

export const NANOBANANA_GUIDELINES = `NanoBanana (Gemini Imagen) prompt guidelines:

KEY INSIGHT: Both plain text with structured sections AND JSON prompts work well. Choose based on use case:
- **Structured plain text** (Wzorzec A): best for B-roll, lifestyle, editorial — more natural, flexible
- **JSON prompt** (Wzorzec B): best for product photography, commercial shots — precise control over each aspect

Wzorzec A — Structured plain text (recommended for most shots):
\`\`\`
Scene: [brief scene description]
Subject: [who/what, pose, expression, clothing]
Environment: [setting, background, atmosphere]
Lighting: [type, direction, intensity, color temperature]
Camera: [lens mm, framing, focus/DOF]
Negative: [what to avoid]
\`\`\`

Wzorzec B — JSON prompt (recommended for product/commercial shots):
\`\`\`json
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
\`\`\`

Lighting parameters (most impactful field):
- Type: natural | studio | golden hour | neon | dramatic
- Direction: front | side | back | rim
- Intensity: soft / diffused | hard | harsh
- Temperature: warm amber | cool blue | neutral white

Camera parameters:
- Lens: 24mm (wide) | 35mm (street) | 50mm (natural) | 85mm (portrait) | 135mm (telephoto)
- Framing: extreme close-up | close-up | medium shot | wide shot | bird's eye
- Focus: sharp | shallow depth of field (f/1.4–f/2.8) | tilt-shift
- Layout: centered | rule of thirds | symmetrical | negative space on right

Style keywords: "documentary realism" | "lifestyle photography" | "editorial" | "vintage film" | "product shot" | "isometric illustration" | "technical blueprint"

Negative prompt patterns (always include):
- For photos: "blurry, distorted, low quality, text, watermarks, logos, uncanny"
- For clean product shots: "clutter, busy background, harsh shadows, overexposed"
- Add "No text" at the end if no text wanted in frame

Good for: thumbnails, infographics, product shots, title card backgrounds, editorial stills
Avoid for: logos (use Ideogram instead), animation, video thumbnails with text overlays`;

export const FLUX_GUIDELINES = `FLUX prompt guidelines:
Use detailed scene description + lighting + camera specs. Short prompts work but detail improves quality.
FLUX Pro: higher quality, better prompt adherence — use for hero shots.
FLUX Schnell: fast and cheap — use for bulk B-roll stills.
FLUX Dev: 12B params, 28 steps — best quality but slower.`;

export const IDEOGRAM_GUIDELINES = `Ideogram v3: best model for images WITH TEXT (titles, captions, labels in frame).
Include quoted text exactly as it should appear: 'A neon sign reading "SALE 50% OFF"'.
Supports Polish characters. For pure visuals without text, prefer FLUX or NanoBanana instead.`;

export const RECRAFT_GUIDELINES = `Recraft v3: best for design-style images, illustrations, icons, UI mockups, vector-like artwork.
Style options via prompt suffix: "realistic_image" | "digital_illustration" | "vector_illustration" | "icon".
Good for: infographic elements, product mockups, flat design, brand imagery.
Avoid for: photorealistic scenes (use FLUX or Imagen4 instead).`;

export const SEEDREAM_GUIDELINES = `Seedream 4.5 (ByteDance): photorealistic images in 2-3s, up to 4MP (2048x2048), $0.04/image.
Best for: product shots, lifestyle photos, editorial imagery, social media visuals.
Prompts: natural language works well, no special syntax needed.
Supports: text-in-image (Chinese and English), photorealistic, illustration styles.`;

export const QWEN_IMAGE_GUIDELINES = `Qwen Image 2.0 (Alibaba): photorealistic images, bilingual (Chinese/English), $0.04/image.
Excellent prompt adherence, strong for lifestyle and commercial imagery.
Works well with natural language — no special syntax needed.`;

// ── STOCK / OTHER ───────────────────────────────────────────────

export const PEXELS_GUIDELINES = `Pexels search query guidelines:

CRITICAL: Pexels is a LITERAL search engine. It matches EXACTLY what you type against video/photo tags.
- Use 1-2 word CONCRETE NOUNS that describe a REAL physical object or scene
- Good: "laptop typing", "office desk", "smartphone screen", "person coding", "server room", "whiteboard notes"
- Bad: "magic box glowing", "checklist tasks steps", "sunrise new beginning", "creative process flowing"
- NEVER use metaphors, adjectives, or abstract concepts — Pexels returns GARBAGE for those
- NEVER combine unrelated nouns: "checklist tasks steps" returns cooking videos. Use "checklist" alone.
- When in doubt, use the SIMPLEST single noun: "laptop", "phone", "office", "code", "chart"

Query translation examples (script concept → Pexels query):
- "automatyzacja zadań" → "laptop automation" or "image:workflow diagram"
- "oszczędność czasu" → "image:clock time" or "person working fast"
- "krok po kroku" → "image:step by step" or "person writing list"
- "nowe możliwości" → "image:open laptop" or "person smartphone"
- "wzrost efektywności" → "image:chart growth" or "image:dashboard analytics"

ALWAYS write queries in ENGLISH — Pexels search works only in English.

VIDEO vs IMAGE search:
- To get STILL IMAGES, prefix searchQuery with "image:" (e.g. "image:laptop desk")
- Without prefix: returns videos (e.g. "laptop typing")
- **PREFER IMAGES** for most B-roll — they get automatic Ken Burns zoom/pan animation and look more professional than random stock video
- Use videos ONLY when you need actual motion (hands typing, walking, pouring)
- Images work great for: establishing shots, backgrounds, tech setups, abstract concepts, data moments
- Videos are better for: action sequences (typing, walking, cooking), dynamic lifestyle shots`;

export const HEYGEN_GUIDELINES = `HeyGen avatar script guidelines:
- Write natural spoken language, not written prose — contractions, short sentences
- One idea per sentence: "This is huge. And here's why." not "This is huge because of several reasons."
- Mark pauses with "..." or commas — HeyGen respects punctuation rhythm
- Avoid tongue-twisters, alliteration, or complex technical abbreviations unless spelled out
- Numbers: write out "fifty thousand" not "50,000" for natural speech
- Emphasis: CAPS for stressed words ("this is INSANE") — avatar will stress them
- Keep segments under 90 seconds per generation to avoid quality degradation
- The script IS the visual — no need to describe camera angles or scene`;
