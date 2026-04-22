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
  mode: string;
  script: string;
  /** slideshow / talking-object / presenter-explainer */
  topic: string;
  /** captions mode — URL of the existing video to caption */
  videoUrl: string;
  /** n8n-explainer mode — workflow URL or ID */
  workflowUrl: string;
  layout: 'fullscreen' | 'split-screen' | 'picture-in-picture';
  style: 'dynamic' | 'calm' | 'cinematic' | 'educational';
  ttsProvider: 'edge-tts' | 'elevenlabs' | 'openai' | 'gemini-tts';
  ttsVoice: string;
  ttsLanguage: string;
  captionPreset: string;
  highlightColor: string;
  backgroundColor: string;
  /** Optional override: force a specific image-gen tool (empty = let the planner decide). */
  preferredImageTool: string;
  /** Optional override: force a specific video-gen tool. */
  preferredVideoTool: string;
}

/** Which input field the mode needs as its primary source. */
type ModeInputKind = 'script' | 'topic' | 'videoUrl' | 'workflowUrl';

const MODE_INPUT: Readonly<Record<string, ModeInputKind>> = {
  generate: 'script',
  compose: 'script',
  captions: 'videoUrl',
  slideshow: 'topic',
  'talking-object': 'topic',
  'presenter-explainer': 'topic',
  'n8n-explainer': 'workflowUrl',
};

interface ModuleOption {
  slug: string;
  name: string;
  description: string | null;
  category: string;
  creditCost: number;
}

interface JobStatus {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  outputUrl?: string;
  error?: string;
}

interface ToolOption {
  id: string;
  name: string;
  assetTypes: string[];
  costTier: string;
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

/**
 * Gemini Flash TTS voices are multilingual — every voice works for every
 * supported locale. We expose a curated subset (those Google highlights as
 * best-quality defaults). Full catalog is in
 * @reelstack/tts/providers/gemini-tts.ts.
 */
const GEMINI_VOICES: Array<{ id: string; label: string }> = [
  { id: 'Charon', label: 'Charon (Default, warm)' },
  { id: 'Kore', label: 'Kore (Confident)' },
  { id: 'Aoede', label: 'Aoede (Musical)' },
  { id: 'Puck', label: 'Puck (Playful)' },
  { id: 'Zephyr', label: 'Zephyr (Bright)' },
  { id: 'Fenrir', label: 'Fenrir (Strong)' },
  { id: 'Leda', label: 'Leda (Smooth)' },
  { id: 'Orus', label: 'Orus (Deep)' },
  { id: 'Achernar', label: 'Achernar (Clear)' },
  { id: 'Despina', label: 'Despina (Gentle)' },
];

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
    mode: 'generate',
    script: '',
    topic: '',
    videoUrl: '',
    workflowUrl: '',
    layout: 'fullscreen',
    style: 'dynamic',
    ttsProvider: 'edge-tts',
    ttsVoice: 'en-US-GuyNeural',
    ttsLanguage: 'en-US',
    captionPreset: 'bold-dark',
    highlightColor: '#F59E0B',
    backgroundColor: '#0E0E12',
    preferredImageTool: '',
    preferredVideoTool: '',
  });
  const [tools, setTools] = useState<ToolOption[]>([]);
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load available modules (access + credit cost are server-side truth)
  useEffect(() => {
    fetch('/api/v1/modules')
      .then((res) => (res.ok ? res.json() : null))
      .then((resp) => setModules(resp?.data?.modules ?? []))
      .catch((err) => console.warn('[reel-wizard] modules fetch failed:', err));
  }, []);

  // Load generation tools (image / video models) so the user can optionally
  // override the planner's default pick. Empty array = silent fallback
  // (wizard shows no model selector, planner decides).
  useEffect(() => {
    fetch('/api/v1/tools')
      .then((res) => (res.ok ? res.json() : null))
      .then((resp) => setTools(resp?.data?.tools ?? []))
      .catch((err) => console.warn('[reel-wizard] tools fetch failed:', err));
  }, []);

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
      .catch((err) => console.warn('[reel-wizard] preferences fetch failed:', err));
  }, []);

  const update = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

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
    [update]
  );

  // Get available voices for selected language + provider combo.
  // Gemini TTS voices are multilingual — same 10 voices across every
  // language. Other providers are language-specific (edge-tts has
  // per-locale Neural voices, OpenAI is multilingual but its own voices).
  const voices =
    form.ttsProvider === 'gemini-tts'
      ? GEMINI_VOICES
      : (TTS_VOICES[form.ttsLanguage] ?? TTS_VOICES['en-US']!);

  // Submit reel creation
  const handleSubmit = async () => {
    setError('');
    setStep('generating');

    try {
      // Build the mode-specific payload — different backends need
      // different fields (topic / videoUrl / workflowUrl / script).
      // Empty strings must NOT be sent; the server treats them as
      // present-but-invalid and rejects validation.
      const inputKind = MODE_INPUT[form.mode] ?? 'script';
      const modePayload: Record<string, unknown> = {};
      if (inputKind === 'script' && form.script.trim()) {
        modePayload.script = form.script;
      } else if (inputKind === 'topic' && form.topic.trim()) {
        modePayload.topic = form.topic;
      } else if (inputKind === 'videoUrl' && form.videoUrl.trim()) {
        modePayload.videoUrl = form.videoUrl;
      } else if (inputKind === 'workflowUrl' && form.workflowUrl.trim()) {
        modePayload.workflowUrl = form.workflowUrl;
      }

      // preferredToolIds is a flat array — union image + video picks if the
      // user overrode either. Empty array is fine; server treats absence as
      // "planner decides" (documented in reel-schemas.ts).
      const preferredToolIds = [form.preferredImageTool, form.preferredVideoTool].filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      );

      const res = await fetch('/api/v1/reel/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: form.mode,
          ...modePayload,
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
          ...(preferredToolIds.length > 0 ? { preferredToolIds } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
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
            // API returns status lowercase ('processing' / 'completed'),
            // but our UI state + string comparisons expect uppercase to
            // match the DB enum (JobStatus type). Normalize here so we
            // don't sprinkle .toUpperCase() across every template branch.
            const status = (j.status ?? 'QUEUED').toString().toUpperCase() as JobStatus['status'];
            setJob({
              id: data.jobId,
              status,
              progress: j.progress ?? 0,
              outputUrl: j.outputUrl,
              error: j.error,
            });
            if (status === 'COMPLETED' || status === 'FAILED') {
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
          Start with the content. You'll pick captions, voice, and model settings in the next steps.
        </p>

        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="space-y-4">
              {modules.length > 0 && (
                <div>
                  <Label>Reel type</Label>
                  <Select value={form.mode} onValueChange={(v) => update('mode', v)}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {modules.map((m) => (
                        <SelectItem key={m.slug} value={m.slug}>
                          {m.name}{' '}
                          <span className="text-xs text-muted-foreground">
                            — {m.creditCost} credits
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(() => {
                    const selected = modules.find((m) => m.slug === form.mode);
                    return selected?.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">{selected.description}</p>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Mode-specific primary input — script / topic / videoUrl / workflowUrl */}
              {(() => {
                const inputKind = MODE_INPUT[form.mode] ?? 'script';
                if (inputKind === 'topic') {
                  return (
                    <div>
                      <Label htmlFor="topic">Topic</Label>
                      <textarea
                        id="topic"
                        value={form.topic}
                        onChange={(e) => update('topic', e.target.value)}
                        placeholder="e.g. 3 time-saving VS Code shortcuts every developer should know"
                        className="mt-1.5 min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        AI will generate the full reel from this topic. {form.topic.length}/1000
                      </p>
                    </div>
                  );
                }
                if (inputKind === 'videoUrl') {
                  return (
                    <div>
                      <Label htmlFor="videoUrl">Video URL</Label>
                      <input
                        id="videoUrl"
                        type="url"
                        value={form.videoUrl}
                        onChange={(e) => update('videoUrl', e.target.value)}
                        placeholder="https://example.com/video.mp4"
                        className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Public URL of the existing MP4 to caption. Transcription auto-detects the
                        audio.
                      </p>
                    </div>
                  );
                }
                if (inputKind === 'workflowUrl') {
                  return (
                    <div>
                      <Label htmlFor="workflowUrl">n8n Workflow URL</Label>
                      <input
                        id="workflowUrl"
                        type="url"
                        value={form.workflowUrl}
                        onChange={(e) => update('workflowUrl', e.target.value)}
                        placeholder="https://n8n.yourdomain.com/workflow/ID"
                        className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Public n8n workflow URL. Screenshots will be auto-generated and explained.
                      </p>
                    </div>
                  );
                }
                return (
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
                );
              })()}
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => setStep('style')}
                disabled={(() => {
                  // Primary input must be filled for the selected mode.
                  const inputKind = MODE_INPUT[form.mode] ?? 'script';
                  if (inputKind === 'script') return form.script.trim().length < 10;
                  if (inputKind === 'topic') return form.topic.trim().length < 3;
                  if (inputKind === 'videoUrl') return !form.videoUrl.trim().startsWith('http');
                  if (inputKind === 'workflowUrl') return form.workflowUrl.trim().length < 3;
                  return true;
                })()}
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
        <p className="mt-1 text-sm text-muted-foreground">Choose how your captions look.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {CAPTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                form.captionPreset === preset.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'
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
                  <p className="text-xs text-muted-foreground">{preset.description}</p>
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
                      onChange={(e) => update('backgroundColor', e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border"
                    />
                    <Input
                      value={form.backgroundColor}
                      onChange={(e) => update('backgroundColor', e.target.value)}
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
        <p className="mt-1 text-sm text-muted-foreground">Final touches before generating.</p>

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
                  onValueChange={(v) => update('layout', v as FormData['layout'])}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fullscreen">Fullscreen (9:16)</SelectItem>
                    <SelectItem value="split-screen">Split Screen</SelectItem>
                    <SelectItem value="picture-in-picture">Picture-in-Picture</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Video Style</Label>
                <Select
                  value={form.style}
                  onValueChange={(v) => update('style', v as FormData['style'])}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dynamic">Dynamic - fast cuts, zoom effects</SelectItem>
                    <SelectItem value="calm">Calm - smooth transitions, minimal</SelectItem>
                    <SelectItem value="cinematic">Cinematic - slow zooms, dramatic</SelectItem>
                    <SelectItem value="educational">Educational - clean, structured</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Audio: Provider → Language → Voice (chained). Provider drives
                  the voice catalog — Gemini has its own list, edge-tts is
                  per-locale. Language + Voice live here (not on step 1)
                  because they only make sense after Provider is chosen. */}
              <div>
                <Label>TTS Provider</Label>
                <Select
                  value={form.ttsProvider}
                  onValueChange={(v) => {
                    const provider = v as FormData['ttsProvider'];
                    update('ttsProvider', provider);
                    if (provider === 'gemini-tts') {
                      update('ttsVoice', GEMINI_VOICES[0]!.id);
                    } else {
                      const langDefaults = TTS_VOICES[form.ttsLanguage];
                      if (langDefaults?.[0]) update('ttsVoice', langDefaults[0].id);
                    }
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="edge-tts">Edge TTS (Free)</SelectItem>
                    <SelectItem value="gemini-tts">Gemini Flash TTS (Preview)</SelectItem>
                    <SelectItem value="elevenlabs">ElevenLabs (Pro)</SelectItem>
                    <SelectItem value="openai">OpenAI TTS (Pro)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Language</Label>
                  <Select
                    value={form.ttsLanguage}
                    onValueChange={(v) => {
                      update('ttsLanguage', v);
                      // Gemini voices are multilingual — don't swap on lang change.
                      if (form.ttsProvider !== 'gemini-tts') {
                        const newVoices = TTS_VOICES[v];
                        if (newVoices?.[0]) update('ttsVoice', newVoices[0].id);
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
                  <Select value={form.ttsVoice} onValueChange={(v) => update('ttsVoice', v)}>
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

            {/* Generation model overrides — optional, otherwise planner picks */}
            {tools.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <Label>Image Model (optional)</Label>
                  <Select
                    value={form.preferredImageTool || '__auto__'}
                    onValueChange={(v) => update('preferredImageTool', v === '__auto__' ? '' : v)}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Auto (planner picks)</SelectItem>
                      {tools
                        .filter((t) => t.assetTypes.includes('ai-image'))
                        .map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}{' '}
                            <span className="text-xs text-muted-foreground">— {t.costTier}</span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Video Model (optional)</Label>
                  <Select
                    value={form.preferredVideoTool || '__auto__'}
                    onValueChange={(v) => update('preferredVideoTool', v === '__auto__' ? '' : v)}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Auto (planner picks)</SelectItem>
                      {tools
                        .filter((t) => t.assetTypes.includes('ai-video'))
                        .map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}{' '}
                            <span className="text-xs text-muted-foreground">— {t.costTier}</span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="mt-6 rounded-md bg-muted p-4">
              <h3 className="text-sm font-medium">Summary</h3>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {(() => {
                  const inputKind = MODE_INPUT[form.mode] ?? 'script';
                  if (inputKind === 'topic') {
                    return <p>Topic: {form.topic.length} characters</p>;
                  }
                  if (inputKind === 'videoUrl') {
                    return <p>Video URL: {form.videoUrl || '(none)'}</p>;
                  }
                  if (inputKind === 'workflowUrl') {
                    return <p>Workflow: {form.workflowUrl || '(none)'}</p>;
                  }
                  return <p>Script: {form.script.length} characters</p>;
                })()}
                <p>Mode: {form.mode}</p>
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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
              <svg className="h-12 w-12 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
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
                  {job?.status === 'PROCESSING' ? 'Generating your reel...' : 'Queued...'}
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
                  <p className="mt-1 text-center text-xs text-muted-foreground">{job.progress}%</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
