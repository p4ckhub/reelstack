Recraft v3/v4 Pro prompt guidelines:

BEST AT: vector illustrations, icons, UI mockups, infographic elements, brand-styled imagery with consistent visual language across a campaign. Recraft has direct-to-design-tool export (SVG, PNG with transparent background) — uniquely suited for design workflows.

WEAK AT: photoreal humans (use FLUX or Seedream), in-frame text-heavy posters (use Ideogram or GPT-Image-2), photo editing.

STYLE SUFFIX (mandatory — append to prompt):

- `realistic_image` — photo-style output
- `digital_illustration` — modern flat illustration
- `vector_illustration` — SVG-ready vector look
- `icon` — single-glyph icon, transparent background

PROMPT PATTERN — describe the BRAND VISUAL LANGUAGE, not abstract adjectives:

- BAD: "minimalist illustration of a laptop"
- GOOD: "clean Scandinavian minimalism illustration of a laptop, sage green and warm cream palette, thin line art, generous negative space"

Brand-styling vocabulary that works:

- "warm artisan food photography"
- "bold athletic streetwear"
- "calm Nordic editorial"
- "playful pastel children's-book illustration"
- "tech editorial flat vector, monochrome with one accent color"

EXAMPLE (digital_illustration):

```
Flat illustration of an open laptop on a wooden desk, plant in the corner, side window light, calm Nordic editorial style, sage green and warm cream palette, thin line work, generous negative space top-right for headline overlay. digital_illustration
```

EXAMPLE (icon):

```
Single icon of a coffee cup with steam curl, monoline thin black stroke, transparent background, balanced negative space, app-icon legible at 64px. icon
```

ASPECT RATIOS: 1:1, 4:5, 9:16, 16:9. Default 1024×1024.

COST NOTE: ~$0.04/image. Cheap enough for bulk illustration. SVG export is the killer feature — pick Recraft over FLUX when output goes into Figma/Adobe.
