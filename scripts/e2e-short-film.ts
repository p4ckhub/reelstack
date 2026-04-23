#!/usr/bin/env bun
/**
 * E2E short-film smoke test — direct orchestrator call, no HTTP / queue / UI.
 *
 * Usage:
 *   bun scripts/e2e-short-film.ts
 *
 * Uses .env.dev for API keys; overrides MINIO_ENDPOINT to localhost because
 * the docker-compose service name ("minio") only resolves inside the network.
 *
 * FAL_KEY is blank in .env.dev — pulled from Vaultwarden via the shell before
 * the script runs. Export FAL_KEY in your shell (or bw get password) first.
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

const repoRoot = path.resolve(import.meta.dirname, '..');
// Use the repo's default `.env` (R2 prod storage). Local MinIO can't be
// reached from fal.ai's servers during chained i2v — they need a publicly
// resolvable URL for every frame we feed as `image_url`. R2 has one out
// of the box; MinIO would need ngrok or similar.
loadEnv({ path: path.join(repoRoot, '.env'), override: true });

// Pull FAL_KEY from shell env (export it before running) or fail loudly.
if (!process.env.FAL_KEY) {
  // Fallback: try Vaultwarden — requires `bw` CLI unlocked via BW_SESSION.
  try {
    const { execSync } = await import('node:child_process');
    const fromVault = execSync('bw get password "fal.ai API" 2>/dev/null', {
      encoding: 'utf8',
    }).trim();
    if (fromVault) {
      process.env.FAL_KEY = fromVault;
      console.log('✓ FAL_KEY pulled from Vaultwarden');
    }
  } catch {
    /* bw not available */
  }
}

if (!process.env.FAL_KEY) {
  console.error(
    '✗ FAL_KEY missing. Export it (or unlock bw) before running:',
    '\n  export FAL_KEY=$(bw get password "fal.ai API")'
  );
  process.exit(1);
}

// Now import the orchestrator (after env is wired up).
await import('@reelstack/modules');
const { listModules } = await import('@reelstack/agent');

const sf = listModules().find((m) => m.id === 'ai-short-film');
if (!sf) {
  console.error('✗ ai-short-film module did not register');
  process.exit(1);
}
console.log('✓ ai-short-film module registered');

const baseRequest = {
  jobId: `e2e-short-film-${Date.now()}`,
  language: 'en',
  onProgress: (step: string) => console.log(`  · ${step}`),
};

const topic =
  'A weary senior developer on night shift realises the broken deploy was their own typo. They push a single-line fix, watch the green CI badge, and lean back smiling at the empty office.';

const outDir = path.join(process.env.HOME ?? '/tmp', 'Downloads');
fs.mkdirSync(outDir, { recursive: true });
const outputPath = path.join(outDir, `reelstack-short-film-${Date.now()}.mp4`);

console.log(`\nTopic: "${topic.slice(0, 90)}..."`);
console.log(`Output: ${outputPath}\n`);

const startedAt = Date.now();
try {
  const result = await sf.orchestrate(baseRequest, {
    topic,
    numberOfScenes: 4,
    characterDescription:
      'Late-30s man, short salt-and-pepper beard, wire-frame glasses, dark grey hoodie.',
    preferredI2VToolId: 'kling-o3-std-fal',
    outputPath,
  });
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

  console.log('\n✓ DONE');
  console.log(`  output: ${result.outputPath}`);
  console.log(`  duration: ${result.durationSeconds}s`);
  console.log(`  wall time: ${elapsedSec}s`);
  console.log(`  meta:`, JSON.stringify(result.meta, null, 2));
} catch (err) {
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.error(`\n✗ FAILED after ${elapsedSec}s:`);
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
}
