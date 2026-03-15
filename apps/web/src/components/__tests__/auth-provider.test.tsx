import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';

// Mock next-auth/react
const mockUseSession = vi.fn();
const mockSignOut = vi.fn();
vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => mockUseSession(),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

const { AuthProvider, useAuth } = await import('../providers/auth-provider');

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('useAuth', () => {
  it('returns null user when not authenticated', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('returns user when authenticated', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1', email: 'test@test.com', name: 'Test' } },
      status: 'authenticated',
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toEqual({
      id: 'u1',
      email: 'test@test.com',
      name: 'Test',
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('returns isLoading true when loading', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'loading' });
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });

  it('signOut calls nextAuthSignOut', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1', email: 'test@test.com' } },
      status: 'authenticated',
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await result.current.signOut();
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/' });
  });
});
