/**
 * Test script generation in isolation.
 * Verifies: section count, word count, estimated duration vs target.
 */
import { generatePresenterScript } from '../packages/modules/src/private/agent/generators/presenter-script-generator';
import { callLLM } from '../packages/agent/src/index';

const TARGET = 30;

const script = await generatePresenterScript({
  topic: 'Agent AI vs chatbot - fundamentalna różnica. Chatbot odpowiada, agent działa.',
  llmCall: callLLM,
  persona: 'animated-dev',
  style: 'aggressive-funny',
  language: 'pl',
  targetDuration: TARGET,
});

const allText = [script.hook, ...script.sections.map((s) => s.text), script.cta].join(' ');
const totalWords = allText.split(/\s+/).length;
const estimatedDuration = totalWords / 2.5;

console.log(`\nHook: "${script.hook}"`);
console.log(`Sections: ${script.sections.length}`);
for (const [i, s] of script.sections.entries()) {
  const words = s.text.split(/\s+/).length;
  console.log(
    `  [${i}] ${words} words (~${(words / 2.5).toFixed(1)}s) [${s.boardImageSpec.type}]: "${s.text.substring(0, 70)}"`
  );
}
console.log(`CTA: "${script.cta}"`);
console.log(
  `\nTotal: ${totalWords} words → ~${estimatedDuration.toFixed(0)}s (target: ${TARGET}s)`
);

if (estimatedDuration > TARGET * 1.3) {
  console.log(
    `❌ TOO LONG: ${estimatedDuration.toFixed(0)}s vs ${TARGET}s target (${((estimatedDuration / TARGET - 1) * 100).toFixed(0)}% over)`
  );
} else {
  console.log(`✅ Duration OK`);
}

if (script.sections.length < Math.floor(TARGET / 5)) {
  console.log(
    `❌ TOO FEW SECTIONS: ${script.sections.length} (need ${Math.floor(TARGET / 5)}+ for ${TARGET}s)`
  );
} else {
  console.log(`✅ Section count OK`);
}
