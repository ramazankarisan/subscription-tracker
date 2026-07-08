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

type LinkState = 'idle' | 'sending' | 'error';

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

  if (!isSupabaseConfigured) {
    return <ConfigNeeded />;
  }
  if (!ready) {
    return <Centered>Loading…</Centered>;
  }
  if (user) {
    return <>{children(user)}</>;
  }
  return <SignIn />;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [state, setState] = useState<LinkState>('idle');
  const [message, setMessage] = useState('');

  // Email a one-time code (and a magic link). On phones the code is the reliable
  // path: an installed iOS PWA can't receive the link's session from Safari, but
  // typing the code signs you in right here.
  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('sending');
    setMessage('');
    const trimmedEmail = email.trim();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: { emailRedirectTo: window.location.href },
    });
    if (error) {
      setState('error');
      setMessage(error.message);
    } else {
      setStage('code');
      setState('idle');
      setMessage(
        `We emailed a 6-digit code to ${trimmedEmail}. Check spam if it's not there.`,
      );
    }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('sending');
    setMessage('');
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (error) {
      setState('error');
      setMessage(
        'That code did not work. Check it and try again, or request a new one.',
      );
    }
    // On success, AuthGate's onAuthStateChange signs the user in.
  };

  return (
    <Centered>
      <div className="app-brand" style={{ marginBottom: 8 }}>
        <BellIcon size={26} />
        <span>SubTrack</span>
      </div>

      {stage === 'email' ? (
        <>
          <p className="settings-hint" style={{ textAlign: 'center' }}>
            Sign in with a one-time email code — no password to remember.
          </p>
          <form onSubmit={sendCode} style={{ width: '100%', maxWidth: 320 }}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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
              {state === 'sending' ? 'Sending…' : 'Email me a code'}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="settings-hint" style={{ textAlign: 'center' }}>
            Enter the code from the email. On iPhone, typing the code works in
            the installed app (the link often doesn't).
          </p>
          <form onSubmit={verifyCode} style={{ width: '100%', maxWidth: 320 }}>
            <label className="field">
              <span>Code</span>
              <input
                type="text"
                required
                autoFocus
                value={code}
                // Keep only digits; Supabase OTP length is configurable (6–10).
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ''))
                }
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
              />
            </label>
            <button
              type="submit"
              className="button button-primary button-block"
              disabled={state === 'sending' || code.trim().length < 6}
            >
              {state === 'sending' ? 'Verifying…' : 'Verify & sign in'}
            </button>
          </form>
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => {
              setStage('email');
              setCode('');
              setState('idle');
              setMessage('');
            }}
          >
            Use a different email
          </button>
        </>
      )}

      {message && (
        <p
          className={`email-status ${
            state === 'error' ? 'email-status-error' : 'email-status-ok'
          }`}
          role={state === 'error' ? 'alert' : 'status'}
          aria-live={state === 'error' ? 'assertive' : 'polite'}
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
