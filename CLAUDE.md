# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm**.

```bash
pnpm install
pnpm dev        # dev server at http://localhost:5173 (add --host to reach it from a phone on the LAN)
pnpm build      # tsc -b type-check + vite build into dist/ (also generates PWA icons)
pnpm preview    # serve the production build
pnpm lint       # oxlint
pnpm lint:fix   # oxlint --fix
pnpm format     # prettier --write .
```

There is no test runner configured. Type-checking happens as part of `pnpm build` (`tsc -b`).

## Architecture

A serverless, phone-first PWA (Vite + React 19 + TypeScript) for tracking subscription renewals and installment plans, with optional client-side email reminders. There is no backend and no accounts — **all state is a single JSON blob in `localStorage`**.

### Data flow

- `src/types.ts` — the domain model (`Subscription`, `Installment`, `AppData`, settings). Everything is plain JSON: **dates are stored as ISO day strings (`"yyyy-MM-dd"`), never `Date` objects.**
- `src/state/useAppData.tsx` — the single store. A React context holds one `AppData` object (`useState`), persisted back to `localStorage` on every change via an effect. Components read data and call typed action helpers (`addSubscription`, `markSubscriptionRenewed`, `markInstallmentPaid`, …); **components never touch `localStorage` directly.**
- `src/lib/storage.ts` — load/save the blob. Loading is defensive: corruption or missing fields fall back to defaults (merged over `defaultSettings`), so schema additions are safe. Save errors are swallowed (quota / private mode).

### Date logic (the core domain rules)

All calendar math lives in `src/lib/dates.ts` and goes through `date-fns` — do not do date arithmetic elsewhere.

- **Subscriptions**: "mark renewed" calls `advanceByCycle` then `rollForwardToFuture`, which skips any cycles already in the past (handles the app not being opened for a while).
- **Installments**: the next payment date is `firstPaymentDate + paidPayments × intervalMonths`; "paid one" / "undo" just increments/decrements `paidPayments` (clamped).
- `src/lib/reminders.ts` — `getDueItems(data, leadDays)` flattens subscriptions + installments into one sorted list of what's due within the lead window (overdue included). This is the single source of truth shared by both the Dashboard (render) and the email sender (summarise), so they always agree.

### Email reminders (no backend)

Email is sent **from the browser** via EmailJS (`@emailjs/browser`) using the user's own Service ID / Template ID / Public Key entered in Settings. The template must reference `{{to_email}}`, `{{subject}}`, `{{message}}` (see `docs/emailjs-template.html`).

- `src/lib/email.ts` — builds the message from due items and calls EmailJS.
- `src/hooks/useAutoEmailOnOpen.ts` — because there's no server/cron, the reminder is sent **when the app is opened**, at most once per day (guarded by `settings.lastEmailSentDate`). A module-level `hasAttempted` flag also neutralises React StrictMode's double-effect in dev. It marks "sent" before sending so a quick refresh can't double-send.

### UI

`src/App.tsx` wraps everything in `AppDataProvider` and renders a tab shell (`TabBar`) with four views: Dashboard, Subscriptions, Installments, Settings. Forms live in `*Form.tsx` components rendered inside `Modal.tsx`.

### PWA

`vite-plugin-pwa` (config in `vite.config.ts`, `registerType: 'autoUpdate'`) generates the service worker and all icons from the single source `public/favicon.svg`. A real home-screen install needs HTTPS (or `localhost`) for the service worker.
