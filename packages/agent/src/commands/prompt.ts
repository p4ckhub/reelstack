/**
 * Prompt command — preview a rendered prompt template.
 *
 * Usage:
 *   bun run rs prompt <name> [--out <file>] [--manifest <path>]
 *
 * Templates that build via prompt-builder (planner / composer / revision) use a
 * built-in mock ToolManifest unless --manifest <path> is provided.
 *
 * Templates without builder wrappers (supervisor / prompt-writer / script-reviewer
 * / script-writer) are rendered directly from the .md file via renderPrompt() —
 * variable placeholders are filled with `<<MOCK_NAME>>` so you can see the
 * template structure without runtime data.
 */
import fs from 'fs';
import path from 'path';
import { B, G, Y, R, D, X, positional, opt, save, loadPrivateModules } from '../cli-utils';

const TEMPLATE_NAMES = [
  'planner',
  'composer',
  'revision',
  'supervisor',
  'prompt-writer',
  'script-reviewer',
  'script-writer',
  'short-film-director',
] as const;

type TemplateName = (typeof TEMPLATE_NAMES)[number];

export async function prompt() {
  const name = positional(1) as TemplateName | undefined;

  if (!name || !TEMPLATE_NAMES.includes(name)) {
    console.log(`${B}Prompt preview${X}\n`);
    console.log(`Usage: ${Y}bun run rs prompt <name>${X} [--out <file>] [--manifest <path>]\n`);
    console.log(`Available templates:`);
    for (const n of TEMPLATE_NAMES) console.log(`  - ${n}`);
    console.log(`\n${D}Examples:${X}`);
    console.log(`  bun run rs prompt planner                  # render with mock manifest`);
    console.log(`  bun run rs prompt planner --out planner.md # save to file`);
    console.log(`  bun run rs prompt supervisor               # raw template (with <<MOCK>> vars)`);
    process.exit(name ? 1 : 0);
  }

  // Card / palette / scene-transition registries are populated by registry setup.
  // Without this the planner's CARD LIBRARY and SCENE TRANSITIONS sections
  // render as "No cards/transitions currently registered."
  await loadPrivateModules();

  const text = await renderByName(name);

  const outFile = opt('out');
  if (outFile) {
    const dest = path.isAbsolute(outFile) ? outFile : path.resolve(process.cwd(), outFile);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text);
    console.log(`${G}✓${X} ${name} prompt written to ${dest} (${text.length} chars)`);
  } else {
    process.stdout.write(text);
    if (!text.endsWith('\n')) process.stdout.write('\n');
    console.error(`\n${D}— ${text.length} chars, ${text.split('\n').length} lines${X}`);
  }
}

async function renderByName(name: TemplateName): Promise<string> {
  if (name === 'planner' || name === 'composer' || name === 'revision') {
    return await renderViaBuilder(name);
  }
  // supervisor / prompt-writer / script-reviewer / script-writer / short-film-director
  // — render template directly with mock variables.
  return await renderRawTemplate(name);
}

async function renderViaBuilder(name: 'planner' | 'composer' | 'revision'): Promise<string> {
  const manifestPath = opt('manifest');
  const manifest = manifestPath
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    : buildMockManifest();

  const builder = await import('../planner/prompt-builder');

  if (name === 'planner') return builder.buildPlannerPrompt(manifest);

  if (name === 'composer') {
    const mockAssets = [
      {
        id: 'asset-1',
        url: 'https://example.com/asset-1.mp4',
        type: 'video' as const,
        description: 'Talking-head intro recorded by user',
        durationSeconds: 28,
        isPrimary: true,
      },
      {
        id: 'asset-2',
        url: 'https://example.com/asset-2.png',
        type: 'image' as const,
        description: 'Screenshot of dashboard with red error highlighted',
      },
      {
        id: 'asset-3',
        url: 'https://example.com/asset-3.mp4',
        type: 'video' as const,
        description: 'Screencast of n8n workflow firing successfully',
        durationSeconds: 7,
      },
    ];
    return builder.buildComposerPrompt(mockAssets);
  }

  // revision
  const mockPlan = {
    primarySource: { type: 'avatar' as const },
    shots: [{ id: 'shot-1', startTime: 0, endTime: 5, scriptSegment: 'Mock segment' }],
    effects: [],
    layout: 'fullscreen',
  } as unknown as Parameters<typeof builder.buildRevisionPrompt>[0];
  return builder.buildRevisionPrompt(mockPlan, 'Mock director note: tighten pacing.', manifest);
}

async function renderRawTemplate(name: TemplateName): Promise<string> {
  const { renderPrompt } = await import('../prompts');

  // Fill every {{var}} we can plausibly need so the structure is readable.
  // Unknown vars resolve to '' by design — we surface them as <<MOCK:name>>
  // instead so the user can spot what would be injected at runtime.
  const mockVars: Record<string, string> = {
    script: '<<MOCK:script — sample reel narration goes here>>',
    duration: '30',
    style: 'dynamic',
    timingSection: '<<MOCK:timingSection>>',
    profileChecks: '<<MOCK:profileChecks — empty unless montageProfile passed>>',
    toolGuidelines: '<<MOCK:toolGuidelines — populated per shot from guidelines/*.md>>',
    brief: '<<MOCK:brief — short visual description of the shot>>',
    toolName: 'seedance2-piapi',
  };

  const tpl = await import('../prompts/loader');
  const raw = tpl.loadTemplate(name);

  // Find every {{var}} placeholder still present, fill missing ones with <<MOCK:name>>.
  const placeholders = new Set<string>();
  raw.replace(/\{\{(\w+)\}\}/g, (_, n: string) => {
    placeholders.add(n);
    return '';
  });
  for (const p of placeholders) {
    if (!(p in mockVars)) mockVars[p] = `<<MOCK:${p}>>`;
  }

  return renderPrompt(name, mockVars);
}

function buildMockManifest() {
  return {
    tools: [
      {
        id: 'seedance2-piapi',
        name: 'Seedance 2.0',
        available: true,
        capabilities: [
          {
            assetType: 'ai-video',
            supportsPrompt: true,
            supportsScript: false,
            isAsync: true,
            estimatedLatencyMs: 120_000,
            costTier: 'expensive',
          },
        ],
        promptGuidelines: 'See guidelines/seedance.md',
      },
      {
        id: 'nanobanana2-kie',
        name: 'NanoBanana 2',
        available: true,
        capabilities: [
          {
            assetType: 'ai-image',
            supportsPrompt: true,
            supportsScript: false,
            isAsync: false,
            estimatedLatencyMs: 5000,
            costTier: 'moderate',
          },
        ],
        promptGuidelines: 'See guidelines/nanobanana.md',
      },
      {
        id: 'pexels',
        name: 'Pexels Stock',
        available: true,
        capabilities: [
          {
            assetType: 'stock-video',
            supportsPrompt: false,
            supportsScript: false,
            isAsync: false,
            estimatedLatencyMs: 2000,
            costTier: 'free',
          },
        ],
      },
    ],
    summary: 'Mock manifest: seedance + nanobanana + pexels (for prompt preview only)',
  } as const;
}
