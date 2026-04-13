import path from 'path';
import os from 'os';
import fs from 'fs';
import type { RemotionRenderer, RenderOptions, RenderResult } from './types';
import { createLogger } from '@reelstack/logger';

import { fileURLToPath } from 'url';

const log = createLogger('local-renderer');

// Lazy-evaluated paths — import.meta.dirname is undefined in Next.js turbopack bundles.
// These are only used when LocalRenderer.render() is actually called (worker process, not build).
let _remotionPkgDir: string | undefined;
function getDir(): string {
  if (!_remotionPkgDir) {
    const dir = import.meta.dirname ?? (typeof __dirname !== 'undefined' ? __dirname : null);
    if (!dir) throw new Error('Cannot resolve remotion package directory');
    _remotionPkgDir = path.resolve(dir, '../..');
  }
  return _remotionPkgDir;
}
function getBundleEntry(): string {
  if (process.env.REMOTION_ENTRY) return process.env.REMOTION_ENTRY;
  const localEntry = path.resolve(getDir(), '../../apps/web/remotion-entry.local.ts');
  if (fs.existsSync(localEntry)) return localEntry;
  return path.resolve(getDir(), '../../apps/web/remotion-entry.ts');
}
function getBundlePublicDir(): string {
  return path.resolve(getDir(), 'public');
}
function getPrivateCompositionsDir(): string {
  return path.resolve(getDir(), '../modules/src/private/remotion');
}

/**
 * Compute a cache key based on the newest source file across all composition directories.
 * Any change to any .tsx/.ts/.css file in remotion or modules packages invalidates the bundle.
 */
function computeBundleCacheKey(): string {
  let maxMtime = 0;
  const dirs = [
    path.resolve(getDir(), 'src'),
    getPrivateCompositionsDir(),
    path.dirname(getBundleEntry()),
  ];
  for (const dir of dirs) {
    try {
      const files = collectSourceFiles(dir);
      for (const f of files) {
        try {
          const mt = fs.statSync(f).mtimeMs;
          if (mt > maxMtime) maxMtime = mt;
        } catch {}
      }
    } catch {}
  }
  return String(maxMtime);
}

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '__tests__') {
        results.push(...collectSourceFiles(full));
      } else if (/\.(tsx?|css)$/.test(entry.name)) {
        results.push(full);
      }
    }
  } catch {}
  return results;
}

export class LocalRenderer implements RemotionRenderer {
  async render(props: Record<string, unknown>, options: RenderOptions): Promise<RenderResult> {
    const { mkdirSync, statSync, existsSync, rmSync, writeFileSync, readFileSync } =
      await import('fs');

    mkdirSync(path.dirname(options.outputPath), { recursive: true });

    // Use pre-built bundle (Docker / cached) or bundle on the fly via CLI
    let bundlePath = process.env.REMOTION_BUNDLE_PATH;

    if (!bundlePath) {
      const { execFileSync } = await import('child_process');
      const outDir = path.join(os.tmpdir(), 'remotion-bundle');
      const indexHtml = path.join(outDir, 'index.html');
      const cacheKeyFile = path.join(outDir, '.cache-key');
      const currentCacheKey = computeBundleCacheKey();

      let cacheValid = false;
      if (existsSync(indexHtml)) {
        try {
          const storedKey = readFileSync(cacheKeyFile, 'utf-8').trim();
          cacheValid = storedKey === currentCacheKey;
          if (!cacheValid) {
            log.info({ storedKey, currentCacheKey }, 'Bundle cache key mismatch, rebuilding');
          }
        } catch {
          // No cache key file → treat as invalid
          log.info('No cache key file found, rebuilding bundle');
        }
      }

      if (cacheValid) {
        bundlePath = outDir;
      } else {
        if (existsSync(outDir)) {
          rmSync(outDir, { recursive: true, force: true });
        }
        execFileSync(
          'bunx',
          [
            'remotion',
            'bundle',
            getBundleEntry(),
            '--public-dir',
            getBundlePublicDir(),
            '--out-dir',
            outDir,
          ],
          { cwd: getDir(), stdio: 'pipe', timeout: 300_000 }
        );
        writeFileSync(cacheKeyFile, currentCacheKey);
        bundlePath = outDir;
      }
    }

    const compositionId = options.compositionId ?? 'Reel';
    const codec = options.codec === 'h265' ? 'h265' : 'h264';

    log.info(
      { compositionId, codec, cwd: process.cwd(), bundlePath },
      'Render config (CLI subprocess)'
    );

    const startMs = performance.now();

    // Write props to temp file to avoid shell escaping issues
    const propsFile = path.join(os.tmpdir(), `remotion-props-${Date.now()}.json`);
    writeFileSync(propsFile, JSON.stringify(props));

    try {
      // Use CLI subprocess instead of programmatic renderMedia to avoid
      // Bun event loop deadlock when renderMedia runs inside BullMQ worker.
      const { execFileSync } = await import('child_process');
      const args = [
        'remotion',
        'render',
        bundlePath,
        compositionId,
        `--props=${propsFile}`,
        `--output=${options.outputPath}`,
        `--codec=${codec}`,
      ];
      if (options.crf !== undefined) {
        args.push(`--crf=${options.crf}`);
      }
      if (options.concurrency) {
        args.push(`--concurrency=${options.concurrency}`);
      } else if (process.env.REMOTION_CONCURRENCY) {
        args.push(`--concurrency=${process.env.REMOTION_CONCURRENCY}`);
      }

      log.info({ args: args.join(' ') }, 'Spawning remotion render');

      execFileSync('bunx', args, {
        cwd: getDir(),
        stdio: 'pipe',
        timeout: 600_000, // 10 min max
      });
    } catch (e: unknown) {
      const execErr = e as { stderr?: Buffer; stdout?: Buffer };
      const stderr = execErr.stderr?.toString() ?? '';
      const stdout = execErr.stdout?.toString() ?? '';
      log.error(
        { stderr: stderr.slice(-2000), stdout: stdout.slice(-500) },
        'remotion render CLI error'
      );
      throw new Error(`Remotion render failed: ${stderr.slice(-500)}`);
    } finally {
      try {
        (await import('fs')).unlinkSync(propsFile);
      } catch {}
    }

    const durationMs = performance.now() - startMs;
    const stats = statSync(options.outputPath);

    return {
      outputPath: options.outputPath,
      sizeBytes: stats.size,
      durationMs,
    };
  }
}
