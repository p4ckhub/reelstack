import React from 'react';
import { AbsoluteFill } from 'remotion';
import { WatermarkOverlay, type WatermarkProps } from './WatermarkOverlay';

/**
 * WithWatermarkOverlay — single-line wrapper for any composition that needs
 * to comply with the FREE-tier watermark contract.
 *
 *     {watermark && <WithWatermarkOverlay watermark={watermark} />}
 *
 * Why a wrapper: composition code used to duplicate the same
 * `<AbsoluteFill style={{ zIndex: 100 }}><WatermarkOverlay … /></AbsoluteFill>`
 * block in 7+ places. When the contract changes (e.g. z-index, always-on
 * during transitions, pointer-events tweaks), we edit ONE file.
 *
 * The wrapper renders nothing when `watermark` is undefined or `enabled`
 * is false — safe to drop at the end of any composition unconditionally.
 */
export interface WithWatermarkOverlayProps {
  readonly watermark:
    | Pick<WatermarkProps, 'enabled' | 'seed' | 'text' | 'rotateEverySeconds'>
    | undefined;
}

export const WithWatermarkOverlay: React.FC<WithWatermarkOverlayProps> = ({ watermark }) => {
  if (!watermark?.enabled) return null;
  return (
    <AbsoluteFill style={{ zIndex: 100 }}>
      <WatermarkOverlay
        enabled={watermark.enabled}
        seed={watermark.seed}
        text={watermark.text}
        rotateEverySeconds={watermark.rotateEverySeconds}
      />
    </AbsoluteFill>
  );
};
