/**
 * Thin wrapper over Supabase's experimental passkey API (WebAuthn — Face ID /
 * Touch ID / Windows Hello). Keeping the beta surface in one file means the
 * churn stays contained: if the API shifts, only this file changes.
 *
 * Passkeys are additive — email one-time codes remain the fallback everywhere.
 */
import { supabase } from './supabase';

/** One registered passkey, as shown in Settings. */
export interface PasskeySummary {
  id: string;
  friendlyName?: string;
  createdAt: string;
  lastUsedAt?: string;
}

/** Outcome of a register / sign-in ceremony. `cancelled` = user dismissed the
 *  biometric prompt, which is not a real error and should stay quiet. */
export type PasskeyOutcome =
  { ok: true } | { ok: false; cancelled: boolean; message: string };

/** True when the browser can do WebAuthn at all (old browsers just get OTP). */
export function passkeysSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function'
  );
}

// A dismissed Face ID / Touch ID sheet surfaces as a WebAuthn NotAllowedError or
// AbortError — treat it as a no-op, not a failure to shout about.
function isCancellation(error: unknown): boolean {
  const name = (error as { name?: string })?.name ?? '';
  const message = (error as { message?: string })?.message ?? '';
  return /NotAllowed|Abort|cancel/i.test(`${name} ${message}`);
}

function toOutcome(error: unknown, fallback: string): PasskeyOutcome {
  if (!error) {
    return { ok: true };
  }
  const cancelled = isCancellation(error);
  const message =
    (error as { message?: string })?.message && !cancelled
      ? (error as { message: string }).message
      : fallback;
  return { ok: false, cancelled, message };
}

// Run a WebAuthn ceremony and normalise both a returned error and a thrown one.
async function runCeremony(
  call: () => Promise<{ error: unknown }>,
  fallback: string,
): Promise<PasskeyOutcome> {
  try {
    const { error } = await call();
    return toOutcome(error, fallback);
  } catch (error) {
    return toOutcome(error, fallback);
  }
}

/** Enroll the current device. Requires an already signed-in user. */
export function registerPasskey(): Promise<PasskeyOutcome> {
  return runCeremony(
    () => supabase.auth.registerPasskey(),
    'Could not set up this device. Try again.',
  );
}

/** Sign in with a previously enrolled passkey. Session lands via onAuthStateChange. */
export function signInWithPasskey(): Promise<PasskeyOutcome> {
  return runCeremony(
    () => supabase.auth.signInWithPasskey(),
    'Passkey sign-in did not work. Use your email code.',
  );
}

/** List the signed-in user's passkeys (empty on any error). */
export async function listPasskeys(): Promise<PasskeySummary[]> {
  const { data, error } = await supabase.auth.passkey.list();
  if (error || !data) {
    return [];
  }
  return data.map((item) => ({
    id: item.id,
    friendlyName: item.friendly_name,
    createdAt: item.created_at,
    lastUsedAt: item.last_used_at,
  }));
}

/** Remove a passkey. Returns an error string on failure, null on success. */
export async function deletePasskey(passkeyId: string): Promise<string | null> {
  const { error } = await supabase.auth.passkey.delete({ passkeyId });
  return error ? 'Could not remove that passkey.' : null;
}
