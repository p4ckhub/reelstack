MiniMax Hailuo prompt guidelines:

BEST AT: cinematic short clips, lifestyle, product reveals, urban/nature scenes. Director Mode (when available) gives precise control over scene/movement/character interactions.

WEAK AT: in-frame text, named faces, prompts > 100 words (quality plateaus, model ignores tail).

VARIANTS:

- `video-01` — smoother, better for calm/atmospheric shots
- `video-01-live` — more dynamic motion, good for action

PROMPT PATTERN:

- Lead with SUBJECT + ACTION: "A woman walks through a neon-lit market" not "A market with a woman"
- Camera hints respected: `slow push-in`, `tracking shot`, `locked wide`, `pan left`, `tilt up`
- Sweet spot: 50-100 words. Keep under 200 (model reads but quality drops after ~100 words).

EXAMPLE (lifestyle, video-01):

```
A man in a wool coat walks slowly along a foggy beach at dawn, hands in pockets, gentle waves crashing in background. Slow tracking shot from behind at eye-level. Cool blue ambient with warm amber sunrise glow on the horizon, naturalistic muted grade, sharp focus on subject.
```

EXAMPLE (action, video-01-live):

```
A skateboarder kicks the board into a 360-degree spin in an empty city plaza at golden hour. Slow-motion tracking shot orbiting around them, low angle. Warm backlight, hard shadows, anamorphic look.
```

DIRECTOR MODE (when available on the host):
Use to specify precise per-second scene changes, character beats, or camera moves. Prompt structure becomes timestamp-driven similar to Seedance L3.

DURATION: typically 6-10s. Quality optimal under 8s.

ASPECT RATIOS: 9:16, 1:1, 16:9. 9:16 quality good for reels.

COST NOTE: ~$0.10-0.30/clip. Solid mid-tier choice when Seedance is busy or unavailable.
