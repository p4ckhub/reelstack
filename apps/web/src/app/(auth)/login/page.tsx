'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function LoginForm() {
  const searchParams = useSearchParams();
  const isVerify = searchParams.get('verify') === '1';

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(isVerify);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const altchaRef = useRef<HTMLElement & { value?: string }>(null);

  // Load Altcha web component from CDN (self-hosted, no API key required)
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://eu.altcha.org/js/latest/altcha.min.js';
    script.async = true;
    script.type = 'module';
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Verify Altcha proof-of-work
    const altchaPayload = altchaRef.current?.value;
    if (!altchaPayload) {
      setError('Please complete the verification.');
      return;
    }

    const verification = await fetch('/api/auth/altcha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: altchaPayload }),
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
  };

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
            {/* Altcha proof-of-work widget — no API key, no external service */}
            <altcha-widget
              ref={altchaRef}
              challengeurl="/api/auth/altcha"
              style={{ display: 'block' }}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send magic link'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              No password needed. We&apos;ll email you a sign-in link.
            </p>
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
