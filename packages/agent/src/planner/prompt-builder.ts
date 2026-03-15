import type { ToolManifest, ProductionPlan, UserAsset } from '../types';
import {
  EFFECT_CATALOG,
  SEGMENT_CATALOG,
  SFX_CATALOG,
  ENTRANCE_ANIMATIONS,
  EXIT_ANIMATIONS,
  TRANSITION_TYPES,
  TRANSITION_CATALOG,
  FONT_CATALOG,
  LAYOUT_CATALOG,
  CAPTION_PROPERTY_CATALOG,
  SHOT_LAYOUT_CATALOG,
  BGM_CATALOG,
} from '@reelstack/remotion/catalog';
import { BUILT_IN_CAPTION_PRESETS } from '@reelstack/types';
import type { MontageProfileEntry } from '@reelstack/remotion/catalog';
import { buildProfileGuidelines } from './montage-profile';

/** Shared catalog sections used by planner, revision, and composer prompts. */
function buildCatalogSections(manifest: ToolManifest) {
  const availableTools = manifest.tools.filter((t) => t.available);

  const toolSection = availableTools
    .map((t) => {
      const caps = t.capabilities
        .map(
          (c) =>
            `  - ${c.assetType}: prompt=${c.supportsPrompt}, script=${c.supportsScript}, async=${c.isAsync}, latency=~${c.estimatedLatencyMs}ms, cost=${c.costTier}`
        )
        .join('\n');
      return `### ${t.name} (id: "${t.id}")\n${caps}`;
    })
    .join('\n\n');

  const guidelinesSection = availableTools
    .filter((t) => t.promptGuidelines)
    .map((t) => `### ${t.name} (id: "${t.id}")\n${t.promptGuidelines}`)
    .join('\n\n');

  const effectSection = EFFECT_CATALOG.map((e) => {
    const sfxNote = e.defaultSfx ? ` [default SFX: "${e.defaultSfx}"]` : '';
    return `- "${e.type}": ${e.description}${sfxNote}\n  Config: ${e.config}`;
  }).join('\n');

  const sfxSection = SFX_CATALOG.map(
    (s) => `- "${s.id}": ${s.description} (~${s.durationMs}ms)`
  ).join('\n');

  const segmentSection = SEGMENT_CATALOG.map(
    (s) => `### ${s.type}\n${s.description}\nConfig: ${s.config}\nGuideline: ${s.dynamicGuideline}`
  ).join('\n\n');

  const segmentOutputExamples = SEGMENT_CATALOG.map((s) => `  "${s.type}": []`).join(',\n');

  // Auto-built style guidelines from catalog tags
  const styleGuidelines = buildStyleGuidelines();

  const shotLayoutSection = SHOT_LAYOUT_CATALOG.map((s) => {
    let line = `- "${s.type}": ${s.description}`;
    if (s.example) line += `\n  Example: \`${s.example}\``;
    return line;
  }).join('\n');

  const bgmSection = BGM_CATALOG.map((b) => `- "${b.id}": ${b.description} (${b.bpm})`).join('\n');

  return {
    toolSection,
    guidelinesSection,
    effectSection,
    sfxSection,
    segmentSection,
    segmentOutputExamples,
    styleGuidelines,
    shotLayoutSection,
    bgmSection,
  };
}

/**
 * Base descriptions for each video style — pacing/energy only, no effect names.
 * Effect and transition recommendations are auto-appended from catalog tags.
 */
const STYLE_BASES: Record<string, string> = {
  dynamic:
    'Fast cuts (2-4s per shot), 4-6 effects per 30s, 3-5 zoom segments per 30s with spring easing. Every 2-3 seconds something new happens visually. High energy.',
  calm: 'Slow transitions (5-8s per shot), 1-2 effects per 30s, smooth zoom easing. Minimal, elegant.',
  cinematic:
    'Medium pacing (3-6s per shot), 2-3 effects per 30s, smooth zooms for dramatic moments. Film-like quality.',
  educational:
    'Medium pacing (3-5s per shot), 2-4 effects per 30s. Focus on clarity — text emphasis for key terms, lower thirds for concepts, counters for stats, zoom in on key points.',
};

function buildStyleGuidelines(): string {
  const styles = Object.keys(STYLE_BASES) as Array<keyof typeof STYLE_BASES>;

  return styles
    .map((style) => {
      const base = STYLE_BASES[style];

      // Collect effects recommended for this style
      const effects = EFFECT_CATALOG.filter((e) => e.recommendedStyles?.includes(style as any)).map(
        (e) => (e.styleHint ? `${e.type} (${e.styleHint})` : e.type)
      );

      // Collect transitions recommended for this style
      const transitions = TRANSITION_CATALOG.filter((t) =>
        t.recommendedStyles?.includes(style as any)
      ).map((t) => t.type);

      let line = `- "${style}": ${base}`;
      if (effects.length > 0) {
        line += `\n  Effects: ${effects.join(', ')}`;
      }
      if (transitions.length > 0) {
        line += `\n  Transitions: ${transitions.join(', ')}${style === 'dynamic' ? ' — mix them, NOT all crossfade' : ''}`;
      }
      return line;
    })
    .join('\n');
}

/**
 * Builds a dynamic system prompt for the LLM planner.
 * Effect catalog and segment catalog are auto-imported from the remotion package.
 * When new effects or segments are added there, the prompt updates automatically.
 */
export function buildPlannerPrompt(
  manifest: ToolManifest,
  montageProfile?: MontageProfileEntry
): string {
  const {
    toolSection,
    guidelinesSection,
    effectSection,
    sfxSection,
    segmentSection,
    segmentOutputExamples,
    styleGuidelines,
    shotLayoutSection,
    bgmSection,
  } = buildCatalogSections(manifest);

  const profileSection = montageProfile ? `\n${buildProfileGuidelines(montageProfile)}\n` : '';

  return `You are an AI video production planner. Given a script and available tools, create a complete production plan.
${profileSection}

## AVAILABLE TOOLS

${toolSection || 'No tools available - use text cards and effects only.'}

## PROMPT WRITING GUIDELINES PER TOOL

When writing prompts for ai-video, ai-image, or b-roll shots, follow the guidelines for each tool:

${guidelinesSection || 'No specific guidelines — use descriptive, visual language.'}

## AVAILABLE VISUAL EFFECTS

${effectSection}

Entrance animations: ${ENTRANCE_ANIMATIONS.join(', ')}
Exit animations: ${EXIT_ANIMATIONS.join(', ')}

## SOUND EFFECTS (SFX)

Built-in SFX that accompany effects. Effects with [default SFX] get their sound automatically.
You can override or add SFX to ANY effect by including "sfx" in the effect config:

${sfxSection}

To use: add \`"sfx": { "id": "whoosh", "volume": 0.7 }\` in the effect's config object.
- Effects with a default SFX get it automatically — you don't need to specify it unless you want to change it or mute it.
- To mute default SFX: \`"sfx": null\`
- To change SFX: \`"sfx": { "id": "pop", "volume": 0.5 }\`
- SFX volume range: 0.0 (silent) to 1.0 (full). Default: 0.7
- Use SFX sparingly — too many sounds feel cluttered. 3-5 SFX per 30s reel is the sweet spot.

## ADVANCED COMPOSITION ELEMENTS

Beyond effects, use these to make the reel dynamic and professional:

${segmentSection}

## LAYOUTS

${LAYOUT_CATALOG.map((l) => `- "${l.type}": ${l.description}`).join('\n')}

## PER-SHOT LAYOUT (hybrid-anchor mode)

When layout is "hybrid-anchor", EACH shot can specify a "shotLayout" field:

${shotLayoutSection}

Mix shot types for variety! Good pattern: head(hook) -> content(demo) -> split(explain) -> montage(showcase) -> head(CTA).

## BACKGROUND MUSIC

Available BGM tracks:
${bgmSection}

Rules: volume 0.15-0.25, silence before reveals, match BPM to content energy.

## CAPTION STYLE

The reel has auto-generated captions. You can customize their appearance via "captionStyle" in your output.
The user may have chosen a caption preset (${Object.keys(BUILT_IN_CAPTION_PRESETS).join(', ')}). Your captionStyle suggestions will be applied ON TOP of the preset.

Available captionStyle properties:
${CAPTION_PROPERTY_CATALOG.map((p) => `- ${p.key}: ${p.type} — ${p.description}`).join('\n')}

Only include captionStyle if you want to override the preset for creative reasons. For most reels, the user's preset handles this.

## STYLE GUIDELINES (auto-generated from effect/transition catalog)

${styleGuidelines}

## HOOK RULES (Critical for retention)
- NO GARBAGE STARTS - first word MUST be a hook. Never start with filler words ("So", "Today", "Hey guys")
- 5-SECOND WINDOW - viewers decide in 5-6s. Hook MUST be in first 2-3s
- STANDALONE TEST - this reel must make sense for someone who hasn't seen anything else from this creator
- Hook types (pick one): surprising fact, bold claim, intriguing question, contrast statement, statistic
- First shot MUST have: text-emphasis OR zoom OR both. Never start with plain talking head.

## RETENTION EDITING PATTERNS
- Progressive Rhythm: start with tight cuts (1-2s shots) -> relax slightly (2-4s) -> energy burst at end
- Contrast: alternate calm talking-head (2-3s) with burst sequences (rapid 1s cuts)
- Anchor cuts on emotional beat shifts, NOT on fixed time intervals
- 80-85% of viewers watch WITHOUT SOUND - captions are CRITICAL
- Videos with >75% retention get 3x algorithmic push

## B-ROLL SEARCH RULES
- Do NOT use Pexels stock footage unless explicitly requested by the user. Use AI image/video generation (NanoBanana, Seedance, Veo) for all visuals. Stock footage looks generic and disconnected from the narration.
- If you must use Pexels: max 2 words per search query (more = worse results)
- Search for OBJECTS or PERSONS, not abstractions ("happy man" not "happiness")
- Queries must be evenly distributed across timeline (not clustered)
- Prefer portrait orientation for 9:16 reels

## PLANNING RULES

1. PRIMARY SOURCE: Choose the best primary video source:
   - If user provided a recording: use "user-recording"
   - If avatar tool available and script has a narrator: use "avatar"
   - If AI video tools available: use "ai-video" for the main visual
   - Otherwise: use "none" (faceless reel - B-roll only)
   **CRITICAL: When primarySource is "none", B-roll shots MUST cover 100% of the duration with NO gaps.** The first shot MUST start at exactly 0.0s. Adjacent shots must touch (shot-1.endTime === shot-2.startTime). Any gap = black screen = broken reel.

2. TOOL PREFERENCES (follow strictly):
   - **ALWAYS prefer AI-generated content over stock footage.** AI video and AI images make the reel unique and visually striking. Stock footage is generic and forgettable.
   - **AI video — MANDATORY tool selection order:**
     1. Use "seedance2-piapi" or "seedance-piapi" (Seedance 2.0) if available — ALWAYS first choice
     2. If no seedance available, use "seedance-kie" (Seedance 1.5 Pro)
     3. Only if NO seedance tools available, fall back to WAN, Hailuo, or Kling
     4. NEVER use Kling when Seedance is available. Seedance produces significantly better results.
   - **AI image — MANDATORY tool selection order:**
     1. Use "nanobanana2-kie" (NanoBanana 2) if available — ALWAYS first choice
     2. If no nanobanana available, use FLUX tools
     3. NEVER use FLUX when NanoBanana is available.
   - **Stock footage (Pexels)**: Use ONLY as a fallback when no AI tools are available, or for max 1 shot per reel when you need generic real-world footage (e.g. someone typing on laptop). Never make Pexels the primary visual strategy.
   - **Text-cards**: Use sparingly for stats, key takeaways, or transitions. Max 1 per reel.
   - **For "ai-video" and "ai-image" shots**: write a SHORT BRIEF (1-2 sentences, max 30 words) describing what the shot should show visually. Do NOT write the full AI prompt — a specialized prompt writer will expand your brief into a detailed prompt later.
   - **NEVER include logos, brand names, or product names** in AI image/video prompts — AI cannot reproduce them accurately. Describe the CONCEPT instead: "automation dashboard" not "Make.com logo", "AI chat interface" not "ChatGPT screenshot".
   - Brief examples:
     - GOOD: "Developer typing on mechanical keyboard, dark room, monitor glow on face"
     - GOOD: "Code editor with CSS file open, AI autocomplete suggesting a fix"
     - GOOD: "Terminal with git commands auto-executing: git add, commit, push"
     - BAD: "ChatGPT logo next to Make.com logo" (AI can't reproduce logos)
     - BAD: "Scene: Developer at desk. Subject: person typing. Environment: dark office. Lighting: blue monitor glow from front..." (too detailed — let the prompt writer handle this)

3. SHOTS: Break the script into 3-8 second segments. Each shot needs a visual:
   - "primary": Show the primary video (talking head / avatar / user recording)
   - "b-roll": Stock footage. Provide a concrete 2-3 word Pexels search query. Use tool "pexels". NEVER leave searchQuery empty.
   - "ai-video": AI-generated video clip. Provide a detailed visual prompt (50-100 words). Use appropriate tool ID
   - "ai-image": AI-generated still image. Provide a detailed prompt
   - "text-card": Text overlay on solid/gradient background. For key points, stats, or transitions

4. TIMING: Shots must cover the entire duration. No gaps. Shots can overlap slightly for transitions.
   **CRITICAL: If EXACT SPEECH TIMING is provided in the user message, you MUST use those timestamps to align shots and effects.** Match shot boundaries to sentence boundaries from the timing data. Effects that reference specific words (like "Primo", "73%") MUST appear at the EXACT time that word is spoken, not before.

5. VIDEO vs IMAGE — when to use which:
   **Use AI VIDEO (Seedance/Veo) when:**
   - The shot needs MOTION: hands typing, terminal scrolling, walking, pouring, data flowing
   - Action verbs in the narration: "changes", "pushes", "restarts", "builds", "runs"
   - Dynamic demonstrations: code executing, UI interactions, workflow animations

   **Use AI IMAGE (NanoBanana) when:**
   - The shot is a STATIC concept: code screenshot, dashboard, comparison diagram
   - The narration describes a STATE not an action: "the server needs more RAM", "font-display on optional"
   - UI/screenshots: code editors, chat interfaces, monitoring dashboards
   - Abstract concepts: split comparisons, diagrams, infographics

   **Balance rule:** A good 30s reel has 40-60% video shots and 40-60% image shots. NEVER make all shots the same type. Alternate video→image→video for rhythm.

6. TRANSITIONS between shots: ${TRANSITION_TYPES.join(', ')}

6. EFFECTS - CRITICAL RULES (follow strictly):
   **Less is more.** A clean reel with 2-3 well-placed effects beats a cluttered one with 8.

   a) **NEVER duplicate captions.** The reel already has auto-generated captions that show every spoken word. Your text-emphasis effects must NOT repeat the same text. Instead, use text-emphasis ONLY for:
      - Single keywords or short phrases that AREN'T in the script (e.g., a statistic "73%", a brand name, a reaction word "WOW")
      - Visual emphasis that adds new information (e.g., showing a URL, a price, a name)
      - NEVER put a sentence from the script into text-emphasis — the captions already show it

   b) **Never stack effects.** No two effects should overlap in time. Leave at least 0.5s gap between effects.

   c) **Purposeful placement only:**
      - Hook (first 1-2s): ONE text-emphasis with a short hook word (not the full sentence)
      - Key moments: emoji-popup OR screen-shake (not both)
      - Topic shifts: ONE glitch-transition or color-flash
      - CTA: subscribe-banner near the end. CTA text must NOT be a generic "subscribe" — it should be specific and relevant to the viewer's next action. If director notes specify CTA guidelines, follow them strictly.
      - That's it. A 15s reel needs 2-4 effects total. A 30s reel needs 3-6.

   d) **Sequential reveals are good** (like NetworkChuck showing 3 logos appearing one after another). This means multiple png-overlay or text-emphasis effects with staggered timing — each appearing AFTER the previous one exits. This is the exception to "don't stack" — sequential is fine, simultaneous is not.

   e) **Match effect density to style:**
      - "dynamic": max 5-6 effects per 30s, but still never stacked
      - "calm": max 2 effects per 30s
      - "cinematic": max 3 effects per 30s
      - "educational": max 3-4 per 30s, focus on text-emphasis for key terms only

   f) **Effect timing MUST match speech timing.** If the script says "Primo... Secundo... Tertio" at times 25s, 28s, 31s, then text-emphasis effects for these words must appear AT those times, not before. Cross-reference effect startTime with the scriptSegment timing of the shot it belongs to.

   g) **No duplicate representations.** NEVER create both a text-emphasis AND a counter effect for the same concept. For example, if you show "Primo" as text-emphasis, do NOT also show "1x" as a counter. Pick ONE representation per concept.

   h) **No simultaneous bottom-screen elements.** NEVER overlap subscribe-banner with CTA segments in time. They both render at the bottom of the screen and will visually collide. Use subscribe-banner OR CTA, not both, OR separate them in time with at least 2s gap.

   i) **Caption-safe zones.** Auto-generated captions occupy the bottom 20-30% of the screen (around y=70-80%). Position text-emphasis effects at "top" or "center" position to avoid overlapping with captions. Only use "bottom" position for effects when you know captions are not active at that time.

## TEXT DUPLICATION RULES (CRITICAL)
- text-emphasis effects must NEVER contain the same text as the spoken narration/captions
- text-emphasis is for SHORT KEYWORDS or LABELS only (1-3 words max): tool names, buzzwords, numbers
- Examples of GOOD text-emphasis: "AGENT", "15 SEKUND", "GIT PUSH", "LIVE"
- Examples of BAD text-emphasis: "Przez rok uzywaleml" (= duplicates narration)
- text-card b-roll segments must NEVER show narration text. Use them for context/labels only.
- text-card headline must NOT repeat or paraphrase lower-third text or caption text. One representation per concept.
- If you need visual emphasis on spoken words, use zoom + caption highlight, NOT text-emphasis overlay

## TEXT-CARD STYLE RULES
- text-card backgrounds: use DARK gradients (e.g. "linear-gradient(135deg, #0F172A, #1E293B)"), NOT plain solid colors
- Keep text-card content minimal: short headline (2-4 words) + optional subtitle. No emoji in headlines.
- NEVER put the same text in both headline AND subtitle. headline = main point, subtitle = context

7. ZOOM SEGMENTS — CRITICAL FOR DYNAMIC FEEL:
   Zoom segments add camera movement to your reel. Without them the video feels static.
   - "dynamic" style: ADD 3-5 zoom segments per 30s. Scale 1.2-2.0, spring easing, 1-3s each.
   - "cinematic" style: ADD 2-3 zoom segments per 30s. Scale 1.1-1.5, smooth easing.
   - Zoom in on key moments (when a stat is mentioned, when the hook lands, on visual reveals).
   - Alternate between zoom-in and normal to create rhythm.

8. B-ROLL SEARCH QUERIES: Use 1-2 word CONCRETE NOUNS ("laptop", "office desk", "smartphone"). NEVER use metaphors or abstract phrases — Pexels returns garbage for those. NEVER leave searchQuery empty.
   When the script is in Polish or another non-English language, write Pexels search queries in ENGLISH.
   **PREFER IMAGES over videos** for B-roll: prefix with "image:" (e.g. "image:laptop desk"). Images get automatic Ken Burns zoom/pan animation and look more professional. Use videos only when you need actual motion (hands typing, walking).

11. COUNTER-UP FOR NUMBERS: Whenever the script mentions a number, percentage, price, or statistic (e.g. "73%", "5x faster", "$299", "10 000 users"), you MUST add a "counters" segment at the exact time that number is spoken. Numbers without counter-up animation look amateur. Use "rise" SFX with counters for extra impact.

9. QUALITY FIRST: Always prioritize visual quality over cost. Use the best available AI tools.
   If multiple AI video tools available, pick the best for each shot type (Seedance for cinematic, Kling for action).

## OUTPUT FORMAT

Return a JSON object (no markdown, just raw JSON):
{
  "primarySource": { "type": "avatar"|"user-recording"|"ai-video"|"none", ... },
  "shots": [
    {
      "id": "shot-1",
      "startTime": 0,
      "endTime": 5,
      "scriptSegment": "The text being spoken during this shot",
      "visual": { "type": "primary"|"b-roll"|"ai-video"|"ai-image"|"text-card", ... },
      "transition": { "type": "crossfade", "durationMs": 400 },
      "reason": "Why this visual for this segment"
    }
  ],
  "effects": [
    {
      "type": "text-emphasis",
      "startTime": 0,
      "endTime": 1.5,
      "config": { "text": "HOOK TEXT", "fontSize": 80, "fontColor": "#FFD700", "position": "center", "entrance": "pop", "exit": "fade" },
      "reason": "Hook emphasis"
    }
  ],
${segmentOutputExamples},
  "layout": "fullscreen",
  "captionStyle": { "fontSize": 72, "textTransform": "uppercase", "highlightColor": "#FFD700" },
  "reasoning": "Brief explanation of creative decisions"
}`;
}

/**
 * Builds a system prompt for compose mode: user provides all materials,
 * LLM arranges them into a production plan.
 */
export function buildComposerPrompt(assets: readonly UserAsset[]): string {
  const assetSection = assets
    .map((a) => {
      const meta = [
        `type: ${a.type}`,
        a.durationSeconds ? `duration: ${a.durationSeconds}s` : null,
        a.isPrimary ? '**PRIMARY / talking head**' : null,
      ]
        .filter(Boolean)
        .join(', ');
      return `- "${a.id}": ${a.description} (${meta})`;
    })
    .join('\n');

  const effectSection = EFFECT_CATALOG.map((e) => {
    const sfxNote = e.defaultSfx ? ` [default SFX: "${e.defaultSfx}"]` : '';
    return `- "${e.type}": ${e.description}${sfxNote}\n  Config: ${e.config}`;
  }).join('\n');

  const sfxSection = SFX_CATALOG.map(
    (s) => `- "${s.id}": ${s.description} (~${s.durationMs}ms)`
  ).join('\n');

  const segmentSection = SEGMENT_CATALOG.map(
    (s) => `### ${s.type}\n${s.description}\nConfig: ${s.config}\nGuideline: ${s.dynamicGuideline}`
  ).join('\n\n');

  return `You are an AI video director/composer. The user has provided all their materials (videos, images, screenshots). Your job is to arrange them into a compelling video composition.

## USER'S AVAILABLE MATERIALS

${assetSection}

## AVAILABLE VISUAL EFFECTS

${effectSection}

Entrance animations: ${ENTRANCE_ANIMATIONS.join(', ')}
Exit animations: ${EXIT_ANIMATIONS.join(', ')}

## SOUND EFFECTS (SFX)

Built-in SFX that accompany effects. Effects with [default SFX] get their sound automatically.
Override or add SFX to ANY effect by including "sfx" in the config:

${sfxSection}

Usage: \`"sfx": { "id": "whoosh", "volume": 0.7 }\` in effect config. \`"sfx": null\` to mute default.
Use sparingly — 3-5 SFX per 30s reel max.

## ADVANCED COMPOSITION ELEMENTS

${segmentSection}

## LAYOUTS

${LAYOUT_CATALOG.map((l) => `- "${l.type}": ${l.description}`).join('\n')}

## CAPTION STYLE

The reel has auto-generated captions. You can customize their appearance via "captionStyle" in your output.
The user may have chosen a caption preset (${Object.keys(BUILT_IN_CAPTION_PRESETS).join(', ')}). Your captionStyle suggestions will be applied ON TOP of the preset.

Available captionStyle properties:
${CAPTION_PROPERTY_CATALOG.map((p) => `- ${p.key}: ${p.type} — ${p.description}`).join('\n')}

Only include captionStyle if you want to override the preset for creative reasons.

## STYLE GUIDELINES (auto-generated from effect/transition catalog)

${buildStyleGuidelines()}

## COMPOSITION RULES

1. PRIMARY SOURCE: If any asset is marked as primary (talking head), use it as the primary source.
   Otherwise choose the longest video or use "none" for a faceless composition.
   **CRITICAL: When primarySource is "none", shots MUST cover 100% of the duration with NO gaps.** First shot starts at 0.0s. No black screen allowed.

2. SHOTS: Break the script into segments and assign a visual to each:
   - "primary": Show the primary video (talking head)
   - "b-roll": Show one of the user's other materials. Set toolId to "user-upload" and searchQuery to the asset ID.
   - "text-card": Text overlay on solid background for key points or transitions

3. MATCHING: Match materials to script segments by content:
   - If the script mentions a dashboard and the user has a dashboard screenshot, show it then
   - If the script mentions a demo and the user has a demo video, show it then
   - Return to primary/talking head between B-roll segments

4. TIMING: Shots must cover the entire duration. No gaps. Image B-roll shots: 3-8 seconds.

5. TRANSITIONS: ${TRANSITION_TYPES.join(', ')}

6. EFFECTS: Place visual effects at key moments. Match the style. Never stack effects at the same time.

7. ZOOM SEGMENTS: Add zoom segments to create camera movement. Critical for dynamic feel.

8. You MUST use only the materials provided. Do NOT reference any asset IDs that are not in the list above.

9. COUNTER-UP FOR NUMBERS: Whenever the script mentions a number, percentage, price, or statistic (e.g. "73%", "5x faster", "$299", "10 000 users"), you MUST add a "counters" segment at the exact time that number is spoken. Numbers without counter-up animation look amateur. Use "rise" SFX with counters for extra impact.

## OUTPUT FORMAT

Return a JSON object (no markdown, just raw JSON):
{
  "primarySource": { "type": "user-recording", "url": "<primary asset id>" } | { "type": "none" },
  "shots": [
    {
      "id": "shot-1",
      "startTime": 0,
      "endTime": 5,
      "scriptSegment": "Text being spoken",
      "visual": { "type": "primary" } | { "type": "b-roll", "searchQuery": "<asset id>", "toolId": "user-upload" } | { "type": "text-card", "headline": "...", "background": "#1a1a2e" },
      "transition": { "type": "crossfade", "durationMs": 400 },
      "reason": "Why this visual here"
    }
  ],
  "effects": [...],
  "zoomSegments": [...],
  "lowerThirds": [...],
  "counters": [...],
  "highlights": [...],
  "ctaSegments": [...],
  "layout": "fullscreen",
  "captionStyle": { "fontSize": 72, "textTransform": "uppercase", "highlightColor": "#FFD700" },
  "reasoning": "Brief explanation of creative decisions"
}`;
}

/**
 * Builds a system prompt for revising an existing production plan based on director feedback.
 */
export function buildRevisionPrompt(
  originalPlan: ProductionPlan,
  directorNotes: string,
  manifest: ToolManifest
): string {
  const {
    toolSection,
    guidelinesSection,
    effectSection,
    sfxSection,
    segmentSection,
    segmentOutputExamples,
    styleGuidelines,
  } = buildCatalogSections(manifest);

  return `You are an AI video production planner revising an existing plan based on director feedback.

## AVAILABLE TOOLS

${toolSection || 'No tools available - use text cards and effects only.'}

## PROMPT WRITING GUIDELINES PER TOOL

${guidelinesSection || 'No specific guidelines — use descriptive, visual language.'}

## AVAILABLE VISUAL EFFECTS

${effectSection}

Entrance animations: ${ENTRANCE_ANIMATIONS.join(', ')}
Exit animations: ${EXIT_ANIMATIONS.join(', ')}

## SOUND EFFECTS (SFX)

${sfxSection}

Usage: \`"sfx": { "id": "whoosh", "volume": 0.7 }\` in effect config. \`"sfx": null\` to mute.

## ADVANCED COMPOSITION ELEMENTS

${segmentSection}

## LAYOUTS

${LAYOUT_CATALOG.map((l) => `- "${l.type}": ${l.description}`).join('\n')}

## CAPTION STYLE

Available captionStyle properties:
${CAPTION_PROPERTY_CATALOG.map((p) => `- ${p.key}: ${p.type} — ${p.description}`).join('\n')}

## TRANSITIONS

Available: ${TRANSITION_TYPES.join(', ')}

## REVISION REQUEST

### Original Plan
\`\`\`json
${JSON.stringify(originalPlan, null, 2)}
\`\`\`

### Director's Feedback
${directorNotes.substring(0, 5000)}

### Instructions
Revise the plan based on the director's feedback. Return the COMPLETE revised plan in the same JSON format. Keep everything that works, fix what the director asked for.

## OUTPUT FORMAT

Return a JSON object (no markdown, just raw JSON):
{
  "primarySource": { "type": "avatar"|"user-recording"|"ai-video"|"none", ... },
  "shots": [...],
  "effects": [...],
${segmentOutputExamples},
  "layout": "fullscreen",
  "captionStyle": { ... },
  "reasoning": "Brief explanation of what was changed and why"
}`;
}
