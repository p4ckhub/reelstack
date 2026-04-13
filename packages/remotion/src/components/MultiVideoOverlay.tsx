/**
 * MultiVideoOverlay — display multiple video/image windows simultaneously.
 *
 * Used for "reveal" moments in reels: showing multiple AI-generated clips
 * or before/after comparisons in floating windows over the main content.
 */
import React from 'react';
import {
  Img,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';

export interface OverlayPanel {
  /** Media URL (video or image) */
  url: string;
  type: 'video' | 'image';
  /** Position as percentage of container */
  x: number;
  y: number;
  /** Size as percentage of container width */
  width: number;
  height: number;
  /** Border config */
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  /** Drop shadow */
  shadow?: boolean;
  /** Stagger entrance delay in frames */
  entranceDelay?: number;
}

export interface MultiVideoOverlayProps {
  panels: readonly OverlayPanel[];
  startFrame: number;
  endFrame: number;
}

export const MultiVideoOverlay: React.FC<MultiVideoOverlayProps> = ({
  panels,
  startFrame,
  endFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < startFrame || frame > endFrame) return null;

  const relativeFrame = frame - startFrame;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {panels.map((panel, i) => {
        const delay = panel.entranceDelay ?? i * 6;
        const progress = spring({
          frame: relativeFrame - delay,
          fps,
          config: { damping: 12, stiffness: 180 },
        });

        if (progress < 0.01) return null;

        const exitStart = endFrame - startFrame - 10;
        const exitProgress = interpolate(relativeFrame, [exitStart, exitStart + 10], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        const scale = progress * exitProgress;
        const opacity = exitProgress;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${panel.x}%`,
              top: `${panel.y}%`,
              width: `${panel.width}%`,
              height: `${panel.height}%`,
              transform: `scale(${scale})`,
              opacity,
              borderRadius: panel.borderRadius ?? 8,
              border: `${panel.borderWidth ?? 2}px solid ${panel.borderColor ?? '#ffffff'}`,
              overflow: 'hidden',
              boxShadow: panel.shadow !== false ? '0 4px 20px rgba(0,0,0,0.5)' : 'none',
            }}
          >
            {panel.type === 'video' ? (
              <OffthreadVideo
                src={panel.url}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <Img src={panel.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
        );
      })}
    </div>
  );
};
