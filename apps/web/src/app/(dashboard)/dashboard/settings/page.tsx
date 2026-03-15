'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/components/providers/auth-provider';

const CAPTION_PRESETS = [
  { id: 'bold-dark', name: 'Bold Dark' },
  { id: 'clean-white', name: 'Clean White' },
  { id: 'neon', name: 'Neon Glow' },
  { id: 'warm', name: 'Warm Amber' },
  { id: 'custom', name: 'Custom' },
];

interface Preferences {
  brandPreset?: {
    highlightColor?: string;
    backgroundColor?: string;
    captionPreset?: string;
  };
  defaultLayout?: string;
  defaultTtsProvider?: string;
  defaultTtsVoice?: string;
  defaultTtsLanguage?: string;
  defaultVideoStyle?: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [highlightColor, setHighlightColor] = useState('#F59E0B');
  const [backgroundColor, setBackgroundColor] = useState('#0E0E12');
  const [captionPreset, setCaptionPreset] = useState('bold-dark');
  const [layout, setLayout] = useState('fullscreen');
  const [ttsProvider, setTtsProvider] = useState('edge-tts');
  const [ttsVoice, setTtsVoice] = useState('en-US-GuyNeural');
  const [ttsLanguage, setTtsLanguage] = useState('en-US');
  const [videoStyle, setVideoStyle] = useState('dynamic');

  const loadPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/user/preferences');
      if (!res.ok) return;
      const { data } = await res.json();
      if (data.brandPreset?.highlightColor) setHighlightColor(data.brandPreset.highlightColor);
      if (data.brandPreset?.backgroundColor) setBackgroundColor(data.brandPreset.backgroundColor);
      if (data.brandPreset?.captionPreset) setCaptionPreset(data.brandPreset.captionPreset);
      if (data.defaultLayout) setLayout(data.defaultLayout);
      if (data.defaultTtsProvider) setTtsProvider(data.defaultTtsProvider);
      if (data.defaultTtsVoice) setTtsVoice(data.defaultTtsVoice);
      if (data.defaultTtsLanguage) setTtsLanguage(data.defaultTtsLanguage);
      if (data.defaultVideoStyle) setVideoStyle(data.defaultVideoStyle);
    } catch {
      // Ignore - use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const body: Preferences = {
        brandPreset: { highlightColor, backgroundColor, captionPreset },
        defaultLayout: layout,
        defaultTtsProvider: ttsProvider,
        defaultTtsVoice: ttsVoice,
        defaultTtsLanguage: ttsLanguage,
        defaultVideoStyle: videoStyle,
      };
      const res = await fetch('/api/v1/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-center text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Default preferences for new reels
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
        </Button>
      </div>

      {/* Brand Preset */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Brand Preset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Caption Preset</Label>
            <Select value={captionPreset} onValueChange={setCaptionPreset}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAPTION_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="highlight">Highlight Color</Label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="color"
                  id="highlight"
                  value={highlightColor}
                  onChange={(e) => setHighlightColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border"
                />
                <Input
                  value={highlightColor}
                  onChange={(e) => setHighlightColor(e.target.value)}
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
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border"
                />
                <Input
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default Reel Settings */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-lg">Default Reel Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Layout</Label>
            <Select value={layout} onValueChange={setLayout}>
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
            <Select value={videoStyle} onValueChange={setVideoStyle}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dynamic">Dynamic</SelectItem>
                <SelectItem value="calm">Calm</SelectItem>
                <SelectItem value="cinematic">Cinematic</SelectItem>
                <SelectItem value="educational">Educational</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>TTS Provider</Label>
            <Select value={ttsProvider} onValueChange={setTtsProvider}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="edge-tts">Edge TTS (Free)</SelectItem>
                <SelectItem value="elevenlabs">ElevenLabs (Pro)</SelectItem>
                <SelectItem value="openai">OpenAI TTS (Pro)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Language</Label>
              <Select value={ttsLanguage} onValueChange={setTtsLanguage}>
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
              <Input
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-lg">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input value={user?.email ?? ''} disabled className="mt-1.5" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Tier:</span>
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {(user as Record<string, unknown>)?.tier as string ?? 'FREE'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
