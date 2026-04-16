'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/providers/auth-provider';

interface ReelJobItem {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  script: string | null;
  outputUrl: string | null;
  error: string | null;
  createdAt: string;
}

interface UsageData {
  tier: string;
  unlimited?: boolean;
  creditsUsed: number;
  creditsPerMonth: number;
  creditsPerReel: number;
  tokenBalance: number;
  resetsAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  QUEUED: 'bg-yellow-500/10 text-yellow-600',
  PROCESSING: 'bg-blue-500/10 text-blue-600',
  COMPLETED: 'bg-green-500/10 text-green-600',
  FAILED: 'bg-red-500/10 text-red-600',
};

const TIER_COLORS: Record<string, string> = {
  FREE: 'bg-gray-500/10 text-gray-600',
  SOLO: 'bg-blue-500/10 text-blue-600',
  PRO: 'bg-purple-500/10 text-purple-600',
  AGENCY: 'bg-orange-500/10 text-orange-600',
};

export default function DashboardPage() {
  const { user: _user } = useAuth();
  const [reels, setReels] = useState<ReelJobItem[]>([]);
  const [usage, setUsage] = useState<(UsageData & { daysUntilReset: number }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/reel/list')
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .then((resp) => setReels(resp.data ?? [])),
      fetch('/api/v1/user/usage')
        .then((res) => (res.ok ? res.json() : null))
        .then((resp) => {
          const data: UsageData | null = resp?.data ?? null;
          if (!data) {
            setUsage(null);
            return;
          }
          // Compute derived value at fetch time — Date.now() is impure and
          // can't be called during render or synchronously in an effect.
          const daysUntilReset = Math.max(
            1,
            Math.ceil((new Date(data.resetsAt).getTime() - Date.now()) / 86_400_000)
          );
          setUsage({ ...data, daysUntilReset });
        }),
    ])
      .catch((err) => console.warn('[dashboard] request failed:', err))
      .finally(() => setLoading(false));
  }, []);

  const creditsLeft = usage ? Math.max(0, usage.creditsPerMonth - usage.creditsUsed) : 0;
  const reelsLeft =
    usage && usage.creditsPerReel > 0 ? Math.floor(creditsLeft / usage.creditsPerReel) : 0;
  const usedPercent = usage
    ? Math.min(100, Math.round((usage.creditsUsed / usage.creditsPerMonth) * 100))
    : 0;

  return (
    <div className="p-8">
      {/* Usage card */}
      {usage && (
        <div className="mb-8 rounded-lg border p-6">
          {usage.unlimited ? (
            <div className="flex items-center gap-3">
              <span className="inline-flex rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-600">
                OWNER
              </span>
              <span className="text-sm font-medium">Unlimited renders · no credit limits</span>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIER_COLORS[usage.tier] ?? ''}`}
                    >
                      {usage.tier}
                    </span>
                    <span className="text-sm font-medium">
                      {reelsLeft} {reelsLeft === 1 ? 'reel' : 'reels'} left this month
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {usage.creditsUsed} / {usage.creditsPerMonth} credits used
                    {' · '}
                    {usage.creditsPerReel} credits per reel
                    {' · '}resets in {usage.daysUntilReset}{' '}
                    {usage.daysUntilReset === 1 ? 'day' : 'days'}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {usage.tokenBalance > 0 && (
                    <span className="text-sm">
                      <strong>{usage.tokenBalance}</strong>{' '}
                      <span className="text-muted-foreground">bonus tokens</span>
                    </span>
                  )}
                  {usage.tier === 'FREE' && (
                    <Link href="/pricing">
                      <Button variant="outline" size="sm">
                        Upgrade
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${usedPercent >= 90 ? 'bg-red-500' : usedPercent >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Reels header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Reels</h1>
        <Link href="/dashboard/reel/new">
          <Button>Create Reel</Button>
        </Link>
      </div>

      {loading ? (
        <div className="mt-12 text-center text-muted-foreground">Loading...</div>
      ) : reels.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">No reels yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your first reel from a script with AI voiceover and captions.
          </p>
          <Link href="/dashboard/reel/new" className="mt-4 inline-block">
            <Button>Create Reel</Button>
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Script</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reels.map((reel) => (
                <tr key={reel.id} className="border-b last:border-0">
                  <td className="max-w-xs truncate px-4 py-3">
                    {reel.script?.slice(0, 80) ?? '(no script)'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[reel.status] ?? ''}`}
                    >
                      {reel.status}
                      {reel.status === 'PROCESSING' && ` ${reel.progress}%`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(reel.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {reel.status === 'COMPLETED' && reel.outputUrl && (
                      <a href={reel.outputUrl} download>
                        <Button variant="ghost" size="sm">
                          Download
                        </Button>
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
