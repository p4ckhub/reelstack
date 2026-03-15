export type SizePreset = 'post' | 'story' | 'youtube' | 'all';

export interface RenderParams {
  brand: string;
  template: string;
  size: SizePreset | string;
  // Content params
  text?: string;
  attr?: string;
  title?: string;
  badge?: string;
  bullets?: string;
  number?: string;
  label?: string;
  date?: string;
  cta?: string;
  num?: string;
  urgency?: string;
  bg?: string;
  bg_opacity?: string;
}

export interface RenderResult {
  sizeName: string;
  width: number;
  height: number;
  png: Buffer;
}

export interface SizeSpec {
  name: string;
  width: number;
  height: number;
}

export interface BrandInfo {
  name: string;
  source: 'builtin' | 'user';
}

export interface TemplateInfo {
  name: string;
}
