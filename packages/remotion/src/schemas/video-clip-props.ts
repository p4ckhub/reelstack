import { z } from 'zod';
import { captionCueSchema } from './caption-cue';
import { watermarkSchema } from './watermark';

const videoClipSchema = z.object({
  /** URL of the video clip */
  url: z.string(),
  /** Start time in the final composition (seconds) */
  startTime: z.number().nonnegative(),
  /** End time in the final composition (seconds) */
  endTime: z.number().positive(),
  /** Transition to next clip */
  transition: z
    .enum(['crossfade', 'slide-left', 'slide-right', 'zoom-in', 'wipe', 'none'])
    .default('crossfade'),
  /** Transition duration in ms */
  transitionDurationMs: z.number().min(0).max(2000).default(300),
});

export const videoClipPropsSchema = z.object({
  /** Ordered array of video clips to stitch */
  clips: z.array(videoClipSchema).min(1),
  /** Caption cues */
  cues: z.array(captionCueSchema),
  /** Voiceover audio URL (optional - clips may have their own audio) */
  voiceoverUrl: z.string().optional(),
  /** Background music URL */
  musicUrl: z.string().optional(),
  /** Music volume (0-1) */
  musicVolume: z.number().min(0).max(1).default(0.15),
  /** Total duration in seconds */
  durationSeconds: z.number().positive(),
  /** Background color (shown during transitions) */
  backgroundColor: z.string().default('#000000'),
  /** Caption highlight mode (text, single-word, pill, hormozi, glow, pop-word, etc.) */
  highlightMode: z.string().optional(),
  /** Caption styling overrides */
  captionStyle: z
    .object({
      fontSize: z.number().default(64),
      fontColor: z.string().default('#FFFFFF'),
      highlightColor: z.string().default('#FFD700'),
      // 65% from top = caption baseline in the cross-platform safe zone:
      // above YouTube Shorts' ~18% bottom UI overlay, TikTok's ~14% music
      // bar, IG Reels' ~13% description. 80 was inside YT Shorts chrome.
      position: z.number().min(0).max(100).default(65),
    })
    .optional(),
  /** Show segmented progress bar (Instagram Stories-style) when 2+ clips */
  showSegmentedProgress: z.boolean().optional(),
  /** Segmented progress bar styling */
  segmentedProgressStyle: z
    .object({
      color: z.string().default('#FFFFFF'),
      activeColor: z.string().optional(),
      bgColor: z.string().default('rgba(255, 255, 255, 0.25)'),
      height: z.number().min(2).max(8).default(3),
    })
    .optional(),
  /**
   * FREE-tier "reelstack.dev" watermark. Set by the API endpoint via
   * shouldShowWatermark(user) — never client-configurable.
   */
  watermark: watermarkSchema.optional(),
  /**
   * Closing CTA card. Built by orchestrators via
   * `endCardConfigToSelection()` from the resolved `EndCardConfig`.
   * The composition renders this through `EndCardLayer`.
   */
  endCard: z
    .object({
      cardSlug: z.string(),
      paletteSlug: z.string(),
      durationSeconds: z.number().positive().optional(),
      data: z.record(z.string(), z.string().optional()),
    })
    .optional(),
});

export type VideoClipProps = z.infer<typeof videoClipPropsSchema>;
export type VideoClip = z.infer<typeof videoClipSchema>;
