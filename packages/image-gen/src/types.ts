export type SizePreset = 'post' | 'story' | 'youtube' | 'all';

export interface RenderParams {
  brand: string;
  template: string;
  size: SizePreset | string;
  // Content params
  text?: string;
  attr?: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  bullets?: string;
  number?: string;
  label?: string;
  date?: string;
  time?: string;
  cta?: string;
  num?: string;
  urgency?: string;
  bg?: string;
  bg_opacity?: string;
  myth?: string;
  reality?: string;
  heading?: string;
  speaker?: string;
  price?: string;
  price1?: string;
  price2?: string;
  deadline?: string;
  days?: string;
  duration?: string;
  color?: string;
  banner?: string;
  features?: string;
  footer?: string;
  icon?: string;
  logo?: string;
  optA?: string;
  optB?: string;
  optC?: string;
  optD?: string;
  question?: string;
  titleHighlight?: string;
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
