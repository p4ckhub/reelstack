WAN 2.2 / 2.6 (Alibaba) prompt guidelines:

BEST AT: lifestyle, nature, urban scenes, multi-shot descriptions in a single prompt, multi-dimensional visual control (lighting, color, composition as explicit fields). WAN 2.6 adds native audio at 720p.

ARCHITECTURE NOTE: WAN 2.2 uses MoE (Mixture of Experts) with separate high-noise and low-noise expert models — this gives stronger motion coherence on complex scenes than 2.1.

WEAK AT: in-frame text, named faces, very short rapid-cut sequences (the model leans toward smoother continuous motion).

PROMPT PATTERN — multi-dimensional fields work well (WAN parses these explicitly):

```
Subject: [who/what + action]
Environment: [setting, time, atmosphere]
Camera: [framing + movement + speed]
Lighting: [direction + quality + temperature]
Color: [palette + grade]
Composition: [layout, balance, focal point]
```

Or natural prose with all the same elements (WAN handles both).

EXAMPLE (multi-shot in one prompt — unique strength):

```
Shot 1 (0-3s): Wide shot of a Tokyo crosswalk at dusk, drone descending slowly, neon signs igniting one by one. Shot 2 (3-7s): Medium tracking shot following a figure with a red umbrella weaving through the crowd. Shot 3 (7-10s): Close-up on rain hitting puddles, neon reflections fragmenting. Cool blue ambient with magenta practical accents, anamorphic look.
```

EXAMPLE (single field-driven shot):

```
Subject: A barista pulling an espresso shot, hands focused on the portafilter
Environment: Sunlit cafe counter, blurred customers in background
Camera: Medium close-up, slow push-in toward hands, eye-level
Lighting: Soft morning window light camera-left, warm tungsten fill from above
Color: Warm neutral grade, slightly muted
Composition: Hands centered lower-third, machine fills upper-right
```

CAMERA VOCABULARY: `wide`, `medium`, `close-up`, `ECU`, `dolly push/pull`, `pan left/right`, `tilt up/down`, `orbit`, `tracking`, `handheld`, `crane`.

DURATION: 5s standard, multi-shot prompts can stretch to 10-15s.

ASPECT RATIOS: 16:9, 9:16, 1:1. WAN 2.6 native 720p; some hosts upscale to 1080p.

WHEN TO PICK WAN:

- vs Hunyuan: WAN for natural lifestyle / multi-shot in one prompt. Hunyuan for higher cinematic polish.
- vs Seedance: WAN when you want fields-based prompting and don't need Seedance's L4 choreography level.
- vs LTX-2: WAN 2.6 for stronger visual quality. LTX-2 for tighter audio sync.

COST NOTE: ~$0.10-0.30/clip on hosted APIs. Self-hosted needs 24GB+ VRAM.
