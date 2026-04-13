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
});

export type CaptionCue = z.infer<typeof captionCueSchema>;
export type SubtitleWord = z.infer<typeof subtitleWordSchema>;
