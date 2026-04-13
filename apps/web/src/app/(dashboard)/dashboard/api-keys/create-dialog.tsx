'use client';

import { useState } from 'react';
import { SCOPE_PRESETS } from '@reelstack/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

type ScopePreset = 'full' | 'reelOnly' | 'readOnly' | 'templateManager';

const PRESET_LABELS: Record<ScopePreset, string> = {
  full: 'Full Access',
  reelOnly: 'Reel Only',
  readOnly: 'Read Only',
  templateManager: 'Template Manager',
};

const EXPIRATION_OPTIONS = [
  { value: '', label: 'Never' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
];

export function CreateApiKeyDialog({ open, onOpenChange, onCreated }: CreateApiKeyDialogProps) {
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<ScopePreset>('full');
  const [expiration, setExpiration] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        scopes: SCOPE_PRESETS[preset],
      };
      if (expiration) {
        body.expiresInDays = Number(expiration);
      }

      const res = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setCreatedKey(data.data?.key ?? null);
        onCreated();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setName('');
    setPreset('full');
    setExpiration('');
    setCreatedKey(null);
    setCopied(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{createdKey ? 'API Key Created' : 'Create API Key'}</DialogTitle>
        </DialogHeader>

        {createdKey ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Copy your API key now. You won&apos;t be able to see it again.
            </p>
            <div className="flex gap-2">
              <Input value={createdKey} readOnly className="font-mono text-xs" />
              <Button variant="outline" onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production API Key"
                />
              </div>

              <div className="space-y-1">
                <Label>Permissions</Label>
                <Select value={preset} onValueChange={(v) => setPreset(v as ScopePreset)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRESET_LABELS) as ScopePreset[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {PRESET_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Scopes: {SCOPE_PRESETS[preset].join(', ')}
                </p>
              </div>

              <div className="space-y-1">
                <Label>Expiration</Label>
                <Select value={expiration} onValueChange={setExpiration}>
                  <SelectTrigger>
                    <SelectValue placeholder="Never" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value || 'never'} value={opt.value || 'never'}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!name.trim() || creating}>
                {creating ? 'Creating...' : 'Create Key'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
