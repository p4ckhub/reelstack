/**
 * ContentPackage — standardized format between content production and montage.
 *
 * Any content producer (presenter, n8n, ai-tips, user-upload) outputs this.
 * Any montage strategy (template, AI director) consumes this.
 */

export interface ContentPackage {
  /** Full narration text */
  script: string;

  /** Voiceover audio — always present, from one of 3 sources */
  voiceover: {
    url: string;
    durationSeconds: number;
    source: 'ai-video-native' | 'talking-head-native' | 'tts';
  };

  /** Caption cues with per-word timing (from Whisper) */
  cues: readonly CaptionCue[];

  /** Script broken into timed sections (from Whisper alignment) */
  sections: readonly ContentSection[];

  /** Visual assets — from any source, mixed freely */
  assets: readonly ContentAsset[];

  /** Talking head / avatar video (optional — not every reel has one) */
  primaryVideo?: PrimaryVideo;

  /** Metadata for montage decisions */
  metadata: ContentMetadata;
}

export interface CaptionCue {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words?: readonly { text: string; startTime: number; endTime: number }[];
}

export interface ContentSection {
  index: number;
  text: string;
  startTime: number;
  endTime: number;
  /** Which asset illustrates this section (matches ContentAsset.id) */
  assetId?: string;
  /** Hint for montage (e.g. emotion, intensity) */
  emotion?: string;
}

export interface ContentAsset {
  id: string;
  url: string;
  type: 'image' | 'video';
  role: 'board' | 'screenshot' | 'broll' | 'demo' | 'illustration' | 'tip-video';
  description: string;
  /** Which section this asset belongs to */
  sectionIndex: number;
  /** Video duration (for video assets) */
  durationSeconds?: number;
}

export interface PrimaryVideo {
  url: string;
  durationSeconds: number;
  /** How the person/avatar is framed in the video */
  framing: 'bottom-aligned' | 'centered' | 'top-aligned';
  /** Short clip that needs looping (animated avatar) vs full-length (HeyGen, user recording) */
  loop: boolean;
  source: 'user-recording' | 'ai-avatar-loop' | 'heygen' | 'ai-generated';
}

export interface ContentMetadata {
  language: string;
  style?: 'dynamic' | 'calm' | 'cinematic' | 'educational';
  montageProfile?: string;
}

/** How to handle sections without assets */
export type AssetFillMode = 'strict' | 'fill-missing';

/** How to handle effects */
export type EffectsMode = 'template' | 'ai-director';
