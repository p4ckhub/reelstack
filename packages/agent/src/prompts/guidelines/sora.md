Sora 2 (OpenAI) prompt guidelines:

BEST AT: state-of-the-art photorealism, accurate physics simulation (cause-and-effect, weight, momentum, fluid dynamics), and SYNCHRONIZED NATIVE AUDIO (dialogue + ambient + SFX generated together with video, lip-synced).

USE FOR: hero shots only — Sora 2 is the most expensive video model in the stack. Don't burn it on filler B-roll.

WEAK AT: in-frame text (still imperfect), named real people (filtered), longer than 12s (quality drops).

PROMPT PATTERNS:

1. **Cinematic + audio**: write dialogue and SFX in QUOTES, inline with the visual description.
2. **Physics-aware**: describe cause-and-effect explicitly. Sora is a physics simulator — give it cues.
3. **Cinematography vocabulary**: Sora responds strongly to "shot on 35mm film", "soft natural window light", "shallow depth of field with slow push-in", "Kodak Vision3 500T 5219".

EXAMPLES:

Hero with dialogue:

```
INT. HOME OFFICE — DAY. Shot on 35mm film, Kodak Vision3 250D. A developer leans back in her chair, staring at a stack overflow page on the monitor. She mutters: "There has to be a better way." Soft window light from camera-left, warm tungsten desk lamp backlight, shallow depth of field, slow push-in toward her face. Ambient sound: distant traffic, mechanical keyboard tap.
```

Physics-driven moment:

```
A glass of red wine tips off the edge of an oak table. The glass falls 80cm and shatters on the hardwood floor; wine splashes outward in a crown. Macro shot, locked low-angle, single hard key from above-right. Audio: glass shatter on impact, liquid splatter, distant heartbeat.
```

Cinematic exterior:

```
A lone runner crests a hill at golden hour, breath visible in cold air, distant city below. 35mm anamorphic, slow tracking shot from behind, warm horizon backlight, cool blue ambient. Audio: footsteps on gravel, wind, faint city hum.
```

CAUSE-AND-EFFECT VOCABULARY (Sora rewards explicit physics):

- "ball rolls off the table, falls 1m, bounces twice"
- "smoke rises and dissipates in 3 seconds"
- "fabric catches the breeze and flutters left"
- "candle flame bends as the door opens"

DURATION: 5s, 10s, or 12s. 12s is the practical max before quality erosion.

ASPECT RATIOS: 16:9 (best), 9:16, 1:1. 9:16 works well for reels — Sora is the strongest model in vertical.

COST NOTE: ~$0.40-1.50 per clip depending on duration and resolution. Reserve for the 1-2 shots that anchor the reel emotionally. Generate Sora once, generate alternatives in cheaper models (Seedance, Pika).
