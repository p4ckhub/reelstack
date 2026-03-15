import { createOgImage } from '@/lib/og/image';

export const runtime = 'nodejs';
export const revalidate = 86400;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return createOgImage({
    badge: 'Pricing',
    title: 'Start free.',
    titleAccent: 'Scale as you grow.',
    description: 'Every render costs us less than $0.01. Pass the savings on.',
    tiers: [
      { name: 'Free', price: 'forever' },
      { name: 'Solo', price: '$9/mo' },
      { name: 'Pro', price: '$24/mo' },
      { name: 'Agency', price: '$79/mo' },
    ],
  });
}
