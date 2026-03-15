import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Start free, scale as you grow. Solo $9/mo · Pro $24/mo · Agency $79/mo. Every render costs less than $0.01.',
  openGraph: {
    title: 'ReelStack Pricing — Start free, scale as you grow',
    description: 'Free forever · Solo $9/mo · Pro $24/mo · Agency $79/mo. No hidden fees.',
    url: '/pricing',
  },
};

const tiers = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Try ReelStack and see how it works.',
    features: [
      '3 renders/month',
      'Edge TTS voiceover',
      'Karaoke captions',
      'All effects',
      'Up to 100 MB uploads',
      'Watermark on output',
    ],
    cta: 'Get Started',
    href: '/login',
    highlight: false,
  },
  {
    name: 'Solo',
    price: '$9',
    period: '/month',
    description: 'For freelancers shipping content regularly.',
    features: [
      '30 renders/month',
      'No watermark',
      'Up to 500 MB uploads',
      'Up to 5 min duration',
      'API access',
    ],
    cta: 'Start Solo',
    href: '/login',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$24',
    period: '/month',
    description: 'For creators who ship daily.',
    features: [
      '100 renders/month',
      'No watermark',
      'ElevenLabs & OpenAI TTS',
      'Up to 2 GB uploads',
      'Up to 30 min duration',
      'YouTube 16:9 composition',
      'Priority render queue',
    ],
    cta: 'Start Pro',
    href: '/login',
    highlight: true,
  },
  {
    name: 'Agency',
    price: '$79',
    period: '/month',
    description: 'For teams and agencies at scale.',
    features: [
      '500 renders/month',
      'Everything in Pro',
      'Unlimited duration',
      'Up to 10 GB uploads',
      'Batch rendering',
      'White-label output',
      'Priority support',
    ],
    cta: 'Start Agency',
    href: '/login',
    highlight: false,
  },
];

const tokenPacks = [
  { tokens: 10, price: '$5', perRender: '$0.50', label: 'Starter' },
  { tokens: 50, price: '$19', perRender: '$0.38', label: 'Creator' },
  { tokens: 150, price: '$49', perRender: '$0.33', label: 'Pro' },
  { tokens: 500, price: '$129', perRender: '$0.26', label: 'Agency' },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Simple Pricing</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Start free. Scale as you grow. Every render costs us less than $0.01.
        </p>
      </div>

      <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`rounded-lg border p-6 ${tier.highlight ? 'border-primary ring-2 ring-primary' : ''}`}
          >
            <h2 className="text-lg font-semibold">{tier.name}</h2>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold">{tier.price}</span>
              {tier.period && <span className="text-sm text-muted-foreground">{tier.period}</span>}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>
            <ul className="mt-5 space-y-2">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-primary">&#10003;</span>
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href={tier.href}
              className={`mt-6 block rounded-md px-4 py-2 text-center text-sm font-medium ${
                tier.highlight
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'border hover:bg-muted'
              }`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>

      {/* Token packs */}
      <div className="mt-20 text-center">
        <h2 className="text-2xl font-bold">Need Extra Renders?</h2>
        <p className="mt-2 text-muted-foreground">
          Buy token packs on top of any plan. No expiration. Use when you need them.
        </p>
        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-4">
          {tokenPacks.map((pack) => (
            <div key={pack.tokens} className="rounded-lg border p-5 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{pack.label}</p>
              <p className="mt-2 text-3xl font-bold">{pack.tokens}</p>
              <p className="text-xs text-muted-foreground">renders</p>
              <p className="mt-3 text-lg font-semibold">{pack.price}</p>
              <p className="text-xs text-muted-foreground">{pack.perRender}/render</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
