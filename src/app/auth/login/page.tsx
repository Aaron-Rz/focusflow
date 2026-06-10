'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import {
  AuthCard, Field, ErrorBox, PrimaryButton, OAuthButton, Divider,
} from '@/components/auth-ui';

const APPLE_CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: sbError } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);
    if (sbError) {
      setError(
        sbError.message === 'Invalid login credentials'
          ? 'Incorrect email or password.'
          : sbError.message,
      );
    } else {
      router.replace('/');
    }
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setError('');
    setOauthLoading(provider);
    const { error: sbError } = await createClient().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (sbError) {
      setOauthLoading(null);
      setError(sbError.message);
    }
    // On success the browser navigates away to the provider.
  };

  return <AuthCard title="Welcome back" subtitle="Sign in to sync your tasks across devices.">
    {error && <ErrorBox>{error}</ErrorBox>}

    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="Email address">
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" required autoComplete="email"
          style={{ width: '100%' }}
        />
      </Field>
      <Field label="Password">
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••" required autoComplete="current-password"
          style={{ width: '100%' }}
        />
      </Field>
      <PrimaryButton type="submit" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </PrimaryButton>
    </form>

    <Divider />

    <OAuthButton onClick={() => handleOAuth('google')} disabled={oauthLoading !== null}>
      {oauthLoading === 'google' ? 'Redirecting…' : 'Continue with Google'}
    </OAuthButton>

    {APPLE_CLIENT_ID && (
      <OAuthButton onClick={() => handleOAuth('apple')} disabled={oauthLoading !== null}>
        {oauthLoading === 'apple' ? 'Redirecting…' : 'Continue with Apple'}
      </OAuthButton>
    )}

    <p style={{ fontSize: 13, color: 'var(--t2)', textAlign: 'center', marginTop: 20 }}>
      No account?{' '}
      <Link href="/auth/register" style={{ color: 'var(--accent)', fontWeight: 600 }}>
        Create one
      </Link>
    </p>
  </AuthCard>;
}
