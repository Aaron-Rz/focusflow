'use client';

/** Shared presentational pieces for the /auth/* pages. */

export function AuthCard({
  title, subtitle, children,
}: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg)', padding: '24px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 360, background: 'var(--bg-1)',
        border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '32px 28px',
      }}>
        <div style={{
          fontFamily: 'var(--ff-dm-sans, sans-serif)', fontWeight: 800, fontSize: 28,
          color: 'var(--accent)', letterSpacing: '-0.04em', marginBottom: 8,
        }}>
          FocusFlow
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>
          {title}
        </div>
        <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 24 }}>{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 10, letterSpacing: '0.05em',
        textTransform: 'uppercase', color: 'var(--t2)', marginBottom: 4,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12, color: 'var(--error)', background: 'rgba(192,48,48,0.08)',
      border: '1px solid var(--error)', borderRadius: 'var(--r)',
      padding: '8px 12px', marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--accent)',
        color: 'var(--accent-text)', border: 'none',
        cursor: props.disabled ? 'default' : 'pointer', opacity: props.disabled ? 0.6 : 1,
        fontSize: 14, fontWeight: 600, minHeight: 44, letterSpacing: '0.02em',
      }}
    />
  );
}

export function OAuthButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        width: '100%', padding: '11px 16px', borderRadius: 'var(--r)',
        background: 'transparent', color: 'var(--t1)',
        border: '1px solid var(--border)',
        cursor: props.disabled ? 'default' : 'pointer', opacity: props.disabled ? 0.6 : 1,
        fontSize: 14, fontWeight: 600, minHeight: 44, marginBottom: 8,
      }}
    />
  );
}

export function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: 11, color: 'var(--t3)' }}>or</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}
