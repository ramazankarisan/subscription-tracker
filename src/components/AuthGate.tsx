/**
 * Gate that requires a signed-in user before rendering the app.
 *
 * Sign-in is passwordless: the user enters their email and gets a one-time
 * magic link (Supabase Auth `signInWithOtp`). Clicking it returns them here and
 * `detectSessionInUrl` completes the session. While signed out, only the
 * email-link form is shown.
 */
import { useEffect, useState, type ReactNode } from 'react';

import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { AuthedUser } from '../state/useAppData';
import { BellIcon, MailIcon } from './icons';

type LinkState = 'idle' | 'sending' | 'sent' | 'error';

export function AuthGate({
  children,
}: {
  children: (user: AuthedUser) => ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthedUser | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUser(u ? { id: u.id, email: u.email ?? '' } : null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email ?? '' } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <ConfigNeeded />;
  if (!ready) return <Centered>Loading…</Centered>;
  if (user) return <>{children(user)}</>;
  return <SignIn />;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<LinkState>('idle');
  const [message, setMessage] = useState('');

  const sendLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('sending');
    setMessage('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    if (error) {
      setState('error');
      setMessage(error.message);
    } else {
      setState('sent');
      setMessage(`Check ${email} for your sign-in link.`);
    }
  };

  return (
    <Centered>
      <div className="app-brand" style={{ marginBottom: 8 }}>
        <BellIcon size={26} />
        <span>SubTrack</span>
      </div>
      <p className="settings-hint" style={{ textAlign: 'center' }}>
        Sign in with a one-time email link — no password to remember.
      </p>
      <form onSubmit={sendLink} style={{ width: '100%', maxWidth: 320 }}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        <button
          type="submit"
          className="button button-primary button-block"
          disabled={state === 'sending' || !email}
        >
          <MailIcon size={18} />
          {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>
      {message && (
        <p
          className={`email-status ${
            state === 'error' ? 'email-status-error' : 'email-status-ok'
          }`}
        >
          {message}
        </p>
      )}
    </Centered>
  );
}

function ConfigNeeded() {
  return (
    <Centered>
      <div className="app-brand" style={{ marginBottom: 8 }}>
        <BellIcon size={26} />
        <span>SubTrack</span>
      </div>
      <p
        className="settings-hint"
        style={{ textAlign: 'center', maxWidth: 360 }}
      >
        Backend not configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> (see{' '}
        <code>docs/supabase-setup.md</code>
        ), then reload.
      </p>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}
