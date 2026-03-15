/**
 * Test: LLM planner prompt quality with real Claude API call.
 * Verifies that the new Seedance guidelines produce proper prompts.
 *
 * Run: ANTHROPIC_API_KEY=... bun vitest run src/__tests__/planner-prompt-quality.test.ts
 */
import { describe, it, expect } from 'vitest';
import { planProduction } from '../planner/production-planner';
import { SEEDANCE_GUIDELINES, NANOBANANA_GUIDELINES } from '../tools/prompt-guidelines';
import type { ToolManifest } from '../types';

// Skip if no API key (CI-safe)
const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
const itLive = hasApiKey ? it : it.skip;

// Seedance forbidden words
const FORBIDDEN_WORDS = [
  'cinematic', 'epic', 'masterpiece', 'ultra-real', 'award-winning',
  'stunning', '8K', '4K', 'beautiful', 'breathtaking', 'immersive',
  'ethereal', 'magical', 'hyper-realistic', 'photorealistic',
  'high quality', 'professional', 'amazing',
];

function checkPromptQuality(prompt: string, shotId: string) {
  const lower = prompt.toLowerCase();

  // Check forbidden words
  const found = FORBIDDEN_WORDS.filter(w => lower.includes(w.toLowerCase()));
  if (found.length > 0) {
    console.warn(`  ⚠ Shot ${shotId} uses FORBIDDEN words: ${found.join(', ')}`);
  }

  // Check structure: should have camera/lighting descriptions
  const hasCamera = /\b(wide|medium|close-up|ECU|dolly|pan|tilt|orbit|crane|locked|tracking|handheld)\b/i.test(prompt);
  const hasLighting = /\b(amber|blue|warm|cool|key|rim|backlight|shadow|low-key|high-key)\b/i.test(prompt);
  const hasFraming = /\b(wide shot|medium shot|close-up|bird's eye|eye level|low angle|high angle)\b/i.test(prompt);

  return { found, hasCamera, hasLighting, hasFraming, wordCount: prompt.split(/\s+/).length };
}

/** Build a realistic tool manifest with seedance + pexels marked as available */
function getMockToolManifest(): ToolManifest {
  return {
    summary: 'seedance2-piapi, seedance-piapi, pexels, nanobanana2-kie, user-upload',
    tools: [
      {
        id: 'seedance2-piapi',
        name: 'Seedance 2.0 via piapi.ai',
        available: true,
        capabilities: [{ assetType: 'ai-video', supportsPrompt: true, supportsScript: false, maxDurationSeconds: 15, estimatedLatencyMs: 150_000, isAsync: true, costTier: 'moderate' }],
        promptGuidelines: SEEDANCE_GUIDELINES,
      },
      {
        id: 'seedance-piapi',
        name: 'Seedance 2.0 (fast) via piapi.ai',
        available: true,
        capabilities: [{ assetType: 'ai-video', supportsPrompt: true, supportsScript: false, maxDurationSeconds: 15, estimatedLatencyMs: 90_000, isAsync: true, costTier: 'moderate' }],
        promptGuidelines: SEEDANCE_GUIDELINES,
      },
      {
        id: 'nanobanana2-kie',
        name: 'NanoBanana 2 via kie.ai',
        available: true,
        capabilities: [{ assetType: 'ai-image', supportsPrompt: true, supportsScript: false, estimatedLatencyMs: 15_000, isAsync: true, costTier: 'cheap' }],
        promptGuidelines: NANOBANANA_GUIDELINES,
      },
      {
        id: 'pexels',
        name: 'Pexels Stock',
        available: true,
        capabilities: [{ assetType: 'stock-video', supportsPrompt: false, supportsScript: false, estimatedLatencyMs: 2_000, isAsync: false, costTier: 'free' }],
      },
      {
        id: 'user-upload',
        name: 'User Upload',
        available: true,
        capabilities: [{ assetType: 'user-recording', supportsPrompt: false, supportsScript: false, estimatedLatencyMs: 0, isAsync: false, costTier: 'free' }],
      },
    ],
  };
}

describe('LLM planner prompt quality', () => {
  itLive('generates Seedance-compliant prompts for self-hosted script (cinematic style)', async () => {
    const manifest = getMockToolManifest();

    console.log('\n📋 Available tools:', manifest.tools.map(t => `${t.id} (${t.available ? '✓' : '✗'})`).join(', '));

    const plan = await planProduction({
      script: 'Every morning, a single line of code decides your fate. One API call to the cloud. One response that shapes your entire day. But what if you could control it all? What if your infrastructure was yours? Self-hosted. Self-owned. Self-sovereign. No vendor lock-in. No surprise bills. Just pure freedom.',
      durationEstimate: 24,
      style: 'cinematic',
      toolManifest: manifest,
    });

    console.log('\n🎬 Plan created:');
    console.log(`  Layout: ${plan.layout}`);
    console.log(`  Primary: ${plan.primarySource.type}`);
    console.log(`  Shots: ${plan.shots.length}`);
    console.log(`  Effects: ${plan.effects.length}`);
    console.log(`  Reasoning: ${plan.reasoning}`);

    let totalForbidden = 0;
    let totalWithCamera = 0;
    let totalWithLighting = 0;

    for (const shot of plan.shots) {
      const prompt = 'prompt' in shot.visual ? (shot.visual.prompt as string) : null;
      const toolId = 'toolId' in shot.visual ? shot.visual.toolId : null;

      console.log(`\n  Shot ${shot.id} [${shot.startTime.toFixed(1)}-${shot.endTime.toFixed(1)}s] type=${shot.visual.type} tool=${toolId}`);

      if (prompt) {
        const quality = checkPromptQuality(prompt, shot.id);
        totalForbidden += quality.found.length;
        if (quality.hasCamera) totalWithCamera++;
        if (quality.hasLighting) totalWithLighting++;

        console.log(`    Words: ${quality.wordCount}`);
        console.log(`    Camera: ${quality.hasCamera ? '✓' : '✗'} | Lighting: ${quality.hasLighting ? '✓' : '✗'} | Framing: ${quality.hasFraming ? '✓' : '✗'}`);
        if (quality.found.length > 0) {
          console.log(`    ⚠ FORBIDDEN: ${quality.found.join(', ')}`);
        }
        console.log(`    Prompt: ${prompt}`);
      } else if ('searchQuery' in shot.visual) {
        console.log(`    Search: ${(shot.visual as { searchQuery: string }).searchQuery}`);
      }
    }

    const aiVideoShots = plan.shots.filter(s => s.visual.type === 'ai-video');

    // Assertions
    expect(plan.shots.length).toBeGreaterThanOrEqual(3);
    expect(plan.shots.length).toBeLessThanOrEqual(15);

    // Most shots should be ai-video (not pexels stock)
    expect(aiVideoShots.length).toBeGreaterThanOrEqual(Math.floor(plan.shots.length * 0.5));

    // No forbidden words in any prompt
    console.log(`\n📊 Summary: ${totalForbidden} forbidden words, ${totalWithCamera}/${aiVideoShots.length} have camera, ${totalWithLighting}/${aiVideoShots.length} have lighting`);

    expect(totalForbidden).toBe(0);

    // At least 50% of ai-video prompts should have camera directions
    if (aiVideoShots.length > 0) {
      expect(totalWithCamera).toBeGreaterThanOrEqual(Math.floor(aiVideoShots.length * 0.5));
    }
  }, 60_000);

  itLive('generates good prompts for dynamic style', async () => {
    const manifest = getMockToolManifest();

    const plan = await planProduction({
      script: 'Stop paying for SaaS you don\'t need. Three tools. One VPS. Total control. n8n replaces Zapier. Umami replaces Google Analytics. Listmonk replaces Mailchimp. All self-hosted. All free. All yours.',
      durationEstimate: 18,
      style: 'dynamic',
      toolManifest: manifest,
    });

    console.log('\n🎬 Dynamic plan:');
    for (const shot of plan.shots) {
      const prompt = 'prompt' in shot.visual ? (shot.visual.prompt as string) : null;
      const toolId = 'toolId' in shot.visual ? shot.visual.toolId : null;
      console.log(`  Shot ${shot.id} [${shot.startTime.toFixed(1)}-${shot.endTime.toFixed(1)}s] type=${shot.visual.type} tool=${toolId}`);
      if (prompt) {
        const quality = checkPromptQuality(prompt, shot.id);
        console.log(`    ${quality.found.length > 0 ? '⚠ FORBIDDEN: ' + quality.found.join(', ') : '✓ Clean'} | Camera: ${quality.hasCamera ? '✓' : '✗'} | Words: ${quality.wordCount}`);
        console.log(`    Prompt: ${prompt}`);
      }
    }

    // Check zoom segments for dynamic style
    console.log(`\n  Zoom segments: ${plan.zoomSegments?.length ?? 0}`);
    console.log(`  Effects: ${plan.effects.length}`);

    // Dynamic style should have zoom segments
    expect(plan.zoomSegments?.length ?? 0).toBeGreaterThanOrEqual(2);

    // No forbidden words
    const allPrompts = plan.shots
      .filter(s => 'prompt' in s.visual)
      .map(s => (s.visual as { prompt: string }).prompt);

    for (const prompt of allPrompts) {
      const lower = prompt.toLowerCase();
      for (const word of FORBIDDEN_WORDS) {
        expect(lower).not.toContain(word.toLowerCase());
      }
    }
  }, 60_000);
});
