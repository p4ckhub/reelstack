export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import LandingPage from './(marketing)/page';

export default async function RootPage() {
  const session = await auth();

  if (session?.user) {
    redirect('/dashboard');
  }

  return <LandingPage />;
}
