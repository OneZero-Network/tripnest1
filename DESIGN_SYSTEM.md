# TripNest Design System v1

Approved direction. Every screen should consume these tokens (`components/UI.js` `theme`
object) rather than hard-coded values — that's what makes a future re-theme an edit in one
file instead of a find-and-replace across the app.

## Design Principles

1. Calm before colorful
2. Information before decoration
3. Whitespace before borders
4. One primary action per screen
5. Consistency before creativity
6. Capture first, organize second
7. Design for one-handed use
8. Offline is the default
9. Motion should communicate, never distract
10. Every screen should reduce the organizer's mental load

## Tokens (`theme` in `components/UI.js`)

| Concept | Token path | Value |
|---|---|---|
| Brand | `theme.brand` / `.brandDeep` / `.brandWash` | `#0E7C86` / `#0B6169` / `#E3F4F5` |
| Ink (text) | `theme.ink` / `.inkSoft` / `.inkMute` | `#14181C` / `#414A55` / `#7B8695` |
| Surface | `theme.surface` (card) / `.bg` (page) | `#FFFFFF` / `#F7F8FA` |
| Border | `theme.line` | `#E4E7EB` |
| Danger / Warning | `theme.danger` / `.warn` (+ `Wash` variants) | `#C2413A` / `#B4790B` |
| Spacing | `theme.space.{xs,sm,md,lg,xl,xxl,xxxl}` | 4 · 8 · 12 · 16 · 24 · 32 · 48 |
| Radius | `theme.radius.{sm,md,lg,xl}` | 10 · 16 · 20 · 26 |
| Type scale | `theme.type.{hero,title,heading,body,label,caption}` | 30 · 20 · 16 · 15 · 13 · 11.5 |
| Weight ceiling | `theme.weight.{regular,medium,semibold}` | 400 · 500 · 600 — **nothing renders above 600** |

Color meaning is reserved, not decorative: brand teal = primary action / positive finance /
success. It should not appear on chrome that isn't one of those three things.

## Motion (`theme.motion`)

| Interaction | Duration |
|---|---|
| Screen transition | 240ms |
| Bottom sheet | 280ms |
| FAB expand | 180ms |
| Card press | scale to 0.98 |
| Success animation | ≤380ms |

Motion should feel responsive, not theatrical — these are ceilings, not targets to hit exactly.

## Accessibility (`theme.a11y`)

- Body text ≥ 15sp (`theme.a11y.minBodyFont`) — already the default body size.
- Touch targets ≥ 48×48dp (`theme.a11y.minTouchTarget`) — `PrimaryButton` now enforces this
  via `minHeight`; any other tappable control should too.
- Contrast: WCAG AA against the surface it sits on.
- Dynamic font scaling: don't hard-cap font scale in any screen; let the OS setting apply.
- One-handed reach: primary actions (FAB, "Save") stay in the lower half of the screen.
- No information by color alone: pair every color-coded state (positive/negative balance,
  danger action) with a label or icon, not just a hue.

## Component patterns

- **Hairline lists** for repeated data (expenses, notes, timeline rows) — one container,
  divided by `theme.line`, not individually bordered/shadowed cards. Cards are reserved for
  bounded singular objects (Cash Left hero, a traveler record).
- **Underline navigation** for the tab switcher — active tab gets ink text + 2px brand
  underline, not a filled pill. Filled pills stay for infrequent choices (filters).
- **No drop shadows** — flat surface + `theme.line` hairline border reads calmer and was
  also the direct fix for the double-shadow rendering bug.
- **Contextual Hero** (`CockpitCard`) — one component, several meanings depending on where
  the organizer actually is:
  - Morning (before 12:00): today's plan count
  - Midday: cash left
  - Evening with pending drafts: pending draft count
  - Trip closed: settlement ready
  - **Not built:** a "Travel / next destination" state — there's no flight/hotel/location
    data in the schema to honestly derive "in transit" from. Would need a real data model
    addition, not a UI trick, before it can ship without guessing.
- **Empty states**: title is an instruction ("Start by logging who paid for the first
  expense"), not a status report ("No expenses yet"). One-line hint below explains why/how.
- **Loading**: skeleton blocks for lists on first load; a full-screen spinner only for
  genuinely blocking loads (Splash, initial DB open) — never for a list that already has
  cached data to show.

## Device validation checklist (before this ships to the UI team as final)

- Android 10 through 15
- Small (~5.5"), standard (~6.3"), large (~6.8") phones, and a basic tablet layout
- Gesture navigation and 3-button navigation
- Notches / punch-hole cameras (this is exactly what the SafeAreaView fix earlier addressed)
- Landscape, where a screen reasonably supports it

None of this has been run on a physical device yet — same gap flagged in every previous
pass. It's the next real step, not a formality.
