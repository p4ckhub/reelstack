Ideogram v3 prompt guidelines:

BEST AT: images WITH READABLE TEXT — titles, posters, labels, signs, thumbnails, memes, logo concepts. Highest text-rendering accuracy of all current image models (tied with GPT-Image-2). Reliable with Polish characters.

WEAK AT: photoreal humans (use FLUX or Seedream), natural scenes without text (use NanoBanana 2 or Seedream).

CORE RULES:

1. **Quote exact text** in single quotes inside the prompt: `a poster with the words 'SPRING EDIT' in bold condensed sans-serif`. Unquoted text triggers character hallucination.
2. **Describe the typography** — never the font name. Say "thin rounded bauhaus-style typeface" not "Arial".
3. **Specify placement**: `centered`, `curved above icon`, `bottom footer`, `top-third`.
4. **Backgrounds**: always declare `white background` or `transparent background` for logos/cards.
5. **Short text wins** — 1-3 words renders cleanly. Long sentences degrade. For paragraphs, use GPT-Image-2.
6. **Sweet spot**: 15-25 words total prompt.
7. **Modes**: Design mode (vs General) increases text accuracy. Magic Prompt ON auto-enriches typography details.
8. **When text comes out wrong**: regenerate, don't try to fix the layout in the prompt.

PROMPT PATTERNS:

Wordmark logo:

```
a wordmark logo 'BrandName' for a [INDUSTRY], [STYLE] typeface, on a white background
```

Poster / thumbnail:

```
a minimalist poster with the words 'SPRING EDIT' in bold condensed sans-serif, dark navy background, centered top-third, generous negative space below
```

Reel title card:

```
a vertical title card 9:16 with the words 'STOP SCROLLING' in heavy display sans-serif, white text on solid crimson background, centered
```

Mascot with text:

```
a mascot logo of a [CHARACTER] with text 'BrandName' below, flat vector style, on a white background
```

ASPECT RATIOS: 1:1 for logos, 9:16 / 4:5 for reel title cards, 16:9 for thumbnails.

COST NOTE: ~$0.04-0.08/image depending on tier. Pick Ideogram when text is the WHOLE job — otherwise NanoBanana 2 or FLUX is cheaper for plain visuals.
