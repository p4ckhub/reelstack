'use client';

import { useEffect, useState } from 'react';
import { BUILT_IN_TEMPLATES } from '@reelstack/core';
import type { SubtitleTemplate } from '@reelstack/types';
import { Button } from '@/components/ui/button';

function TemplateCard({
  template,
  onRemove,
}: {
  template: SubtitleTemplate;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="truncate font-medium">{template.name}</h3>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
      <div
        className="mt-3 flex h-10 items-center justify-center rounded text-sm font-medium"
        style={{
          fontFamily: template.style.fontFamily,
          color: template.style.fontColor,
          backgroundColor: template.style.backgroundColor,
        }}
      >
        Sample Text
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{template.category}</span>
        {onRemove && !template.isBuiltIn && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => onRemove(template.id)}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const [userTemplates, setUserTemplates] = useState<SubtitleTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/templates')
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((resp) => setUserTemplates(resp.data ?? []))
      .catch(() => setUserTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/v1/templates/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setUserTemplates((prev) => prev.filter((t) => t.id !== id));
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage caption style templates for your reels
          </p>
        </div>
      </div>

      {/* User templates */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">My Templates</h2>
        {loading ? (
          <p className="mt-4 text-muted-foreground">Loading...</p>
        ) : userTemplates.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No custom templates yet. Create one via the API or import a template JSON.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {userTemplates.map((t) => (
              <TemplateCard key={t.id} template={t} onRemove={handleDelete} />
            ))}
          </div>
        )}
      </section>

      {/* Built-in presets */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold">Built-in Presets</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pre-designed templates available to all users
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {BUILT_IN_TEMPLATES.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      </section>
    </div>
  );
}
