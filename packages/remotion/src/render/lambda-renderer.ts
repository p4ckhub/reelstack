import type { RemotionRenderer, RenderOptions, RenderResult } from './types';
import type { AwsRegion } from '@remotion/lambda/client';

/**
 * Renders video using AWS Lambda via @remotion/lambda.
 *
 * Required env vars:
 *   AWS_REGION               - e.g. "eu-central-1"
 *   REMOTION_LAMBDA_FUNCTION_NAME - deployed Lambda function name
 *   REMOTION_LAMBDA_SERVE_URL     - Remotion site URL from deploySite()
 *
 * Optional:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY - if not using default credentials
 */
export class LambdaRenderer implements RemotionRenderer {
  private region: AwsRegion;
  private functionName: string;
  private serveUrl: string;

  constructor() {
    this.region = (process.env.AWS_REGION ?? '') as AwsRegion;
    this.functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME ?? '';
    this.serveUrl = process.env.REMOTION_LAMBDA_SERVE_URL ?? '';

    if (!this.region || !this.functionName || !this.serveUrl) {
      throw new Error(
        'Lambda renderer requires: AWS_REGION, REMOTION_LAMBDA_FUNCTION_NAME, REMOTION_LAMBDA_SERVE_URL'
      );
    }
  }

  async render(props: Record<string, unknown>, options: RenderOptions): Promise<RenderResult> {
    const { renderMediaOnLambda } = await import('@remotion/lambda/client');
    const { getRenderProgress } = await import('@remotion/lambda/client');

    const compositionId = options.compositionId ?? 'Reel';
    const startMs = performance.now();

    // Start render on Lambda
    const { renderId, bucketName } = await renderMediaOnLambda({
      region: this.region,
      functionName: this.functionName,
      serveUrl: this.serveUrl,
      composition: compositionId,
      codec: options.codec === 'h265' ? 'h265' : 'h264',
      inputProps: props,
      imageFormat: 'png',
      crf: options.crf ?? 18,
      jpegQuality: 100,
    });

    // Poll for completion
    let outputUrl: string | null = null;
    const MAX_POLL_ATTEMPTS = 600; // 30 min at 3s intervals
    let attempts = 0;

    while (true) {
      if (++attempts > MAX_POLL_ATTEMPTS) {
        throw new Error(`Lambda render timed out after ${MAX_POLL_ATTEMPTS * 3}s`);
      }

      const progress = await getRenderProgress({
        renderId,
        bucketName,
        functionName: this.functionName,
        region: this.region,
      });

      if (progress.fatalErrorEncountered) {
        const errorMsg =
          progress.errors?.map((e) => e.message).join('; ') ?? 'Unknown Lambda error';
        throw new Error(`Lambda render failed: ${errorMsg}`);
      }

      if (progress.done && progress.outputFile) {
        outputUrl = progress.outputFile;
        break;
      }

      // Wait 3s before next poll
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    const durationMs = performance.now() - startMs;

    // Download from S3 to local outputPath
    const { writeFileSync } = await import('fs');
    const { mkdirSync } = await import('fs');
    const path = await import('path');

    mkdirSync(path.dirname(options.outputPath), { recursive: true });

    const response = await fetch(outputUrl, {
      signal: AbortSignal.timeout(120_000),
      redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`Failed to download render from S3: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(options.outputPath, buffer);

    return {
      outputPath: options.outputPath,
      sizeBytes: buffer.length,
      durationMs,
    };
  }
}
