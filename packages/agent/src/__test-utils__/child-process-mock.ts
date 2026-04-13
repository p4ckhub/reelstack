import { vi } from 'vitest';

export const mockExecFileSync = vi.fn();
export const mockExecSync = vi.fn();

export function childProcessMockFactory() {
  return {
    execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
    execSync: (...args: unknown[]) => mockExecSync(...args),
  };
}
