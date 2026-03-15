'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { CreateApiKeyDialog } from './create-dialog';

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  usageCount: number;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchKeys = useCallback(() => {
    fetch('/api/v1/api-keys')
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((resp) => setKeys(resp.data ?? []))
      .catch(() => setKeys([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) return;
    const res = await fetch(`/api/v1/api-keys/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, isActive: false } : k)));
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage API keys for programmatic access
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create API Key</Button>
      </div>

      {loading ? (
        <p className="mt-12 text-center text-muted-foreground">Loading...</p>
      ) : keys.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">No API keys yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Create an API key to access the Subtitle Burner API programmatically.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Key</th>
                <th className="px-4 py-3 text-left font-medium">Scopes</th>
                <th className="px-4 py-3 text-left font-medium">Last Used</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{key.name}</td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-muted px-2 py-0.5 text-xs">
                      {key.keyPrefix}...
                    </code>
                  </td>
                  <td className="max-w-48 px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.slice(0, 3).map((scope) => (
                        <span
                          key={scope}
                          className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
                        >
                          {scope}
                        </span>
                      ))}
                      {key.scopes.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{key.scopes.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {key.lastUsedAt
                      ? new Date(key.lastUsedAt).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    {key.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        Revoked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {key.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRevoke(key.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={fetchKeys}
      />
    </div>
  );
}
