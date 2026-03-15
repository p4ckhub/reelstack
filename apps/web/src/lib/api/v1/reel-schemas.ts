import { z } from 'zod';

/**
 * Validates callback URLs. Only HTTPS allowed in production (prevents SSRF to internal services).
 * HTTP allowed in development for local testing.
 */
/**
 * Check if a hostname is a private/internal IP (IPv4 or IPv6).
 * Blocks: loopback, private ranges, link-local, IPv4-mapped IPv6.
 */
function isPrivateHost(hostname: string): boolean {
  // Strip IPv6 brackets
  const host = hostname.replace(/^\[|\]$/g, '');

  // Block known internal hostnames
  const blocked = [
    'localhost',
    'metadata.google.internal',
    'metadata.google',
    'kubernetes.default',
  ];
  if (blocked.some((b) => host === b || host.endsWith(`.${b}`))) return true;

  // IPv6 checks (::1, fe80::, fc00::, fd00::, ::ffff:x.x.x.x mapped)
  if (host.includes(':')) {
    // Loopback
    if (host === '::1' || host === '::') return true;
    // Link-local (fe80::)
    if (host.toLowerCase().startsWith('fe80:')) return true;
    // Unique local (fc00::/7 = fc00:: and fd00::)
    if (/^f[cd]/i.test(host)) return true;
    // IPv4-mapped IPv6 (::ffff:x.x.x.x) - extract IPv4 and check
    const v4Match = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (v4Match) return isPrivateIPv4(v4Match[1]);
    // IPv4-mapped IPv6 in hex form (::ffff:7f00:1) - URL parser converts dotted to hex
    const v4HexMatch = host.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (v4HexMatch) {
      const hi = parseInt(v4HexMatch[1], 16);
      const lo = parseInt(v4HexMatch[2], 16);
      const ip = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isPrivateIPv4(ip);
    }
    // Any other IPv6 with embedded IPv4
    const embeddedV4 = host.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (embeddedV4) return isPrivateIPv4(embeddedV4[1]);
    return false;
  }

  // IPv4 checks
  return isPrivateIPv4(host);
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length === 1) {
    // Single decimal/hex number (e.g. 2130706433 = 127.0.0.1, 0x7f000001)
    const num = Number(ip);
    if (isNaN(num) || num < 0 || num > 0xffffffff) return false;
    const a = (num >>> 24) & 0xff;
    const b = (num >>> 16) & 0xff;
    return checkPrivateOctets(a, b);
  }
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  return checkPrivateOctets(parts[0], parts[1]);
}

function checkPrivateOctets(a: number, b: number): boolean {
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isPublicHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (parsed.username || parsed.password) return false;
    if (isPrivateHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

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
  .refine(isPublicHttpUrl, { message: 'Asset URL must be a valid public HTTP(S) URL' });

// ── Shared sub-schemas ────────────────────────────────────────

const brandPresetSchema = z
  .object({
    // Caption preset (bundles style + animation + word grouping)
    captionPreset: z
      .enum(['tiktok', 'mrbeast', 'cinematic', 'minimal', 'neon', 'classic'])
      .optional(),
    // Template ID (e.g. "builtin-neon") - overrides preset style
    captionTemplate: z.string().optional(),
    // Animation style override
    animationStyle: z
      .enum(['none', 'word-highlight', 'word-by-word', 'karaoke', 'bounce', 'typewriter'])
      .optional(),
    // Word grouping overrides
    maxWordsPerCue: z.number().min(1).max(10).optional(),
    maxDurationPerCue: z.number().min(0.5).max(10).optional(),
    textTransform: z.enum(['none', 'uppercase']).optional(),
    // Music
    musicUrl: z.string().url().optional(),
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
    provider: z.enum(['openrouter', 'cloudflare', 'ollama']).optional(),
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
    workflowUrl: z.string().max(500).optional(),
    /** Topic for AI generation (ai-tips, presenter-explainer modes) */
    topic: z.string().min(1).max(1000).optional(),
    /** Language for script generation (default: from tts.language or 'pl') */
    language: z.string().max(10).optional(),
    /** Persona for presenter-explainer mode (e.g. "senior developer", "tech reviewer") */
    persona: z.string().max(500).optional(),
    /** Pre-generated avatar video URL (presenter-explainer — skip avatar generation) */
    avatarVideoUrl: z.string().url().max(2000).optional(),
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
    videoUrl: z.string().url().max(2048).optional(),
    /** Pre-computed subtitle cues for captions mode (skips TTS and transcription) */
    cues: z.array(cueSchema).min(1).max(500).optional(),
    /** Number of slides for slideshow LLM generation */
    numberOfSlides: z.number().int().min(2).max(10).optional(),
    /** Number of tips for ai-tips mode */
    numberOfTips: z.number().int().min(1).max(50).optional(),
    /** Target duration in seconds */
    targetDuration: z.number().positive().max(600).optional(),
    /** Background music URL */
    musicUrl: z.string().url().max(2048).optional(),
    /** Background music volume (0 = mute, 1 = full) */
    musicVolume: z.number().min(0).max(1).optional(),
    /** Reel variant / visual style */
    variant: z.enum(['multi-object', 'single-object', 'cutaway-demo']).optional(),
    /** Montage profile ID (auto-selected from script if not provided) */
    montageProfile: z.string().max(50).optional(),
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
