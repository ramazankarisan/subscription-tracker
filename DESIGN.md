---
name: SubTrack
description: A quiet phone-first PWA that tracks subscription renewals and installment plans and answers "what's due, what's owed?" at a glance.
colors:
  accent: '#7c3aed'
  accent-strong: '#6d28d9'
  bg: '#f6f6f9'
  surface: '#ffffff'
  surface-2: '#f1f0f6'
  text: '#1c1a24'
  text-muted: '#6b6375'
  border: '#e5e3ec'
  ok: '#16a34a'
  warn: '#d97706'
  danger: '#dc2626'
  accent-dark: '#a78bfa'
  bg-dark: '#131118'
  surface-dark: '#1c1a24'
  text-dark: '#f3f1f7'
typography:
  title:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '26px'
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: '-0.01em'
  headline:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '18px'
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: '-0.02em'
  body:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 'normal'
  label:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '13px'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 'normal'
  stat:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '20px'
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: '-0.02em'
rounded:
  sm: '10px'
  md: '14px'
  lg: '18px'
  pill: '999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '18px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '#ffffff'
    rounded: '{rounded.sm}'
    padding: '9px 14px'
  button-primary-hover:
    backgroundColor: '{colors.accent-strong}'
    textColor: '#ffffff'
  button-ghost:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.sm}'
    padding: '9px 14px'
  button-small:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.accent}'
    rounded: '{rounded.sm}'
    padding: '6px 11px'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.md}'
    padding: '14px 16px'
  pill-ok:
    backgroundColor: '{colors.ok}'
    textColor: '{colors.ok}'
    rounded: '{rounded.pill}'
    padding: '2px 9px'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.sm}'
    padding: '10px 12px'
  chip:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.pill}'
    padding: '8px 12px'
  chip-active:
    backgroundColor: '{colors.accent}'
    textColor: '#ffffff'
    rounded: '{rounded.pill}'
    padding: '8px 12px'
---

# Design System: SubTrack

## 1. Overview

**Creative North Star: "The Calm Dashboard"**

SubTrack is a single-glance panel that answers one question — _what's about to charge me, and what do I still owe?_ — and then gets out of the way. It is opened for seconds, often from a home-screen PWA icon, sometimes on a train with no signal. The design serves that glance: stats and the "due soon" list lead every screen, chrome recedes, and the one violet accent is spent only on the live action. This is a utility that should feel closer to a native settings screen than a finance product.

The system is deliberately flat and neighbourly. Surfaces are white (or near-black in dark mode) on a faintly tinted body; depth comes from a single hairline border plus one whisper-soft shadow, never from stacked cards or blur-for-decoration. Type is one system font in a tight weight range — no display face, no pairing — because product labels, amounts and dates carry the interface, not typography. Motion is confined to state feedback (150ms button and focus transitions, a 300ms progress fill); nothing choreographs on load.

It explicitly rejects the fintech-dashboard reflex: no hero metrics with gradient accents, no charts shouting for attention, no gamified spending moralising, no SaaS-cream-plus-purple-gradient AI-template look. The lone celebratory beat is the small "paid off" moment of relief when an installment plan completes — earned, quiet, not a confetti cannon.

**Key Characteristics:**

- One violet accent, spent only on the primary action, current tab, and progress.
- Flat surfaces: 1px border + one soft shadow, never nested cards.
- One system font, weights 400–700; amounts and dates are the loudest elements.
- Phone-first: 560px max shell, bottom tab bar, safe-area aware, one-handed reach.
- Status is never colour-only — every pill also carries a word.
- Light and dark are peers, driven by `prefers-color-scheme`.

## 2. Colors

A restrained near-neutral surface set with a single violet accent and a three-colour semantic status vocabulary (ok / warn / danger). Colour is information here, never decoration.

### Primary

- **Signal Violet** (`#7c3aed`, hover `#6d28d9`): The one accent. Reserved for the primary button, the active tab, the brand mark, focus rings, progress fill, and due-item icons. In dark mode it lightens to **Lifted Violet** (`#a78bfa`) so it reads on the near-black surface. Never used as a background wash or gradient field.

### Neutral

- **Cool Mist** (`#f6f6f9`, dark `#131118`): The body background — a faint cool tint, not a warm cream. The stage everything sits on.
- **Card White** (`#ffffff`, dark `#1c1a24`): The raised surface for cards, the modal, inputs, settings groups.
- **Recessed Grey** (`#f1f0f6`, dark `#262330`): A second surface layer for notes, progress tracks, code, and small-button rest.
- **Ink** (`#1c1a24`, dark `#f3f1f7`): Primary text — titles, amounts, values. High contrast, the default read.
- **Muted Ink** (`#6b6375`, dark `#a49db2`): Secondary text — metadata, labels, hints. Held to WCAG AA on the surfaces it sits on; never dropped to decorative light-grey.
- **Hairline** (`#e5e3ec`, dark `#322e3d`): The 1px border and divider that defines every surface edge.

### Semantic (status)

- **Settled Green** (`#16a34a`): "Renewed" / on-track state on pills, plus success email status.
- **Due-Soon Amber** (`#d97706`): The within-lead-window warning pill.
- **Overdue Red** (`#dc2626`): Overdue pills, the sync-error banner, destructive icon-button hover.

Each semantic colour pairs with a low-alpha tint of itself (`--ok-soft`, `--warn-soft`, `--danger-soft`) as its pill/banner background — coloured text on a transparency of the same hue, never grey-on-colour.

### Named Rules

**The One Voice Rule.** Signal Violet appears on ≤10% of any screen: the primary action, the active tab, progress, focus. Its rarity is what makes "the live action" legible. Spread it wider and the calm collapses into the purple-template look the brand exists to avoid.

**The Word-Plus-Colour Rule.** No status is ever communicated by colour alone. Every pill carries its label ("Renewed", "Due soon", "Overdue") so it survives colour-blindness and greyscale.

## 3. Typography

**Body / Display Font:** `system-ui` (with `-apple-system`, `Segoe UI`, `Roboto`, `sans-serif` fallbacks)
**Mono Font:** `ui-monospace` (with `Menlo`, `Consolas`) — inline `<code>` only

**Character:** One native system stack, no pairing. It renders as SF on iOS, Roboto on Android, Segoe on Windows — so the app wears the host OS's own voice and disappears into it. Personality comes from weight and a slightly tightened tracking on headings, not from a chosen typeface.

### Hierarchy

- **Title** (650, 26px, -0.01em): View headers ("Subscriptions", "Installments"). The largest type on any screen.
- **Headline** (700, 18px, -0.02em): The brand wordmark and modal titles.
- **Stat** (700, 20px, -0.02em): Dashboard stat values and amounts — the numbers the glance is for.
- **Card Title** (650, 17px): A subscription or installment name.
- **Body** (400, 16px, 1.45): Default text and inputs. Prose held to 65–75ch (rarely reached on a 560px shell).
- **Label** (600, 13px): Field labels, meta rows, tab captions, hints — always in Muted Ink.

### Named Rules

**The Numbers-Lead Rule.** Amounts and due dates are the heaviest weight (650–700) in any card. If a decorative element out-weighs the number the user came to read, it's wrong.

**The No-Display-Face Rule.** Never introduce a display or brand typeface for headings. Product UI carries on one well-tuned system stack; a display face in a label is the tell of a design fighting the task.

## 4. Elevation

Near-flat by design. Depth is carried almost entirely by a 1px **Hairline** border on every surface; a single soft shadow sits beneath cards, stat cards, the modal, and settings groups to lift them a hair off Cool Mist. There is no shadow scale and no elevation ladder — surfaces are either on the body or one step above it, never stacked. Two backdrop blurs exist (sticky header, tab bar) and are functional translucency for the scroll-under effect, not decorative glass.

### Shadow Vocabulary

- **Soft Lift** (`box-shadow: 0 1px 2px rgba(16,12,30,0.06), 0 6px 16px rgba(16,12,30,0.06)`; dark `0 1px 2px rgba(0,0,0,0.4), 0 6px 16px rgba(0,0,0,0.35)`): The only shadow. A close contact shadow plus a wide diffuse one, both very low opacity. Applied to cards, stat cards, the modal, and settings groups.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are defined by border first, shadow second. If depth reads before the content does, the shadow is too dark. There is exactly one shadow token — resist inventing a second.

**The No-Nested-Cards Rule.** A card never contains another card. Secondary content (notes, progress) sits on Recessed Grey inside the card, not in its own bordered box.

## 5. Components

### Buttons

- **Shape:** Gently rounded (`10px`, `--radius-sm`), 1px transparent border so hover/variants swap colour without reflow.
- **Primary:** Signal Violet fill, white text, `9px 14px`. Hover deepens to `#6d28d9`. The single strongest affordance on a screen — one per context.
- **Ghost:** Card White fill, Hairline border, Ink text. Hover fills Recessed Grey. The default secondary action.
- **Small:** Violet-soft tint fill, violet text, `6px 11px` — used inline in card action rows (e.g. "Paid one", "Mark renewed"), pushed to the left with `margin-right: auto`.
- **Icon button:** 34×34, Hairline border, Muted-Ink glyph; hover fills Recessed Grey. Danger variant tints red on hover only.
- **Disabled:** `opacity: 0.5`, `not-allowed` cursor, no colour change.

### Pills (status)

- **Style:** Fully round (`999px`), 12px/600 text, `2px 9px`. Coloured text on a low-alpha tint of the same hue — **ok** green, **soon** amber, **overdue** red.
- **Rule:** Always carries a word; never colour-only (see The Word-Plus-Colour Rule).

### Cards

- **Corner Style:** `14px` (`--radius-md`).
- **Background:** Card White; secondary content (notes) sits on Recessed Grey inside.
- **Shadow:** Soft Lift (the one shadow) + 1px Hairline border.
- **Border / divider:** Action rows are separated from the card body by a top Hairline border, not a nested container.
- **Internal Padding:** `14px 16px`; internal gap `12px`.

### Inputs / Fields

- **Style:** Card White fill, 1px Hairline border, `10px` radius, Ink text, `10px 12px` padding.
- **Label:** 13px/600 Muted Ink, stacked above the control with a 5px gap.
- **Focus:** Border shifts to Signal Violet plus a 3px violet-soft glow ring (`box-shadow: 0 0 0 3px --accent-soft`). Never a bare `outline: none` with no replacement.
- **Chips (filter/select):** Round `999px`, Hairline border; active state fills Signal Violet with white text.
- **Checkbox:** Native control, `accent-color: var(--accent)`.

### Navigation (bottom tab bar)

- **Style:** Fixed to the bottom, translucent Card White with a 10px backdrop blur, top Hairline border, safe-area padded. Constrained to the 560px shell and centred.
- **Tabs:** Icon over an 11px/600 caption, Muted Ink at rest, Signal Violet when active (`.tab-active`). Colour is the only active affordance — kept legible by the label always being present.

### Progress (installments)

- **Signature component.** An 8px Recessed-Grey track, fully round, with a violet fill (`linear-gradient(90deg, accent, accent-strong)` — the one sanctioned gradient, and it's functional: it marks paid-vs-remaining, not decoration). A 12px/600 Muted-Ink label sits to the right ("3 / 12"). Width animates over 300ms — the small tangible beat when you mark a payment.

### App shell

- Single column, `560px` max-width, centred, `min-height: 100dvh`. Sticky translucent header (brand mark + optional action) with an 8px backdrop blur. Main content padded to clear the fixed tab bar plus safe-area inset.

## 6. Do's and Don'ts

### Do:

- **Do** lead every screen with the answer — stats and the "due soon" list first, controls second.
- **Do** keep Signal Violet to ≤10% of any screen (The One Voice Rule): primary action, active tab, progress, focus.
- **Do** pair every status colour with a word (The Word-Plus-Colour Rule) so pills survive greyscale and colour-blindness.
- **Do** define surfaces with a 1px Hairline border first and the single Soft Lift shadow second.
- **Do** keep Muted Ink text at WCAG AA against its surface; bump toward Ink if contrast is even close.
- **Do** size touch targets for one-handed phone use (icon buttons 34px, tab rows full-height, dismiss controls ≥44px).
- **Do** honour `prefers-color-scheme` — light and dark are peers, both fully specified.
- **Do** confine motion to state feedback (150ms transitions, 300ms progress) and respect `prefers-reduced-motion`.

### Don't:

- **Don't** build the fintech-dashboard look — no hero metric with a gradient accent, no attention-seeking charts. (PRODUCT.md anti-reference.)
- **Don't** ship the SaaS-cream + purple-gradient AI-template look; the violet is a single restrained accent, never a gradient background wash. (PRODUCT.md anti-reference.)
- **Don't** moralise spending or add gamification beyond the one quiet "paid off" moment. (PRODUCT.md anti-reference.)
- **Don't** nest a card inside a card; put secondary content on Recessed Grey instead (The No-Nested-Cards Rule).
- **Don't** introduce a second font or a display face for headings (The No-Display-Face Rule).
- **Don't** communicate status by colour alone.
- **Don't** invent a second shadow or an elevation ladder — there is one shadow token.
- **Don't** use light-grey body text "for elegance"; it fails the glance and the contrast floor.
- **Don't** use a `border-left`/`border-right` colour stripe as an accent — use full borders, tints, or leading icons.
