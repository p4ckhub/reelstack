import { create } from 'zustand';
import type { SubtitleCue, SubtitleStyle } from '@reelstack/types';

interface VideoMeta {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  width: number;
  height: number;
  duration: number;
}

interface EditorState {
  cues: SubtitleCue[];
  style: SubtitleStyle | null;
  video: VideoMeta | null;
  videoUrl: string | null;
  setCues: (cues: SubtitleCue[]) => void;
  setStyle: (style: SubtitleStyle) => void;
  setVideo: (video: VideoMeta, url: string) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  cues: [],
  style: null,
  video: null,
  videoUrl: null,
  setCues: (cues) => set({ cues }),
  setStyle: (style) => set({ style }),
  setVideo: (video, videoUrl) => set({ video, videoUrl }),
  reset: () => set({ cues: [], style: null, video: null, videoUrl: null }),
}));
