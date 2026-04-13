/**
 * LabelOverlay — text badges and arrows for callouts.
 *
 * Used for "NOT A REAL PERSON" style labels with optional directional arrows.
 * Animated entrance (spring scale) and exit (fade).
 */
import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

export interface LabelConfig {
  /** Label text */
  text: string;
  /** Position as percentage */
  x: number;
  y: number;
  /** Background color (default: #000000CC) */
  backgroundColor?: string;
  /** Text color (default: #FFFFFF) */
  textColor?: string;
  /** Font size in px (default: 28) */
  fontSize?: number;
  /** Arrow pointing direction (or none) */
  arrow?: 'up' | 'down' | 'left' | 'right' | 'none';
  /** Arrow color (default: #FF0000) */
  arrowColor?: string;
  /** Arrow size in px (default: 40) */
  arrowSize?: number;
  /** Padding in px (default: 12 16) */
  padding?: string;
  /** Border radius (default: 8) */
  borderRadius?: number;
}

export interface LabelOverlayProps {
  labels: readonly LabelConfig[];
  startFrame: number;
  endFrame: number;
}

const ARROW_CHARS: Record<string, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

export const LabelOverlay: React.FC<LabelOverlayProps> = ({ labels, startFrame, endFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < startFrame || frame > endFrame) return null;

  const relativeFrame = frame - startFrame;
  const exitStart = endFrame - startFrame - 8;
  const exitProgress = interpolate(relativeFrame, [exitStart, exitStart + 8], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {labels.map((label, i) => {
        const entranceProgress = spring({
          frame: relativeFrame - i * 4,
          fps,
          config: { damping: 14, stiffness: 200 },
        });

        if (entranceProgress < 0.01) return null;

        const scale = entranceProgress * exitProgress;
        const arrowChar = label.arrow && label.arrow !== 'none' ? ARROW_CHARS[label.arrow] : null;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${label.x}%`,
              top: `${label.y}%`,
              transform: `translate(-50%, -50%) scale(${scale})`,
              display: 'flex',
              flexDirection:
                label.arrow === 'down' ? 'column' : label.arrow === 'up' ? 'column-reverse' : 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <div
              style={{
                backgroundColor: label.backgroundColor ?? 'rgba(0,0,0,0.8)',
                color: label.textColor ?? '#FFFFFF',
                fontSize: label.fontSize ?? 28,
                fontWeight: 'bold',
                fontFamily: 'Arial, sans-serif',
                padding: label.padding ?? '12px 16px',
                borderRadius: label.borderRadius ?? 8,
                whiteSpace: 'nowrap',
              }}
            >
              {label.text}
            </div>
            {arrowChar && (
              <div
                style={{
                  color: label.arrowColor ?? '#FF0000',
                  fontSize: label.arrowSize ?? 40,
                  fontWeight: 'bold',
                  lineHeight: 1,
                }}
              >
                {arrowChar}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
