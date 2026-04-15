import Link from 'next/link';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#09090f' }}>
      {/* Sticky Nav */}
      <header
        className="fixed top-0 z-50 w-full border-b border-white/[0.06] backdrop-blur-md"
        style={{ backgroundColor: 'rgba(9, 9, 15, 0.8)' }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-white">
            ReelStack
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="#features"
              className="text-sm text-[#94979e] transition-colors duration-200 hover:text-white focus-visible:text-white focus-visible:outline-none"
            >
              Features
            </Link>
            <Link
              href="#faq"
              className="text-sm text-[#94979e] transition-colors duration-200 hover:text-white focus-visible:text-white focus-visible:outline-none"
            >
              FAQ
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-[#94979e] transition-colors duration-200 hover:text-white focus-visible:text-white focus-visible:outline-none"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-[#7c3aed] px-5 py-2 text-sm font-medium text-white transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/50 active:opacity-80"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>
      <main className="pt-14">{children}</main>
    </div>
  );
}
