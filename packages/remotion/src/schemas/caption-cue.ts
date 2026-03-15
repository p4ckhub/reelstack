import { z } from 'zod';

export const subtitleWordSchema = z.object({
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
});

export const captionCueSchema = z.object({
  id: z.string(),
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  words: z.array(subtitleWordSchema).optional(),
  animationStyle: z.enum(['none', 'word-highlight', 'word-by-word', 'karaoke', 'bounce', 'typewriter']).optional(),
});

export type CaptionCue = z.infer<typeof captionCueSchema>;
export type SubtitleWord = z.infer<typeof subtitleWordSchema>;
