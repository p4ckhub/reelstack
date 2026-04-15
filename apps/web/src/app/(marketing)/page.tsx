import type { Metadata } from 'next';
import Link from 'next/link';
import {
  FadeIn,
  Stagger,
  CountUp,
  GlowCard,
  PulseBadge,
  KaraokeDemo,
  TerminalDemo,
  RenderProgress,
  Waveform,
  GradientMesh,
  TiltCard,
  WordRotator,
  FilmStrip,
  ReelEffectsShowcase,
  SpotlightCursor,
  MagneticButton,
  RenderTimeline,
  InteractivePipelineStep,
} from './animations';

export const metadata: Metadata = {
  title: 'Stop Editing Manually. Start Rendering Programmatically.',
  description:
    'AI video production platform. Script to TTS to AI Director to Remotion render to MP4. 19 AI tools, 28 effects, karaoke captions, REST API. Self-hostable.',
  openGraph: {
    title: 'ReelStack - AI Video Production Platform',
    description:
      'Script to finished video in seconds. 19 AI tools, 28 effects, karaoke captions, full REST API. Open source, self-hostable.',
    url: '/',
  },
};

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const pipelineSteps = [
  { label: 'Script', icon: '&#9998;', desc: 'Write or paste your script' },
  { label: 'Voice', icon: '&#9835;', desc: 'ElevenLabs, Edge TTS, OpenAI' },
  { label: 'Captions', icon: '&#8943;', desc: 'Word-level karaoke timing' },
  { label: 'AI Director', icon: '&#9672;', desc: 'Claude plans shots and effects' },
  { label: 'Render', icon: '&#9654;', desc: 'Remotion + Lambda = MP4' },
];

const contrastRows = [
  {
    capcut: 'You need a quick one-off edit for Instagram',
    reelstack: 'You need 50 reels a week from a spreadsheet of topics',
  },
  {
    capcut: 'You like drag-and-drop timelines',
    reelstack: 'You want a REST API that fits into your n8n or CI pipeline',
  },
  {
    capcut: 'You edit on your phone between meetings',
    reelstack: 'You self-host on your VPS and own every frame of data',
  },
  {
    capcut: 'You want a free consumer app',
    reelstack: 'You want open source code you can fork and extend',
  },
];

const alternatingFeatures = [
  {
    category: 'AI Director',
    heading: 'Let AI Plan Every Shot for You',
    description:
      'Claude analyzes your script and automatically selects B-roll, effects, transitions, and timing. No storyboarding. No timeline dragging. Just a finished video that matches your content.',
  },
  {
    category: 'Captions',
    heading: 'Karaoke Captions That Hit Every Syllable',
    description:
      'whisper.cpp generates word-level timestamps with sub-frame accuracy. Bold, neon, minimal, or custom styles. Your viewers read along without thinking about it.',
  },
  {
    category: 'API-First',
    heading: 'Automate Video Like You Automate Email',
    description:
      'Full REST API with API keys, rate limiting, and scoped permissions. Trigger renders from n8n, Zapier, cron jobs, or your own app. One POST request, one MP4 back.',
  },
  {
    category: 'Self-Hosted',
    heading: 'Your Server, Your Data, Zero Vendor Lock-in',
    description:
      'Deploy with Docker on any VPS. No cloud dependency, no usage caps you cannot control. Fork the AGPL core, build modules on top, ship on your terms.',
  },
];

const gridFeatures = [
  {
    title: '19 AI Video Tools',
    desc: 'Seedance, Veo 3.1, Kling, HeyGen, Pexels, and more. One unified interface.',
  },
  {
    title: '28 Visual Effects',
    desc: 'Text cards, zoom, highlight boxes, counters, lower thirds, CTA overlays.',
  },
  {
    title: 'Reels + YouTube',
    desc: '9:16 vertical and 16:9 horizontal. Same effects, same pipeline, two formats.',
  },
  {
    title: 'B-Roll Cutaways',
    desc: '5 transition types with AI-selected stock footage from Pexels.',
  },
  {
    title: 'Lambda Rendering',
    desc: 'Offload heavy renders to AWS Lambda. Parallel, fast, cost-effective.',
  },
  {
    title: 'CLI + SDK',
    desc: 'Bash CLI for scripts, TypeScript SDK for apps. Both hit the same API.',
  },
  {
    title: 'Open Source Core',
    desc: 'AGPL licensed. Read every line, fork it, extend it, contribute back.',
  },
  {
    title: 'Premium Modules',
    desc: 'Talking head, n8n explainers, branded intros. Buy once, use forever.',
  },
  { title: 'Webhook Callbacks', desc: 'Get notified when renders finish. No polling, no waiting.' },
];

const proofPoints = [
  {
    metric: '< $0.01',
    label: 'per render on Lambda',
    detail: 'AWS Lambda parallel rendering. A 30-second reel costs less than a cent.',
  },
  {
    metric: '15-40s',
    label: 'render time',
    detail: 'Typical 30-second reel. Script to finished MP4, including TTS and AI planning.',
  },
  {
    metric: '19',
    label: 'AI video providers',
    detail: 'Seedance, Veo 3.1, Kling, HeyGen, Pexels, and more. One unified tool interface.',
  },
  {
    metric: 'AGPL',
    label: 'open source',
    detail: 'Read every line. Fork it. Self-host it. No vendor lock-in, ever.',
  },
  {
    metric: '$5/mo',
    label: 'hosting cost',
    detail: 'Run the full stack on a cheap VPS. Redis, worker, web, nginx. Four containers.',
  },
  {
    metric: '1 POST',
    label: 'to generate a reel',
    detail:
      'Full REST API. Send a script, get an MP4. Integrate with n8n, Zapier, or your own app.',
  },
];

const integrations = [
  'Claude',
  'ElevenLabs',
  'Pexels',
  'AWS Lambda',
  'Docker',
  'Remotion',
  'OpenAI',
  'Seedance',
  'Veo',
  'Kling',
  'HeyGen',
  'n8n',
];

const faqs = [
  {
    q: 'Do I need to know how to code to use ReelStack?',
    a: 'No. The web dashboard lets you write a script, pick a voice, and hit render. The API and CLI exist for developers who want automation, but they are optional.',
  },
  {
    q: 'How long does a render take?',
    a: 'A typical 30-second reel renders in 15 to 40 seconds on AWS Lambda. Local Docker renders depend on your hardware but average under 2 minutes.',
  },
  {
    q: 'Can I use my own AI video tools or just the built-in ones?',
    a: 'ReelStack ships with 19 integrations, but the module system is open. You can write a custom provider for any tool that has an API.',
  },
  {
    q: 'What does "self-hostable" actually mean?',
    a: 'You run ReelStack on your own server with Docker. Your data never leaves your infrastructure. No cloud account required, though Lambda rendering is available as an optional accelerator.',
  },
  {
    q: 'Is the free tier actually usable or just a teaser?',
    a: '3 full renders per month with all effects and AI Director. The free tier includes a small watermark. Upgrade to Solo ($9/mo) to remove it.',
  },
  {
    q: 'How is this different from CapCut or Descript?',
    a: 'Those are editing tools. ReelStack is a rendering pipeline. You do not drag clips on a timeline. You write a script, the AI plans the video, and code renders it. Built for volume, not one-offs.',
  },
  {
    q: 'Can I use it for YouTube videos, not just reels?',
    a: 'Yes. ReelStack supports both 9:16 vertical (Reels, TikTok, Shorts) and 16:9 horizontal (YouTube). Same effects, same pipeline.',
  },
  {
    q: 'What happens if I cancel my subscription?',
    a: 'You keep the open source core forever. Premium modules you purchased stay yours. You just lose access to future module updates and priority Lambda rendering.',
  },
  {
    q: 'Can I white-label the output for my agency clients?',
    a: 'Yes. The Agency plan includes no branding on renders and API access for multi-tenant setups. Many agencies resell the output directly.',
  },
  {
    q: 'Where do I get help if something breaks?',
    a: 'GitHub Issues for bugs, Discord community for questions, and priority email support on Pro and Agency plans.',
  },
];

const footerLinks = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'API Docs', href: '/docs' },
    { label: 'Changelog', href: '/changelog' },
  ],
  Company: [
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Contact', href: 'mailto:hello@reelstack.dev' },
  ],
  Resources: [
    { label: 'GitHub', href: 'https://github.com/jurczykpawel/reelstack' },
    { label: 'Discord', href: '#' },
    { label: 'Documentation', href: '/docs' },
  ],
  Legal: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'License (AGPL)', href: '/license' },
  ],
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  return (
    <div style={{ backgroundColor: '#09090f', color: '#ffffff' }}>
      <RenderTimeline />

      {/* ── Hero ── */}
      <section className="relative mx-auto max-w-6xl px-6 pb-24 pt-20 text-center">
        <GradientMesh />
        <SpotlightCursor />
        <FadeIn>
          <PulseBadge className="mx-auto mb-6">
            <div
              className="inline-block rounded-full border border-white/[0.06] px-4 py-1.5 text-sm tracking-wide text-[#94979e]"
              style={{ backgroundColor: '#10111a' }}
            >
              Open source AI video pipeline
            </div>
          </PulseBadge>
        </FadeIn>
        <FadeIn delay={100}>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">
            Stop Editing Manually.
            <br />
            Start Rendering{' '}
            <WordRotator
              words={['Reels', 'Shorts', 'YouTube', 'TikToks', 'Explainers']}
              className="text-[#7c3aed]"
            />
            .
          </h1>
        </FadeIn>
        <FadeIn delay={250}>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#94979e]">
            Write what you want to say. Pick a voice. Get a professional video back with captions,
            effects, and transitions. No timeline, no editing skills, no hours wasted.
          </p>
        </FadeIn>
        <FadeIn delay={400} className="mt-10 flex flex-wrap justify-center gap-4">
          <MagneticButton
            href="/dashboard/reel/new"
            className="inline-flex rounded-full bg-[#7c3aed] px-7 py-3 font-medium text-white transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/50 active:opacity-80"
          >
            Create a Free Reel in 60 Seconds
          </MagneticButton>
          <Link
            href="https://github.com/jurczykpawel/reelstack"
            className="rounded-full border border-white/[0.06] px-7 py-3 font-medium text-[#94979e] transition-colors duration-200 hover:border-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 active:opacity-80"
          >
            View on GitHub
          </Link>
        </FadeIn>
        <FadeIn delay={500}>
          <p className="mt-4 text-xs text-[#61646b]">
            Free forever. No credit card. Pro from $9/mo.
          </p>
        </FadeIn>

        {/* Hero demo: karaoke captions in action */}
        <FadeIn delay={500}>
          <div
            className="mx-auto mt-16 max-w-3xl overflow-hidden rounded-2xl border border-white/[0.06]"
            style={{ backgroundColor: '#10111a' }}
          >
            <div className="flex flex-col items-center justify-center px-8 py-12">
              <Waveform bars={40} className="mb-6 h-8 opacity-60" />
              <KaraokeDemo />
              <p className="mt-6 text-xs text-[#61646b]">
                Word-level karaoke captions, generated automatically from your script
              </p>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── Social Proof ── */}
      <section className="border-y border-white/[0.06] py-16">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-[#61646b]">
            Open source since 2026. Self-hosted by creators worldwide.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
            <CountUp
              target={1200}
              suffix="+"
              className="text-2xl font-bold tracking-tight text-white"
            />
            <span className="text-sm text-[#94979e]">renders completed</span>
            <span className="mx-2 hidden text-[#61646b] sm:inline">|</span>
            <CountUp target={19} className="text-2xl font-bold tracking-tight text-white" />
            <span className="text-sm text-[#94979e]">AI video tools integrated</span>
            <span className="mx-2 hidden text-[#61646b] sm:inline">|</span>
            <CountUp target={28} className="text-2xl font-bold tracking-tight text-white" />
            <span className="text-sm text-[#94979e]">visual effects</span>
          </div>
        </div>
      </section>

      {/* ── Pipeline Demo ── */}
      <section className="mx-auto max-w-6xl px-6 py-28">
        <p className="text-center text-sm font-medium uppercase tracking-widest text-[#61646b]">
          How it works
        </p>
        <h2 className="mt-4 text-center text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">
          Five Steps. Zero Timeline.
        </h2>
        <Stagger
          staggerMs={120}
          className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
        >
          {pipelineSteps.map((step, i) => (
            <div key={step.label} className="relative">
              <InteractivePipelineStep
                label={step.label}
                stepNum={i + 1}
                icon={step.icon}
                desc={step.desc}
              >
                {step.label === 'Voice' && <Waveform bars={16} className="mt-2 h-4" />}
              </InteractivePipelineStep>
              {i < pipelineSteps.length - 1 && (
                <div className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-[#61646b] lg:block">
                  &rarr;
                </div>
              )}
            </div>
          ))}
        </Stagger>
      </section>

      {/* ── Contrast Positioning ── */}
      <section className="mx-auto max-w-6xl px-6 py-28">
        <h2 className="text-center text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">
          The Right Tool for the Right Job
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-[#94979e]">
          Editing apps are great for one-off projects. ReelStack is for teams and creators who ship
          video at scale.
        </p>
        <FadeIn>
          <div
            className="mt-12 overflow-hidden rounded-xl border border-white/[0.06]"
            style={{ backgroundColor: '#10111a' }}
          >
            <div className="grid grid-cols-2 border-b border-white/[0.06] text-sm font-medium">
              <div className="px-6 py-3 text-[#61646b]">Manual editing tools</div>
              <div className="border-l border-white/[0.06] px-6 py-3 text-[#7c3aed]">ReelStack</div>
            </div>
            {contrastRows.map((row, i) => (
              <div
                key={i}
                className={`grid grid-cols-2 text-sm ${i < contrastRows.length - 1 ? 'border-b border-white/[0.06]' : ''}`}
              >
                <div className="px-6 py-4 text-[#94979e]">{row.capcut}</div>
                <div className="border-l border-white/[0.06] px-6 py-4 text-white">
                  {row.reelstack}
                </div>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ── Alternating Feature Sections ── */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-28">
        {alternatingFeatures.map((feature, i) => (
          <FadeIn key={feature.category}>
            <div
              className={`flex flex-col gap-10 py-16 lg:flex-row lg:items-center lg:gap-16 ${i % 2 === 1 ? 'lg:flex-row-reverse' : ''} ${i < alternatingFeatures.length - 1 ? 'border-b border-white/[0.06]' : ''}`}
            >
              <div className="flex-1">
                <p className="text-sm font-medium uppercase tracking-widest text-[#7c3aed]">
                  {feature.category}
                </p>
                <h3 className="mt-3 text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">
                  {feature.heading}
                </h3>
                <p className="mt-4 leading-relaxed text-[#94979e]">{feature.description}</p>
              </div>
              <div
                className="flex h-64 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06]"
                style={{ backgroundColor: '#10111a' }}
              >
                {/* AI Director: render progress */}
                {feature.category === 'AI Director' && <RenderProgress />}
                {/* Captions: waveform + karaoke */}
                {feature.category === 'Captions' && (
                  <div className="flex flex-col items-center gap-5 px-4">
                    <Waveform bars={32} />
                    <KaraokeDemo
                      words={[
                        'Five',
                        'tips',
                        'to',
                        'hook',
                        'viewers',
                        'in',
                        'the',
                        'first',
                        'three',
                        'seconds.',
                      ]}
                      className="text-sm sm:text-base"
                    />
                  </div>
                )}
                {/* API-First: terminal typing */}
                {feature.category === 'API-First' && <TerminalDemo className="mx-4 w-full" />}
                {/* Self-Hosted: Docker compose animation */}
                {feature.category === 'Self-Hosted' && (
                  <div className="px-6 font-mono text-xs leading-relaxed text-[#94979e]">
                    <p className="text-[#28c840]">$ docker compose up -d</p>
                    <p className="mt-1 text-[#61646b]">
                      Creating reelstack-redis-1 ... <span className="text-[#28c840]">done</span>
                    </p>
                    <p className="text-[#61646b]">
                      Creating reelstack-web-1 ... <span className="text-[#28c840]">done</span>
                    </p>
                    <p className="text-[#61646b]">
                      Creating reelstack-worker-1 ... <span className="text-[#28c840]">done</span>
                    </p>
                    <p className="text-[#61646b]">
                      Creating reelstack-nginx-1 ... <span className="text-[#28c840]">done</span>
                    </p>
                    <p className="mt-2 text-white">4 containers running on your VPS.</p>
                  </div>
                )}
              </div>
            </div>
          </FadeIn>
        ))}
      </section>

      {/* ── Founder Letter ── */}
      <section className="border-y border-white/[0.06] py-28">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-[#61646b]">
            From the founder
          </p>
          <FadeIn>
            <blockquote className="mt-8 text-lg italic leading-relaxed text-[#94979e]">
              I built ReelStack because I was spending 4 hours editing a 30-second reel. I knew the
              script. I knew the style. I just needed a machine to assemble the pieces. So I wrote
              one. ReelStack started as a bash script, grew into a Remotion pipeline, and now it is
              an open platform that anyone can extend. If you make content at scale, this is for
              you.
            </blockquote>
          </FadeIn>
          <FadeIn delay={200}>
            <p className="mt-6 text-sm font-medium text-white">Pawel Jurczyk</p>
            <p className="text-xs text-[#61646b]">Creator of ReelStack</p>
          </FadeIn>
        </div>
      </section>

      {/* ── Features Grid + Reel Showcase ── */}
      <section className="mx-auto max-w-6xl px-6 py-28">
        <p className="text-center text-sm font-medium uppercase tracking-widest text-[#61646b]">
          Everything included
        </p>
        <h2 className="mt-4 text-center text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">
          One Platform, Every Building Block
        </h2>
        <div className="mt-14 flex flex-col items-center gap-12 lg:flex-row lg:items-start">
          {/* Reel preview: a phone showing actual effects */}
          <FadeIn className="flex-shrink-0">
            <ReelEffectsShowcase />
          </FadeIn>
          {/* Feature cards */}
          <Stagger staggerMs={80} className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gridFeatures.map((f) => (
              <GlowCard
                key={f.title}
                className="rounded-xl border border-white/[0.06] transition-colors duration-200 hover:border-white/[0.12]"
              >
                <div className="p-6">
                  <h3 className="text-sm font-semibold text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#94979e]">{f.desc}</p>
                </div>
              </GlowCard>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── Film Strip (scroll-driven) ── */}
      <FilmStrip className="py-8" />

      {/* ── Proof Points (real numbers, no fake testimonials) ── */}
      <section className="border-y border-white/[0.06] py-28">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-center text-sm font-medium uppercase tracking-widest text-[#61646b]">
            By the numbers
          </p>
          <h2 className="mt-4 text-center text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">
            Built for Speed, Cost, and Control
          </h2>
          <Stagger staggerMs={100} className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {proofPoints.map((p) => (
              <TiltCard key={p.label}>
                <GlowCard className="h-full rounded-xl border border-white/[0.06] transition-colors duration-200 hover:border-white/[0.12]">
                  <div className="p-6">
                    <p className="text-2xl font-bold tracking-tight text-[#7c3aed]">{p.metric}</p>
                    <p className="mt-1 text-sm font-medium text-white">{p.label}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[#94979e]">{p.detail}</p>
                  </div>
                </GlowCard>
              </TiltCard>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── Logo Bar (Integrations) ── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-center text-sm font-medium uppercase tracking-widest text-[#61646b]">
          Integrations
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {integrations.map((name) => (
            <span
              key={name}
              className="text-sm font-medium text-[#61646b] transition-colors duration-200 hover:text-[#94979e]"
            >
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-28">
        <p className="text-center text-sm font-medium uppercase tracking-widest text-[#61646b]">
          FAQ
        </p>
        <h2 className="mt-4 text-center text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">
          Questions You Are Probably Asking
        </h2>
        <div className="mt-14 divide-y divide-white/[0.06]">
          {faqs.map((faq) => (
            <details key={faq.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-white transition-colors duration-200 hover:text-[#7c3aed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/50">
                {faq.q}
                <span className="ml-4 text-[#61646b] transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-[#94979e]">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">
            Your First Reel Is 60 Seconds Away
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[#94979e]">
            Free tier. No credit card. 3 full renders to see if ReelStack fits your workflow.
          </p>
          <div className="mt-10">
            <Link
              href="/dashboard/reel/new"
              className="rounded-full bg-[#7c3aed] px-8 py-3.5 text-base font-medium text-white transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/50 active:opacity-80"
            >
              Start Free
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <p className="text-lg font-semibold tracking-tight text-white">ReelStack</p>
            <p className="mt-2 text-sm leading-relaxed text-[#61646b]">
              Open source AI video pipeline. Script to MP4 in seconds.
            </p>
          </div>
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <p className="text-sm font-medium text-[#94979e]">{category}</p>
              <ul className="mt-3 space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-[#61646b] transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-12 max-w-6xl border-t border-white/[0.06] px-6 pt-6 text-xs text-[#61646b]">
          &copy; {new Date().getFullYear()} ReelStack. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
