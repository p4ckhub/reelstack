LTX-2.3 (Lightricks) prompt guidelines:

BEST AT: open-source video with NATIVE SINGLE-PASS AUDIO — first open model to generate dialogue, lip movements, and ambient sound aligned with video in one inference pass. Up to 4K, up to 20s clips. Fast generation. Atmospheric B-roll, nature, abstract motion graphics.

UNIQUE: LTX-2 understands BOTH visual and audio cues. A prompt mentioning "loud thunder crack" will sync the flash of light with the audio peak.

WEAK AT: complex multi-person dialogue scenes, in-frame text, photoreal portraits at extreme close-up (Sora 2 / Veo 3.1 win there).

PROMPT PATTERN — describe the SCENE + the SOUND together:

```
[Visual scene + camera + lighting]. [Audio elements: dialogue / ambient / SFX].
```

ALWAYS include negative prompt: `blurry, low quality, distorted, flickering, warped`.

EXAMPLES:

Audio-synced action:

```
A cinematic shot of a thunderstorm over a rocky coastline at night. Lightning strikes a lone tree on the cliff. Camera locked wide, slow push-in. Cool blue ambient with white lightning flash. Audio: loud thunder crack on the lightning strike, heavy rain pouring, distant ocean waves crashing.
```

Atmospheric B-roll:

```
A neon-lit Tokyo alley after rain, steam rising from a manhole, slow tracking shot at eye-level, magenta and cyan signs reflected on wet pavement. Audio: distant traffic hum, faint izakaya chatter, soft rain.
```

Nature with ambient:

```
Sunlight breaks through tall pine trees in a misty forest, slow handheld pull-back, warm golden shafts cutting through cool blue mist, particles drifting. Audio: birdsong, distant stream, wind through pine needles.
```

NEGATIVE PROMPT (always include):

```
blurry, low quality, distorted, flickering, warped, oversaturated, glitch artifacts
```

DURATION: 5s, 10s, 15s, up to 20s. Quality holds well to 15s, slight degradation at 20s.

ASPECT RATIOS: 16:9, 9:16, 1:1. Native up to 4K (most hosts cap at 1080p).

WHEN TO PICK LTX-2:

- vs Veo 3.1 / Sora 2: LTX-2 when you want native audio at fraction of cost.
- vs WAN 2.6: LTX-2 has tighter audio-visual sync (single pass). WAN 2.6 has slightly stronger visuals.
- vs Hunyuan: LTX-2 for atmospheric / abstract / nature with audio. Hunyuan for cleaner cinematic polish without audio.

COST NOTE: ~$0.05-0.20/clip on hosted APIs. Among the cheapest models with native audio. Excellent for atmospheric B-roll where ambient sound adds production value cheaply.
