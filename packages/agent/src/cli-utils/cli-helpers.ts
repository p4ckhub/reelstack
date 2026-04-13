/**
 * CLI argument parsing and output helpers.
 * Extracted from cli.ts for reuse across command modules.
 */
import fs from 'fs';
import path from 'path';

// ANSI colors
export const B = '\x1b[36m'; // cyan (brand)
export const G = '\x1b[32m'; // green (success)
export const Y = '\x1b[33m'; // yellow (warning)
export const R = '\x1b[31m'; // red (error)
export const D = '\x1b[2m'; // dim (secondary)
export const X = '\x1b[0m'; // reset

const args = process.argv.slice(2);

export const outDir = (() => {
  const idx = args.indexOf('--out');
  const dir =
    idx >= 0
      ? args[idx + 1]!
      : path.resolve(import.meta.dirname ?? __dirname, '../../../..', 'out');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
})();

export function flag(name: string): boolean {
  return args.includes(`--${name}`);
}

export function opt(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

export function positional(n: number): string | undefined {
  return args.filter((a) => !a.startsWith('--'))[n];
}

export function save(name: string, data: unknown): string {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  console.log(`${D}→ ${file}${X}`);
  return file;
}

export function elapsed(start: number): string {
  return `${((performance.now() - start) / 1000).toFixed(1)}s`;
}

/** Strip reel-script timing markers, convert pause annotations to ellipsis for TTS/HeyGen. */
export function cleanScriptFile(raw: string): string {
  return raw
    .split('\n')
    .filter((l) => !l.startsWith('[') || l.startsWith('[Pauza'))
    .map((l) => l.replace(/\[Pauza[\s\d.s]*\]/gi, '...').trim())
    .filter(Boolean)
    .join('\n');
}

/** Validate file exists, exit with error if not. */
export function requireFile(filePath: string, hint?: string): void {
  if (!fs.existsSync(filePath)) {
    console.log(`${R}File not found: ${filePath}${X}`);
    if (hint) console.log(`${D}${hint}${X}`);
    process.exit(1);
  }
}

/** Load JSON file, exit with error if invalid. */
export function loadJSON<T = Record<string, unknown>>(filePath: string): T {
  requireFile(filePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}
