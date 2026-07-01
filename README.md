# SubTrack — Subscriptions & Installments

A personal, phone-first PWA to track **subscription renewals** (so you can cancel
in time) and **installment plans** (so you can see how many payments are left).
It can also **email you a reminder** of anything due soon.

- **No server / no accounts** — all data lives in your browser's `localStorage`.
- **Installable** — add it to your phone's home screen like a real app (PWA).
- **Email reminders** — sent straight from the browser via
  [EmailJS](https://www.emailjs.com/) (free tier). Because there's no backend,
  the email is sent **when you open the app** (at most once per day).

## Stack

Vite + React + TypeScript · `date-fns` · `vite-plugin-pwa` · `@emailjs/browser`.
State is a single context "store" (`src/state/useAppData.tsx`) persisted to
`localStorage`.

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # production build into dist/ (also generates the PWA icons)
pnpm preview    # serve the production build
pnpm lint       # oxlint
pnpm format     # prettier --write .
```

## Use it on your phone (no App Store)

1. Deploy `dist/` to any free static host (Netlify, Vercel, GitHub Pages, …),
   or run `pnpm dev --host` and open your computer's LAN URL on the phone.
2. Open the URL in the phone browser.
3. **iOS Safari:** Share → _Add to Home Screen_.
   **Android Chrome:** menu → _Install app_ / _Add to Home screen_.

> A PWA needs HTTPS (or `localhost`) for the service worker, so for real
> home-screen use, deploy to a host that serves HTTPS.

## Set up email reminders (EmailJS)

1. Create a free account at [emailjs.com](https://www.emailjs.com/).
2. Add an **Email Service** (e.g. connect a Gmail account) → note the **Service ID**.
3. Create an **Email Template** that uses these variables in its body/subject:
   `{{to_email}}`, `{{subject}}`, `{{message}}` → note the **Template ID**.
4. Copy your **Public Key** from Account → API Keys.
5. In the app: **Settings → Email**, paste the three IDs + your recipient
   address, tick **Enable email reminders**, and hit **Send test email**.

With "Automatically email me when I open the app" on, opening the app will send a
summary of everything due within your reminder window — once per day.

## How dates work

- **Subscriptions** have a next-renewal date and a billing cycle. "Renewed"
  advances the date by one cycle (skipping any cycles already in the past).
- **Installments** compute the next payment as `firstPaymentDate + paidPayments
× interval`. "Paid one" increments the paid count; "Undo" decrements it.
- Anything within your reminder window (or overdue) shows up on the Dashboard
  and in the email.

## Backup

Settings → Backup lets you export all data to a JSON file and re-import it
(handy for moving to another device, since data is browser-local).
