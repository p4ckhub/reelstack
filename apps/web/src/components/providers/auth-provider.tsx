'use client';

import { createContext, useContext } from 'react';
import { SessionProvider, useSession, signOut as nextAuthSignOut } from 'next-auth/react';
import type { Session } from 'next-auth';

interface AuthContextType {
  user: { id: string; email: string; name?: string | null; tier?: string } | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: false,
  signOut: async () => {},
});

function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  const user = session?.user
    ? {
        id: session.user.id!,
        email: session.user.email!,
        name: session.user.name,
        tier: (session.user as unknown as Record<string, unknown>).tier as string | undefined,
      }
    : null;

  const signOut = async () => {
    await nextAuthSignOut({ callbackUrl: '/' });
  };

  return (
    <AuthContext.Provider value={{ user, isLoading: status === 'loading', signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session?: Session | null;
}) {
  return (
    <SessionProvider session={session}>
      <AuthContextProvider>{children}</AuthContextProvider>
    </SessionProvider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
