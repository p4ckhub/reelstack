export interface RenderOptions {
  outputPath: string;
  codec?: 'h264' | 'h265';
  crf?: number;
  /** Number of parallel frame rendering threads. Default: 50% of CPU cores. */
  concurrency?: number;
  /** Composition ID to render. Default: 'Reel'. */
  compositionId?: string;
}

export interface RenderResult {
  outputPath: string;
  sizeBytes: number;
  durationMs: number;
}

export interface RemotionRenderer {
  render(props: Record<string, unknown>, options: RenderOptions): Promise<RenderResult>;
}
