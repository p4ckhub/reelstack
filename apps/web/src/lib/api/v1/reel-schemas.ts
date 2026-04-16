import { z } from 'zod';
import { isPublicUrl, isPrivateHost } from '@reelstack/agent';

const callbackUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;
        if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return false;
        if (parsed.username || parsed.password) return false;
        if (isPrivateHost(parsed.hostname)) return false;
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Callback URL must be a valid public HTTPS URL' }
  );

const assetUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine(isPublicUrl, { message: 'Asset URL must be a valid public HTTP(S) URL' });

/** Reusable URL schema with SSRF protection for optional URL fields */
const publicUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine(isPublicUrl, { message: 'URL must be a valid public HTTP(S) URL' });

// ── Shared sub-schemas ────────────────────────────────────────

const brandPresetSchema = z
  .object({
    // Caption preset (bundles style + animation + word grouping)
    captionPreset: z
      .enum(['tiktok', 'mrbeast', 'cinematic', 'minimal', 'neon', 'classic'])
      .optional(),
    // Animation style override
    animationStyle: z
      .enum([
        'none',
        'word-highlight',
        'word-by-word',
        'karaoke',
        'bounce',
        'typewriter',
        'snap-pop',
      ])
      .optional(),
    // Word grouping overrides
    maxWordsPerCue: z.number().min(1).max(10).optional(),
    maxDurationPerCue: z.number().min(0.5).max(10).optional(),
    textTransform: z.enum(['none', 'uppercase']).optional(),
    // Music
    musicUrl: publicUrlSchema.optional(),
    musicVolume: z.number().min(0).max(1).optional(),
    // Layout & display
    layout: z
      .enum(['fullscreen', 'split-screen', 'picture-in-picture', 'comparison-split'])
      .optional(),
    showProgressBar: z.boolean().optional(),
    dynamicCaptionPosition: z.boolean().optional(),
    // Style overrides (applied on top of preset/template)
    highlightColor: z.string().optional(),
    backgroundColor: z.string().optional(),
    fontSize: z.number().min(8).max(120).optional(),
    fontFamily: z.string().optional(),
    fontColor: z.string().optional(),
    fontWeight: z.enum(['normal', 'bold']).optional(),
    outlineWidth: z.number().min(0).max(20).optional(),
    outlineColor: z.string().optional(),
    position: z.number().min(0).max(100).optional(),
    // Transition
    defaultTransition: z
      .enum(['crossfade', 'slide-left', 'slide-right', 'zoom-in', 'wipe', 'none'])
      .optional(),
  })
  .optional();

const ttsSchema = z
  .object({
    provider: z.enum(['edge-tts', 'elevenlabs', 'openai']).default('edge-tts'),
    voice: z.string().optional(),
    language: z.string().optional(),
  })
  .optional();

const whisperSchema = z
  .object({
    provider: z.enum(['openai', 'cloudflare', 'whisper-cpp', 'synthetic']).optional(),
    apiKey: z.string().optional(),
  })
  .optional();

const userAssetSchema = z.object({
  /** Unique ID referenced by the LLM composer */
  id: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Asset ID must be alphanumeric'),
  url: assetUrlSchema,
  type: z.enum(['video', 'image']),
  /** Human description for the LLM (e.g. "Talking head — mówię do kamery") */
  description: z.string().min(1).max(500),
  durationSeconds: z.number().positive().max(3600).optional(),
  /** Mark as talking head / primary source */
  isPrimary: z.boolean().optional(),
});

const cueSchema = z.object({
  id: z.string(),
  text: z.string(),
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
  words: z
    .array(
      z.object({
        text: z.string(),
        startTime: z.number().nonnegative(),
        endTime: z.number().positive(),
      })
    )
    .optional(),
});

const SUPPORTED_LANGUAGES = [
  'pl',
  'en',
  'es',
  'de',
  'fr',
  'it',
  'pt',
  'nl',
  'ru',
  'uk',
  'cs',
  'sk',
  'ja',
  'ko',
  'zh',
  'ar',
  'hi',
  'sv',
  'da',
  'no',
  'fi',
  'hu',
  'ro',
  'bg',
  'hr',
  'sr',
  'sl',
  'tr',
  'vi',
  'th',
] as const;

// ── Primary schemas ───────────────────────────────────────────

/**
 * POST /api/v1/reel/generate
 *
 * Generate a new video reel.
 * - Without `assets`: full auto mode (AI discovers tools, generates assets, renders)
 * - With `assets`: compose mode (user provides materials, LLM arranges them)
 */
export const reelModeSchema = z.enum([
  'generate',
  'compose',
  'captions',
  'slideshow',
  'talking-object',
  'n8n-explainer',
  'presenter-explainer',
]);

export type ReelMode = z.infer<typeof reelModeSchema>;

export const generateReelSchema = z
  .object({
    mode: reelModeSchema.optional().default('generate'),
    /** Required for generate/compose/captions modes. Auto-generated for n8n-explainer/ai-tips/presenter-explainer. */
    script: z.string().min(1).max(50000).optional(),
    style: z.enum(['dynamic', 'calm', 'cinematic', 'educational']).optional(),
    layout: z
      .enum([
        'fullscreen',
        'split-screen',
        'picture-in-picture',
        'anchor-bottom',
        'hybrid-anchor',
        'comparison-split',
      ])
      .default('fullscreen'),
    tts: ttsSchema.optional(),
    whisper: whisperSchema.optional(),
    brandPreset: brandPresetSchema,
    /** User-provided materials. When present, triggers compose mode. */
    assets: z.array(userAssetSchema).min(1).max(20).optional(),
    /** Extra instructions for the LLM composer (compose mode only) */
    directorNotes: z.string().max(1000).optional(),
    /** Avatar settings (full auto mode, when HeyGen is available) */
    avatar: z
      .object({
        avatarId: z.string().optional(),
        voice: z.string().optional(),
      })
      .optional(),
    /** n8n workflow URL or ID (n8n-explainer mode) */
    workflowUrl: z
      .string()
      .max(500)
      .refine((v) => !v.startsWith('http') || isPublicUrl(v), {
        message: 'Workflow URL must be a valid public HTTP(S) URL',
      })
      .optional(),
    /** Optional closing CTA shown over the last N seconds of the reel. */
    endCard: z
      .object({
        enabled: z.boolean().default(true),
        headline: z.string().min(1).max(120),
        subheadline: z.string().max(200).optional(),
        action: z.string().max(80).optional(),
        durationSeconds: z.number().min(1).max(10).default(3),
        accentColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default('#7c3aed'),
        backgroundColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default('#09090f'),
      })
      .optional(),
    /** Intro scroll-stopper animation. `none` disables; default is
     *  zoom-bounce @ 0.6s. Presets live in @reelstack/modules. */
    scrollStopper: z
      .object({
        preset: z
          .enum([
            'none',
            'flash-zoom',
            'glitch-reveal',
            'impact-shake',
            'tv-static',
            'swipe-in',
            'zoom-bounce',
          ])
          .default('zoom-bounce'),
        durationSeconds: z.number().min(0.2).max(2).default(0.6),
      })
      .optional(),
    /** Topic for AI generation (ai-tips, presenter-explainer modes) */
    topic: z.string().min(1).max(1000).optional(),
    /** Language for script generation (default: from tts.language or 'pl') */
    language: z.string().max(10).optional(),
    /** Persona for presenter-explainer mode (e.g. "senior developer", "tech reviewer") */
    persona: z.string().max(500).optional(),
    /** Pre-generated avatar video URL (presenter-explainer — skip avatar generation) */
    avatarVideoUrl: publicUrlSchema.optional(),
    /** Loop avatar video for animated characters (presenter-explainer) */
    avatarLoop: z.boolean().optional(),
    /** Duration of avatar clip in seconds (for loop timing, presenter-explainer) */
    avatarClipDurationSeconds: z.number().positive().max(60).optional(),
    /** LLM provider override (e.g. "openai", "anthropic") */
    provider: z.string().max(100).optional(),
    /** Slideshow slides (slideshow mode — skips LLM when provided) */
    slides: z
      .array(
        z.object({
          title: z.string().max(200),
          text: z.string().max(500).optional(),
          badge: z.string().max(50).optional(),
          num: z.string().max(10).optional(),
          template: z.string().max(50).optional(),
        })
      )
      .min(1)
      .max(20)
      .optional(),
    /** Image-gen brand CSS name (slideshow mode, default: example) */
    brand: z.string().max(50).optional(),
    /** Image-gen template name (slideshow mode, default: tip-card) */
    template: z.string().max(50).optional(),
    /** Caption highlight mode (text = karaoke phrase, single-word = one word at a time, pill = colored pill) */
    highlightMode: z.string().max(30).optional(),
    /** Video URL for captions mode (existing video to overlay captions on) */
    videoUrl: publicUrlSchema.optional(),
    /** Pre-computed subtitle cues for captions mode (skips TTS and transcription) */
    cues: z.array(cueSchema).min(1).max(500).optional(),
    /** Number of slides for slideshow LLM generation */
    numberOfSlides: z.number().int().min(2).max(10).optional(),
    /** Number of tips for ai-tips mode */
    numberOfTips: z.number().int().min(1).max(50).optional(),
    /** Target duration in seconds */
    targetDuration: z.number().positive().max(600).optional(),
    /** Background music URL */
    musicUrl: publicUrlSchema.optional(),
    /** Background music volume (0 = mute, 1 = full) */
    musicVolume: z.number().min(0).max(1).optional(),
    /** Reel variant / visual style */
    variant: z.enum(['multi-object', 'single-object', 'cutaway-demo']).optional(),
    /** Montage profile ID (auto-selected from script if not provided) */
    montageProfile: z.string().max(50).optional(),
    /** Preferred tool IDs — planner will strongly favor these tools (e.g. ["heygen-agent"] for Video Agent) */
    preferredToolIds: z.array(z.string().max(50)).max(10).optional(),
    callbackUrl: callbackUrlSchema.optional(),
  })
  .refine(
    (data) => {
      const scriptModes = ['generate', 'compose'];
      if (scriptModes.includes(data.mode ?? 'generate') && !data.script) return false;
      if (data.mode === 'captions' && !data.videoUrl) return false;
      // captions: videoUrl required. script/cues optional — without them, transcribes video's own audio.
      if (data.mode === 'slideshow' && !data.topic) return false;
      if (data.mode === 'talking-object' && !data.topic) return false;
      if (data.mode === 'presenter-explainer' && !data.topic) return false;
      if (data.mode === 'n8n-explainer' && !data.workflowUrl) return false;
      return true;
    },
    (data) => ({
      message:
        data.mode === 'n8n-explainer'
          ? 'workflowUrl is required for n8n-explainer mode'
          : ['slideshow', 'talking-object', 'presenter-explainer'].includes(data.mode ?? '')
            ? `topic is required for ${data.mode} mode`
            : data.mode === 'captions' && !data.videoUrl
              ? 'videoUrl is required for captions mode'
              : 'script is required for generate/compose mode',
    })
  );

/**
 * POST /api/v1/reel/captions
 *
 * Add captions to an existing video.
 * - With `script`: TTS → transcribe → burn captions
 * - With `cues`: burn pre-computed captions directly (no TTS)
 */
export const captionsReelSchema = z
  .object({
    /** URL of the existing video to caption */
    videoUrl: assetUrlSchema,
    /** Script text — TTS will generate audio, Whisper will transcribe for captions */
    script: z.string().min(1).max(50000).optional(),
    /** Pre-computed subtitle cues — skip TTS and transcription entirely */
    cues: z.array(cueSchema).min(1).max(500).optional(),
    style: z.enum(['dynamic', 'calm', 'cinematic', 'educational']).optional(),
    tts: ttsSchema,
    brandPreset: brandPresetSchema,
    callbackUrl: callbackUrlSchema.optional(),
  })
  .refine((data) => !!(data.script || data.cues), {
    message: 'Provide either script (for TTS + transcription) or cues (pre-computed subtitles)',
  });

/** Batch reel generation - up to 20 reels per request */
export const batchGenerateSchema = z.object({
  reels: z.array(generateReelSchema).min(1).max(20),
  callbackUrl: callbackUrlSchema.optional(),
});

/** Multi-language reel - same script translated into multiple languages */
export const multiLangReelSchema = z.object({
  script: z.string().min(1).max(10000),
  sourceLanguage: z.enum(SUPPORTED_LANGUAGES).default('pl'),
  targetLanguages: z
    .array(z.enum(SUPPORTED_LANGUAGES))
    .min(1)
    .max(10)
    .refine((arr) => new Set(arr).size === arr.length, {
      message: 'Duplicate languages not allowed',
    }),
  layout: z.enum(['split-screen', 'fullscreen', 'picture-in-picture']).default('fullscreen'),
  style: z.enum(['dynamic', 'calm', 'cinematic', 'educational']).optional(),
  tts: z
    .object({
      provider: z.enum(['edge-tts', 'elevenlabs', 'openai']).default('edge-tts'),
      voice: z.string().optional(),
    })
    .optional(),
  brandPreset: brandPresetSchema,
  callbackUrl: callbackUrlSchema.optional(),
});

export const publishReelSchema = z.object({
  reelId: z.string().uuid(),
  platforms: z
    .array(z.enum(['tiktok', 'instagram', 'youtube-shorts', 'facebook', 'linkedin', 'x']))
    .min(1),
  caption: z.string().min(1).max(5000),
  hashtags: z.array(z.string()).max(30).optional(),
  scheduleDate: z.string().datetime().optional(),
});
