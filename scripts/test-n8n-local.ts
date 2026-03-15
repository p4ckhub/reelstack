#!/usr/bin/env bun
/**
 * Local test: full n8n-explainer pipeline using local code + Lambda render.
 * Tests quality fix (PNG frames + CRF 18) without waiting for CI Docker build.
 *
 * Run from project root:
 *   bun run scripts/test-n8n-local.ts
 */
import { produceN8nExplainer, callLLM } from '../packages/agent/src/index';

// Same workflow URL as the last completed job
const WORKFLOW_URL = 'https://n8n.io/workflows/3121-ai-image-generator-using-replicate-and-google-drive';

console.log('Starting n8n-explainer local test...');
console.log('Quality settings: imageFormat=png, crf=18 (from lambda-renderer.ts)');
console.log('');

const result = await produceN8nExplainer({
  workflowUrl: WORKFLOW_URL,
  language: 'en',
  tts: { provider: 'edge-tts', language: 'en-US' },
  llmCall: callLLM,
  outputPath: '/tmp/n8n-explainer-quality-test.mp4',
  onProgress: (step) => console.log(`  → ${step}`),
});

console.log('\n=== Result ===');
console.log(`Output: ${result.outputPath}`);
console.log(`Duration: ${result.durationSeconds.toFixed(1)}s`);
console.log(`Workflow: ${result.workflow.name} (${result.workflow.nodes.length} nodes)`);
console.log(`Script sections: ${result.script.sections.length}`);
console.log('\nSteps:');
for (const step of result.steps) {
  console.log(`  ${step.name}: ${(step.durationMs / 1000).toFixed(1)}s - ${step.detail}`);
}
console.log('\nOpen: open /tmp/n8n-explainer-quality-test.mp4');
