/**
 * API call audit — global `fetch()` hook that records every outbound HTTP
 * request/response for the active job.
 *
 * Philosophy:
 *   - Call `installFetchHook()` once at process bootstrap. From then on,
 *     every `fetch()` anywhere in the process (including calls from SDKs)
 *     is captured when a job context is active.
 *   - Capture is gated on the presence of an `apiCallLogger` in the current
 *     jobContext — outside of a job there is no sink and no log is written.
 *   - Sensitive headers (Authorization, x-api-key, cookie, ...) are
 *     redacted before storage.
 *   - Payloads are scrubbed: anything that looks like base64 above
 *     `MAX_BASE64_LEN` is replaced with a placeholder (binary blobs never
 *     land in the audit log). Strings above `MAX_STRING_LEN` are truncated.
 *   - The sink itself (e.g., R2 upload of the audit artifact) runs with a
 *     reentrancy flag set so we never log the log.
 *   - Logging is best-effort: if the sink throws, the fetch still succeeds.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { jobContext, logApiCall } from './job-context';

// ── Types ─────────────────────────────────────────────────────

export type ApiCallKind =
  | 'llm'
  | 'asset-gen'
  | 'asset-poll'
  | 'tts'
  | 'transcription'
  | 'storage'
  | 'other';

export interface ApiCallLogEntry {
  /** Populated by `logApiCall` from the active jobContext. */
  jobId: string;
  stepId: string;
  callId: string;
  kind: ApiCallKind;
  provider: string;
  model?: string;
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  durationMs: number;
  error?: string;
  costUSD?: number;
  startedAt: number;
}

export interface ApiCallLogger {
  saveApiCall(entry: ApiCallLogEntry): void;
}

// ── Redaction ─────────────────────────────────────────────────

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'x-access-token',
  'x-goog-api-key',
  'proxy-authorization',
  'cookie',
  'set-cookie',
]);

export function redactHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const entries: Array<[string, string]> =
    headers instanceof Headers
      ? [...headers.entries()]
      : Array.isArray(headers)
        ? (headers as Array<[string, string]>)
        : Object.entries(headers as Record<string, string>);
  for (const [k, v] of entries) {
    out[k] = SENSITIVE_HEADER_NAMES.has(k.toLowerCase()) ? '[REDACTED]' : String(v);
  }
  return out;
}

// ── Payload scrubbing ─────────────────────────────────────────

const BASE64_RE = /^[A-Za-z0-9+/]+=*$/;
const MAX_BASE64_LEN = 256;
const MAX_STRING_LEN = 8000;
const MAX_DEPTH = 8;

function isLikelyBase64(s: string): boolean {
  return s.length >= MAX_BASE64_LEN && BASE64_RE.test(s);
}

export function scrubPayload(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated: depth]';
  if (value == null) return value;

  if (typeof value === 'string') {
    if (value.startsWith('data:') && value.length > MAX_BASE64_LEN) {
      return `[data-url stripped: ${value.length} chars]`;
    }
    if (isLikelyBase64(value)) {
      return `[base64 stripped: ${value.length} chars]`;
    }
    if (value.length > MAX_STRING_LEN) {
      return `${value.slice(0, MAX_STRING_LEN)}…[truncated: ${value.length} chars total]`;
    }
    return value;
  }

  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((v) => scrubPayload(v, depth + 1));
  }

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = scrubPayload(v, depth + 1);
  }
  return out;
}

// ── Body serialization for logging ────────────────────────────

function describeRequestBody(body: BodyInit | null | undefined): unknown {
  if (body == null) return undefined;
  if (typeof body === 'string') {
    try {
      return scrubPayload(JSON.parse(body));
    } catch {
      return scrubPayload(body);
    }
  }
  if (body instanceof URLSearchParams) {
    const out: Record<string, string> = {};
    body.forEach((v, k) => {
      out[k] = v;
    });
    return scrubPayload(out);
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const out: Record<string, unknown> = {};
    body.forEach((v, k) => {
      out[k] =
        typeof v === 'string'
          ? v
          : `[${(v as { constructor?: { name?: string } }).constructor?.name ?? 'Blob'}]`;
    });
    return scrubPayload(out);
  }
  if (body instanceof ArrayBuffer) {
    return `[ArrayBuffer: ${body.byteLength} bytes]`;
  }
  if (ArrayBuffer.isView(body)) {
    return `[${body.constructor.name}: ${body.byteLength} bytes]`;
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return `[Blob: ${body.size} bytes, ${body.type || 'unknown type'}]`;
  }
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return '[ReadableStream: unread]';
  }
  return `[non-serializable: ${typeof body}]`;
}

async function describeResponseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? '';
  const cloned = res.clone();

  if (!contentType || contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return scrubPayload(await cloned.json());
    } catch {
      try {
        return scrubPayload(await res.clone().text());
      } catch {
        return '[unreadable response body]';
      }
    }
  }
  if (
    contentType.startsWith('text/') ||
    contentType.includes('xml') ||
    contentType.includes('html')
  ) {
    try {
      return scrubPayload(await cloned.text());
    } catch {
      return '[unreadable text body]';
    }
  }
  const size = res.headers.get('content-length');
  return `[binary: ${size ?? 'unknown'} bytes, ${contentType}]`;
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

// ── Provider + kind inference from URL ────────────────────────

const PROVIDER_HOST_RULES: Array<{ match: RegExp; provider: string; kind: ApiCallKind }> = [
  { match: /(^|\.)api\.anthropic\.com$/i, provider: 'anthropic', kind: 'llm' },
  { match: /(^|\.)api\.openai\.com$/i, provider: 'openai', kind: 'llm' },
  { match: /(^|\.)openrouter\.ai$/i, provider: 'openrouter', kind: 'llm' },
  { match: /(^|\.)generativelanguage\.googleapis\.com$/i, provider: 'gemini', kind: 'llm' },
  { match: /(^|\.)aiplatform\.googleapis\.com$/i, provider: 'vertex', kind: 'asset-gen' },
  { match: /(^|\.)api\.heygen\.com$/i, provider: 'heygen', kind: 'asset-gen' },
  { match: /(^|\.)api\.kie\.ai$/i, provider: 'kie', kind: 'asset-gen' },
  { match: /(^|\.)api\.piapi\.ai$/i, provider: 'piapi', kind: 'asset-gen' },
  { match: /(^|\.)api\.wavespeed\.ai$/i, provider: 'wavespeed', kind: 'asset-gen' },
  { match: /(^|\.)api\.aimlapi\.com$/i, provider: 'aimlapi', kind: 'asset-gen' },
  { match: /(^|\.)api\.replicate\.com$/i, provider: 'replicate', kind: 'asset-gen' },
  { match: /(^|\.)api\.fal\.ai$/i, provider: 'fal', kind: 'asset-gen' },
  { match: /(^|\.)queue\.fal\.run$/i, provider: 'fal', kind: 'asset-gen' },
  { match: /(^|\.)api\.runwayml\.com$/i, provider: 'runway', kind: 'asset-gen' },
  { match: /(^|\.)api\.minimax\.(chat|io)$/i, provider: 'minimax', kind: 'asset-gen' },
  { match: /(^|\.)api\.minimaxi\.com$/i, provider: 'minimax', kind: 'asset-gen' },
  { match: /(^|\.)api\.runpod\.ai$/i, provider: 'runpod', kind: 'asset-gen' },
  { match: /(^|\.)api\.pexels\.com$/i, provider: 'pexels', kind: 'asset-gen' },
  { match: /(^|\.)api\.elevenlabs\.io$/i, provider: 'elevenlabs', kind: 'tts' },
  { match: /(^|\.)api\.cloudflare\.com$/i, provider: 'cloudflare', kind: 'transcription' },
  { match: /(^|\.)r2\.cloudflarestorage\.com$/i, provider: 'r2', kind: 'storage' },
  { match: /(^|\.)amazonaws\.com$/i, provider: 'aws', kind: 'storage' },
  { match: /(^|\.)supabase\.co$/i, provider: 'supabase', kind: 'storage' },
];

export function inferCallMeta(urlStr: string): { provider: string; kind: ApiCallKind } {
  try {
    const host = new URL(urlStr).hostname;
    for (const rule of PROVIDER_HOST_RULES) {
      if (rule.match.test(host)) return { provider: rule.provider, kind: rule.kind };
    }
    // Fallback: first label after stripping api./www.
    const stripped = host.replace(/^(api|www|api-)\./, '');
    const provider = stripped.split('.')[0] || host;
    return { provider, kind: 'other' };
  } catch {
    return { provider: 'unknown', kind: 'other' };
  }
}

// ── Global fetch hook ─────────────────────────────────────────

/** Captured at module load, before any install() call, so downstream code
 * that needs to bypass the hook (e.g., audit-sink uploads) can use it. */
export const originalFetch: typeof fetch = globalThis.fetch.bind(globalThis);

/** Reentrancy guard: any fetch triggered while we are inside the log sink
 * (artifact upload, DB insert) skips logging to avoid infinite recursion. */
const insideSink = new AsyncLocalStorage<true>();

let hookInstalled = false;

/** Install the global fetch hook. Idempotent. Safe to call multiple times.
 * Call once at process bootstrap (worker entry, Next.js instrumentation). */
export function installFetchHook(): void {
  if (hookInstalled) return;
  hookInstalled = true;
  const hooked: typeof fetch = (input, init) => performLoggedFetch(input, init);
  globalThis.fetch = hooked;
}

/** Run a block with the audit sink reentrancy flag set. Used internally by
 * the audit sink to avoid logging the log. */
export function runInsideSink<T>(fn: () => T): T {
  return insideSink.run(true, fn);
}

function resolveUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  try {
    return (input as Request).url;
  } catch {
    return String(input);
  }
}

function resolveMethod(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1]
): string {
  const fromInit = init?.method;
  if (fromInit) return fromInit.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function resolveHeaders(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1]
): HeadersInit | undefined {
  if (init?.headers) return init.headers;
  if (input instanceof Request) return input.headers;
  return undefined;
}

function resolveBody(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1]
): BodyInit | null | undefined {
  if (init?.body !== undefined) return init.body as BodyInit | null;
  // Note: Request bodies can only be read once, so we don't try to inspect
  // them here — just indicate presence.
  if (input instanceof Request && input.body !== null) return '[Request with body]';
  return undefined;
}

/** Internal — exported only so tests can drive the logging pipeline with
 * a mock fetch implementation. Production code should call `fetch()` and
 * let `installFetchHook` route through `hookedFetch` below. */
export async function performLoggedFetch(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  fetchImpl: typeof fetch = originalFetch
): Promise<Response> {
  // Reentrancy: log-sink's own fetches bypass logging entirely.
  if (insideSink.getStore()) return fetchImpl(input, init);

  // Logging requires a job context (so entries carry jobId). Without one,
  // fetches from health checks / crons / unrelated code pass through
  // silently. `logApiCall` itself dispatches to both the per-job sink and
  // any registered global sinks.
  const store = jobContext.getStore();
  if (!store) return fetchImpl(input, init);

  const startedAt = Date.now();
  const start = performance.now();
  const callId = randomUUID();
  const urlStr = resolveUrl(input);
  const method = resolveMethod(input, init);
  const headers = resolveHeaders(input, init);
  const body = resolveBody(input, init);
  const { provider, kind } = inferCallMeta(urlStr);

  const requestHeaders = redactHeaders(headers);
  const requestBody = describeRequestBody(body as BodyInit | null | undefined);

  try {
    const res = await fetchImpl(input, init);
    const durationMs = Math.round(performance.now() - start);
    const responseHeaders = headersToObject(res.headers);
    let responseBody: unknown;
    try {
      responseBody = await describeResponseBody(res);
    } catch {
      responseBody = '[failed to read response]';
    }

    logApiCall({
      stepId: 'fetch',
      callId,
      kind,
      provider,
      method,
      url: urlStr,
      requestHeaders,
      requestBody,
      responseStatus: res.status,
      responseHeaders,
      responseBody,
      durationMs,
      startedAt,
    });
    return res;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    logApiCall({
      stepId: 'fetch',
      callId,
      kind,
      provider,
      method,
      url: urlStr,
      requestHeaders,
      requestBody,
      durationMs,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      startedAt,
    });
    throw err;
  }
}
