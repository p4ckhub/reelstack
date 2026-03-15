import { ImageResponse } from 'next/og';

// ── Brand tokens ──────────────────────────────────────────
const BG = '#0d0d0d';
const PRIMARY = '#818cf8'; // ≈ oklch(0.65 0.19 260)
const PRIMARY_RGBA = 'rgba(129, 140, 248,';
const TEXT = '#f5f5f5';
const MUTED = '#9ca3af';

export interface OgImageProps {
  /** Main heading (white) */
  title: string;
  /** Second heading line (primary color accent) */
  titleAccent?: string;
  /** Sub-text under the heading */
  description: string;
  /** Small tag shown next to the logo, e.g. "Pricing" */
  badge?: string;
  /** Optional tier pills, e.g. for pricing page */
  tiers?: { name: string; price?: string }[];
}

// ── Template ──────────────────────────────────────────────

function OgTemplate({ title, titleAccent, description, badge, tiers }: OgImageProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: BG,
        padding: '56px 72px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          backgroundImage: `linear-gradient(90deg, ${PRIMARY}, rgba(129,140,248,0))`,
        }}
      />

      {/* Logo + brand name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            backgroundImage: `linear-gradient(135deg, ${PRIMARY}, #a78bfa)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 700,
            color: '#fff',
          }}
        >
          RS
        </div>
        <span style={{ fontSize: 24, fontWeight: 600, color: TEXT }}>ReelStack</span>
        {badge && (
          <>
            <span style={{ color: MUTED, fontSize: 20 }}>·</span>
            <span style={{ fontSize: 20, color: MUTED }}>{badge}</span>
          </>
        )}
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Heading */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              color: TEXT,
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
            }}
          >
            {title}
          </div>
          {titleAccent && (
            <div
              style={{
                fontSize: 68,
                fontWeight: 700,
                color: PRIMARY,
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
              }}
            >
              {titleAccent}
            </div>
          )}
        </div>

        {/* Description */}
        <div style={{ fontSize: 23, color: MUTED, lineHeight: 1.55, maxWidth: 780 }}>
          {description}
        </div>

        {/* Tier pills (pricing page) */}
        {tiers && (
          <div style={{ display: 'flex', gap: 12 }}>
            {tiers.map((tier) => (
              <div
                key={tier.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 20px',
                  borderRadius: 100,
                  border: `1px solid ${PRIMARY_RGBA} 0.3)`,
                  backgroundColor: `${PRIMARY_RGBA} 0.08)`,
                }}
              >
                <span style={{ color: TEXT, fontWeight: 700, fontSize: 16 }}>{tier.name}</span>
                {tier.price && (
                  <span style={{ color: MUTED, fontSize: 14 }}>{tier.price}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pipeline footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {(['Script', 'TTS', 'Captions', 'Render'] as const).map((step, i) => (
          <span key={step} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {i > 0 && (
              <span style={{ color: PRIMARY, fontSize: 14, fontWeight: 600 }}>→</span>
            )}
            <span style={{ fontSize: 15, color: MUTED }}>{step}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Font loader (Inter from Bunny CDN, graceful fallback) ─

async function loadFonts(): Promise<
  { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[]
> {
  try {
    const base = 'https://fonts.bunny.net/inter/files';
    const [regular, bold] = await Promise.all([
      fetch(`${base}/inter-latin-400-normal.woff`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null),
      fetch(`${base}/inter-latin-700-normal.woff`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null),
    ]);
    const fonts: { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[] = [];
    if (regular) fonts.push({ name: 'Inter', data: regular, weight: 400, style: 'normal' });
    if (bold) fonts.push({ name: 'Inter', data: bold, weight: 700, style: 'normal' });
    return fonts;
  } catch {
    return [];
  }
}

// ── Public API ────────────────────────────────────────────

export async function createOgImage(props: OgImageProps): Promise<ImageResponse> {
  const fonts = await loadFonts();
  return new ImageResponse(<OgTemplate {...props} />, {
    width: 1200,
    height: 630,
    fonts,
  });
}
