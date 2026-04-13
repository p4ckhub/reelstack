/**
 * Shared @reelstack/queue mock factory for apps/web tests.
 *
 * Same pattern as database-mock.ts — prevents vi.mock cross-contamination
 * in bun's single-process test runner.
 */
import { vi } from 'vitest';

export const mockEnqueue = vi.fn();

export function queueMockFactory() {
  return {
    createQueue: () => Promise.resolve({ enqueue: mockEnqueue }),
    detectDeploymentMode: () => 'local',
  };
}
