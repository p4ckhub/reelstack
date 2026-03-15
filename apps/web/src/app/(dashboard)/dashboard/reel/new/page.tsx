'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Types ─────────────────────────────────────────────────

type Step = 'script' | 'style' | 'settings' | 'generating';

interface FormData {
  script: string;
  layout: 'fullscreen' | 'split-screen' | 'picture-in-picture';
  style: 'dynamic' | 'calm' | 'cinematic' | 'educational';
  ttsProvider: 'edge-tts' | 'elevenlabs' | 'openai';
  ttsVoice: string;
  ttsLanguage: string;
  captionPreset: string;
  highlightColor: string;
  backgroundColor: string;
}

interface JobStatus {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  outputUrl?: string;
  error?: string;
}

// ── Caption Presets ───────────────────────────────────────

const CAPTION_PRESETS = [
  {
    id: 'bold-dark',
    name: 'Bold Dark',
    description: 'White text on dark background, high contrast',
    highlightColor: '#F59E0B',
    backgroundColor: '#0E0E12',
  },
  {
    id: 'clean-white',
    name: 'Clean White',
    description: 'Dark text on light background, minimal',
    highlightColor: '#3B82F6',
    backgroundColor: '#F8FAFC',
  },
  {
    id: 'neon',
    name: 'Neon Glow',
    description: 'Bright highlight on transparent, punchy',
    highlightColor: '#22D3EE',
    backgroundColor: '#000000',
  },
  {
    id: 'warm',
    name: 'Warm Amber',
    description: 'Golden tones, cozy feel',
    highlightColor: '#FB923C',
    backgroundColor: '#1C1917',
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Pick your own colors',
    highlightColor: '#FF0000',
    backgroundColor: '#000000',
  },
] as const;

const TTS_VOICES: Record<string, Array<{ id: string; label: string }>> = {
  'en-US': [
    { id: 'en-US-GuyNeural', label: 'Guy (Male)' },
    { id: 'en-US-JennyNeural', label: 'Jenny (Female)' },
    { id: 'en-US-AriaNeural', label: 'Aria (Female)' },
    { id: 'en-US-DavisNeural', label: 'Davis (Male)' },
  ],
  'pl-PL': [
    { id: 'pl-PL-MarekNeural', label: 'Marek (Male)' },
    { id: 'pl-PL-ZofiaNeural', label: 'Zofia (Female)' },
  ],
  'de-DE': [
    { id: 'de-DE-ConradNeural', label: 'Conrad (Male)' },
    { id: 'de-DE-KatjaNeural', label: 'Katja (Female)' },
  ],
  'es-ES': [
    { id: 'es-ES-AlvaroNeural', label: 'Alvaro (Male)' },
    { id: 'es-ES-ElviraNeural', label: 'Elvira (Female)' },
  ],
};

// ── Component ─────────────────────────────────────────────

export default function ReelWizardPage() {
  const [step, setStep] = useState<Step>('script');
  const [form, setForm] = useState<FormData>({
    script: '',
    layout: 'fullscreen',
    style: 'dynamic',
    ttsProvider: 'edge-tts',
    ttsVoice: 'en-US-GuyNeural',
    ttsLanguage: 'en-US',
    captionPreset: 'bold-dark',
    highlightColor: '#F59E0B',
    backgroundColor: '#0E0E12',
  });
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load saved user preferences as form defaults
  useEffect(() => {
    fetch('/api/v1/user/preferences')
      .then((res) => (res.ok ? res.json() : null))
      .then((resp) => {
        if (!resp?.data) return;
        const d = resp.data;
        setForm((prev) => ({
          ...prev,
          ...(d.defaultLayout && { layout: d.defaultLayout }),
          ...(d.defaultVideoStyle && { style: d.defaultVideoStyle }),
          ...(d.defaultTtsProvider && { ttsProvider: d.defaultTtsProvider }),
          ...(d.defaultTtsVoice && { ttsVoice: d.defaultTtsVoice }),
          ...(d.defaultTtsLanguage && { ttsLanguage: d.defaultTtsLanguage }),
          ...(d.brandPreset?.captionPreset && { captionPreset: d.brandPreset.captionPreset }),
          ...(d.brandPreset?.highlightColor && { highlightColor: d.brandPreset.highlightColor }),
          ...(d.brandPreset?.backgroundColor && { backgroundColor: d.brandPreset.backgroundColor }),
        }));
      })
      .catch(err => console.warn('[reel-wizard] preferences fetch failed:', err));
  }, []);

  const update = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Apply caption preset
  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = CAPTION_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        update('captionPreset', presetId);
        if (presetId !== 'custom') {
          update('highlightColor', preset.highlightColor);
          update('backgroundColor', preset.backgroundColor);
        }
      }
    },
    [update],
  );

  // Get available voices for selected language
  const voices = TTS_VOICES[form.ttsLanguage] ?? TTS_VOICES['en-US']!;

  // Submit reel creation
  const handleSubmit = async () => {
    setError('');
    setStep('generating');

    try {
      const res = await fetch('/api/v1/reel/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: form.script,
          layout: form.layout,
          style: form.style,
          tts: {
            provider: form.ttsProvider,
            voice: form.ttsVoice,
            language: form.ttsLanguage,
          },
          brandPreset: {
            highlightColor: form.highlightColor,
            backgroundColor: form.backgroundColor,
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error?.message ?? `Request failed (${res.status})`,
        );
      }

      const { data } = await res.json();
      setJob({ id: data.jobId, status: 'QUEUED', progress: 0 });

      // Start polling
      let pollFailures = 0;
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/v1/reel/render/${data.jobId}`);
          if (statusRes.ok) {
            pollFailures = 0;
            const statusData = await statusRes.json();
            const j = statusData.data ?? statusData;
            setJob({
              id: data.jobId,
              status: j.status,
              progress: j.progress ?? 0,
              outputUrl: j.outputUrl,
              error: j.error,
            });
            if (j.status === 'COMPLETED' || j.status === 'FAILED') {
              if (pollRef.current) clearInterval(pollRef.current);
            }
          }
        } catch {
          pollFailures++;
          if (pollFailures > 90) {
            if (pollRef.current) clearInterval(pollRef.current);
            setError('Lost connection to server. Please try again.');
            setStep('settings');
          }
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStep('settings');
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setJob(null);
    setError('');
    setStep('script');
  };

  // ── Step: Script ──────────────────────────────────────

  if (step === 'script') {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">Create Reel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Write your script and we will generate a reel with voiceover, captions, and transitions.
        </p>

        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="script">Script</Label>
                <textarea
                  id="script"
                  value={form.script}
                  onChange={(e) => update('script', e.target.value)}
                  placeholder="Write your reel script here. Each sentence will become a caption..."
                  className="mt-1.5 min-h-[200px] w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {form.script.length}/10000 characters
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Language</Label>
                  <Select
                    value={form.ttsLanguage}
                    onValueChange={(v) => {
                      update('ttsLanguage', v);
                      const newVoices = TTS_VOICES[v];
                      if (newVoices?.[0]) {
                        update('ttsVoice', newVoices[0].id);
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en-US">English (US)</SelectItem>
                      <SelectItem value="pl-PL">Polish</SelectItem>
                      <SelectItem value="de-DE">German</SelectItem>
                      <SelectItem value="es-ES">Spanish</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Voice</Label>
                  <Select
                    value={form.ttsVoice}
                    onValueChange={(v) => update('ttsVoice', v)}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {voices.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => setStep('style')}
                disabled={form.script.trim().length < 10}
              >
                Next: Caption Style
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step: Style ───────────────────────────────────────

  if (step === 'style') {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">Caption Style</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how your captions look.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {CAPTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                form.captionPreset === preset.id
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-8 w-8 rounded"
                  style={{ backgroundColor: preset.backgroundColor }}
                >
                  <div
                    className="m-1 h-6 w-6 rounded-sm"
                    style={{ backgroundColor: preset.highlightColor }}
                  />
                </div>
                <div>
                  <p className="font-medium">{preset.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {preset.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {form.captionPreset === 'custom' && (
          <Card className="mt-4">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="highlight">Highlight Color</Label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      type="color"
                      id="highlight"
                      value={form.highlightColor}
                      onChange={(e) => update('highlightColor', e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border"
                    />
                    <Input
                      value={form.highlightColor}
                      onChange={(e) => update('highlightColor', e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="bg">Background Color</Label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      type="color"
                      id="bg"
                      value={form.backgroundColor}
                      onChange={(e) =>
                        update('backgroundColor', e.target.value)
                      }
                      className="h-9 w-12 cursor-pointer rounded border"
                    />
                    <Input
                      value={form.backgroundColor}
                      onChange={(e) =>
                        update('backgroundColor', e.target.value)
                      }
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex justify-between">
          <Button variant="ghost" onClick={() => setStep('script')}>
            Back
          </Button>
          <Button onClick={() => setStep('settings')}>Next: Settings</Button>
        </div>
      </div>
    );
  }

  // ── Step: Settings ────────────────────────────────────

  if (step === 'settings') {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">Reel Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Final touches before generating.
        </p>

        {error && (
          <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <Label>Layout</Label>
                <Select
                  value={form.layout}
                  onValueChange={(v) =>
                    update('layout', v as FormData['layout'])
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fullscreen">
                      Fullscreen (9:16)
                    </SelectItem>
                    <SelectItem value="split-screen">
                      Split Screen
                    </SelectItem>
                    <SelectItem value="picture-in-picture">
                      Picture-in-Picture
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Video Style</Label>
                <Select
                  value={form.style}
                  onValueChange={(v) =>
                    update('style', v as FormData['style'])
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dynamic">
                      Dynamic - fast cuts, zoom effects
                    </SelectItem>
                    <SelectItem value="calm">
                      Calm - smooth transitions, minimal
                    </SelectItem>
                    <SelectItem value="cinematic">
                      Cinematic - slow zooms, dramatic
                    </SelectItem>
                    <SelectItem value="educational">
                      Educational - clean, structured
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>TTS Provider</Label>
                <Select
                  value={form.ttsProvider}
                  onValueChange={(v) =>
                    update('ttsProvider', v as FormData['ttsProvider'])
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="edge-tts">
                      Edge TTS (Free)
                    </SelectItem>
                    <SelectItem value="elevenlabs">
                      ElevenLabs (Pro)
                    </SelectItem>
                    <SelectItem value="openai">OpenAI TTS (Pro)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Summary */}
            <div className="mt-6 rounded-md bg-muted p-4">
              <h3 className="text-sm font-medium">Summary</h3>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>Script: {form.script.length} characters</p>
                <p>Voice: {voices.find((v) => v.id === form.ttsVoice)?.label ?? form.ttsVoice}</p>
                <p>Layout: {form.layout}</p>
                <p>Style: {form.style}</p>
                <p>
                  Caption:{' '}
                  {CAPTION_PRESETS.find((p) => p.id === form.captionPreset)?.name ?? 'Custom'}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep('style')}>
                Back
              </Button>
              <Button onClick={handleSubmit}>Generate Reel</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step: Generating ──────────────────────────────────

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <Card className="w-full max-w-lg">
        <CardContent className="pt-6">
          {job?.status === 'COMPLETED' ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <svg
                  className="h-8 w-8 text-green-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold">Reel Ready!</h2>
              <p className="text-sm text-muted-foreground">
                Your reel has been generated successfully.
              </p>
              <div className="flex gap-3">
                {job.outputUrl && (
                  <a href={job.outputUrl} download>
                    <Button>Download MP4</Button>
                  </a>
                )}
                <Button variant="ghost" onClick={handleReset}>
                  Create Another
                </Button>
              </div>
            </div>
          ) : job?.status === 'FAILED' ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <svg
                  className="h-8 w-8 text-destructive"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold">Generation Failed</h2>
              <p className="text-sm text-muted-foreground">
                {job.error ?? 'An unexpected error occurred.'}
              </p>
              <Button variant="ghost" onClick={handleReset}>
                Try Again
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <svg
                className="h-12 w-12 animate-spin text-primary"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <div className="text-center">
                <h2 className="text-xl font-bold">
                  {job?.status === 'PROCESSING'
                    ? 'Generating your reel...'
                    : 'Queued...'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {job?.status === 'PROCESSING'
                    ? 'TTS, transcription, and rendering in progress'
                    : 'Waiting for an available render slot'}
                </p>
              </div>
              {job && job.progress > 0 && (
                <div className="w-full">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-center text-xs text-muted-foreground">
                    {job.progress}%
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
