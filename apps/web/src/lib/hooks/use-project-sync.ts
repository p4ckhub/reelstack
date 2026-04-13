'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editor-store';

export function useProjectSync(projectId: string) {
  const [loading, setLoading] = useState(true);
  const setCues = useEditorStore((s) => s.setCues);
  const setStyle = useEditorStore((s) => s.setStyle);
  const setVideo = useEditorStore((s) => s.setVideo);
  const cues = useEditorStore((s) => s.cues);
  const style = useEditorStore((s) => s.style);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);

  // Hydrate store from API on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [videoRes, subRes] = await Promise.all([
          fetch(`/api/videos/${projectId}`),
          fetch(`/api/videos/${projectId}/subtitles`),
        ]);

        if (cancelled) return;

        if (videoRes.ok) {
          const video = await videoRes.json();
          setVideo(
            {
              id: video.id,
              filename: video.filename ?? 'video',
              fileSize: video.fileSize ?? 0,
              mimeType: video.mimeType ?? 'video/mp4',
              width: video.width ?? 1920,
              height: video.height ?? 1080,
              duration: video.duration ?? 0,
            },
            video.url
          );
        }

        if (subRes.ok) {
          const sub = await subRes.json();
          if (sub?.content) setCues(sub.content);
          if (sub?.style) setStyle(sub.style);
        }
      } catch {
        // silently fail - user can still use the editor
      } finally {
        if (!cancelled) {
          initialLoadRef.current = false;
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, setCues, setStyle, setVideo]);

  // Debounced auto-save on cue/style changes
  useEffect(() => {
    if (initialLoadRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      fetch(`/api/videos/${projectId}/subtitles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cues, style }),
      }).catch((err) => console.warn('[use-project-sync] auto-save failed:', err));
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [projectId, cues, style]);

  return { loading };
}
