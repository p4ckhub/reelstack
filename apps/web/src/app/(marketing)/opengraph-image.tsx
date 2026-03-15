import { createOgImage } from '@/lib/og/image';

export const runtime = 'nodejs';
export const revalidate = 86400; // regenerate at most once per day
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return createOgImage({
    title: 'Programmatic',
    titleAccent: 'Video Pipeline',
    description:
      'Generate reels and YouTube videos from text. ' +
      'Automated voiceover, word-level karaoke captions, B-roll, and effects. ' +
      'All from code or API.',
  });
}
