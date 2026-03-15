import { z } from 'zod';
import {
  bRollSegmentSchema,
  captionCueSchema,
  captionStyleSchema,
  pipSegmentSchema,
  lowerThirdSegmentSchema,
  ctaSegmentSchema,
  counterSegmentSchema,
  zoomSegmentSchema,
  highlightSegmentSchema,
} from './reel-props';

const chapterSegmentSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  number: z.number().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  style: z.enum(['fullscreen', 'overlay']).default('fullscreen'),
  backgroundColor: z.string().default('#0F0F0F'),
  accentColor: z.string().default('#3B82F6'),
});

export const youtubePropsSchema = z.object({
  // Layout
  layout: z.enum(['fullscreen', 'sidebar', 'horizontal-split']),
  primaryVideoUrl: z.string().optional(),
  secondaryVideoUrl: z.string().optional(),
  sidebarPosition: z.enum(['left', 'right']).default('right'),
  sidebarWidth: z.number().min(20).max(50).default(30),

  // B-roll & overlays (shared with Reel)
  bRollSegments: z.array(bRollSegmentSchema).default([]),
  pipSegments: z.array(pipSegmentSchema).default([]),
  lowerThirds: z.array(lowerThirdSegmentSchema).default([]),
  ctaSegments: z.array(ctaSegmentSchema).default([]),

  // Shared effect layers
  zoomSegments: z.array(zoomSegmentSchema).default([]),
  counters: z.array(counterSegmentSchema).default([]),
  highlights: z.array(highlightSegmentSchema).default([]),

  // YouTube-specific
  chapters: z.array(chapterSegmentSchema).default([]),

  // Audio
  voiceoverUrl: z.string().optional(),
  musicUrl: z.string().optional(),
  musicVolume: z.number().min(0).max(1).default(0.15),

  // Captions
  cues: z.array(captionCueSchema).default([]),
  captionStyle: captionStyleSchema.optional(),

  // Visual
  showProgressBar: z.boolean().default(false),
  backgroundColor: z.string().default('#0F0F0F'),
});

export type YouTubeProps = z.infer<typeof youtubePropsSchema>;
