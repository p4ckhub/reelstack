export const content = `NanoBanana (Gemini Imagen) prompt guidelines:

KEY INSIGHT: Both plain text with structured sections AND JSON prompts work well. Choose based on use case:

- **Structured plain text** (Wzorzec A): best for B-roll, lifestyle, editorial — more natural, flexible
- **JSON prompt** (Wzorzec B): best for product photography, commercial shots — precise control over each aspect

Wzorzec A — Structured plain text (recommended for most shots):
\\\`\\\`\\\`
Scene: [brief scene description]
Subject: [who/what, pose, expression, clothing]
Environment: [setting, background, atmosphere]
Lighting: [type, direction, intensity, color temperature]
Camera: [lens mm, framing, focus/DOF]
Negative: [what to avoid]
\\\`\\\`\\\`

Wzorzec B — JSON prompt (recommended for product/commercial shots):
\\\`\\\`\\\`json
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
\\\`\\\`\\\`

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
