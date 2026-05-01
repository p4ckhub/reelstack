/**
 * Image- and video-tool default resolver tests.
 *
 * The agent picks tools from `discoverTools()` based on env vars; this
 * resolver layer answers a different question: *given the set of
 * available tools, which one should be the default* for a given asset
 * type? Priority lists are env-overridable so ops can test alternatives
 * without code changes.
 */

import { describe, it, expect } from 'vitest';
import {
  IMAGE_TOOL_PRIORITY,
  VIDEO_TOOL_PRIORITY,
  resolveDefaultImageTool,
  resolveDefaultVideoTool,
  classifyAssetTool,
  type AssetMediaType,
} from '../asset-defaults';

const EMPTY_ENV = {} as NodeJS.ProcessEnv;

function envWith(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

describe('IMAGE_TOOL_PRIORITY', () => {
  it('lists the canonical image providers in quality-first order', () => {
    // Top-of-list = preferred; tail = least preferred when nothing better
    // is available. Order is meaningful — don't reshuffle without a
    // benchmarking reason.
    expect(IMAGE_TOOL_PRIORITY[0]).toBe('nanobanana2-kie');
    expect(IMAGE_TOOL_PRIORITY).toContain('nanobanana');
    expect(IMAGE_TOOL_PRIORITY).toContain('flux-kie');
    expect(IMAGE_TOOL_PRIORITY).toContain('gpt-image-1');
  });

  it('contains no duplicate tool IDs', () => {
    const seen = new Set<string>();
    for (const id of IMAGE_TOOL_PRIORITY) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });
});

describe('VIDEO_TOOL_PRIORITY', () => {
  it('lists the canonical video providers in quality-first order', () => {
    expect(VIDEO_TOOL_PRIORITY[0]).toBe('seedance2-kie');
    expect(VIDEO_TOOL_PRIORITY).toContain('veo31-gemini');
    expect(VIDEO_TOOL_PRIORITY).toContain('kling-piapi');
    expect(VIDEO_TOOL_PRIORITY).toContain('seedance-piapi');
  });

  it('contains no duplicate tool IDs', () => {
    const seen = new Set<string>();
    for (const id of VIDEO_TOOL_PRIORITY) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });
});

describe('classifyAssetTool', () => {
  it('classifies image tools', () => {
    expect(classifyAssetTool('nanobanana')).toBe('image');
    expect(classifyAssetTool('flux-kie')).toBe('image');
    expect(classifyAssetTool('gpt-image-1')).toBe('image');
    expect(classifyAssetTool('seedream-piapi')).toBe('image');
  });

  it('classifies video tools', () => {
    expect(classifyAssetTool('veo31-gemini')).toBe('video');
    expect(classifyAssetTool('kling-piapi')).toBe('video');
    expect(classifyAssetTool('hailuo-piapi')).toBe('video');
    expect(classifyAssetTool('humo')).toBe('video');
  });

  it('returns null for unknown tools', () => {
    expect(classifyAssetTool('random-uploaded-asset')).toBe(null);
    expect(classifyAssetTool('user-upload')).toBe(null);
  });
});

describe('resolveDefaultImageTool', () => {
  it('returns the highest-priority tool that is available', () => {
    expect(
      resolveDefaultImageTool(['nanobanana2-kie', 'nanobanana', 'flux-kie', 'gpt-image-1'])
    ).toBe('nanobanana2-kie');
    // When top pick isn't available, walks down the list.
    expect(resolveDefaultImageTool(['nanobanana', 'flux-kie', 'gpt-image-1'])).toBe('nanobanana');
  });

  it('skips unavailable tools in the priority list', () => {
    // Only flux-kie + gpt-image-1 available, top-priority isn't.
    expect(resolveDefaultImageTool(['flux-kie', 'gpt-image-1'])).toBe('flux-kie');
  });

  it('returns null when no priority tool is available', () => {
    expect(resolveDefaultImageTool(['random-tool', 'another-random'])).toBe(null);
    expect(resolveDefaultImageTool([])).toBe(null);
  });

  it('user preference wins over priority order when available', () => {
    expect(
      resolveDefaultImageTool(['nanobanana2-kie', 'flux-kie', 'gpt-image-1'], {
        preferredToolIds: ['gpt-image-1'],
      })
    ).toBe('gpt-image-1');
  });

  it('falls back to priority order when user preference is unavailable', () => {
    expect(
      resolveDefaultImageTool(['nanobanana', 'flux-kie'], {
        preferredToolIds: ['gpt-image-1'],
      })
    ).toBe('nanobanana');

    expect(
      resolveDefaultImageTool(['flux-kie', 'gpt-image-1'], {
        preferredToolIds: ['unknown-tool'],
      })
    ).toBe('flux-kie');
  });

  it('IMAGE_PROVIDER_PRIORITY env reorders priority chain', () => {
    expect(
      resolveDefaultImageTool(['nanobanana', 'flux-kie', 'gpt-image-1'], {
        env: envWith({ IMAGE_PROVIDER_PRIORITY: 'gpt-image-1,flux-kie,nanobanana' }),
      })
    ).toBe('gpt-image-1');
  });

  it('user preference still beats env priority override', () => {
    expect(
      resolveDefaultImageTool(['nanobanana', 'flux-kie', 'gpt-image-1'], {
        preferredToolIds: ['nanobanana'],
        env: envWith({ IMAGE_PROVIDER_PRIORITY: 'gpt-image-1,flux-kie' }),
      })
    ).toBe('nanobanana');
  });

  it('honors empty env override and falls back to defaults', () => {
    // Empty / whitespace-only env value should be ignored, not crash.
    expect(
      resolveDefaultImageTool(['nanobanana', 'flux-kie'], {
        env: envWith({ IMAGE_PROVIDER_PRIORITY: '  ' }),
      })
    ).toBe('nanobanana');
  });
});

describe('resolveDefaultVideoTool', () => {
  it('returns the highest-priority tool that is available', () => {
    expect(
      resolveDefaultVideoTool(['kling-piapi', 'seedance-piapi', 'veo31-gemini', 'seedance2-kie'])
    ).toBe('seedance2-kie');
  });

  it('skips unavailable tools', () => {
    expect(resolveDefaultVideoTool(['hailuo-piapi', 'wan-kie'])).toBe('wan-kie');
  });

  it('returns null when no priority tool is available', () => {
    expect(resolveDefaultVideoTool([])).toBe(null);
    expect(resolveDefaultVideoTool(['user-upload'])).toBe(null);
  });

  it('user preference wins when available', () => {
    expect(
      resolveDefaultVideoTool(['kling-piapi', 'veo31-gemini'], {
        preferredToolIds: ['kling-piapi'],
      })
    ).toBe('kling-piapi');
  });

  it('VIDEO_PROVIDER_PRIORITY env reorders priority chain', () => {
    expect(
      resolveDefaultVideoTool(['kling-piapi', 'veo31-gemini', 'seedance-piapi'], {
        env: envWith({ VIDEO_PROVIDER_PRIORITY: 'seedance-piapi,veo31-gemini,kling-piapi' }),
      })
    ).toBe('seedance-piapi');
  });
});
