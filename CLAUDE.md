# CLAUDE.md

Guidance for working in this repo. Read alongside `README.md` (user-facing docs).

## What this is

A single-page dashboard that visualizes barbell strength progress for the **big four
lifts — Bench Press, Squat, Deadlift, Overhead Press (BP/SQ/DL/OHP)** — from a
[Strong app](https://www.strong.app/) CSV export. Static site, no backend, deployed
free to GitHub Pages at <https://ys-math.github.io/strength-training/>.

## Commands

```bash
npm install
npm run dev      # dev server at http://localhost:5173/strength-training/
npm run build    # tsc -b && vite build → dist/  (run this to type-check)
npm run preview  # serve the production build at :4173
npm run test     # vitest run — unit tests for the suggestion logic
```

`npm run build` is the type-check gate. There is no lint script. The only unit tests are
Vitest coverage of `nextSessionSuggestion` (`src/lib/metrics.suggestion.test.ts`); the rest
of the pipeline is verified by build + manual/headless checks. Test files live under `src`,
so `tsc -b` type-checks them too, but they're never bundled (nothing imports them).

## Architecture & data flow

The data source is **`strong_workouts.csv` at the repo root**, bundled at build time via
Vite's `?raw` import in `src/App.tsx` (`import csv from '../strong_workouts.csv?raw'`).
There is no runtime fetch. The pipeline is one direction:

```
strong_workouts.csv ?raw
  → parse.ts   parseWorkouts(csv): string → SetRow[]   (PapaParse, Epley e1RM, warmup flag)
  → metrics.ts pure aggregation functions over SetRow[]
  → components/ Recharts + plain-div views
```

- **`src/lib/types.ts`** — `LIFTS` is the source of truth: the four lifts, their exact
  Strong "Exercise Name" strings, short keys, and CSS-var colors. Everything filters/keys
  off this. Also `SetRow`, `LiftSession`, `LiftPR`.
- **`src/lib/parse.ts`** — `epley(weight, reps) = weight * (1 + reps/30)` and
  `parseWorkouts`. Dates arrive as `"YYYY-MM-DD HH:MM:SS"` (local). Sets are keyed by
  `dateKey` (YYYY-MM-DD).
- **`src/lib/metrics.ts`** — all aggregation, pure and unit-testable: `liftSessions`,
  `liftPR`, `e1rmSeries` (per-session best e1RM), `maxWeightSeries` (per-session heaviest
  set + its reps/set-count, for the max-weight chart), `cumulativeSeries(rows, mode)` and
  `big4Series(rows, mode)` (each lift's / the summed best-to-date value, only climbs),
  `currentPrev`, `weeklyVolume` (ISO week), `dailyActivity`, `sessionDetails`, `overallStats`,
  and `nextSessionSuggestion` (per-lift load × reps heuristic — config in
  `DEFAULT_SUGGESTION_CONFIG`, theory documented in README's "How suggestions work").
- **`src/components/`** — presentational; each takes `rows: SetRow[]` and derives via
  `useMemo`. `Dashboard.tsx` composes them.

### Metric mode (est. 1RM vs. actual max weight)

A global toggle switches the primary metric shown by `StatCards` (hero + per-lift cards)
and the main `ProgressChart`. Defined in `src/lib/mode.ts`
(`MetricMode = 'e1rm' | 'maxWeight'`, `MODES`, `DEFAULT_MODE`, `MODE_STORAGE_KEY`);
`src/hooks/useMetricMode.ts` reads/writes `localStorage`; `ModeToggle.tsx` is the header
control. Mode-aware metrics take `mode` and read the right per-session value via an internal
`sessionMetric` (`bestE1rm` or `maxWeight`). Both modes of `ProgressChart` plot the best set
*per session* (monotone lines): `e1rm` via `e1rmSeries`, `maxWeight` via `maxWeightSeries`
(whose points also carry each set's reps and working-set count, shown in a custom tooltip).
The `StatCards` per-lift "current PR" figure still comes from `cumulativeSeries` (best-to-date).

### Theming

Three selectable UI themes — `modern-dark` (default), `modern-light`, `cozy` — defined in
`src/lib/theme.ts` (`THEMES`, `DEFAULT_THEME`, `STORAGE_KEY`). Each theme is a
`[data-theme='…']` block of CSS custom properties in `src/index.css`; `data-theme` on
`<html>` selects one, so switching is a single attribute change (no re-render of colors).
`src/hooks/useTheme.ts` reads/writes the attribute + `localStorage`; `ThemeSwitcher.tsx`
is the picker in the header.

**Gotcha:** `index.html` has an inline blocking script that sets `data-theme` before first
paint (avoids a flash of the default theme). Its `STORAGE_KEY` string and theme-id list are
duplicated there and **must stay in sync with `src/lib/theme.ts`** when you add/rename a
theme.

## Conventions — keep these

- **Units are kg.** Weights come straight from the CSV; no conversion.
- **Warmup sets** are the rows with `Set Order === "W"` (`isWarmup`). They are **excluded
  from working volume and frequency**, but kept for max-based metrics (a warmup never wins
  a max, so it's harmless).
- **e1RM is Epley** (`weight * (1 + reps/30)`). If you add another formula, put it in
  `parse.ts`/`metrics.ts` and keep the display note in `Dashboard.tsx`'s footer in sync.
- **Colors follow the dataviz skill's validated palette**, exposed as CSS vars
  (`--lift-bp/-sq/-dl/-ohp`, sequential `--seq-*`, ink/surface roles) and redefined per
  theme block in `src/index.css`. A lift's color follows the entity everywhere; don't
  hardcode hex in components — use the `color` on its `LIFTS` entry (a `var(--lift-*)`
  reference) or the CSS var directly, so all three themes stay correct. **Never build a
  dual-axis chart** (see `LiftDetail`: e1RM and heaviest set share one kg axis on purpose).
- **Recharts marks must set `isAnimationActive={false}`.** Grow-in animation renders blank
  under throttled requestAnimationFrame (headless/screenshots, and a flash on load). All
  Lines/Areas/Bars here disable it — match that when adding charts.
- Text wears ink tokens (`--text-*`), not the series color; identity is carried by a
  color chip beside the text.

## Adding a new lift or chart

- **New lift:** add an entry to `LIFTS` in `types.ts` (key, label, exact `exercise` string,
  a `--lift-*` CSS var color) and a matching var in **every `[data-theme]` block** in
  `index.css`. Metrics and StatCards pick it up automatically; the `LiftKey`-typed fields in
  `e1rmSeries`/`cumulativeSeries`/`weeklyVolume` need the new key added.
- **New theme:** add it to `THEMES` in `src/lib/theme.ts`, add a `[data-theme='…']` block in
  `index.css`, and update the theme-id list in the inline script in `index.html`.
- **New chart:** wrap it in `ChartCard`, reuse `ChartTooltip`, add a `metrics.ts` function
  rather than aggregating inside the component.

## Deployment

Push to `main` → `.github/workflows/deploy.yml` runs `npm ci && npm run build` and deploys
`dist/` to GitHub Pages. Pages is already enabled (Actions source). The Vite `base` is
`/strength-training/` — it must match the repo name; update it there if the repo is renamed.

## Data update workflow (the user's normal loop)

On the user's Mac this is automated: `scripts/sync-data.sh`, run by the
`com.ys-math.strength-training.sync` LaunchAgent (`scripts/*.plist`), watches
`~/Library/Mobile Documents/com~apple~CloudDocs/StrongExports` for a new Strong export
and — only if its content differs from the committed CSV — copies it to
`strong_workouts.csv`, commits, and pushes to `main`. No code change involved; see the
"Automatic sync via iCloud Drive" section in `README.md` for the one-time setup
(Full Disk Access for `/bin/bash` + Terminal, since iCloud Drive is TCC-protected) and
the manual fallback (replace the CSV, commit, push).

If you touch `scripts/sync-data.sh`, keep it idempotent (hash-compare before
committing — no empty commits) and keep the unpushed-commit retry check at the top
(a failed `git push` must not look like "no change" on the next run).
