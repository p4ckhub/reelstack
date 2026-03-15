'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  const nav = [
    { label: 'Create Reel', href: '/dashboard/reel/new' },
    { label: 'My Reels', href: '/dashboard' },
    { label: 'Templates', href: '/dashboard/templates' },
    { label: 'API Keys', href: '/dashboard/api-keys' },
    { label: 'Settings', href: '/dashboard/settings' },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/" className="text-lg font-bold">
            ReelStack
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm ${
                pathname === item.href
                  ? 'bg-muted font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t p-4">
          <p className="truncate text-sm text-muted-foreground">{user?.email ?? 'Guest'}</p>
          <button
            onClick={signOut}
            className="mt-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
