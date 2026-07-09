/**
 * WhatsApp inbound webhook (Supabase Edge Function, Deno).
 *
 * Lets a user manage their tracker by texting a WhatsApp bot in plain English.
 * Mirrors `send-reminders`: a service-role `admin` client (bypasses RLS, every
 * query scoped with `.eq('user_id', …)`), in-file date math, `verify_jwt=false`.
 *
 * Two request shapes, by HTTP method:
 *   • GET  — Meta webhook verification. Echoes `hub.challenge` when
 *     `hub.mode==='subscribe'` and `hub.verify_token` matches our secret.
 *   • POST — an inbound message event. The body's HMAC-SHA256 (keyed by the Meta
 *     App Secret) must match `X-Hub-Signature-256`, else 401 — this proves the
 *     request came from Meta and nobody else can drive the agent.
 *
 * Phase 1 (this file): verify + signature + echo the received text back, which
 * proves the full receive→reply loop. No LLM, no linking, no writes yet.
 *
 * Secrets (`supabase secrets set`): WHATSAPP_TOKEN (permanent System User token),
 * WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN (arbitrary, for GET),
 * WHATSAPP_APP_SECRET (HMAC key). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
 * injected by the platform.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';

// Graph API version pinned so message-send behaviour can't shift under us.
const GRAPH_VERSION = 'v20.0';

// Reserved for later phases (linking, writes). Declared now to fix the shape.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
void admin;

// ---------- Signature verification ----------

/** Constant-time compare of two ASCII strings (avoids leaking via timing). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

/** HMAC-SHA256 of the raw body vs the `X-Hub-Signature-256` header from Meta. */
async function verifySignature(raw: string, header: string): Promise<boolean> {
  if (!APP_SECRET || !header) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(raw),
  );
  const expected =
    'sha256=' +
    [...new Uint8Array(mac)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  return timingSafeEqual(expected, header);
}

// ---------- WhatsApp Graph API ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send a text message back to `to` via the Graph API. Free because it replies
 * inside the 24h service window a user-initiated message opens (no template).
 * Retries once on HTTP 429, mirroring `send-reminders`' `sendEmail` shape.
 */
async function sendWhatsApp(to: string, body: string) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    });
    if (res.ok) return;
    if (res.status === 429 && attempt < 2) {
      await sleep(600 * (attempt + 1));
      continue;
    }
    throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
  }
}

// ---------- Payload parsing ----------

interface InboundMessage {
  from: string;
  text: string;
}

/**
 * Pull the first text message out of a webhook payload. WhatsApp also posts
 * non-message events (delivery/read status callbacks) we simply ignore.
 */
function parseInbound(payload: unknown): InboundMessage | null {
  const value = (payload as Record<string, unknown> | null)?.entry as
    Array<{ changes?: Array<{ value?: Record<string, unknown> }> }> | undefined;
  const message = value?.[0]?.changes?.[0]?.value?.messages as
    | Array<{ from?: string; type?: string; text?: { body?: string } }>
    | undefined;
  const first = message?.[0];
  if (!first || first.type !== 'text' || !first.from || !first.text?.body) {
    return null;
  }
  return { from: first.from, text: first.text.body };
}

// ---------- HTTP entry ----------

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // GET — Meta webhook verification handshake.
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') ?? '';
    if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // POST — an inbound event. Verify it came from Meta before trusting anything.
  const raw = await req.text();
  const signature = req.headers.get('X-Hub-Signature-256') ?? '';
  if (!(await verifySignature(raw, signature))) {
    console.error('wa: signature mismatch → 401');
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const inbound = parseInbound(payload);
  // Non-message events (status callbacks) — acknowledge so Meta stops retrying.
  if (!inbound) {
    return new Response('ok', { status: 200 });
  }

  try {
    // Phase 1: prove the loop end-to-end by echoing the text back.
    await sendWhatsApp(inbound.from, `echo: ${inbound.text}`);
  } catch (err) {
    console.error('wa: reply failed:', err);
  }

  return new Response('ok', { status: 200 });
});
