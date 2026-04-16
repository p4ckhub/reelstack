'use client';

import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';

/* ── Scroll-triggered fade-in ──────────────────────────────────── */

export function FadeIn({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Staggered children (each child fades in sequentially) ───── */

export function Stagger({
  children,
  staggerMs = 100,
  className = '',
}: {
  children: ReactNode[];
  staggerMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children.map((child, i) => (
        <div
          key={i}
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
            transition: `opacity 0.5s ease ${i * staggerMs}ms, transform 0.5s ease ${i * staggerMs}ms`,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/* ── Animated counter ─────────────────────────────────────────── */

export function CountUp({
  target,
  suffix = '',
  className = '',
}: {
  target: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const duration = 1200;
    const steps = 40;
    const increment = target / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(interval);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(interval);
  }, [started, target]);

  return (
    <span ref={ref} className={className}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ── Glow card (hover effect) ─────────────────────────────────── */

export function GlowCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--glow-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--glow-y', `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      className={`group relative overflow-hidden ${className}`}
      style={{
        backgroundColor: '#10111a',
      }}
    >
      {/* Radial glow that follows cursor */}
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(300px circle at var(--glow-x, 50%) var(--glow-y, 50%), rgba(124, 58, 237, 0.12), transparent 60%)',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

/* ── Pulse badge ──────────────────────────────────────────────── */

export function PulseBadge({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative inline-block ${className}`}>
      <div className="absolute -inset-0.5 animate-pulse rounded-full bg-[#7c3aed]/20" />
      <div className="relative">{children}</div>
    </div>
  );
}

/* ── Karaoke Caption Demo ────────────────────────────────────── */
/* Words highlight one-by-one like the actual product feature.    */

const DEFAULT_KARAOKE_WORDS = [
  'Stop',
  'editing',
  'manually.',
  'Let',
  'AI',
  'render',
  'your',
  'next',
  'viral',
  'reel.',
];

export function KaraokeDemo({ words, className = '' }: { words?: string[]; className?: string }) {
  // Memoize so the same prop value produces the same array identity across
  // renders — lets the effect depend on it without re-running on every render.
  const DEMO_WORDS = useMemo(() => words ?? DEFAULT_KARAOKE_WORDS, [words]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          observer.disconnect();
          let i = 0;
          const tick = () => {
            setActiveIdx(i);
            i++;
            if (i < DEMO_WORDS.length) {
              setTimeout(tick, DEMO_WORDS[i] === '' ? 600 : 180);
            } else {
              setTimeout(() => {
                started.current = false;
                setActiveIdx(-1);
                i = 0;
                setTimeout(tick, 1200);
              }, 2000);
            }
          };
          setTimeout(tick, 400);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [DEMO_WORDS]);

  return (
    <div
      ref={ref}
      className={`flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 ${className}`}
    >
      {DEMO_WORDS.map((word, i) =>
        word === '' ? (
          <div key={i} className="w-full" />
        ) : (
          <span
            key={i}
            className="rounded px-1 py-0.5 text-lg font-bold tracking-tight transition-colors duration-150 sm:text-xl"
            style={{
              color: i <= activeIdx ? '#ffffff' : '#61646b',
              backgroundColor: i === activeIdx ? 'rgba(124, 58, 237, 0.25)' : 'transparent',
            }}
          >
            {word}
          </span>
        )
      )}
    </div>
  );
}

/* ── Terminal Typing ─────────────────────────────────────────── */
/* Simulates a curl command being typed, then a JSON response.    */

const COMMAND = 'curl -X POST reelstack.app/api/v1/reel/generate \\';
const COMMAND2 = '  -d \'{"script": "5 tips for better reels"}\'';
const RESPONSE = `{
  "jobId": "b65ce656-9823...",
  "status": "queued",
  "pollUrl": "/api/v1/reel/render/b65ce..."
}`;

export function TerminalDemo({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [showResponse, setShowResponse] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          observer.disconnect();
          let i = 0;
          const typeLine1 = () => {
            if (i <= COMMAND.length) {
              setLine1(COMMAND.slice(0, i));
              i++;
              setTimeout(typeLine1, 25 + Math.random() * 20);
            } else {
              i = 0;
              setTimeout(typeLine2, 100);
            }
          };
          const typeLine2 = () => {
            if (i <= COMMAND2.length) {
              setLine2(COMMAND2.slice(0, i));
              i++;
              setTimeout(typeLine2, 25 + Math.random() * 20);
            } else {
              setShowCursor(false);
              setTimeout(() => setShowResponse(true), 400);
            }
          };
          setTimeout(typeLine1, 600);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`overflow-hidden rounded-xl border border-white/[0.06] font-mono text-xs sm:text-sm ${className}`}
      style={{ backgroundColor: '#0c0c14' }}
    >
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-2">
        <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[10px] text-[#61646b]">terminal</span>
      </div>
      <div className="p-4 leading-relaxed">
        <div className="text-[#94979e]">
          <span className="text-[#28c840]">$</span> {line1}
          {!line2 && showCursor && <span className="animate-pulse text-white">|</span>}
        </div>
        {line2 && (
          <div className="text-[#94979e]">
            {line2}
            {showCursor && <span className="animate-pulse text-white">|</span>}
          </div>
        )}
        {showResponse && (
          <div
            className="mt-3 border-t border-white/[0.06] pt-3"
            style={{
              opacity: 1,
              animation: 'fadeSlideIn 0.4s ease',
            }}
          >
            <div className="mb-1 text-[10px] text-[#28c840]">HTTP 201 Created</div>
            <pre className="text-[#7c3aed]">{RESPONSE}</pre>
          </div>
        )}
      </div>
      <style>{`@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

/* ── Render Progress ─────────────────────────────────────────── */
/* Animated circular progress like a real render job.              */

export function RenderProgress({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(0);
  const [status, setStatus] = useState('Waiting...');
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          observer.disconnect();

          const stages = [
            { to: 15, label: 'Generating voice...', ms: 800 },
            { to: 30, label: 'Transcribing...', ms: 600 },
            { to: 55, label: 'AI Director planning...', ms: 1200 },
            { to: 75, label: 'Generating B-roll...', ms: 1000 },
            { to: 90, label: 'Rendering frames...', ms: 800 },
            { to: 100, label: 'Done.', ms: 400 },
          ];

          let stageIdx = 0;
          const runStage = () => {
            if (stageIdx >= stages.length) {
              setTimeout(() => {
                started.current = false;
                setPct(0);
                setStatus('Waiting...');
                stageIdx = 0;
                setTimeout(runStage, 2000);
              }, 2500);
              return;
            }
            const stage = stages[stageIdx];
            setStatus(stage.label);

            const steps = 20;
            const startPct = stageIdx === 0 ? 0 : stages[stageIdx - 1].to;
            const inc = (stage.to - startPct) / steps;
            let current = startPct;
            const interval = setInterval(() => {
              current += inc;
              if (current >= stage.to) {
                setPct(stage.to);
                clearInterval(interval);
                stageIdx++;
                setTimeout(runStage, 200);
              } else {
                setPct(Math.floor(current));
              }
            }, stage.ms / steps);
          };
          setTimeout(runStage, 500);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div ref={ref} className={`flex flex-col items-center gap-4 ${className}`}>
      <div className="relative h-32 w-32">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={pct >= 100 ? '#28c840' : '#7c3aed'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-white">{pct}%</span>
        </div>
      </div>
      <p className="h-5 text-xs text-[#94979e]">{status}</p>
    </div>
  );
}

/* ── Waveform ────────────────────────────────────────────────── */
/* Animated audio bars that pulse when in view.                    */

export function Waveform({ bars = 32, className = '' }: { bars?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [mouseX, setMouseX] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), {
      threshold: 0.3,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMouseX((e.clientX - rect.left) / rect.width); // 0..1
  }, []);

  const handleMouseLeave = useCallback(() => setMouseX(null), []);

  return (
    <div
      ref={ref}
      className={`flex items-end justify-center gap-[2px] cursor-pointer ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const t = i / (bars - 1); // 0..1 position along bar array
        const baseH = 20 + Math.sin(i * 0.7) * 15 + Math.cos(i * 1.3) * 10;

        // Mouse proximity boost: gaussian bell centered on mouseX
        let hoverBoost = 0;
        if (mouseX !== null) {
          const dist = Math.abs(t - mouseX);
          hoverBoost = Math.exp(-(dist * dist) / 0.015) * 28; // peak +28px
        }

        const height = active ? baseH + hoverBoost : 4;
        const baseOpacity = active ? 0.4 + Math.sin(i * 0.5) * 0.3 : 0.15;
        const opacity =
          mouseX !== null
            ? baseOpacity + Math.exp(-((t - mouseX) ** 2) / 0.015) * 0.5
            : baseOpacity;

        return (
          <div
            key={i}
            className="w-1 rounded-full"
            style={{
              height: `${height}px`,
              backgroundColor: '#7c3aed',
              opacity: Math.min(1, opacity),
              transition:
                mouseX !== null
                  ? `height 0.08s ease, opacity 0.08s ease`
                  : `height 0.6s ease ${i * 20}ms, opacity 0.6s ease ${i * 20}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ── Gradient Mesh Background ────────────────────────────────── */
/* Slowly morphing colored blobs behind the hero. Pure CSS.        */

export function GradientMesh({ className = '' }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <div
        className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full opacity-[0.07]"
        style={{
          background: 'radial-gradient(circle, #7c3aed, transparent 70%)',
          animation: 'meshFloat 12s ease-in-out infinite',
        }}
      />
      <div
        className="absolute -right-1/4 top-1/3 h-[500px] w-[500px] rounded-full opacity-[0.05]"
        style={{
          background: 'radial-gradient(circle, #2563eb, transparent 70%)',
          animation: 'meshFloat 15s ease-in-out infinite reverse',
        }}
      />
      <div
        className="absolute -bottom-1/4 left-1/3 h-[400px] w-[400px] rounded-full opacity-[0.04]"
        style={{
          background: 'radial-gradient(circle, #7c3aed, transparent 70%)',
          animation: 'meshFloat 18s ease-in-out infinite 3s',
        }}
      />
      <style>{`
        @keyframes meshFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -40px) scale(1.05); }
          66% { transform: translate(-20px, 30px) scale(0.95); }
        }
      `}</style>
    </div>
  );
}

/* ── 3D Tilt Card ────────────────────────────────────────────── */
/* Card tilts toward cursor on hover. Transform only = performant. */

export function TiltCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(600px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) scale(1.02)`;
  }, []);

  const handleLeave = useCallback(() => {
    const el = ref.current;
    if (el) el.style.transform = 'perspective(600px) rotateY(0deg) rotateX(0deg) scale(1)';
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={className}
      style={{ transition: 'transform 0.3s ease', transformStyle: 'preserve-3d' }}
    >
      {children}
    </div>
  );
}

/* ── Word Rotator ────────────────────────────────────────────── */
/* Cycles through words with a slide-up animation.                 */

export function WordRotator({
  words,
  intervalMs = 2400,
  className = '',
}: {
  words: string[];
  intervalMs?: number;
  className?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const measuredRef = useRef<HTMLSpanElement>(null);

  // Lock container width to the widest word so layout never shifts
  useEffect(() => {
    if (!containerRef.current || !measuredRef.current) return;
    let maxWidth = 0;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;';
    // Inherit computed font so measurement matches real render
    const computed = window.getComputedStyle(measuredRef.current);
    probe.style.font = computed.font;
    probe.style.letterSpacing = computed.letterSpacing;
    document.body.appendChild(probe);
    for (const word of words) {
      probe.textContent = word;
      maxWidth = Math.max(maxWidth, probe.offsetWidth);
    }
    document.body.removeChild(probe);
    containerRef.current.style.minWidth = `${maxWidth}px`;
  }, [words]);

  useEffect(() => {
    const timer = setInterval(() => {
      setAnimating(true);
      setTimeout(() => {
        setIdx((prev) => (prev + 1) % words.length);
        setAnimating(false);
      }, 300);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [words.length, intervalMs]);

  return (
    <span
      ref={containerRef}
      className={`relative inline-block overflow-hidden text-center align-bottom ${className}`}
    >
      <span
        ref={measuredRef}
        aria-hidden
        className="pointer-events-none absolute opacity-0 whitespace-nowrap"
      >
        {words[0]}
      </span>
      <span
        className="inline-block whitespace-nowrap"
        style={{
          transform: animating ? 'translateY(-110%)' : 'translateY(0)',
          opacity: animating ? 0 : 1,
          transition: 'transform 0.3s ease, opacity 0.3s ease',
        }}
      >
        {words[idx]}
      </span>
    </span>
  );
}

/* ── Film Strip ──────────────────────────────────────────────── */
/* Horizontal scrolling "frames" that move with page scroll.       */

const FRAME_COLORS = [
  'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
  'linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)',
  'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
  'linear-gradient(135deg, #059669 0%, #2563eb 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
  'linear-gradient(135deg, #ec4899 0%, #f59e0b 100%)',
  'linear-gradient(135deg, #06b6d4 0%, #7c3aed 100%)',
];

export function FilmStrip({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewH = window.innerHeight;
      if (rect.top < viewH && rect.bottom > 0) {
        const progress = (viewH - rect.top) / (viewH + rect.height);
        setOffset(progress * 300);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={ref} className={`overflow-hidden ${className}`}>
      <div
        className="flex gap-3"
        style={{ transform: `translateX(-${offset}px)`, transition: 'transform 0.1s linear' }}
      >
        {FRAME_COLORS.concat(FRAME_COLORS).map((bg, i) => (
          <div
            key={i}
            className="h-20 w-36 flex-shrink-0 rounded-lg opacity-60"
            style={{ background: bg }}
          >
            <div className="flex h-full items-center justify-center font-mono text-[10px] text-white/40">
              {String((i % 8) + 1).padStart(2, '0')}:00
            </div>
          </div>
        ))}
      </div>
      {/* Sprocket holes */}
      <div
        className="mt-1 flex gap-3"
        style={{ transform: `translateX(-${offset}px)`, transition: 'transform 0.1s linear' }}
      >
        {Array.from({ length: 32 }).map((_, i) => (
          <div key={i} className="h-1.5 w-3 flex-shrink-0 rounded-sm bg-white/[0.06]" />
        ))}
      </div>
    </div>
  );
}

/* ── Reel Effects Showcase ───────────────────────────────────── */
/* Mini reel preview showing actual effects the product generates.  */

export function ReelEffectsShowcase({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          observer.disconnect();
          let s = 0;
          const cycle = () => {
            setStep(s % 5);
            s++;
            setTimeout(cycle, 2200);
          };
          setTimeout(cycle, 500);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`relative mx-auto h-[420px] w-[236px] overflow-hidden rounded-2xl border border-white/[0.06] ${className}`}
      style={{ backgroundColor: '#0a0a12' }}
    >
      {/* Fake reel background gradient */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, #1a0a2e 0%, #0a0a12 50%, #0c1420 100%)' }}
      />

      {/* Effect 1: Text Card (title slide) */}
      <div
        className="absolute inset-0 flex items-center justify-center p-6"
        style={{
          opacity: step === 0 ? 1 : 0,
          transform: step === 0 ? 'scale(1)' : 'scale(0.9)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}
      >
        <div className="text-center">
          <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-[#7c3aed]">
            Tip #3
          </div>
          <p className="text-lg font-bold leading-tight text-white">
            Stop wasting time
            <br />
            on manual edits
          </p>
          <div className="mx-auto mt-3 h-0.5 w-8 rounded bg-[#7c3aed]" />
        </div>
      </div>

      {/* Effect 2: Karaoke caption on "footage" */}
      <div
        className="absolute inset-0 flex flex-col justify-end p-4"
        style={{
          opacity: step === 1 ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}
      >
        <div className="mb-20 text-center">
          <span className="rounded bg-black/60 px-2 py-1 text-sm font-bold text-white">
            automate <span className="text-[#7c3aed]">everything</span>
          </span>
        </div>
      </div>

      {/* Effect 3: Punch-in zoom */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          opacity: step === 2 ? 1 : 0,
          transform: step === 2 ? 'scale(1.15)' : 'scale(1)',
          transition: 'opacity 0.4s ease, transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <div className="rounded-xl bg-white/5 p-6 backdrop-blur-sm">
          <p className="text-2xl font-bold text-white">19</p>
          <p className="text-xs text-[#94979e]">AI tools</p>
        </div>
      </div>

      {/* Effect 4: Lower third */}
      <div
        className="absolute bottom-16 left-0 right-0 px-4"
        style={{
          opacity: step === 3 ? 1 : 0,
          transform: step === 3 ? 'translateX(0)' : 'translateX(-20px)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
        }}
      >
        <div className="rounded-lg bg-black/70 px-3 py-2 backdrop-blur-sm">
          <p className="text-xs font-bold text-white">Pawel Jurczyk</p>
          <p className="text-[10px] text-[#94979e]">Creator of ReelStack</p>
        </div>
      </div>

      {/* Effect 5: CTA overlay */}
      <div
        className="absolute bottom-16 left-0 right-0 flex justify-center px-4"
        style={{
          opacity: step === 4 ? 1 : 0,
          transform: step === 4 ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
        }}
      >
        <div className="rounded-full bg-[#7c3aed] px-4 py-1.5 text-xs font-medium text-white">
          Try it free &rarr;
        </div>
      </div>

      {/* Step indicator dots */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
        {[0, 1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className="h-1 rounded-full transition-all duration-300"
            style={{
              width: step === s ? '16px' : '4px',
              backgroundColor: step === s ? '#7c3aed' : 'rgba(255,255,255,0.2)',
            }}
          />
        ))}
      </div>

      {/* Effect labels */}
      <div className="absolute left-0 right-0 top-3 text-center">
        <span className="rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-medium text-[#94979e] backdrop-blur-sm">
          {['text-card', 'karaoke', 'punch-zoom', 'lower-third', 'cta-overlay'][step]}
        </span>
      </div>

      {/* Phone-like frame */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/[0.08]" />
    </div>
  );
}

/* ── Spotlight Cursor ────────────────────────────────────────── */
/* Radial light that follows the mouse across the hero section.    */

export function SpotlightCursor({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    const handleMove = (e: MouseEvent) => {
      const rect = parent.getBoundingClientRect();
      el.style.opacity = '1';
      el.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`;
    };
    const handleLeave = () => {
      el.style.opacity = '0';
    };

    parent.addEventListener('mousemove', handleMove);
    parent.addEventListener('mouseleave', handleLeave);
    return () => {
      parent.removeEventListener('mousemove', handleMove);
      parent.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 ${className}`}
      style={{
        width: '600px',
        height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124, 58, 237, 0.08) 0%, transparent 70%)',
        opacity: 0,
        transition: 'opacity 0.3s ease',
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  );
}

/* ── Magnetic Button ─────────────────────────────────────────── */
/* CTA button that subtly pulls toward the cursor when nearby.     */

export function MagneticButton({
  children,
  className = '',
  href,
}: {
  children: ReactNode;
  className?: string;
  href: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  const handleMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 120) {
      const pull = (120 - dist) / 120;
      el.style.transform = `translate(${dx * pull * 0.3}px, ${dy * pull * 0.3}px)`;
    }
  }, []);

  const handleLeave = useCallback(() => {
    const el = ref.current;
    if (el) el.style.transform = 'translate(0, 0)';
  }, []);

  return (
    <a
      ref={ref}
      href={href}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={className}
      style={{ transition: 'transform 0.2s ease' }}
    >
      {children}
    </a>
  );
}

/* ── Render Timeline (scroll progress) ───────────────────────── */
/* Thin bar at the top of the page styled as a render progress.    */

export function RenderTimeline() {
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState('');

  useEffect(() => {
    const handleScroll = () => {
      const scrollH = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollH > 0 ? window.scrollY / scrollH : 0;
      setPct(progress * 100);

      if (progress < 0.15) setStage('Script');
      else if (progress < 0.3) setStage('Voice');
      else if (progress < 0.5) setStage('AI Director');
      else if (progress < 0.75) setStage('Rendering');
      else if (progress < 0.95) setStage('Finishing');
      else setStage('Done');
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fixed left-0 right-0 top-0 z-[60]">
      <div className="h-0.5 w-full" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
        <div
          className="h-full rounded-r-full"
          style={{
            width: `${pct}%`,
            backgroundColor: pct >= 99 ? '#28c840' : '#7c3aed',
            transition: 'width 0.1s linear, background-color 0.3s ease',
          }}
        />
      </div>
      {pct > 2 && pct < 98 && (
        <div
          className="absolute top-1.5 font-mono text-[9px] text-[#61646b]"
          style={{ left: `min(${pct}%, calc(100% - 80px))`, transition: 'left 0.1s linear' }}
        >
          {stage} {Math.floor(pct)}%
        </div>
      )}
    </div>
  );
}

/* ── Interactive Pipeline Step ───────────────────────────────── */
/* Hovering a step expands a preview of what happens at that stage. */

const STEP_PREVIEWS: Record<string, { visual: string; detail: string }> = {
  Script: {
    visual: '"5 tips for better reels\\nTip 1: Hook in 3 seconds..."',
    detail: 'Plain text in, any language',
  },
  Voice: { visual: '~~ generating 24s audio ~~', detail: 'ElevenLabs, Edge TTS, or OpenAI' },
  Captions: { visual: 'Stop | editing | manually', detail: 'whisper.cpp word-level timestamps' },
  'AI Director': {
    visual: 'shot-1: seedance, shot-2: pexels...',
    detail: 'Claude picks tools, effects, timing',
  },
  Render: { visual: 'frame 1/720 ... frame 720/720', detail: 'Remotion + Lambda = MP4 in seconds' },
};

export function InteractivePipelineStep({
  label,
  stepNum,
  icon,
  desc,
  children,
}: {
  label: string;
  stepNum: number;
  icon: string;
  desc: string;
  children?: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const preview = STEP_PREVIEWS[label];

  return (
    <div
      className="relative rounded-xl border border-white/[0.06] p-5 text-center transition-all duration-300"
      style={{
        backgroundColor: hovered ? '#14152a' : '#10111a',
        borderColor: hovered ? 'rgba(124, 58, 237, 0.3)' : 'rgba(255,255,255,0.06)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="mb-3 text-xs font-medium text-[#7c3aed]">0{stepNum}</div>
      <div className="mb-2 text-2xl" dangerouslySetInnerHTML={{ __html: icon }} />
      <p className="text-sm font-semibold text-white">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-[#61646b]">{desc}</p>
      {children}

      {/* Expanded preview on hover */}
      {preview && (
        <div
          className="mt-3 overflow-hidden"
          style={{
            maxHeight: hovered ? '80px' : '0',
            opacity: hovered ? 1 : 0,
            transition: 'max-height 0.3s ease, opacity 0.3s ease',
          }}
        >
          <div className="rounded-md border-t border-white/[0.06] pt-2 font-mono text-[10px] leading-relaxed text-[#7c3aed]">
            {preview.visual}
          </div>
        </div>
      )}
    </div>
  );
}
