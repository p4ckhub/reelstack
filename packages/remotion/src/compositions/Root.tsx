import { Composition } from 'remotion';
import { ReelComposition } from './ReelComposition';
import { YouTubeLongFormComposition } from './YouTubeLongFormComposition';
import type { ReelProps } from '../schemas/reel-props';
import type { YouTubeProps } from '../schemas/youtube-props';
import { calculateReelMetadata } from './calculate-metadata';
import { calculateYouTubeMetadata } from './calculate-youtube-metadata';
import { listCompositions } from './registry';

// Import modules barrel to trigger self-registration
import '../modules';

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  const moduleCompositions = listCompositions();

  return (
    <>
      {/* ── Core compositions ──────────────────────────────────── */}

      {/* 9:16 Vertical Reel (TikTok, Instagram, YouTube Shorts) */}
      <Composition
        id="Reel"
        component={ReelComposition}
        durationInFrames={FPS * 15}
        fps={FPS}
        width={1080}
        height={1920}
        calculateMetadata={calculateReelMetadata}
        defaultProps={{
          layout: 'split-screen' as const,
          bRollSegments: [
            {
              startTime: 3,
              endTime: 5,
              media: { url: '#e94560', type: 'color' as const, label: 'B-ROLL 1' },
              animation: 'spring-scale' as const,
            },
            {
              startTime: 9,
              endTime: 11,
              media: { url: '#e94560', type: 'color' as const, label: 'B-ROLL 2' },
              animation: 'spring-scale' as const,
            },
          ],
          cues: [
            { id: '1', text: 'To jest hook', startTime: 0, endTime: 2 },
            { id: '2', text: 'który przyciąga', startTime: 2, endTime: 4 },
            { id: '3', text: 'uwagę widza', startTime: 4, endTime: 6 },
            { id: '4', text: 'a tutaj substance', startTime: 6, endTime: 8 },
            { id: '5', text: 'z konkretnymi tipami', startTime: 8, endTime: 10 },
            { id: '6', text: 'i payoff na końcu', startTime: 10, endTime: 12 },
            { id: '7', text: 'z mocnym CTA', startTime: 12, endTime: 15 },
          ],
          pipSegments: [],
          lowerThirds: [],
          ctaSegments: [],
          counters: [],
          zoomSegments: [],
          highlights: [],
          effects: [],
          primaryVideoObjectPosition: 'center',
          dynamicCaptionPosition: false,
          musicVolume: 0.3,
          showProgressBar: true,
          backgroundColor: '#000000',
          speedRamps: [],
        }}
      />

      {/* 16:9 Horizontal YouTube Long-Form */}
      <Composition
        id="YouTubeLongForm"
        component={YouTubeLongFormComposition}
        durationInFrames={FPS * 60}
        fps={FPS}
        width={1920}
        height={1080}
        calculateMetadata={calculateYouTubeMetadata}
        defaultProps={{
          layout: 'sidebar' as const,
          bRollSegments: [],
          cues: [
            { id: '1', text: 'Welcome to this tutorial', startTime: 1, endTime: 3 },
            { id: '2', text: 'Today we will build something amazing', startTime: 3, endTime: 6 },
          ],
          chapters: [
            {
              startTime: 0,
              endTime: 2,
              number: 1,
              title: 'Introduction',
              style: 'fullscreen' as const,
              backgroundColor: '#0F0F0F',
              accentColor: '#3B82F6',
            },
            {
              startTime: 10,
              endTime: 12,
              number: 2,
              title: 'Getting Started',
              style: 'fullscreen' as const,
              backgroundColor: '#0F0F0F',
              accentColor: '#10B981',
            },
          ],
          sidebarPosition: 'right' as const,
          sidebarWidth: 30,
          pipSegments: [],
          ctaSegments: [],
          counters: [],
          highlights: [],
          zoomSegments: [
            {
              startTime: 6,
              endTime: 8,
              scale: 1.4,
              focusPoint: { x: 50, y: 40 },
              easing: 'spring' as const,
            },
          ],
          lowerThirds: [
            {
              startTime: 2,
              endTime: 6,
              title: 'Your Name',
              subtitle: 'Software Engineer',
              accentColor: '#3B82F6',
              textColor: '#FFFFFF',
              position: 'left' as const,
              backgroundColor: '#000000CC',
            },
          ],
          musicVolume: 0.15,
          showProgressBar: false,
          backgroundColor: '#0F0F0F',
        }}
      />

      {/* ── Module compositions (from registry) ────────────────── */}
      {moduleCompositions.map((mod) => (
        <Composition
          key={mod.id}
          id={mod.id}
          component={mod.component}
          durationInFrames={mod.defaultDurationInFrames}
          fps={mod.fps}
          width={mod.width}
          height={mod.height}
          calculateMetadata={mod.calculateMetadata}
          defaultProps={mod.defaultProps}
        />
      ))}
    </>
  );
};
