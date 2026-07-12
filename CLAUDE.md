# CLAUDE.md

Guidance for working in this repo. Read alongside `README.md` (user-facing docs) and
`docs/METHOD.md` (the suggestion/goal rules, their formulas, and the evidence behind each).

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

`npm run build` is the type-check gate. There is no lint script. Vitest covers the pure metrics —
`nextSessionSuggestion` (`metrics.suggestion.test.ts`), the drill-down's per-set series
(`metrics.blocks.test.ts`), the heatmap (`metrics.heatmap.test.ts`), session volume, and goals; the
components are verified by build + manual checks. Test files live under `src`, so `tsc -b`
type-checks them too, but they're never bundled (nothing imports them).

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
  `liftPR`, `sessionMaxSeries(rows)` (each lift's heaviest *working* set **per session** — the main
  ProgressChart; can descend, and carries `isPR` / `focus` / all-time `records` so the fall stays
  legible), `cumulativeSeries(rows)` and `big4Series(rows)` (each lift's / the summed
  best-to-date heaviest set, only climbs — `cumulativeSeries` is now **`StatCards`-only**, no longer
  plotted), `liftSetSeries(rows, lift)` (a lift's history as the sets actually
  performed, session by session — the shape the drill-down's set-block chart draws) and
  `liftGrowth(rows, lift, from?)` (that card's two rates: the record's kg/wk and weekly tonnage's %/wk,
  scoped to the visible span),
  `currentPrev`, `weeklyVolume` (ISO week), `sessionVolume` (per training day), `dailyMetrics`,
  `focusMix` (training days per intensity band, for the heatmap's mix bar), `sessionDetails`,
  `overallStats`,
  and `nextSessionSuggestion(rows, goalCtx?, config?, now?, focus?)` (per-lift load × reps heuristic — config
  in `DEFAULT_SUGGESTION_CONFIG`, theory in `docs/METHOD.md`'s "How suggestions work" / "theory → formula map").
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
  *every* training day (median of its per-lift **working**-set reps → `classifyFocus`), and
  `nextSessionFocus` now calls it for its `from` value. So the heatmap and the Next-session
  `FocusBanner` cannot label the same day differently. Never re-derive "heavy" locally in a component.
  `dayFocusDetail` is the same map plus the deciding rep count, which the tooltip prints so the label
  is auditable.
- **It reads `dayWorkingSets`, *not* `topWorkingSets` — the distinction is load-bearing.** The routine
  ends each lift with one heavy top set (~90 % e1RM, 2–3 reps), so the *heaviest* set of the day is the
  top set. Reading it answers "what's my record"; it does **not** answer "what did I train". Asking the
  wrong one labelled 2026-07-05 and 07-12 `heavy` when the working sets were 6 reps.
  `dayWorkingSets` takes the **modal load** per lift per day — the weight carrying the most working
  sets, ties to the heavier — and its max reps. The load is chosen *positively* ("the load I worked
  at") rather than by discarding a set guessed to be the top one: the CSV has **no top-set marker**
  (`Set Order` is just 1,2,3,4), so shape is all there is, and the modal load is what survives contact
  with ramps and drop-off sets. Its `bestE1rm` covers those sets only, so the top set the engine
  *recommends* stays anchored to what the working sets prove instead of ratcheting off its own previous
  value. **Both functions must keep existing** — see the engine note below.
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

### Nothing estimated is ever plotted — and why that forces the rest of the design

**e1RM is never drawn, labelled, or printed anywhere in the UI.** It survives only *inside*
`metrics.ts`, where it is load-bearing and invisible: `isStagnant` (the plateau check), `heavyTopSet`
(~90 % of e1RM), the DUP cold-start load seed, and the goal projection. There is no metric-mode
toggle — `MetricMode`, `mode.ts`, `useMetricMode.ts` and `ModeToggle.tsx` were **removed**, not
hidden. Don't reintroduce a mode; don't surface an estimate. (Removing Epley from the *engine* is a
different and much larger project — it would require re-deriving "90 % of *what*".)

The consequence is what shapes both charts, and it is not obvious: **e1RM's one real virtue was
rep-normalization** — it made a heavy day and a light day comparable on one axis. The engine runs
**DUP**, deliberately alternating heavy/moderate/light. So a raw heaviest-set-per-session line
**zigzags by design** (a light day is a 30 kg cliff that is *not* a regression), and e1RM was the
thing hiding it. Take e1RM away and any chart that still compares across rep ranges starts lying.
Hence:

- **The `'all'` chart plots each session's own heaviest working set** (`sessionMaxSeries`) — every
  point a weight lifted *that day*. **It therefore zigzags, by design.** This *replaced* a
  best-to-date (monotone) line, and the swap was deliberate: a line that cannot descend renders a
  deload or a light block as **flat**, so the chart went dead for weeks at a time (bench sat at
  67.5 kg through a month of real training). **Accepted cost, eyes open:** the top of the line is no
  longer guaranteed to be your record, and a planned light day (Jul 10 bench: 50 kg × 11) is a
  17.5 kg cliff drawn exactly like an injury would be. **Do not "fix" this back to a monotone
  series** — `cumulativeSeries` still exists, but only `StatCards` uses it now.
- Three things exist *solely* to stop that cliff reading as a regression; none is decoration:
  **`isPR`** (a running max over the **full history**, decided in `metrics.ts`) drives the dots —
  the old rule compared a point with its *predecessor*, which equals "beats the record" only on a
  monotone line; here it would dot every rebound (60 → 50 → 60 sets no record). **`focus`** (from
  `dayFocusMap`, never re-derived) heads the tooltip — "Light day" is the *answer* to the cliff, and
  this card is the only place it's given. **`records`** feeds the legend chips — they must show the
  all-time PR, **not the last point**, or a light day prints "BP 50" and reads as "my bench is
  50 kg". A footnote states the hazard in words.
- **Warmups are excluded** — the series is built on `topWorkingSets` (the same per-day top set the
  DUP engine progresses off, so the chart plots the number the engine reasons about).
  `liftSessions.maxWeight` counts warmups, which was harmless on a monotone line but **not** here:
  two squat days (2026-06-04, 06-19) logged warmups *only*, and would plot as fake 50/60 kg dips.
  They now emit no point and `connectNulls` bridges them.
- **The drill-down doesn't compare across rep ranges at all** — it stops plotting *max weight* and
  plots the **sets themselves**. See below.

`ProgressChart` still appends a dashed `${key}__p` projection per lift from `nextSessionSuggestion`
(`projectedWeight`) to a synthetic future date; tooltips ignore any `__p` dataKey. `projValue`
now draws that projection **whether it rises or falls**. It used to suppress any projection that
wouldn't beat the record — necessary when the line couldn't descend, but it meant the suggestion was
hidden nearly always, since under DUP the next session is usually *lighter* than the standing record.
A projected light day is a real prediction and this axis can say so. **Don't reinstate the
suppression.**

### Progress scope (`ProgressChart` ⊃ `LiftDetail`)

`ProgressChart` owns a local **`Scope = 'all' | LiftKey`**. `'all'` is the per-session max-weight
four-line chart; a `LiftKey` renders `LiftDetailView` (`LiftDetail.tsx`, **unwrapped**: no `ChartCard`, no
selector of its own) in the same card. The two views are never needed at once, which is why they're
one card and not two.

**The drill-down is a set-block chart, and its y-axis is kg of *volume*, not kg of weight.** From
`liftSetSeries`: one **column** per session, one gray **tray** per set, one **block** per rep, each
block as tall as that set's weight — so a column's height *is* that session's volume for the lift, and
weight / reps / sets / volume all read off one picture. Plain divs, not Recharts (which can't nest
per-rep blocks inside per-set trays); `FrequencyHeatmap` is the precedent. Above it, a headline shows
the lift's all-time heaviest set, plus **two rates from `liftGrowth`** — see below.

This replaced a three-line heavy/moderate/light rep-range stream chart (`liftStreamSeries` /
`streamSummary`, both **deleted**). **Do not reinstate it.** The rep-range split was removed on
purpose: the drill-down's question is now "what did a session *look* like", not "is each rep range
getting heavier". `classifyFocus`, `FOCUS_COLOR`, `FOCUS_META`, `dayFocusMap` and `focusMix` all
survive — the heatmap's Intensity mode, the DUP engine and `NextSession`'s `FocusBanner` still need
them — but **nothing colors this card by focus**, and no surface answers per-rep-range progression
any more. That is the accepted price of the trade below.

Six things here are load-bearing:

- **Height is volume, so weight is nearly invisible — that is the deliberate trade, not a bug.** At a
  480 px body, px/kg runs 0.15–0.21, so a 60 kg block and a 50 kg block differ by about **2 px**.
  Weight is legible **only** in the PR headline and the hover tooltip (which therefore lists *every*
  set in full — it's the sole readout). Don't "fix" this with a weight axis, a shade ramp keyed to
  weight, a second panel, or focus hues. Volume was chosen for the axis with this cost on the table.
- **Weight and volume are anti-correlated under DUP, so the tallest column is usually the *lightest*
  session.** Jul 8 bench: 60 kg — the heaviest working load — and 900 kg, the *shortest* column. Jul
  10: 50 kg, and 1700 kg, the tallest. Correct by definition. A reader who expects "taller = stronger"
  will read this chart exactly backwards; the subtitle and footnote exist to prevent that.
- **Tray and rep separators are zero-height chrome** (`outline` + `inset box-shadow`), never inserted
  gaps or padding. If they took real height, a 5-set session would render taller than a 3-set session
  of the same volume and the chart's one claim — height *is* volume — would quietly be false. (The
  gaps *between sessions* are ordinary flex `gap` — horizontal, so they cost nothing.)
- **Blocks and trays are square-cornered, and that is not a style choice.** A block's *height* is the
  weight, and a corner radius eats the ends of the very rectangle that encodes it — worst on a light
  load at a squashed scale, where a block is only a few px tall.
- **The two separators differ in *kind*, not in width — otherwise the sets can't be counted**, which is
  the tray's entire job. Because the blocks are square and butted, gray appears **only** at a set's
  edges, never between reps: **gray (`--surface-2`) = the tray around one set**; **a translucent dark
  score line = the next rep**. Two arrangements have already failed here: making both separators gray
  (3 px vs 1 px) made the sets vanish into the reps, and *rounding the blocks* did the same, because
  gray then showed between every rep. Keep gray exclusive to set edges.
- **The y-domain is the biggest session *on screen*** — `Math.max(...shown)`, not the full history. So
  the tallest visible column always fills the plot. **Consequence, accepted:** dragging the span slider
  rescales every block, so a block's pixel height is only comparable *within* one view. `liftGrowth` is
  scoped to the same window for the same reason — the whole card describes the sessions you can see.
  The slider carries **its own index** (not `ProgressChart`'s: "BP session 20" and "all-lift date 20"
  are different dates).
- **Warmups are excluded** (`if (r.lift !== lift || r.isWarmup)`, the same guard as `sessionVolume` and
  `dailyMetrics`), and `volume` is rounded the same way. So a column's kg **equals** that lift's segment
  of the Session-volume card's bar for the same date, exactly, and the heatmap's kg for that day.
  Including warmups would inflate a bench day ~29 % and put this card at odds with both. There's a
  regression test asserting the agreement (`metrics.blocks.test.ts`).

**The two rates (`liftGrowth`) exist because the blocks can't say either thing.** The axis is volume,
so weight is invisible — hence **Max weight** (kg, + kg/wk); and a single column has no trend — hence
**Weekly volume** (kg/wk, + %/wk). They use *different statistics on purpose*:

- **Max weight takes the window's running max**, not a fit through the per-session top sets. The engine
  runs DUP, so top weight alternates heavy/light **by design** — a fit would measure where the window
  happened to start and end in the cycle, and a window ending on a light day would print a **loss**
  while the record never fell. A running max only climbs, so its slope is "how fast the record
  advanced". There's a regression test for exactly this.
- **Weekly volume takes a least-squares slope**, because it's a *level*, not a record — and it's shown
  as a **% of its own mean** so it reads next to a kg/wk without a second unit. **Rest weeks inside the
  window are filled in as 0**: a week you didn't train really was a zero-volume week, and dropping it
  would flatter the trend.
- A rate is **null (`—`) rather than 0** when the window is too short to have one (under a week /
  under two weeks). Don't substitute a zero; it would read as "flat" instead of "unknown".

Two consequences worth knowing rather than fixing: a day with **two logged workouts** merges into one
column (`liftSetSeries` groups by `dateKey`, as `sessionVolume` does — a "training day"), so it can
tower over its neighbours and squash them (2026-05-03 does this to the squat) — the span slider is the
escape hatch, since the domain follows what's shown. And **the goal `ReferenceLine` is gone from this
scope**: a goal is a
*max-weight* kg number and has no coordinate on a volume axis, so `ProgressChart` **hides** the Goals
switch when `scope !== 'all'` rather than leaving a dead control on screen.

Also load-bearing: **the scope selector is a separate control from the legend chips.** The chips
*multi-select* (hide/show lines) and must keep doing so. Overloading a chip click with "drill down"
would make neither interaction predictable.

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
your most recent training day (median of that day's per-lift working-set reps) into a focus, then
undulates one step along `config.dup.cycle` (`heavy → light → moderate`), returning `{ focus, from }`.
`nextSessionSuggestion` computes it once and threads it into every lift; the optional `focus?` param is
a **testability seam only** (Dashboard never passes it, so there's no control). Per lift, the focus
swaps the working rep window and scopes progression to that focus's **`stream`** — the subset of
**`dayWorkingSets`** whose reps fall in the window — so heavy and light days each track their own trend.

**`stream` reads `dayWorkingSets`; `trueLast` reads `topWorkingSets`. Don't collapse them.** They are
two questions and the engine needs both. `stream` asks *what did I train*, so a heavy top set must not
speak for the session: filtering `topWorkingSets` by rep window silently **dropped every top-set day
from its own stream** (a 6-rep bench day enters as its 2-rep top set, outside the 6–8 moderate window),
so the engine progressed moderate bench from the last session that happened to have no top set — and on
the heavy side it read a 70×3 squat top set as if that were the working session. `trueLast` asks *how
strong am I* and must keep seeing the top set: it drives detraining, the cold-start e1RM seed, and the
goal-pace current best, and a 70×3 squat is a real lift and a real record.

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
**Goals switch** (local `showGoals` state; `goalsOn = showGoals`). The goal is a **max-weight**
quantity, so it is meaningful **only in the `'all'` scope**: the drill-down's axis is kg of *volume*,
where a 65 kg target has no coordinate. The switch is therefore **hidden** when `scope !== 'all'` — not
disabled, not left drawing nothing — so no dead control sits on screen. Its due-date is the next fixed
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
start. Reasoning/evidence live in `docs/METHOD.md`'s "How goals work".

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
- **Every plotted and printed number is a weight actually lifted.** e1RM is Epley
  (`weight * (1 + reps/30)`) and stays **engine-internal** — never render it. See "Nothing
  estimated is ever plotted" above before you reach for `bestE1rm` in a component.
- **Colors follow the dataviz skill's validated palette**, exposed as CSS vars
  (`--lift-bp/-sq/-dl/-ohp`, sequential `--seq-*`, focus `--focus-*`, ink/surface roles) and
  redefined per theme block in `src/index.css`. A lift's color follows the entity everywhere; don't
  hardcode hex in components — use the `color` on its `LIFTS` entry (a `var(--lift-*)`
  reference), `FOCUS_COLOR` for a rep range, or the CSS var directly, so all three themes stay
  correct. **Never build a dual-axis chart** (see `LiftDetail`: three rep-range streams share one kg
  axis on purpose).
- **Recharts marks must set `isAnimationActive={false}`.** Grow-in animation renders blank
  under throttled requestAnimationFrame (headless/screenshots, and a flash on load). All
  Lines/Areas/Bars here disable it — match that when adding charts.
- Text wears ink tokens (`--text-*`), not the series color; identity is carried by a
  color chip beside the text.

## Adding a new lift or chart

- **New lift:** add an entry to `LIFTS` in `types.ts` (key, label, exact `exercise` string,
  a `--lift-*` CSS var color) and a matching var in **every `[data-theme]` block** in
  `index.css`. Metrics and StatCards pick it up automatically; the `LiftKey`-typed fields in
  `cumulativeSeries`/`weeklyVolume` need the new key added.
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
collapsed "auto-sync new exports from iCloud Drive" block under "Use it with your own
data" in `README.md` for the one-time setup
(Full Disk Access for `/bin/bash` + Terminal, since iCloud Drive is TCC-protected) and
the manual fallback (replace the CSV, commit, push).

If you touch `scripts/sync-data.sh`, keep it idempotent (hash-compare before
committing — no empty commits) and keep the unpushed-commit retry check at the top
(a failed `git push` must not look like "no change" on the next run).
