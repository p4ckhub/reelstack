import type { z } from 'zod';
import type { BaseEffectSegment } from './types';

export interface EffectPlugin<T extends BaseEffectSegment = BaseEffectSegment> {
  readonly type: string;
  readonly name: string;
  readonly layer: number;
  readonly schema: z.ZodType<T>;
  readonly component: React.FC<{ segment: T }>;
  readonly defaultSfx?: string;
}

const registry = new Map<string, EffectPlugin>();

export function registerEffect<T extends BaseEffectSegment>(plugin: EffectPlugin<T>): void {
  if (registry.has(plugin.type)) {
    throw new Error(`Effect "${plugin.type}" is already registered`);
  }
  registry.set(plugin.type, plugin as unknown as EffectPlugin);
}

export function getEffect(type: string): EffectPlugin | undefined {
  return registry.get(type);
}

export function getAllEffects(): EffectPlugin[] {
  return Array.from(registry.values());
}
