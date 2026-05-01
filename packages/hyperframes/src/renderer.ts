/**
 * HyperframesRenderer — real implementation for Faza 19.B.
 *
 * Usage:
 *
 *   const r = new HyperframesRenderer();
 *   await r.render(
 *     { composition: '/path/to/compositions/hello', variables: { headline: 'Hi' } },
 *     { outputPath: '/tmp/out.mp4' }
 *   );
 *
 * Under the hood:
 * 1. Clone composition directory to a temp workspace
 * 2. Walk all *.html files and inject `{{variables}}`
 * 3. Spawn `npx hyperframes render <temp> -o <outputPath> --quiet`
 * 4. Return size + duration metrics
 * 5. Clean up the temp dir
 *
 * The subprocess approach (instead of embedding hyperframes as a JS
 * library) keeps the dependency tree small for every caller that does
 * NOT render — workers only, not the Next.js API process.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createLogger } from '@reelstack/logger';
import type { Renderer, RenderInput, RenderOptions, RenderResult } from '@reelstack/renderer';
import { injectVariables, type TemplateVariables } from './variable-injector';

const log = createLogger('hyperframes-renderer');

export interface HyperframesRendererOptions {
  /**
   * Override the path to the hyperframes CLI. Default: uses `npx hyperframes`
   * (resolved from the workspace install). Tests and Docker workers may
   * want to point at an installed binary to skip npm registry lookups.
   */
  readonly cliBin?: string;
  /**
   * Extra env vars passed to the hyperframes subprocess (e.g.
   * `HYPERFRAMES_BROWSER` for Docker). Inherits process.env by default.
   */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * Override watchdog timing. Production defaults: start polling 5s after
   * spawn, then resolve after 3 consecutive 1s polls show a stable file size.
   * Tests pass tighter values to keep run time low.
   */
  readonly watchdog?: {
    readonly startDelayMs?: number;
    readonly pollMs?: number;
    readonly stableTicks?: number;
  };
}

export class HyperframesRenderer implements Renderer {
  readonly runtime = 'hyperframes' as const;

  constructor(private readonly opts: HyperframesRendererOptions = {}) {}

  async render(input: RenderInput, options: RenderOptions): Promise<RenderResult> {
    const startTime = performance.now();

    const compositionDir = input.composition;
    if (!fs.existsSync(compositionDir) || !fs.statSync(compositionDir).isDirectory()) {
      throw new Error(`Hyperframes composition path is not a directory: ${compositionDir}`);
    }

    const workDir = path.join(os.tmpdir(), 'hyperframes-work', `render-${randomUUID()}`);
    fs.mkdirSync(workDir, { recursive: true });

    try {
      await cloneWithVariables(compositionDir, workDir, input.variables as TemplateVariables);

      log.info(
        {
          compositionDir,
          workDir,
          outputPath: options.outputPath,
          variableKeys: Object.keys(input.variables),
        },
        'Hyperframes render starting'
      );

      await runHyperframesCli({
        projectDir: workDir,
        outputPath: options.outputPath,
        cliBin: this.opts.cliBin,
        env: this.opts.env,
        watchdog: this.opts.watchdog,
      });

      const stat = fs.statSync(options.outputPath);
      const durationMs = Math.round(performance.now() - startTime);

      log.info(
        {
          outputPath: options.outputPath,
          sizeKB: Math.round(stat.size / 1024),
          durationMs,
        },
        'Hyperframes render completed'
      );

      return {
        outputPath: options.outputPath,
        sizeBytes: stat.size,
        durationMs,
      };
    } finally {
      // Best-effort cleanup — don't mask a render failure with a cleanup
      // failure.
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch (err) {
        log.warn({ workDir, err }, 'Failed to clean up hyperframes work dir');
      }
    }
  }
}

/**
 * Copy source directory to dest, rewriting .html files with variable
 * substitution. Non-HTML files (CSS, JS, JSON, images) pass through
 * unchanged.
 */
async function cloneWithVariables(
  src: string,
  dest: string,
  vars: TemplateVariables
): Promise<void> {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      await cloneWithVariables(srcPath, destPath, vars);
      continue;
    }

    if (entry.name.endsWith('.html')) {
      const content = fs.readFileSync(srcPath, 'utf8');
      fs.writeFileSync(destPath, injectVariables(content, vars));
      continue;
    }

    fs.copyFileSync(srcPath, destPath);
  }
}

interface CliArgs {
  projectDir: string;
  outputPath: string;
  cliBin?: string;
  env?: NodeJS.ProcessEnv;
  watchdog?: HyperframesRendererOptions['watchdog'];
}

function runHyperframesCli(args: CliArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    // Ensure output directory exists.
    fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });

    // Prefer an explicit cliBin (test / Docker). Otherwise reach for the
    // workspace-installed binary at node_modules/.bin/hyperframes — that
    // path exists in both local dev (bun install) and prod workers
    // (Dockerfile copies workspace). Falling back to `bunx` let us cope
    // with monorepo hoisting quirks where .bin isn't where we think.
    const localBin = path.join(process.cwd(), 'node_modules', '.bin', 'hyperframes');
    const cmd = args.cliBin ?? (fs.existsSync(localBin) ? localBin : 'bunx');
    const cmdArgs =
      args.cliBin || cmd === localBin
        ? ['render', args.projectDir, '-o', args.outputPath, '--quiet']
        : ['hyperframes', 'render', args.projectDir, '-o', args.outputPath, '--quiet'];

    // stdio: stdout='ignore' so the OS discards it without buffering — eliminates
    // the pipe back-pressure failure mode entirely. With longer renders
    // (n8n-explainer composition, ~70s output) even a `data` listener that
    // discards each chunk wasn't enough — Node's internal stream buffering
    // still let the child block on close. 'ignore' = file descriptor → /dev/null.
    // stderr stays piped because we want diagnostics on failure.
    const child = spawn(cmd, cmdArgs, {
      env: args.env ?? process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    // Subprocess hang workaround: hyperframes binary occasionally fails to
    // exit after writing the MP4 (some pending DevTools / Chrome socket).
    // We watchdog the output file: when its size has been stable for 3
    // consecutive 1-second polls, we declare the render complete and
    // SIGTERM the child. SIGKILL after 2s if SIGTERM is ignored. We start
    // polling 5s after spawn so we don't trip on a 0-byte placeholder file
    // that exists during early initialization.
    let resolved = false;
    let lastSize = -1;
    let stableTicks = 0;
    let watchdogTimer: NodeJS.Timeout | null = null;
    const STABLE_TICKS = args.watchdog?.stableTicks ?? 3;
    const POLL_MS = args.watchdog?.pollMs ?? 1_000;
    const START_DELAY_MS = args.watchdog?.startDelayMs ?? 5_000;

    const tick = () => {
      if (resolved) return;
      try {
        if (fs.existsSync(args.outputPath)) {
          const size = fs.statSync(args.outputPath).size;
          if (size > 0 && size === lastSize) {
            stableTicks++;
            if (stableTicks >= STABLE_TICKS) {
              resolved = true;
              try {
                child.kill('SIGTERM');
              } catch {}
              setTimeout(() => {
                try {
                  child.kill('SIGKILL');
                } catch {}
              }, 2_000);
              resolve();
              return;
            }
          } else {
            stableTicks = 0;
            lastSize = size;
          }
        }
      } catch {
        /* fs error — keep polling */
      }
      watchdogTimer = setTimeout(tick, POLL_MS);
    };
    watchdogTimer = setTimeout(tick, START_DELAY_MS);

    child.on('error', (err) => {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
    child.on('close', (code) => {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      if (resolved) return; // watchdog beat us to it
      resolved = true;
      if (code !== 0) {
        reject(
          new Error(`hyperframes render exited with code ${code}. stderr: ${stderr.slice(0, 500)}`)
        );
      } else {
        resolve();
      }
    });
  });
}
