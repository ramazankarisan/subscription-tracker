/**
 * Daily reminder sender (Supabase Edge Function, Deno).
 *
 * Two entry points, distinguished by the request body:
 *   • Scheduled cron run — `Authorization: Bearer <CRON_SECRET>`, no `test`.
 *     Iterates every user with settings and emails whatever fires today.
 *   • Test send — `{ "test": true }` with the caller's user access token.
 *     Emails that one user a preview immediately, ignoring the schedule.
 *
 * A reminder fires when today is within a small catch-up window of
 * `dueDate − offset` for any configured offset (e.g. 3 and 0 → D-3 and D-0),
 * and it hasn't already been recorded in `reminder_log` (idempotency).
 *
 * Secrets (set with `supabase secrets set`): RESEND_API_KEY, CRON_SECRET, and
 * optionally REMINDER_FROM. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
 * SUPABASE_ANON_KEY are injected by the platform.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const REMINDER_FROM =
  Deno.env.get('REMINDER_FROM') ?? 'SubTrack <onboarding@resend.dev>';

/** Recover a missed daily run: a reminder can still fire this many days late. */
const CATCHUP_DAYS = 2;

/** CORS: the browser (test send) calls this from a different origin than *.supabase.co. */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---------- Types ----------

interface SubscriptionRow {
  id: string;
  name: string;
  cost: number;
  currency: string;
  next_renewal: string;
  cancel_url: string;
}
interface InstallmentRow {
  id: string;
  name: string;
  currency: string;
  amount_per_payment: number;
  total_payments: number;
  paid_payments: number;
  first_payment_date: string;
  interval_months: number;
}

interface Fire {
  kind: 'subscription' | 'installment';
  itemId: string;
  dueDate: string;
  offset: number;
  reminderDate: string;
  line: string;
}

// ---------- Date helpers (UTC day math) ----------

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}
function addMonths(iso: string, n: number): string {
  const d = parse(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  // Clamp to the last valid day of the target month (e.g. Jan 31 + 1mo → Feb 28).
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toIso(d);
}
function daysBetween(aIso: string, bIso: string): number {
  return Math.round(
    (parse(aIso).getTime() - parse(bIso).getTime()) / 86_400_000,
  );
}

function nextInstallmentDate(inst: InstallmentRow): string | null {
  if (inst.paid_payments >= inst.total_payments) return null;
  return addMonths(
    inst.first_payment_date,
    inst.paid_payments * Math.max(1, inst.interval_months),
  );
}

// ---------- Formatting (mirrors the client's email copy) ----------

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`.trim();
  }
}
function relative(dueIso: string, today: string): string {
  const days = daysBetween(dueIso, today);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}
function prettyDate(iso: string): string {
  return parse(iso).toLocaleDateString('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
function subscriptionLine(s: SubscriptionRow, today: string): string {
  const when = `${relative(s.next_renewal, today)} (${prettyDate(s.next_renewal)})`;
  const cancel = s.cancel_url ? ` — cancel: ${s.cancel_url}` : '';
  return `• ${s.name} renews ${when} — ${money(s.cost, s.currency)}${cancel}`;
}
function installmentLine(
  i: InstallmentRow,
  dueIso: string,
  today: string,
): string {
  const paymentNumber = i.paid_payments + 1;
  const left = i.total_payments - paymentNumber + 1;
  const when = `${relative(dueIso, today)} (${prettyDate(dueIso)})`;
  return `• ${i.name}: payment ${paymentNumber}/${i.total_payments} due ${when} — ${money(i.amount_per_payment, i.currency)} (${left} left)`;
}
function buildBody(lines: string[]): string {
  return [
    `You have ${lines.length} item${lines.length === 1 ? '' : 's'} coming up:`,
    '',
    ...lines,
    '',
    '— Sent from your Subscription & Installment Tracker',
  ].join('\n');
}

// ---------- Resend ----------

async function sendEmail(to: string, subject: string, text: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: REMINDER_FROM, to, subject, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

async function recipientFor(
  userId: string,
  settingsEmail: string,
): Promise<string> {
  if (settingsEmail) return settingsEmail;
  const { data } = await admin.auth.admin.getUserById(userId);
  return data.user?.email ?? '';
}

// ---------- Core ----------

/** Process one user. `test` ignores the schedule/log and always emails a preview. */
async function processUser(
  userId: string,
  offsets: number[],
  recipient: string,
  test: boolean,
): Promise<{ sent: boolean; count: number }> {
  const today = todayIso();

  const [{ data: subs }, { data: insts }] = await Promise.all([
    admin
      .from('subscriptions')
      .select('id,name,cost,currency,next_renewal,cancel_url')
      .eq('user_id', userId),
    admin
      .from('installments')
      .select(
        'id,name,currency,amount_per_payment,total_payments,paid_payments,first_payment_date,interval_months',
      )
      .eq('user_id', userId),
  ]);

  const subscriptions = (subs ?? []) as SubscriptionRow[];
  const installments = (insts ?? []) as InstallmentRow[];

  // Every item's single upcoming due date (installments: next unpaid payment).
  const due: {
    kind: 'subscription' | 'installment';
    id: string;
    dueDate: string;
    line: string;
  }[] = [];
  for (const s of subscriptions) {
    due.push({
      kind: 'subscription',
      id: s.id,
      dueDate: s.next_renewal,
      line: subscriptionLine(s, today),
    });
  }
  for (const i of installments) {
    const dueDate = nextInstallmentDate(i);
    if (!dueDate) continue;
    due.push({
      kind: 'installment',
      id: i.id,
      dueDate,
      line: installmentLine(i, dueDate, today),
    });
  }

  if (test) {
    // Preview: show everything upcoming (or a placeholder), don't touch the log.
    const lines = due
      .sort(
        (a, b) => daysBetween(a.dueDate, today) - daysBetween(b.dueDate, today),
      )
      .map((d) => d.line);
    const body =
      lines.length > 0
        ? buildBody(lines)
        : 'This is a test — nothing is due right now, but email delivery works. 🎉';
    await sendEmail(recipient, 'SubTrack test reminder', body);
    return { sent: true, count: lines.length };
  }

  // Which (item, offset) pairs are due to fire today (inside the catch-up window)?
  const candidates: Fire[] = [];
  for (const d of due) {
    for (const offset of offsets) {
      const reminderDate = addDays(d.dueDate, -offset);
      const age = daysBetween(today, reminderDate); // >=0 means today is on/after it
      if (age >= 0 && age <= CATCHUP_DAYS) {
        candidates.push({
          kind: d.kind,
          itemId: d.id,
          dueDate: d.dueDate,
          offset,
          reminderDate,
          line: d.line,
        });
      }
    }
  }
  if (candidates.length === 0) return { sent: false, count: 0 };

  // Drop any already recorded in the log (idempotency).
  const { data: logRows } = await admin
    .from('reminder_log')
    .select('item_id,reminder_date,offset_days')
    .eq('user_id', userId)
    .in(
      'item_id',
      candidates.map((c) => c.itemId),
    );
  const sentKeys = new Set(
    (logRows ?? []).map(
      (r: { item_id: string; reminder_date: string; offset_days: number }) =>
        `${r.item_id}|${r.reminder_date}|${r.offset_days}`,
    ),
  );
  const fresh = candidates.filter(
    (c) => !sentKeys.has(`${c.itemId}|${c.reminderDate}|${c.offset}`),
  );
  if (fresh.length === 0) return { sent: false, count: 0 };

  // One consolidated email; de-dup lines if an item fires on multiple offsets.
  const lines = [...new Set(fresh.map((f) => f.line))];
  await sendEmail(
    recipient,
    `Reminder: ${lines.length} item${lines.length === 1 ? '' : 's'} need attention`,
    buildBody(lines),
  );

  await admin.from('reminder_log').upsert(
    fresh.map((f) => ({
      user_id: userId,
      item_kind: f.kind,
      item_id: f.itemId,
      reminder_date: f.reminderDate,
      offset_days: f.offset,
    })),
    {
      onConflict: 'user_id,item_kind,item_id,reminder_date,offset_days',
      ignoreDuplicates: true,
    },
  );

  return { sent: true, count: lines.length };
}

async function runAllUsers() {
  const { data: settings } = await admin
    .from('app_settings')
    .select('user_id,reminder_offsets,recipient_email');
  let sentTo = 0;
  for (const row of settings ?? []) {
    const recipient = await recipientFor(row.user_id, row.recipient_email);
    if (!recipient) continue;
    const offsets: number[] = row.reminder_offsets?.length
      ? row.reminder_offsets
      : [3, 0];
    try {
      const r = await processUser(row.user_id, offsets, recipient, false);
      if (r.sent) sentTo += 1;
    } catch (err) {
      console.error(`user ${row.user_id} failed:`, err);
    }
  }
  return sentTo;
}

// ---------- HTTP entry ----------

Deno.serve(async (req) => {
  // Answer the browser's CORS preflight before doing anything else.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (status: number, obj: unknown) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  let body: { test?: boolean; secret?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body (e.g. a bare cron GET) — treat as a scheduled run
  }
  const bearer = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';

  try {
    if (body.test) {
      // Validate the caller's own access token, then send them a preview.
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: userRes, error } = await userClient.auth.getUser();
      if (error || !userRes.user) return json(401, { error: 'Not signed in' });

      const { data: s } = await admin
        .from('app_settings')
        .select('reminder_offsets,recipient_email')
        .eq('user_id', userRes.user.id)
        .maybeSingle();
      const recipient = await recipientFor(
        userRes.user.id,
        s?.recipient_email ?? userRes.user.email ?? '',
      );
      if (!recipient) return json(400, { error: 'No recipient email set' });

      const r = await processUser(
        userRes.user.id,
        s?.reminder_offsets ?? [3, 0],
        recipient,
        true,
      );
      return json(200, { ok: true, ...r });
    }

    // Scheduled run — require the shared cron secret.
    if (
      !CRON_SECRET ||
      (bearer !== CRON_SECRET && body.secret !== CRON_SECRET)
    ) {
      return json(401, { error: 'Unauthorized' });
    }
    const sentTo = await runAllUsers();
    return json(200, { ok: true, usersEmailed: sentTo });
  } catch (err) {
    console.error(err);
    return json(500, { error: String(err) });
  }
});
