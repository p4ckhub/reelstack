import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Programmatic Video Pipeline',
  description:
    'Generate reels and YouTube videos from text. Automated voiceover, word-level karaoke captions, B-roll, and effects. All from code or API.',
  openGraph: {
    title: 'ReelStack — Programmatic Video Pipeline',
    description:
      'Generate reels and YouTube videos from text. Automated voiceover, karaoke captions, B-roll, and effects.',
    url: '/',
  },
};

const features = [
  {
    title: 'Script to Reel in Seconds',
    description:
      'Write your script, pick a voice, and get a finished reel with captions, transitions, and music. Full TTS + whisper pipeline built in.',
  },
  {
    title: 'Karaoke Captions',
    description:
      'Word-by-word highlighting with pixel-accurate timing from whisper.cpp. Bold, clean, neon, or custom styles.',
  },
  {
    title: '11 Video Effects',
    description:
      'Text cards, B-roll cutaways, punch-in zoom, highlight boxes, animated counters, lower thirds, CTAs, PiP, and more.',
  },
  {
    title: 'Reels + YouTube',
    description:
      'Two compositions: 9:16 vertical reels and 16:9 horizontal YouTube. Same effects work in both formats.',
  },
  {
    title: 'API-First',
    description:
      'Full REST API with API keys, rate limiting, and scoped permissions. Automate reel generation from your app or n8n workflow.',
  },
  {
    title: 'Self-Hostable',
    description:
      'Deploy on your own VPS with Docker. No vendor lock-in. Your data, your infrastructure, your rules.',
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="py-24 text-center">
        <div className="mx-auto mb-6 w-fit rounded-full border px-4 py-1 text-sm text-muted-foreground">
          Script &rarr; TTS &rarr; Captions &rarr; Reel
        </div>
        <h1 className="text-5xl font-bold tracking-tight">
          Programmatic Video Pipeline
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Generate reels and YouTube videos from text. Automated voiceover,
          word-level karaoke captions, B-roll, transitions, and effects.
          All from code or API.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/dashboard/reel/new"
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create Your First Reel
          </Link>
          <Link
            href="/pricing"
            className="rounded-md border px-6 py-3 font-medium hover:bg-muted"
          >
            View Pricing
          </Link>
        </div>
      </section>

      {/* Pipeline visualization */}
      <section className="pb-16">
        <div className="grid grid-cols-4 gap-2 rounded-lg border bg-muted/30 p-6 text-center text-sm">
          <div className="rounded-md bg-background p-4">
            <div className="text-2xl">1</div>
            <p className="mt-1 font-medium">Write Script</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Plain text, any language
            </p>
          </div>
          <div className="rounded-md bg-background p-4">
            <div className="text-2xl">2</div>
            <p className="mt-1 font-medium">Generate Voice</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Edge TTS, ElevenLabs, or OpenAI
            </p>
          </div>
          <div className="rounded-md bg-background p-4">
            <div className="text-2xl">3</div>
            <p className="mt-1 font-medium">Auto Captions</p>
            <p className="mt-1 text-xs text-muted-foreground">
              whisper.cpp word-level timing
            </p>
          </div>
          <div className="rounded-md bg-background p-4">
            <div className="text-2xl">4</div>
            <p className="mt-1 font-medium">Render Video</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Remotion + effects = MP4
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="grid gap-8 pb-24 md:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.title} className="rounded-lg border p-6">
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {feature.description}
            </p>
          </div>
        ))}
      </section>

      {/* Effects showcase */}
      <section className="pb-24">
        <h2 className="text-center text-3xl font-bold">Every Building Block You Need</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-muted-foreground">
          Mix and match effects to create professional-looking content without editing software.
        </p>
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { name: 'Text Cards', desc: 'Gradient intro/chapter screens' },
            { name: 'B-Roll Cutaways', desc: '5 transition types' },
            { name: 'Karaoke Captions', desc: 'Word-by-word highlight' },
            { name: 'Punch-in Zoom', desc: 'Spring or smooth easing' },
            { name: 'Highlight Boxes', desc: 'Draw attention with glow' },
            { name: 'Animated Counters', desc: 'Numbers that count up' },
            { name: 'Lower Thirds', desc: 'Name tags and context' },
            { name: 'CTA Overlays', desc: 'Buttons and pills' },
          ].map((effect) => (
            <div
              key={effect.name}
              className="rounded-md border px-4 py-3"
            >
              <p className="font-medium">{effect.name}</p>
              <p className="text-xs text-muted-foreground">{effect.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="pb-24 text-center">
        <h2 className="text-3xl font-bold">Stop Editing Manually</h2>
        <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
          Write a script, hit generate, get a reel. Free tier included.
        </p>
        <div className="mt-8">
          <Link
            href="/login"
            className="rounded-md bg-primary px-8 py-3 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start Free
          </Link>
        </div>
      </section>
    </div>
  );
}
