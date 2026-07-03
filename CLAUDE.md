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
```

There is no separate test/lint script — `npm run build` is the type-check gate.

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
  `liftPR`, `e1rmSeries`, `big4Series` (sum of each lift's best-e1RM-to-date, only climbs),
  `weeklyVolume` (ISO week), `dailyActivity`, `overallStats`.
- **`src/components/`** — presentational; each takes `rows: SetRow[]` and derives via
  `useMemo`. `Dashboard.tsx` composes them.

## Conventions — keep these

- **Units are kg.** Weights come straight from the CSV; no conversion.
- **Warmup sets** are the rows with `Set Order === "W"` (`isWarmup`). They are **excluded
  from working volume and frequency**, but kept for max-based metrics (a warmup never wins
  a max, so it's harmless).
- **e1RM is Epley** (`weight * (1 + reps/30)`). If you add another formula, put it in
  `parse.ts`/`metrics.ts` and keep the display note in `Dashboard.tsx`'s footer in sync.
- **Colors follow the dataviz skill's validated palette** (defined as CSS vars in
  `src/index.css`: `--lift-bp/-sq/-dl/-ohp`, sequential `--seq-*`, ink/surface roles).
  A lift's color follows the entity everywhere; don't hardcode hex in components — use the
  `color` on its `LIFTS` entry or the CSS var. **Never build a dual-axis chart** (see
  `LiftDetail`: e1RM and heaviest set share one kg axis on purpose).
- **Recharts marks must set `isAnimationActive={false}`.** Grow-in animation renders blank
  under throttled requestAnimationFrame (headless/screenshots, and a flash on load). All
  Lines/Areas/Bars here disable it — match that when adding charts.
- Text wears ink tokens (`--text-*`), not the series color; identity is carried by a
  color chip beside the text.

## Adding a new lift or chart

- **New lift:** add an entry to `LIFTS` in `types.ts` (key, label, exact `exercise` string,
  a `--lift-*` CSS var color) and a matching var in `index.css`. Metrics and StatCards pick
  it up automatically; the `LiftKey`-typed fields in `e1rmSeries`/`weeklyVolume` need the
  new key added.
- **New chart:** wrap it in `ChartCard`, reuse `ChartTooltip`, add a `metrics.ts` function
  rather than aggregating inside the component.

## Deployment

Push to `main` → `.github/workflows/deploy.yml` runs `npm ci && npm run build` and deploys
`dist/` to GitHub Pages. Pages is already enabled (Actions source). The Vite `base` is
`/strength-training/` — it must match the repo name; update it there if the repo is renamed.

## Data update workflow (the user's normal loop)

Re-export from Strong → replace root `strong_workouts.csv` → commit & push. No code change.
