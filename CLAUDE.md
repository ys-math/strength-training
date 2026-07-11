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
  `currentPrev`, `weeklyVolume` (ISO week), `sessionVolume` (per training day), `dailyActivity`,
  `sessionDetails`, `overallStats`,
  and `nextSessionSuggestion(rows, goalCtx?, config?, now?, focus?)` (per-lift load × reps heuristic — config
  in `DEFAULT_SUGGESTION_CONFIG`, theory in README's "How suggestions work" / "theory → formula map").
  It also emits a heavy **`topSet`** (SAID/Size Principle, `heavyTopSet` at ~90% e1RM) and a
  **`'return'`** action that backs the load off after a layoff (reversibility, `retentionFactor`);
  `now` (default `latestTs(rows)`, `Date.now()` from `Dashboard`) is the detraining reference.
- **`src/components/`** — presentational; each takes `rows: SetRow[]` and derives via
  `useMemo`. `Dashboard.tsx` composes them.

### Session volume (`sessionVolume` → `SessionVolumeChart`)

Per-**session** tonnage, next to `weeklyVolume`'s per-week tonnage. Same accumulation rule (big four,
working sets, warmups excluded — so the two cards agree numerically), grouped by `dateKey`. Each
session carries a `baseline` (mean `total` of the **previous 6 sessions**, `SESSION_BASELINE_WINDOW`),
a `deltaPct` against it, and `restDays` since the last session. The window is an **expanding** mean
until 6 priors exist, so only the very first session has a null baseline. Weekly volume answers "am I
doing enough"; this answers "was that day unusually heavy" — the fatigue question.

Two things here are load-bearing and easy to break:

- **The `Line` over the bars is not the line that was reverted in `c65f7fd`.** That one plotted
  `total` — a redundant retracing of the bar tops, which is why it added nothing. This one plots the
  *trailing baseline*, a moving reference the bars are measured **against**; it carries information no
  bar contains, and the card's whole purpose collapses without it. It's deliberately given a
  different visual role (`--text-muted`, dashed, dotless) so it never reads as a fifth series. Don't
  pattern-match it to the old revert and delete it.
- **The baseline is computed over the full history, then sliced for display.** `SessionVolumeChart`'s
  span slider (copied from `ProgressChart`) slices `sessionVolume(rows)` *after* the fact. Computing
  it on the visible slice instead would give the first six visible bars a baseline that silently
  changes as you drag the slider — it would look like a data bug, not a code bug.

The card uses a **custom tooltip** rather than the shared `ChartTooltip`, which can only list series;
this one also prints the session total, the Δ% vs. usual, and the rest taken beforehand. There is
deliberately **no spike badge or threshold outline**: volume trends upward through any progression
block (July 2026 sessions run +21 % to +177 % over baseline), so a fixed threshold would fire
constantly and train you to ignore it.

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
`ProgressChart` also appends a dashed `${key}__p` projection series per lift from
`nextSessionSuggestion` (`projectedE1rm` in e1rm mode, `projectedWeight` in max-weight),
drawn to a synthetic future date; tooltips ignore any `__p` dataKey.

`Suggestion` (from `nextSessionSuggestion`) is structured, not a headline string: it carries
the `prev` top set, target `load/reps/sets`, per-field deltas, and the projections. The routine
has a fixed **baseline shape — 2–3 warmup sets, 3 main working sets, 1 heavy top set**
(`config.workingSets = 3` in `DEFAULT_SUGGESTION_CONFIG`) — that flexes per situation: a deload
trims the *actual last-logged* set count by `deloadSetFactor` (not the baseline — a deload eases
off from what you really did), and the top set is omitted whenever it wouldn't be heavier than the
working set or on a deload/return. `NextSession` builds the **full ordered set list** for each lift
via `sessionPlan(suggestion)` in `metrics.ts` (pure): `warmupRamp(workLoad)` (empty bar → ~60/85 %
ramp, snapped to the plate, only sets lighter than the working load — collapses to 2 sets for a
light load) → the working sets → the heavy `topSet`.
`PlanSet { kind: 'warmup' | 'work' | 'top'; weight; reps }`. It renders in the **same compact
format as `LatestWorkout`** — a header (color chip + label, pace/action tags) plus one wrapping row
of `groupSets`-collapsed `SetChip` pills (W-prefixed warmups, then working, then a `top` divider +
top-set pill, then the `DeltaBadge`). Both cards share `SetChip` / `groupSets` from
`components/SetChip.tsx` (`groupSets` is typed to `{ weight, reps }[]` so it groups both `SetDetail`
and `PlanSet`). `LatestWorkout` renders warmup chips **before** the working-set chips (the order
they're actually done in) with no divider label — the `W` prefix on each chip (from `SetChip`'s
`warmup` prop) is identification enough.

**Daily undulating periodization (DUP).** The engine is **always** DUP — one **global focus** per
next session, `'heavy' | 'moderate' | 'light'` (rep windows `[3,5]/[6,8]/[9,12]` in
`config.dup.windows`), chosen **automatically, no UI control**. `nextSessionFocus(rows)` classifies
your most recent training day (median of that day's per-lift top-set reps) into a focus, then
undulates one step along `config.dup.cycle` (`heavy → light → moderate`), returning `{ focus, from }`.
`nextSessionSuggestion` computes it once and threads it into every lift; the optional `focus?` param is
a **testability seam only** (Dashboard never passes it, so there's no control). Per lift, the focus
swaps the working rep window and scopes progression to that focus's **`stream`** — the subset of
`topWorkingSets` whose reps fall in the window — so heavy and light days each track their own trend.
Cold start (empty stream): action **`'dup'`**, a load seeded from current e1RM via the Epley inverse
at the window midpoint. Detraining still checks the *true* last session and overrides regardless of
focus. `NextSession` shows a **`FocusBanner`** (label + rep window + "last session was X, undulating
to a Y day") atop the per-lift rows. **Consequence:** the card deliberately contradicts your last
session (heavy → recommends light); the banner's "why" line is what keeps that from reading as a bug.
Because `stream` is window-scoped, the engine's old *below-range* branch (`build-reps`) is now
unreachable and kept only as the fallback return.

### Goals (drawn on the chart)

Per-lift **max-weight** targets, **recommendation-only** (no editing, no persistence). The **3-month**
target is drawn on `ProgressChart` as a dashed horizontal `ReferenceLine` per visible lift, gated by a
**Goals switch** (local `showGoals` state) and shown **only in max-weight mode** (`goalsOn = mode ===
'maxWeight' && showGoals`) since goals are a max-weight quantity. Its due-date is the next fixed
calendar quarter-end from `quarterCheckpoints` in `src/lib/goals.ts` (which also holds `HORIZONS` and
`weeksUntil`). `metrics.ts` provides `recommendedGoals` — **history-driven, bounded by diminishing
returns**: it projects `recentRatePerWeek` forward a quarter at a time with per-period **decay** (mid
×0.7, long ×0.5), scales it by two biological factors — `neuralFactor` **ψ** (training age via
`trainingAgeWeeks`; advanced lifters gain slower) and `stimulusFactor` **σ** (frequency via
`sessionFrequency`; sparse training tempers the goal) — then **clamps** the gain between a %-of-current
floor and a decelerating %-of-current cap (8/15/25 %, so a hot streak can't project to absurd numbers),
snapped to 2.5 kg and forced strictly increasing (`DEFAULT_GOAL_CONFIG`); `.short` feeds the chart lines and the
goal-aware suggestion, `.mid`/`.long` keep the curve honest. `nextSessionSuggestion(rows, goalCtx?,
config?)` is **goal-aware**: with a short-term `GoalContext` (built from the recommended short target
in `Dashboard`) it fills `Suggestion.goalPace`/`requiredPerWeek` and, when *behind* pace and only
mildly stalled, pushes a rep instead of a soft deload (hard deloads/load-jumps unchanged). `Dashboard`
computes the goal-aware `suggestions` **once** and passes them to both `NextSession` (pace chip) and
`ProgressChart` (dotted next-session projection). `ProgressChart` also owns a **span slider** (local
`startIdx`) that slices the visible date range; index-keyed end-labels/dots are offset by the slice
start. Reasoning/evidence live in README's "How goals work".

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
