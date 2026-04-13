/**
 * Catalog consistency tests.
 *
 * Ensures all provider catalogs (allXxxTools) are self-consistent:
 * - No duplicate tool IDs across entire system
 * - Every catalog tool has required fields
 * - Self-declared pricing matches expected shape
 * - Discovery returns all catalog tools when env vars are set
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { allKieTools } from '../../tools/kie-tool';
import { allPiapiTools } from '../../tools/piapi-tool';
import { allReplicateTools } from '../../tools/replicate-tool';
import { allWavespeedTools } from '../../tools/wavespeed-tool';
import { allAimlapiTools } from '../../tools/aimlapi-tool';
import { falTools } from '../../tools/fal-tool';
import type { ProductionTool } from '../tool-interface';

const ALL_CATALOGS: { name: string; tools: readonly ProductionTool[] }[] = [
  { name: 'KIE', tools: allKieTools },
  { name: 'PIAPI', tools: allPiapiTools },
  { name: 'Replicate', tools: allReplicateTools },
  { name: 'WaveSpeed', tools: allWavespeedTools },
  { name: 'AIMLAPI', tools: allAimlapiTools },
  { name: 'fal.ai', tools: falTools },
];

describe('catalog consistency', () => {
  it('no duplicate IDs within any single catalog', () => {
    for (const { name, tools } of ALL_CATALOGS) {
      const ids = tools.map((t) => t.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect(dupes, `Duplicate IDs in ${name}: ${dupes.join(', ')}`).toEqual([]);
    }
  });

  it('no duplicate IDs across all catalogs', () => {
    const allIds: string[] = [];
    for (const { tools } of ALL_CATALOGS) {
      for (const t of tools) allIds.push(t.id);
    }
    const dupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);
    expect(dupes, `Cross-catalog duplicate IDs: ${dupes.join(', ')}`).toEqual([]);
  });

  it('every tool has required fields', () => {
    for (const { name, tools } of ALL_CATALOGS) {
      for (const tool of tools) {
        expect(tool.id, `${name}: tool missing id`).toBeTruthy();
        expect(tool.name, `${name}/${tool.id}: missing name`).toBeTruthy();
        expect(tool.capabilities.length, `${name}/${tool.id}: empty capabilities`).toBeGreaterThan(
          0
        );

        for (const cap of tool.capabilities) {
          expect(cap.assetType, `${name}/${tool.id}: missing assetType`).toBeTruthy();
          expect(cap.estimatedLatencyMs, `${name}/${tool.id}: missing latency`).toBeGreaterThan(0);
          expect(cap.costTier, `${name}/${tool.id}: missing costTier`).toBeTruthy();
        }
      }
    }
  });

  it('self-declared pricing has valid shape', () => {
    for (const { name, tools } of ALL_CATALOGS) {
      for (const tool of tools) {
        if (!tool.pricing) continue;
        const p = tool.pricing;
        const hasPerRequest = typeof p.perRequest === 'number' && p.perRequest >= 0;
        const hasPerSecond = typeof p.perSecond === 'number' && p.perSecond >= 0;
        expect(
          hasPerRequest || hasPerSecond,
          `${name}/${tool.id}: pricing declared but no perRequest or perSecond`
        ).toBe(true);
      }
    }
  });

  it('tool IDs follow naming convention (lowercase, hyphens)', () => {
    for (const { name, tools } of ALL_CATALOGS) {
      for (const tool of tools) {
        expect(tool.id, `${name}/${tool.id}: ID should be lowercase with hyphens`).toMatch(
          /^[a-z0-9][a-z0-9\-]*$/
        );
      }
    }
  });

  it('catalog arrays are not empty', () => {
    for (const { name, tools } of ALL_CATALOGS) {
      expect(tools.length, `${name} catalog is empty`).toBeGreaterThan(0);
    }
  });
});

describe('discovery integration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('KIE tools all discovered when KIE_API_KEY set', async () => {
    process.env.KIE_API_KEY = 'test';
    const { discoverTools } = await import('../discovery');
    const tools = discoverTools();
    const kieIds = allKieTools.map((t) => t.id);
    const discoveredIds = tools.map((t) => t.id);
    for (const id of kieIds) {
      expect(discoveredIds, `KIE tool ${id} not discovered`).toContain(id);
    }
  });
});
