'use client';

import {
  Suspense,
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/* ── Altcha wrapper (from official altcha-starter-react-ts) ── */

const Altcha = forwardRef<{ value: string | null }>((_props, ref) => {
  const widgetRef = useRef<HTMLElement & { value?: string }>(null);
  const [value, setValue] = useState<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      get value() {
        return value;
      },
    }),
    [value]
  );

  useEffect(() => {
    import('altcha');
  }, []);

  useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;
    const handler = (ev: Event) => {
      if ('detail' in ev) {
        setValue((ev as CustomEvent).detail.payload || null);
      }
    };
    el.addEventListener('statechange', handler);
    return () => el.removeEventListener('statechange', handler);
  }, []);

  return (
    <altcha-widget
      ref={widgetRef}
      configuration={JSON.stringify({
        challenge: '/api/auth/altcha',
        auto: 'onload',
        display: 'invisible',
      })}
    />
  );
});
Altcha.displayName = 'Altcha';

/* ── Login form ── */

function LoginForm() {
  const searchParams = useSearchParams();
  const isVerify = searchParams.get('verify') === '1';

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(isVerify);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const altchaRef = useRef<{ value: string | null }>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      const payload = altchaRef.current?.value;
      if (!payload) {
        setError('Security check in progress. Please wait a moment and try again.');
        return;
      }

      const verification = await fetch('/api/auth/altcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      })
        .then((r) => r.json())
        .catch(() => ({ ok: false }));

      if (!verification.ok) {
        setError('Verification failed. Please try again.');
        return;
      }

      setLoading(true);
      try {
        const result = await signIn('nodemailer', {
          email,
          redirect: false,
        });

        if (result?.error) {
          setError('Could not send magic link. Please try again.');
        } else {
          setSent(true);
        }
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [email]
  );

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Sign In</CardTitle>
        <p className="text-sm text-muted-foreground">to ReelStack</p>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4 text-center">
            <div className="rounded-md bg-green-500/10 p-4 text-sm text-green-600">
              Check your email for a sign-in link.
            </div>
            <p className="text-sm text-muted-foreground">
              We sent a magic link to <strong>{email || 'your email'}</strong>. Click the link to
              sign in. If you don&apos;t have an account, one will be created automatically.
            </p>
            <Button
              variant="ghost"
              className="text-sm"
              onClick={() => {
                setSent(false);
                setEmail('');
              }}
            >
              Use a different email
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <Altcha ref={altchaRef} />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send magic link'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              No password needed. We&apos;ll email you a sign-in link.
            </p>
            {process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === '1' && (
              <div className="border-t pt-4">
                <p className="mb-2 text-center text-xs text-yellow-600">
                  Dev mode: sign in without email
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={loading || !email}
                  onClick={async () => {
                    setError('');
                    setLoading(true);
                    try {
                      const result = await signIn('dev-login', {
                        email,
                        redirect: false,
                      });
                      if (result?.error) {
                        setError('Dev login failed.');
                      } else if (result?.ok) {
                        window.location.href = '/dashboard';
                      }
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Dev login (bypass magic link)
                </Button>
              </div>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
