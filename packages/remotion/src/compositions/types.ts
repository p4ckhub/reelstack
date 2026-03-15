/**
 * CompositionModule — interface for pluggable Remotion compositions.
 *
 * Each reel type module registers its composition via this interface.
 * Root.tsx reads from the registry and renders all registered compositions.
 */

import type { CalculateMetadataFunction } from 'remotion';
import type { z } from 'zod';

export interface CompositionModule {
  /** Composition ID (must match compositionId used by renderer/orchestrator) */
  id: string;
  /** React component to render */
  component: React.FC<any>;
  /** Zod schema for props validation */
  schema: z.ZodType<any>;
  /** Default props for Remotion Studio preview */
  defaultProps: Record<string, unknown>;
  /** Optional calculateMetadata for dynamic duration */
  calculateMetadata?: CalculateMetadataFunction<any>;
  /** Video width in pixels */
  width: number;
  /** Video height in pixels */
  height: number;
  /** Default duration in frames (overridden by calculateMetadata if present) */
  defaultDurationInFrames: number;
  /** Frames per second */
  fps: number;
}
