'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const params = useSearchParams();
  const hasAuthError = params.get('error') === '1';

  // Redirect if already logged in
  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: sbError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (sbError) {
      setError(sbError.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: '32px 28px',
        }}
      >
        {/* Logo */}
        <div
          style={{
            fontFamily: 'var(--ff-dm-sans, sans-serif)',
            fontWeight: 800,
            fontSize: 28,
            color: 'var(--accent)',
            letterSpacing: '-0.04em',
            marginBottom: 8,
          }}
        >
          FocusFlow
        </div>
        <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 28 }}>
          Sign in to sync your tasks across devices.
        </p>

        {hasAuthError && !sent && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--error)',
              background: 'rgba(192,48,48,0.08)',
              border: '1px solid var(--error)',
              borderRadius: 'var(--r)',
              padding: '8px 12px',
              marginBottom: 16,
            }}
          >
            Authentication failed. Please try again.
          </div>
        )}

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--t1)',
                marginBottom: 8,
              }}
            >
              Check your email
            </div>
            <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.5 }}>
              We sent a magic link to <strong>{email}</strong>. Click it to sign in.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              style={{
                marginTop: 20,
                fontSize: 12,
                color: 'var(--t3)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--error)',
                  background: 'rgba(192,48,48,0.08)',
                  border: '1px solid var(--error)',
                  borderRadius: 'var(--r)',
                  padding: '8px 12px',
                }}
              >
                {error}
              </div>
            )}
            <div>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  fontSize: 10,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--t2)',
                  marginBottom: 4,
                }}
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                autoComplete="email"
                style={{ width: '100%' }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--r)',
                background: 'var(--accent)',
                color: 'var(--accent-text)',
                border: 'none',
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
                fontSize: 14,
                fontWeight: 600,
                minHeight: 44,
                letterSpacing: '0.02em',
              }}
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}

        <p
          style={{
            fontSize: 11,
            color: 'var(--t3)',
            textAlign: 'center',
            marginTop: 24,
          }}
        >
          Passwordless sign-in — no account setup required.
          <br />
          Works offline; sync happens in the background.
        </p>
      </div>
    </div>
  );
}
