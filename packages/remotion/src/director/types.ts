import type { SubtitleCue } from '@reelstack/types';
import type { BrandPreset } from '../pipeline/types';

export interface DirectorInput {
  /** Grouped subtitle cues with word-level timestamps */
  readonly cues: readonly SubtitleCue[];
  /** Full transcript text */
  readonly text: string;
  /** Total audio duration in seconds */
  readonly durationSeconds: number;
  /** Available media assets for B-roll */
  readonly mediaLibrary?: readonly MediaAsset[];
  /** Brand consistency config */
  readonly brandPreset?: BrandPreset;
  /** Editing style */
  readonly style?: 'dynamic' | 'calm' | 'cinematic' | 'educational';
}

export interface MediaAsset {
  readonly url: string;
  readonly type: 'video' | 'image';
  readonly tags: readonly string[];
  readonly durationSeconds?: number;
}

export interface DirectorEffectPlacement {
  readonly type: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly config: Record<string, unknown>;
  readonly reason: string;
}

export interface DirectorOutput {
  /** B-roll segments with transitions, placed on timeline */
  readonly bRollSegments: DirectorBRollSegment[];
  /** Visual effect placements (emoji, text emphasis, glitch, etc.) */
  readonly effects: DirectorEffectPlacement[];
  /** Caption style overrides based on content tone */
  readonly captionStyle?: Record<string, unknown>;
  /** AI's reasoning for each decision */
  readonly editNotes: string[];
}

export interface DirectorBRollSegment {
  readonly startTime: number;
  readonly endTime: number;
  readonly media: { url: string; type: 'video' | 'image' | 'color' };
  readonly animation?: 'spring-scale' | 'fade' | 'slide' | 'none';
  readonly transition?: { type: string; durationMs?: number };
  readonly reason: string;
}
