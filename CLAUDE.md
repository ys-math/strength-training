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
  `currentPrev`, `weeklyVolume` (ISO week), `sessionVolume` (per training day), `dailyMetrics`,
  `focusMix` (training days per intensity band, for the heatmap's mix bar), `sessionDetails`,
  `overallStats`,
  and `nextSessionSuggestion(rows, goalCtx?, config?, now?, focus?)` (per-lift load × reps heuristic — config
  in `DEFAULT_SUGGESTION_CONFIG`, theory in README's "How suggestions work" / "theory → formula map").
  It also emits a heavy **`topSet`** (SAID/Size Principle, `heavyTopSet` at ~90% e1RM) and a
  **`'return'`** action that backs the load off after a layoff (reversibility, `retentionFactor`);
  `now` (default `latestTs(rows)`, `Date.now()` from `Dashboard`) is the detraining reference.
- **`src/components/`** — presentational; each takes `rows: SetRow[]` and derives via
  `useMemo`. `Dashboard.tsx` composes them.

### Page layout — two zones

`Dashboard` composes **six** blocks, in two zones (the card set was consolidated from nine; see the
"merged cards" notes below — do not re-split them):

```
StatCards                          glance strip
[ NextSession ‖ SessionLog ]       TODAY  — what to lift / what I lifted
ProgressChart                      TREND  — All ▾ or a per-lift drill-down
[ VolumeCard ‖ FrequencyHeatmap ]  TREND
```

`SessionLog` sits in the *today* zone deliberately: it opens on the latest session by default, which
is what the deleted `LatestWorkout` card used to render **a second time**. If you find yourself
wanting a "latest workout" card, that's it — don't re-add one.

### Volume (`weeklyVolume` + `sessionVolume` → `VolumeCard`)

**One card, one quantity, two grains** — chosen by `VolumeGrainToggle` in `ChartCard`'s `right` slot
(state in `useVolumeGrain` / `src/lib/volumeGrain.ts`, persisted like the metric and heatmap modes).
Both grains use the **same accumulation rule** (big four, working sets, warmups excluded), so a week's
bar is exactly the sum of its sessions' bars — they are two readings of one number, which is why they
are one card and not two. `week` answers "am I doing enough"; `session` answers "was that day
unusually heavy" — the fatigue question.

`VolumeChart` and `SessionVolumeChart` were **merged** here (they were character-for-character the
same stacked-bar chart apart from the bucket, the baseline line, and the chip). Don't re-split them.

Session grain only: each session carries a `baseline` (mean `total` of the **previous 6 sessions**,
`SESSION_BASELINE_WINDOW`), a `deltaPct` against it, and `restDays` since the last session. The window
is an **expanding** mean until 6 priors exist, so only the very first session has a null baseline. A
week has no baseline — the weekly question is "enough?", not "unusual?" — so the dashed `Line` is the
**one** piece of grain-dependent chrome.

**The two grains are deliberately structurally identical**, and this is load-bearing: one-line
subtitle, a two-line header chip, a span slider, and a one-line footnote — in *both*. Only the text
and the baseline line differ. The reason is layout, not symmetry for its own sake: the card shares a
grid row with `FrequencyHeatmap`, which is `h-full`, so **any** height difference between grains made
the heatmap resize every time you toggled the grain. Keep them the same shape. If you add a row to one
grain (a chip, a note, a second subtitle line), add its counterpart to the other — or the neighbour
starts twitching again. `measure.mjs`-style check: the card's height must be equal in both grains at
1280 / 1024 / 420 px.

Each grain owns its **own slider index** (`weekStart` / `sessionStart`). Sharing one would silently
reframe the other chart — "session 20" and "week 20" are wildly different dates.

Two things here are load-bearing and easy to break:

- **The `Line` over the bars is not the line that was reverted in `c65f7fd`.** That one plotted
  `total` — a redundant retracing of the bar tops, which is why it added nothing. This one plots the
  *trailing baseline*, a moving reference the bars are measured **against**; it carries information no
  bar contains, and the card's whole purpose collapses without it. It's deliberately given a
  different visual role (`--text-muted`, dashed, dotless) so it never reads as a fifth series. Don't
  pattern-match it to the old revert and delete it.
- **The baseline is computed over the full history, then sliced for display.** `VolumeCard`'s span
  slider (copied from `ProgressChart`) slices `sessionVolume(rows)` *after* the fact. Computing
  it on the visible slice instead would give the first six visible bars a baseline that silently
  changes as you drag the slider — it would look like a data bug, not a code bug.

In the session grain the card uses a **custom tooltip** rather than the shared `ChartTooltip`, which
can only list series; this one also prints the session total, the Δ% vs. usual, and the rest taken
beforehand (the week grain keeps `ChartTooltip`). There is
deliberately **no spike badge or threshold outline**: volume trends upward through any progression
block (July 2026 sessions run +21 % to +177 % over baseline), so a fixed threshold would fire
constantly and train you to ignore it.

### Heatmap color modes (`FrequencyHeatmap`)

The Training-frequency calendar can color its cells three ways — **Sets / Volume / Intensity** —
chosen by `HeatmapMetricToggle` in `ChartCard`'s `right` slot (state in `useHeatmapMetric` /
`src/lib/heatmapMetric.ts`, persisted like the metric mode). All three read one map,
`dailyMetrics(rows)` → `{ sets, volume, focus }`, which **replaced `dailyActivity`**.

Four things here are load-bearing:

- **This is an *encoding* switch, not the filter that `33fa31b` removed.** That one (`DayFocusToggle`)
  *hid* the days that didn't match a heavy/light focus, so seeing your heavy days cost you sight of the
  light ones. This one never adds or removes a cell — every training day is on the grid in every mode,
  only the shade's meaning changes, which is what makes the heavy/light *distribution* visible at once.
  Don't pattern-match it to that revert and delete it.
- **Intensity has exactly one definition, and it lives in `dayFocusMap`.** That function classifies
  *every* training day (median of its per-lift top-set reps → `classifyFocus`), and `nextSessionFocus`
  now calls it for its `from` value. So the heatmap and the Next-session `FocusBanner` cannot label the
  same day differently. Never re-derive "heavy" locally in a component.
- **Everything is scoped to the big four** (`if (!r.lift || r.isWarmup) continue`, the same guard as
  `sessionVolume`), and the tonnage is taken *from* `sessionVolume` rather than re-summed — so the
  heatmap's kg for a day equals the Session-volume card's kg for that day, exactly. `dailyActivity` used
  to count accessories; the card's subtitle set-count now comes from `dailyMetrics`, not
  `overallStats.totalWorkingSets` (which still spans all exercises, as `sessionDetails` does).
- **Shade 0 (`--seq-0`) means "didn't train", in every mode.** That leaves only *four* data shades
  (`--seq-1..4`), so `quantileThresholds` returns **three** cut points (quartiles), not four, and
  `volumeBucket` floors any nonzero day at 1 — a real session must never render in the empty color even
  when every day is identical. Thresholds are computed over the **full history**, so a day's shade
  doesn't depend on what else is on screen. Absolute kg cut points were rejected: they go stale as the
  lifter gets stronger.

Sets and volume are *ordinal*, so they read off the sequential ramp. **Intensity is drawn
*categorically*** — one hue per focus, cool → hot (`--focus-light/-moderate/-heavy`, blue/green/red,
redefined in every `[data-theme]` block; `cozy` re-tones them to dusty-blue/sage/terracotta). It rode
the ramp originally (`FOCUS_SHADE` → `--seq-1/2/4`, on the theory that intensity is ordinal), and that
failed on both counts: at small cell sizes, three shades of one blue don't separate — so the
heavy/light *distribution*, the whole point of the mode, didn't read at a glance — and a darker blue
says nothing about what "heavy" *means*. **Red/green is a known color-vision collision** (moderate and heavy are
exactly the pair that merges under deuteranopia); on a single-reader dashboard that cost was weighed
and accepted, and the tooltip names the focus in words in every mode as the fallback. It's a choice,
not an oversight — don't "fix" it back to a ramp.

`FOCUS_COLOR` in `metrics.ts` is the **one** focus → color map (the twin of `FOCUS_META`, the one
focus → label map). `NextSession`'s `FocusBanner` wears the same hue as a chip, so the heatmap and the
banner can't disagree about what "heavy" looks like. Never inline a focus hex in a component.

**The cells are a fixed 13 px, and the card's leftover height is filled with *information*, not with
bigger cells.** This card shares a grid row with `VolumeCard` and is `h-full`, so it inherits that
card's height and had ~176 px of slack that `justify-between` split into two conspicuous voids.
Inflating the cells to fill it (`minmax(13px, 40px)` + `aspect-square`) was tried and **rejected — it
read as oversized**; a contribution calendar is meant to be small. The slack is instead spent on the
three stat chips (deliberately large) and the **Intensity-mix bar**. Slack is now ~36 px, i.e. ordinary
spacing. If you change either card's height, re-check this one for voids.

**The Intensity-mix bar** (`focusMix` in `metrics.ts`) is the distribution behind the Intensity mode:
one proportion bar plus `Light n (x%) · Moderate n · Heavy n`. It counts `dailyMetrics().focus`, the
*same* per-day classification the grid colors by and the DUP engine undulates on — so the bar, the
calendar, and the Next-session `FocusBanner` can never disagree about what a day was. A row of three
counts was considered; the bar won because the **balance** ("I'm 42 % heavy") is the actionable read,
and three numbers don't show it. It is shown in **every** mode, which is what lets the legend drop its
swatches (below).

Mode-dependent chrome is the grid and the legend. The ordinal modes get a captioned ramp
(`Less ▓▓▓▓▓ More`). The categorical one **no longer repeats the three named swatches** — the mix bar
above already names all three hues *and* gives their counts, so the legend would have said it twice;
it now just points there. (Unlabeled hues would still be undecodable — nothing about green says
"moderate" — the labels simply live in the mix bar now.) Nothing else is mode-dependent: the title,
the frequency chips, and the mix bar are true in every mode. The tooltip **always prints all three
metrics** regardless of mode — color is for scanning, so reading a single day should never require a
toggle.

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

### Progress scope (`ProgressChart` ⊃ `LiftDetail`)

`ProgressChart` owns a local **`Scope = 'all' | LiftKey`**. `'all'` is the four-line chart above; a
`LiftKey` renders `LiftDetailView` (`LiftDetail.tsx` — the old per-lift card, **unwrapped**: no
`ChartCard`, no selector of its own) in the same card. The two views are never needed at once, which
is why they're one card and not two.

Three things here are load-bearing:

- **The drill-down deliberately ignores `MetricMode`.** It always plots *both* e1RM (`Area`) and the
  heaviest set (dashed `Line`) on **one kg axis** — the only view in the app where the two are
  comparable, and so the only way to see whether an e1RM gain is real load or rep inflation. (Never a
  dual axis; see Conventions.) The consequence is accepted and intentional: in this scope the header's
  `ModeToggle` still drives `StatCards` but visibly does nothing to the chart. Don't "fix" that by
  making the detail mode-aware — that deletes the view's entire reason to exist.
- **The scope selector is a separate control from the legend chips.** The chips *multi-select*
  (hide/show lines) and must keep doing so. Overloading a chip click with "drill down" too would make
  neither interaction predictable.
- **The Goals switch is *not* gated on max-weight mode in the drill-down** (it is in `'all'`, where
  `goalsOn = mode === 'maxWeight' && showGoals`). A goal is a max-weight quantity, and the drill-down
  always plots the heaviest-set line — so the target line is meaningful there in either mode.

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
`PlanSet { kind: 'warmup' | 'work' | 'top'; weight; reps }`. It renders as a header (color chip +
label, pace/action tags) plus one wrapping row of `groupSets`-collapsed `SetChip` pills (W-prefixed
warmups, then working, then a `top` divider + top-set pill, then the `DeltaBadge`). `SetChip` /
`groupSets` live in `components/SetChip.tsx` (`groupSets` is typed to `{ weight, reps }[]` so it
groups both `SetDetail` and `PlanSet`) and are **shared with `SessionLog`**, so the plan you're about
to do and the history you already did are legible in the same visual grammar side by side.

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
