import { z } from 'zod';
import { captionCueSchema } from '@reelstack/remotion/schemas/caption-cue';

const slideSegmentSchema = z.object({
  imageUrl: z.string(),
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
  transition: z
    .enum(['crossfade', 'slide-left', 'slide-right', 'zoom-in', 'wipe', 'none'])
    .default('crossfade'),
  transitionDurationMs: z.number().min(0).max(2000).default(400),
});

// Resolved end-card config (post `resolveEndCard()` from @reelstack/agent).
// Kept loose here because the shared resolver fills in / nullifies fields
// before the props ever reach the Remotion bundler.
const endCardSchema = z
  .object({
    enabled: z.boolean().optional(),
    headline: z.string().optional(),
    subheadline: z.string().optional(),
    action: z.string().optional(),
    durationSeconds: z.number().positive().optional(),
    accentColor: z.string().optional(),
    backgroundColor: z.string().optional(),
  })
  .optional();

export const slideshowPropsSchema = z.object({
  slides: z.array(slideSegmentSchema).min(1),
  cues: z.array(captionCueSchema),
  voiceoverUrl: z.string().optional(),
  musicUrl: z.string().optional(),
  musicVolume: z.number().min(0).max(1).default(0.2),
  durationSeconds: z.number().positive(),
  backgroundColor: z.string().default('#000000'),
  endCard: endCardSchema,
  captionStyle: z
    .object({
      fontSize: z.number().default(56),
      fontColor: z.string().default('#FFFFFF'),
      fontWeight: z.enum(['normal', 'bold']).default('bold'),
      highlightColor: z.string().default('#FFD700'),
      // Cross-platform safe zone — see video-clip-props comment.
      position: z.number().min(0).max(100).default(65),
      backgroundColor: z.string().default('#000000'),
      backgroundOpacity: z.number().min(0).max(1).default(0.6),
      padding: z.number().default(16),
      outlineWidth: z.number().default(3),
      outlineColor: z.string().default('#000000'),
      shadowBlur: z.number().default(8),
    })
    .optional(),
});

export type SlideshowProps = z.infer<typeof slideshowPropsSchema>;
export type SlideSegment = z.infer<typeof slideSegmentSchema>;
