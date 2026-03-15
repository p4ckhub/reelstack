import { z } from 'zod';

export const subtitleCueSchema = z.object({
  id: z.string().min(1),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  text: z.string().max(500),
});

export const subtitleStyleSchema = z.object({
  fontFamily: z.string().max(100).optional(),
  fontSize: z.number().min(1).max(200).optional(),
  fontColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontWeight: z.enum(['normal', 'bold']).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  backgroundOpacity: z.number().min(0).max(1).optional(),
  outlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  outlineWidth: z.number().min(0).max(10).optional(),
  shadowColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  shadowBlur: z.number().min(0).max(50).optional(),
  position: z.number().min(0).max(100).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  lineHeight: z.number().min(0.5).max(5).optional(),
  padding: z.number().min(0).max(100).optional(),
}).strict();

export const saveSubtitlesSchema = z.object({
  cues: z.array(subtitleCueSchema).max(5000),
  style: subtitleStyleSchema.optional(),
});

export const createRenderSchema = z.object({
  videoId: z.string().uuid(),
});
