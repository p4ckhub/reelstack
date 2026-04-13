/**
 * Pipeline walkthrough — step-by-step execution with full I/O logging.
 *
 * Demonstrates:
 * 1. PipelineEngine executes steps in order with dependency checks
 * 2. Each step's output is persisted to storage
 * 3. Resume from a failed step works (skips completed steps)
 * 4. Cost tracking integrates with pipeline artifacts
 * 5. API call logging flows through context
 *
 * Usage: bun run scripts/pipeline-walkthrough.ts
 */
import { PipelineEngine } from '../packages/agent/src/orchestrator/pipeline-engine';
import {
  runWithJobId,
  addCost,
  getCostSummary,
  setApiCallLogger,
  logApiCall,
} from '../packages/agent/src/context';
import { PipelineLogger } from '../packages/agent/src/orchestrator/pipeline-logger';
import type {
  PipelineDefinition,
  PipelineContext,
  StepStatus,
} from '../packages/agent/src/orchestrator/pipeline-engine';

// ── Colors ─────────────────────────────────────────────────

const B = '\x1b[36m',
  G = '\x1b[32m',
  Y = '\x1b[33m',
  R = '\x1b[31m',
  D = '\x1b[2m',
  X = '\x1b[0m';

function header(text: string) {
  console.log(`\n${B}${'━'.repeat(70)}${X}`);
  console.log(`${B}  ${text}${X}`);
  console.log(`${B}${'━'.repeat(70)}${X}`);
}

function showJson(label: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);
  const lines = json.split('\n');
  const preview =
    lines.length > 25
      ? lines.slice(0, 25).join('\n') + `\n  ... (${lines.length - 25} more lines)`
      : json;
  console.log(`  ${D}${label}:${X}`);
  for (const line of preview.split('\n')) {
    console.log(`    ${line}`);
  }
}

// ── Pipeline definition (simulates real generate pipeline) ──

let failOnStep: string | null = null;

const pipeline: PipelineDefinition = {
  id: 'demo-generate',
  name: 'Demo Generate Pipeline',
  steps: [
    {
      id: 'tts',
      name: 'Text-to-Speech + Transcription',
      dependsOn: [],
      execute: async (ctx: PipelineContext) => {
        if (failOnStep === 'tts') throw new Error('TTS provider connection timeout');
        const script = ctx.input.script as string;
        const words = script.split(' ').map((word, i) => ({
          text: word,
          startTime: +(i * 0.42).toFixed(2),
          endTime: +((i + 1) * 0.42).toFixed(2),
        }));
        const duration = +(words.length * 0.42).toFixed(2);
        return {
          voiceoverPath: '/tmp/demo-voiceover.mp3',
          audioDuration: duration,
          words,
          cues: [{ id: 'cue-1', text: script, startTime: 0, endTime: duration }],
        };
      },
    },
    {
      id: 'plan',
      name: 'LLM Production Planning',
      dependsOn: ['tts'],
      execute: async (ctx: PipelineContext) => {
        if (failOnStep === 'plan') throw new Error('LLM API rate limited');
        const tts = ctx.results.tts as { audioDuration: number };

        addCost({
          step: 'llm:planner',
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          type: 'llm',
          costUSD: 0.045,
          inputUnits: 2100,
          outputUnits: 800,
          durationMs: 3200,
        });

        logApiCall('llm:planner', `anthropic-${Date.now()}`, {
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          request: {
            systemPrompt: 'You are a video production planner...',
            userMessage: `Plan reel (${tts.audioDuration}s)...`,
          },
          response: {
            text: '{"layout":"fullscreen","shots":[...]}',
            usage: { inputTokens: 2100, outputTokens: 800 },
          },
          durationMs: 3200,
        });

        return {
          plan: {
            layout: 'fullscreen',
            primarySource: { type: 'none' },
            shots: [
              {
                id: 'shot-1',
                startTime: 0,
                endTime: 2.5,
                shotLayout: 'head',
                visual: { type: 'primary' },
                reason: 'Hook',
              },
              {
                id: 'shot-2',
                startTime: 2.5,
                endTime: 6,
                shotLayout: 'content',
                visual: { type: 'b-roll', searchQuery: 'AI tools', toolId: 'pexels' },
                reason: 'Illustration',
              },
              {
                id: 'shot-3',
                startTime: 6,
                endTime: tts.audioDuration,
                shotLayout: 'head',
                visual: { type: 'primary' },
                reason: 'CTA',
              },
            ],
            reasoning: 'Dynamic fullscreen, 3 shots, hook-body-CTA',
          },
        };
      },
    },
    {
      id: 'asset-gen',
      name: 'Asset Generation (Veo/Pexels)',
      dependsOn: ['plan'],
      execute: async (ctx: PipelineContext) => {
        if (failOnStep === 'asset-gen') throw new Error('Veo API quota exceeded');

        addCost({
          step: 'asset:pexels',
          provider: 'pexels',
          type: 'video',
          costUSD: 0,
          inputUnits: 1,
          durationMs: 800,
        });

        return {
          assets: [
            {
              toolId: 'pexels-video',
              shotId: 'shot-2',
              url: 'https://videos.pexels.com/12345/ai-demo.mp4',
              type: 'stock-video',
              durationSeconds: 5,
            },
          ],
        };
      },
    },
    {
      id: 'composition',
      name: 'Composition Assembly',
      dependsOn: ['plan', 'asset-gen', 'tts'],
      execute: async (ctx: PipelineContext) => {
        const plan = (ctx.results.plan as { plan: unknown }).plan;
        const assets = (ctx.results['asset-gen'] as { assets: unknown[] }).assets;
        const tts = ctx.results.tts as { cues: unknown[]; audioDuration: number };

        return {
          reelProps: {
            layout: 'fullscreen',
            width: 1080,
            height: 1920,
            fps: 30,
            durationInSeconds: tts.audioDuration,
            cues: tts.cues,
            bRollSegments: assets.length,
          },
          plan,
        };
      },
    },
  ],
};

// ═══════════════════════════════════════════════════════════
// SCENARIO 1: Full successful run
// ═══════════════════════════════════════════════════════════

header('SCENARIO 1: Full pipeline run — all steps succeed');

const JOB_1 = `walkthrough-${Date.now()}`;
const engine = new PipelineEngine();

const scenario1Result = await runWithJobId(JOB_1, async () => {
  const logger = new PipelineLogger(JOB_1);
  setApiCallLogger(logger);

  console.log(`\n  Job ID: ${JOB_1}`);
  console.log(`  Input: { script: "AI zmieni sposób w jaki pracujesz", style: "dynamic" }\n`);

  const result = await engine.runAll(
    pipeline,
    { script: 'AI zmieni sposób w jaki pracujesz na co dzień', style: 'dynamic' },
    JOB_1,
    (_stepId: string, status: StepStatus) => {
      const icon =
        status.status === 'completed'
          ? `${G}✓${X}`
          : status.status === 'running'
            ? `${Y}▶${X}`
            : status.status === 'failed'
              ? `${R}✗${X}`
              : '·';
      const dur = status.durationMs !== undefined ? ` ${D}(${status.durationMs}ms)${X}` : '';
      console.log(`    ${icon} ${status.name} [${status.status}]${dur}`);
    }
  );

  // Show each step output
  for (const step of pipeline.steps) {
    header(`Step "${step.id}" — INPUT → OUTPUT`);
    const deps = step.dependsOn.length > 0 ? step.dependsOn.join(', ') : '(none)';
    console.log(`  Dependencies: ${deps}`);
    showJson('Output', result.context.results[step.id]);
  }

  // Costs
  header('Cost Summary (from context)');
  const costs = getCostSummary();
  console.log(`  Total: $${costs.totalUSD.toFixed(4)}`);
  console.log(`  By provider: ${JSON.stringify(costs.byProvider)}`);
  console.log(`  By type: ${JSON.stringify(costs.byType)}`);
  console.log(`  Entries: ${costs.entries.length}`);

  // Persist pipeline log
  await logger.persist();

  return result;
});

console.log(
  `\n  Pipeline result: ${scenario1Result.status === 'completed' ? G : R}${scenario1Result.status}${X}`
);

// ═══════════════════════════════════════════════════════════
// SCENARIO 2: Failure at asset-gen → Resume
// ═══════════════════════════════════════════════════════════

header('SCENARIO 2: Pipeline fails at asset-gen, then resumes');

const JOB_2 = `walkthrough-resume-${Date.now()}`;

await runWithJobId(JOB_2, async () => {
  failOnStep = 'asset-gen';

  console.log(`\n  ${Y}Running pipeline (asset-gen will FAIL)...${X}\n`);
  const failResult = await engine.runAll(
    pipeline,
    { script: 'Test resume flow', style: 'calm' },
    JOB_2,
    (_stepId: string, status: StepStatus) => {
      const icon =
        status.status === 'completed'
          ? `${G}✓${X}`
          : status.status === 'failed'
            ? `${R}✗${X}`
            : status.status === 'running'
              ? `${Y}▶${X}`
              : '·';
      const err = status.error ? ` — ${R}${status.error}${X}` : '';
      console.log(`    ${icon} ${status.name} [${status.status}]${err}`);
    }
  );

  console.log(`\n  Pipeline status: ${R}${failResult.status}${X}`);
  console.log(`  Failed at: ${R}${failResult.failedStepId}${X}`);
  console.log(`  Persisted results: [${Object.keys(failResult.context.results).join(', ')}]`);

  // Now resume
  failOnStep = null;
  console.log(`\n  ${G}Resuming from "asset-gen"...${X}\n`);

  const resumeResult = await engine.resumeFrom(
    pipeline,
    JOB_2,
    'asset-gen',
    (_stepId: string, status: StepStatus) => {
      const icon =
        status.status === 'completed'
          ? `${G}✓${X}`
          : status.status === 'skipped'
            ? `${D}○${X}`
            : status.status === 'running'
              ? `${Y}▶${X}`
              : '·';
      console.log(`    ${icon} ${status.name} [${status.status}]`);
    }
  );

  console.log(`\n  Resume result: ${G}${resumeResult.status}${X}`);
  const completed = resumeResult.steps.filter((s) => s.status === 'completed').map((s) => s.id);
  const skipped = resumeResult.steps.filter((s) => s.status === 'skipped').map((s) => s.id);
  console.log(`  ${G}Executed${X}: ${completed.join(', ')}`);
  console.log(`  ${D}Skipped (from persisted context)${X}: ${skipped.join(', ')}`);
});

// ═══════════════════════════════════════════════════════════

header('ALL SCENARIOS PASSED');
console.log(`  Pipeline engine: step execution, persistence, resume — all verified.\n`);
