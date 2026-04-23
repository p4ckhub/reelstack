Hunyuan Video (Tencent) prompt guidelines:

BEST AT: cinematic quality, strong motion realism, urban scenes, products, lifestyle. Open-source backbone — available via multiple hosted APIs at varying prices. Hunyuan Video Custom Audio variant lets a person from a reference image speak/sing using a recorded voice or song.

WEAK AT: in-frame text, very fast action sequences (some motion blur artifacts), shots requiring more than ~10s coherence.

PROMPT PATTERN (natural language, 50-100 words optimal):

```
[Subject + main action], [environment + framing], [camera move], [lighting + atmosphere]
```

EXAMPLES:

Lifestyle:

```
A woman in a beige knit sweater pours hot coffee into a ceramic mug at a wooden kitchen counter, steam rising, sunlight through linen curtains, slow handheld push-in toward the cup, warm morning light from camera-right, muted desaturated grade
```

Urban:

```
Pedestrians cross a rain-soaked Tokyo street at night under neon signs, slow tracking shot at eye level following one figure with a red umbrella, magenta and cyan reflections on wet asphalt, anamorphic look
```

Product:

```
A pair of leather sneakers on a polished concrete surface, slow orbit 90 degrees clockwise, single hard key from above-right with soft fill, neutral commercial grade, sharp focus throughout
```

CUSTOM AUDIO VARIANT:
For lip-synced output with provided voice/song, supply a reference image of the subject. The text prompt then describes scene/mood/framing/action — the audio drives mouth shapes.

DURATION: typically 5s standard, longer variants on some hosts. Quality optimal under 10s.

ASPECT RATIOS: 16:9 (default), 9:16, 1:1. 9:16 quality good but not as strong as Sora 2 for vertical.

WHEN TO PICK HUNYUAN:

- vs Seedance: Hunyuan when you need open-source / self-hostable. Seedance generally edges Hunyuan on prompt adherence and motion control vocabulary.
- vs WAN 2.2: Hunyuan for more cinematic look. WAN for more natural lifestyle look + multi-shot in a single prompt.
- vs LTX-2: Hunyuan for higher quality. LTX-2 for native audio + faster gen.

COST NOTE: varies by host. Self-hosted requires significant VRAM (24GB+ for 720p). Hosted APIs ~$0.10-0.30/clip.
