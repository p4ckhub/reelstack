export const content = `Seedance 2.0 prompt framework (5 layers):
SUBJECT + ACTION + CAMERA + STYLE + SOUND

CRITICAL RULE: Subject + Action must appear in the FIRST 20-30 words. The model weights early tokens heavily.

Complexity levels (use L2 for most B-roll shots):

- L1 (≤30 words): atmospheric, let the model decide — "Foggy mountain lake at dawn, still water, bird call. Locked wide shot."
- L2 (30-100 words): directed shot with clear subject + camera + lighting — DEFAULT for agent
- L3 (100-300 words): timestamped multi-scene — "[00:00-00:05] Wide shot of city at dusk, drone descending. [00:05-00:10] Medium close-up, camera tracks subject walking. [00:10-00:15] ECU on hands typing, shallow DOF."
- L4 (300-1000w): full choreography per shot with physics and reactions

Bracket-annotated format (alternative to L2, good for complex shots):
\\\`\\\`\\\`
[Subject]: developer typing on mechanical keyboard, face lit by monitor glow
[Camera]: medium close-up, slow dolly push, eye level, handheld drift
[Lighting]: cool blue monitor fill from front, warm amber rim from window-right, low-key
[Style]: digital clean, muted tones
\\\`\\\`\\\`

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
