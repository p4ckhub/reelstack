'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PipelineStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  durationMs?: number;
  error?: string;
}

interface RerenderDialogProps {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after successful re-render enqueue so the parent can refetch. */
  onResumed?: () => void;
}

const STATUS_DOT: Record<PipelineStep['status'], string> = {
  pending: 'bg-gray-300',
  running: 'bg-blue-500 animate-pulse',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  skipped: 'bg-gray-400',
};

export function RerenderDialog({ jobId, open, onOpenChange, onResumed }: RerenderDialogProps) {
  const [steps, setSteps] = useState<PipelineStep[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy-fetch step list on open. Resetting selected/error per open keeps the
  // dialog idempotent — closing and re-opening always shows fresh state.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelected(null);
    setSteps(null);
    setLoading(true);
    fetch(`/api/v1/reel/render/${jobId}/steps`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message ?? `Failed to load steps (${res.status})`);
        }
        return res.json();
      })
      .then((resp) => {
        const list: PipelineStep[] = resp?.data ?? [];
        setSteps(list);
        // Default to the first completed step so re-render at least exercises
        // a real cached result rather than re-running everything.
        const firstCompleted = list.find((s) => s.status === 'completed');
        setSelected(firstCompleted?.id ?? list[0]?.id ?? null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, jobId]);

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/reel/render/${jobId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromStepId: selected }),
      });
      if (!res.ok && res.status !== 202) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Resume failed (${res.status})`);
      }
      onResumed?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resume failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Re-render reel</DialogTitle>
          <DialogDescription>
            Pick the step to resume from. Earlier steps are reused from cache — re-rendering from
            the last step skips LLM, TTS, and asset generation.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto rounded-md border">
          {loading && <div className="p-4 text-sm text-muted-foreground">Loading steps…</div>}
          {!loading && steps && steps.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              No pipeline state recorded — this reel was rendered before step persistence was
              enabled.
            </div>
          )}
          {!loading && steps && steps.length > 0 && (
            <ul>
              {steps.map((step) => (
                <li key={step.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-muted/50">
                    <input
                      type="radio"
                      name="step"
                      value={step.id}
                      checked={selected === step.id}
                      onChange={() => setSelected(step.id)}
                      className="mt-1"
                    />
                    <span
                      className={`mt-1.5 inline-block h-2 w-2 rounded-full ${STATUS_DOT[step.status]}`}
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{step.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {step.id}
                        {step.durationMs
                          ? ` · ${(step.durationMs / 1000).toFixed(1)}s last run`
                          : ''}
                      </span>
                      {step.error && (
                        <span className="block text-xs text-red-600">{step.error}</span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!selected || submitting || loading}>
            {submitting ? 'Re-rendering…' : 'Re-render'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
