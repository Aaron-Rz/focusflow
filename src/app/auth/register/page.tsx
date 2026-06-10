'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import {
  AuthCard, Field, ErrorBox, PrimaryButton,
} from '@/components/auth-ui';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentConfirmation, setSentConfirmation] = useState(false);

  const validate = (): string | null => {
    if (!USERNAME_RE.test(username.trim())) {
      return 'Username must be 3–20 characters: letters, numbers or underscore.';
    }
    if (password.length < 8) {
      return 'Password must be at least 8 characters.';
    }
    if (password !== confirm) {
      return 'Passwords do not match.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const cleanName = username.trim();

    // 1. Check username availability (anon-callable RPC).
    const { data: available, error: rpcError } = await supabase.rpc(
      'username_available', { check_name: cleanName },
    );
    if (rpcError) {
      setLoading(false);
      setError(rpcError.message);
      return;
    }
    if (!available) {
      setLoading(false);
      setError('That username is already taken.');
      return;
    }

    // 2. Sign up. The username travels in user metadata so the DB trigger can
    //    create the profile with it even when email confirmation is required.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username: cleanName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(
        /already registered|already exists/i.test(signUpError.message)
          ? 'An account with this email already exists.'
          : signUpError.message,
      );
      return;
    }

    // 3. If a session exists (email confirmation disabled), make sure the
    //    profile username matches the chosen one, then enter the app.
    if (data.session) {
      await supabase.from('profiles')
        .update({ username: cleanName })
        .eq('id', data.session.user.id);
      setLoading(false);
      router.replace('/');
    } else {
      // Email confirmation required.
      setLoading(false);
      setSentConfirmation(true);
    }
  };

  if (sentConfirmation) {
    return (
      <AuthCard title="Confirm your email" subtitle="One last step.">
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
          <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.5 }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to
            activate your account, then sign in.
          </p>
          <p style={{ marginTop: 20 }}>
            <Link href="/auth/login" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>
              Back to sign in
            </Link>
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your account" subtitle="Sign up to sync across all your devices.">
      {error && <ErrorBox>{error}</ErrorBox>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Email address">
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" required autoComplete="email"
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Username">
          <input
            type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder="3–20 chars: a–z, 0–9, _" required autoComplete="username"
            minLength={3} maxLength={20}
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Password">
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters" required autoComplete="new-password"
            minLength={8}
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Confirm password">
          <input
            type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter your password" required autoComplete="new-password"
            style={{ width: '100%' }}
          />
        </Field>
        <PrimaryButton type="submit" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </PrimaryButton>
      </form>

      <p style={{ fontSize: 13, color: 'var(--t2)', textAlign: 'center', marginTop: 20 }}>
        Already have an account?{' '}
        <Link href="/auth/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
