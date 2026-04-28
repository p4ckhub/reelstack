/**
 * Tier 0 quality gates — cheap pre-render and post-render sanity checks.
 *
 * Goal: never silently ship a broken reel. Catch issues before paying for a
 * Lambda render (pre-render) and verify the output before handing the file
 * to the customer (post-render).
 *
 * Failed gates do not throw — the orchestrator records the failures and
 * marks the job `completed_with_warnings` so the customer still gets the
 * output but with an audit trail.
 */
import { measureLufs, probeMedia } from '@reelstack/ffmpeg';
import { createLogger } from '@reelstack/logger';
import type { ProductionPlan } from '../types';

const log = createLogger('tier0-gates');

/**
 * LUFS bounds. Spec target is -23..-10 LUFS — anything outside is too loud
 * (clipping risk) or too quiet (inaudible) and the customer will notice.
 */
export const LUFS_MIN = -23;
export const LUFS_MAX = -10;

/** Allowed audio/video codecs and container for shipped reels. */
export const ALLOWED_VIDEO_CODECS = new Set(['h264']);
export const ALLOWED_AUDIO_CODECS = new Set(['aac']);
export const ALLOWED_CONTAINERS = ['mp4', 'mov', 'm4a'];

/** Caption stream codecs ffprobe surfaces in mp4 outputs. */
const CAPTION_STREAM_CODECS = new Set(['mov_text', 'subrip', 'webvtt', 'ass']);

/** Tolerance (seconds) when comparing actual vs planned duration. */
export const DURATION_TOLERANCE_SECONDS = 0.5;

export interface QualityCheckResult {
  /** True iff every gate that was actually evaluated passed. */
  passed: boolean;
  /** Human-readable failure descriptions (gateId: detail). Empty on pass. */
  failures: string[];
  /** Per-gate result for audit/observability. */
  details: GateDetail[];
}

export interface GateDetail {
  /** Stable identifier (lufs, duration, codec, captions). */
  id: string;
  status: 'passed' | 'failed' | 'skipped';
  /** Human-readable explanation. */
  message: string;
}

export interface PreRenderInput {
  /** Local path to the voiceover file (mp3/wav). Required for LUFS check. */
  voiceoverPath?: string;
  /** Audio duration in seconds (from TTS step). */
  audioDuration?: number;
  /** Production plan that will be rendered. */
  plan: ProductionPlan;
  /** Caption cues that the assembler attached to the composition. */
  cues?: ReadonlyArray<{ startTime: number; endTime: number; text: string }>;
}

export interface PostRenderInput {
  /** Local path to the rendered output file. */
  outputPath: string;
  /** Expected duration (seconds) — usually the audio duration. */
  expectedDuration: number;
  /**
   * Whether the plan declared captions. If true, the rendered file must
   * either have a caption stream or the renderer must have burned the
   * captions in (we can't detect burn-in from pixels — see `assumeBurnedIn`).
   */
  expectsCaptions: boolean;
  /**
   * Renderer guarantees burned-in captions when no caption stream is found.
   * Remotion always burns captions into the video, so the orchestrator
   * passes `true` here. We don't FAIL captions for renderers that burn in.
   */
  assumeBurnedInCaptions?: boolean;
}

/**
 * Run pre-render gates. These are cheap (only ffmpeg loudnorm on voiceover +
 * plain JS sanity checks) and run before the orchestrator pays for a render.
 */
export async function runPreRenderGates(input: PreRenderInput): Promise<QualityCheckResult> {
  const details: GateDetail[] = [];

  details.push(checkLufs(input.voiceoverPath));
  details.push(checkPlannedDuration(input.plan, input.audioDuration));
  details.push(checkCaptionsPresent(input.plan, input.cues));

  return summarize(details);
}

/** Run post-render gates against the rendered MP4 file. */
export async function runPostRenderGates(input: PostRenderInput): Promise<QualityCheckResult> {
  const details: GateDetail[] = [];

  let probe: ReturnType<typeof probeMedia> | null = null;
  try {
    probe = probeMedia(input.outputPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    details.push({ id: 'probe', status: 'failed', message: `ffprobe failed: ${message}` });
    return summarize(details);
  }

  details.push(checkContainer(probe.formatName));
  details.push(checkCodecs(probe.streams));
  details.push(checkActualDuration(probe.durationSeconds, input.expectedDuration));
  details.push(
    checkCaptionsInOutput(probe.streams, input.expectsCaptions, input.assumeBurnedInCaptions)
  );

  return summarize(details);
}

/**
 * Combined check used by orchestrators that want a single boolean. Runs
 * pre-render gates first; if pre-render fails, post-render still runs so
 * the audit log captures everything.
 */
export async function runTier0Gates(input: {
  pre: PreRenderInput;
  post: PostRenderInput;
}): Promise<QualityCheckResult> {
  const pre = await runPreRenderGates(input.pre);
  const post = await runPostRenderGates(input.post);
  return {
    passed: pre.passed && post.passed,
    failures: [...pre.failures, ...post.failures],
    details: [...pre.details, ...post.details],
  };
}

// ── Individual gates ────────────────────────────────────────────────

function checkLufs(voiceoverPath?: string): GateDetail {
  if (!voiceoverPath) {
    return { id: 'lufs', status: 'skipped', message: 'No voiceover path provided' };
  }
  let lufs: number | null;
  try {
    lufs = measureLufs(voiceoverPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id: 'lufs', status: 'failed', message: `LUFS measurement failed: ${message}` };
  }

  if (lufs === null) {
    return {
      id: 'lufs',
      status: 'failed',
      message: 'Audio is silent (loudnorm reported -inf LUFS)',
    };
  }
  if (lufs < LUFS_MIN || lufs > LUFS_MAX) {
    return {
      id: 'lufs',
      status: 'failed',
      message: `LUFS ${lufs.toFixed(1)} outside allowed range [${LUFS_MIN}, ${LUFS_MAX}]`,
    };
  }
  return {
    id: 'lufs',
    status: 'passed',
    message: `LUFS ${lufs.toFixed(1)} within range`,
  };
}

function checkPlannedDuration(plan: ProductionPlan, audioDuration?: number): GateDetail {
  if (audioDuration === undefined || audioDuration <= 0) {
    return { id: 'duration', status: 'skipped', message: 'No audio duration provided' };
  }
  const lastShotEnd = plan.shots.reduce((max, s) => Math.max(max, s.endTime), 0);
  if (lastShotEnd <= 0) {
    return { id: 'duration', status: 'skipped', message: 'Plan has no shots' };
  }
  const drift = Math.abs(lastShotEnd - audioDuration);
  if (drift > DURATION_TOLERANCE_SECONDS) {
    return {
      id: 'duration',
      status: 'failed',
      message: `Plan ends at ${lastShotEnd.toFixed(2)}s, audio is ${audioDuration.toFixed(2)}s (drift ${drift.toFixed(2)}s > ${DURATION_TOLERANCE_SECONDS}s)`,
    };
  }
  return {
    id: 'duration',
    status: 'passed',
    message: `Plan/audio aligned (drift ${drift.toFixed(2)}s)`,
  };
}

function checkCaptionsPresent(
  plan: ProductionPlan,
  cues?: ReadonlyArray<{ startTime: number; endTime: number; text: string }>
): GateDetail {
  // We treat captions as expected for any reel that has voiceover speech.
  // The plan itself doesn't carry cues — the assembler attaches them. So
  // we check the cues argument (post-Whisper, pre-render).
  if (!cues || cues.length === 0) {
    // No cues provided — could be a silent reel (no voiceover). We can't
    // know without more context, so skip rather than fail.
    if (plan.primarySource.type === 'none') {
      return { id: 'captions', status: 'skipped', message: 'No primary source — captions n/a' };
    }
    return {
      id: 'captions',
      status: 'failed',
      message: 'Plan has voiceover but no caption cues attached',
    };
  }
  return {
    id: 'captions',
    status: 'passed',
    message: `${cues.length} caption cue(s) present`,
  };
}

function checkContainer(formatName: string): GateDetail {
  const matched = ALLOWED_CONTAINERS.some((c) => formatName.includes(c));
  if (!matched) {
    return {
      id: 'container',
      status: 'failed',
      message: `Container ${formatName} not in allowlist [${ALLOWED_CONTAINERS.join(', ')}]`,
    };
  }
  return { id: 'container', status: 'passed', message: `Container ${formatName} OK` };
}

function checkCodecs(streams: ReadonlyArray<{ codecType: string; codecName: string }>): GateDetail {
  const video = streams.find((s) => s.codecType === 'video');
  const audio = streams.find((s) => s.codecType === 'audio');

  const failures: string[] = [];
  if (!video) {
    failures.push('no video stream');
  } else if (!ALLOWED_VIDEO_CODECS.has(video.codecName)) {
    failures.push(
      `video codec ${video.codecName} not in [${[...ALLOWED_VIDEO_CODECS].join(', ')}]`
    );
  }
  if (!audio) {
    failures.push('no audio stream');
  } else if (!ALLOWED_AUDIO_CODECS.has(audio.codecName)) {
    failures.push(
      `audio codec ${audio.codecName} not in [${[...ALLOWED_AUDIO_CODECS].join(', ')}]`
    );
  }

  if (failures.length > 0) {
    return { id: 'codec', status: 'failed', message: failures.join('; ') };
  }
  return {
    id: 'codec',
    status: 'passed',
    message: `Codecs OK (${video?.codecName}/${audio?.codecName})`,
  };
}

function checkActualDuration(actual: number, expected: number): GateDetail {
  if (expected <= 0) {
    return { id: 'render-duration', status: 'skipped', message: 'No expected duration' };
  }
  const drift = Math.abs(actual - expected);
  if (drift > DURATION_TOLERANCE_SECONDS) {
    return {
      id: 'render-duration',
      status: 'failed',
      message: `Rendered ${actual.toFixed(2)}s vs expected ${expected.toFixed(2)}s (drift ${drift.toFixed(2)}s)`,
    };
  }
  return {
    id: 'render-duration',
    status: 'passed',
    message: `Render duration aligned (drift ${drift.toFixed(2)}s)`,
  };
}

function checkCaptionsInOutput(
  streams: ReadonlyArray<{ codecType: string; codecName: string }>,
  expects: boolean,
  assumeBurnedIn?: boolean
): GateDetail {
  if (!expects) {
    return { id: 'captions-output', status: 'skipped', message: 'Plan did not declare captions' };
  }
  const hasCaptionStream = streams.some(
    (s) => s.codecType === 'subtitle' || CAPTION_STREAM_CODECS.has(s.codecName)
  );
  if (hasCaptionStream) {
    return { id: 'captions-output', status: 'passed', message: 'Caption stream present' };
  }
  if (assumeBurnedIn) {
    return {
      id: 'captions-output',
      status: 'passed',
      message: 'Renderer guarantees burned-in captions',
    };
  }
  return {
    id: 'captions-output',
    status: 'failed',
    message: 'No caption stream and renderer does not guarantee burn-in',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function summarize(details: GateDetail[]): QualityCheckResult {
  const failures = details.filter((d) => d.status === 'failed').map((d) => `${d.id}: ${d.message}`);
  const passed = failures.length === 0;
  if (!passed) {
    log.warn({ failures, details }, 'Tier 0 quality gates failed');
  }
  return { passed, failures, details };
}
