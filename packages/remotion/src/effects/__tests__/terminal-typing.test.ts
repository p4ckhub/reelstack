import { describe, it, expect } from 'vitest';
import { terminalTypingSchema } from '../schemas';

describe('terminal-typing effect', () => {
  it('accepts valid terminal-typing config', () => {
    const result = terminalTypingSchema.safeParse({
      type: 'terminal-typing',
      startTime: 2,
      endTime: 7,
      text: 'npm install remotion',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing text', () => {
    const result = terminalTypingSchema.safeParse({
      type: 'terminal-typing',
      startTime: 2,
      endTime: 7,
    });
    expect(result.success).toBe(false);
  });

  it('applies default values', () => {
    const result = terminalTypingSchema.safeParse({
      type: 'terminal-typing',
      startTime: 2,
      endTime: 7,
      text: 'echo hello',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fontSize).toBe(32);
      expect(result.data.fontColor).toBe('#00FF00');
      expect(result.data.backgroundColor).toBe('#1E1E1E');
      expect(result.data.showCursor).toBe(true);
      expect(result.data.cursorChar).toBe('▌');
      expect(result.data.prompt).toBe('$ ');
      expect(result.data.position).toBe('center');
    }
  });

  it('accepts custom styling', () => {
    const result = terminalTypingSchema.safeParse({
      type: 'terminal-typing',
      startTime: 0,
      endTime: 5,
      text: 'git push origin main',
      fontSize: 28,
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
      showCursor: false,
      prompt: '> ',
      position: 'bottom',
    });
    expect(result.success).toBe(true);
  });

  it('rejects fontSize out of range', () => {
    const result = terminalTypingSchema.safeParse({
      type: 'terminal-typing',
      startTime: 0,
      endTime: 5,
      text: 'test',
      fontSize: 8,
    });
    expect(result.success).toBe(false);
  });
});
