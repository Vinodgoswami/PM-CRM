# 16 · Theme & animation

**Status: applied (D-013).** White surfaces on a soft grey canvas, green accent (`--primary` oklch(0.52 0.11 156)),
Manrope font, rounded cards (`--radius-lg` 1.25rem) with a soft shadow, top pill navigation with a sliding active pill,
striped (`.hatch`) bars with one highlighted bar in charts — after the owner's "Quixotic" reference.
shadcn theme, and features must still use tokens only, so the theme can be swapped in one place.

## Where it lives

- Tokens: `packages/ui/src/theme/tokens.css` (CSS variables) mapped into Tailwind v4 `@theme`.
- Motion presets: `packages/ui/src/motion/presets.ts` (Motion variants and transitions).
- Chart theme: `packages/ui/src/charts/echarts-theme.ts` (built from the same tokens).

## Tokens to define (fill from references)

| Group      | Tokens                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour     | background, surface, surface-raised, border, text, text-muted, primary, primary-contrast, accent, success, warning, danger, info; chart-1…chart-8 |
| Status     | paid, partially-paid, due-soon, overdue, scheduled, unscheduled                                                                                   |
| Typography | font-sans, font-mono (for amounts), sizes xs–4xl, weights, tabular numbers on                                                                     |
| Shape      | radius sm/md/lg/xl, border width                                                                                                                  |
| Elevation  | shadow-sm/md/lg, glass/blur (if the theme uses it)                                                                                                |
| Spacing    | 4-px scale                                                                                                                                        |
| Motion     | duration-fast/base/slow, easing-standard/emphasised/exit, spring presets                                                                          |

Light only (D-014): the app does not follow the OS dark mode.

## Motion inventory (where animation is used)

| Place             | Default intent                                         |
| ----------------- | ------------------------------------------------------ |
| Route change      | Fade + small slide                                     |
| KPI values        | Count-up on first load and filter change               |
| Charts            | Draw/grow on enter; smooth transition on filter change |
| Lists / tables    | Staggered row enter; layout animation on sort/filter   |
| Mark as paid      | Row status morphs to Paid; total counters update       |
| Dialogs / drawers | Scale-fade / slide                                     |
| Skeletons         | Shimmer                                                |
| Hover / press     | Subtle lift / scale                                    |

Rules: animation never delays data or input; all motion respects `prefers-reduced-motion` (fall back to instant or
fade); durations come from tokens only.

## To capture when references arrive

- Links/screenshots/videos, and what to take from each (colour, layout, motion, typography).
- Light/dark preference, brand colours, logo, font licences.
- Any signature effects (glassmorphism, gradients, 3D, Lottie) and where they belong.

## Dropdowns

All dropdowns use our own `Select` (packages/ui): a labelled pill button whose list always opens **below** it, as wide
as the button, with the current choice ticked. Never a native `<select>` (on macOS its menu covers the field) and no
third-party select library. Wrap `<option>` children with `OptionSelect` (apps/web) for drop-in use.
