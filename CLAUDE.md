# CLAUDE.md

Guidance for working in this repo. Read alongside `README.md` (user-facing) and
`docs/METHOD.md` (the algorithm, in prose).

## What this is

A single-page dashboard that visualizes barbell strength progress for the **big four lifts —
Bench Press, Squat, Deadlift, Overhead Press (BP/SQ/DL/OHP)** — from a
[Strong app](https://www.strong.app/) CSV export. Static site, no backend, deployed free to
GitHub Pages at <https://ys-math.github.io/strength-training/>.

## Commands

```bash
npm install
npm run dev      # dev server at http://localhost:5173/strength-training/
npm run build    # tsc -b && vite build → dist/  (run this to type-check)
npm run preview  # serve the production build at :4173
npm run test     # vitest run
```

`npm run build` is the type-check gate. There is no lint script. Test files live under `src`, so
`tsc -b` type-checks them too, but they're never bundled.

## Architecture & data flow

The data source is **`strong_workouts.csv` at the repo root**, bundled at build time via Vite's
`?raw` import in `src/App.tsx`. There is no runtime fetch. The pipeline is one direction:

```
strong_workouts.csv ?raw
  → parse.ts    parseWorkouts(csv): string → SetRow[]
  → engine.ts   the next-session algorithm        ─┐
  → metrics.ts  chart aggregation over SetRow[]   ─┴→ components/
```

- **`src/lib/types.ts`** — `LIFTS` is the source of truth: the four lifts, their exact Strong
  "Exercise Name" strings, short keys, and CSS-var colors. Everything filters off this.
- **`src/lib/parse.ts`** — `parseWorkouts`. Dates arrive as `"YYYY-MM-DD HH:MM:SS"` (local);
  sets are keyed by `dateKey` (YYYY-MM-DD).
- **`src/lib/engine.ts`** — the **entire** algorithm, ~356 lines with its comments, readable top
  to bottom. See below.
- **`src/lib/metrics.ts`** — chart aggregation only, pure and unit-testable: `liftSessions`,
  `liftPR`, `sessionMaxSeries`, `cumulativeSeries`, `big4Series`, `weeklyVolume`, `sessionVolume`,
  `dailyMetrics`, `liftSetSeries`, `liftGrowth`, `sessionDetails`, `overallStats`,
  `frequencyStats`, `quantileThresholds`, `volumeBucket`.
- **`src/lib/dateRange.ts`** — the span control's data model. `rowsInRange` is the only filter.
- **`src/components/`** — presentational; each takes `rows: SetRow[]` and derives via `useMemo`.
  `Dashboard.tsx` composes them.

### The engine

Documented in full in `docs/METHOD.md` — read that before changing a rule. In short: three rep
bands (`heavy 3-5`, `moderate 6-9`, `volume 10-12`) plus a derived 2-rep top set; one
progression track per lift per band, twelve in all; the rotation is `heavy → volume → moderate`,
**per lift**, read off that lift's own last session. One rule advances a track: an unfinished
session repeats, a session at the top of its band earns 2.5 kg at the bottom of the band,
anything else adds a rep.

Load-bearing details, each of which has already been got wrong once:

- **The straight sets are the modal load**, taken positively rather than by discarding a set
  guessed to be the top one. The export has no top-set marker (`Set Order` is just 1,2,3,4), so
  shape is all there is. 57 of 181 lift-days have mixed loads; the modal load is what survives
  ramp-ups and drop-off sets.
- **`round(mean(reps))` does both jobs** — it labels the band and it counts what you achieved.
  `floor` was tried and misfiles 8 of 181 days, including a 65 kg squat session into the heavy
  track beside real 80 kg work. Don't split it back into two statistics without a reason.
- **Counts outside 3-12 clamp**, so a near-max day of doubles reads as heavy. `top` is not a
  rotation state; four real days would otherwise fall out of the cycle entirely.
- **The unfinished check is what makes "3 sets" mean something.** Without it the shape is
  presentation only, and 29 of 181 lift-days would advance the load off two sets.
- **The top set's floor is not paranoia.** The heavy factor is 1.05×, which snaps back onto the
  straight-set load at 20 and 22.5 kg — both reachable by overhead press.
- **No estimate, anywhere.** `epley()`, `e1rm`, goals and deload were all deleted. A band with
  no history prints no number rather than seeding one from a neighbour. Don't reintroduce an
  estimate to fill a gap.
- **No layoff adjustment.** A stale track still gets its plate step; the card shows the
  reference's age instead. This was chosen over a staleness threshold, which is a deload
  wearing a different name.

`dayBandMap` is the **one** place a training day is classified, and `BAND_COLOR` / `BAND_META`
are the one band → color and band → label maps. The heatmap, the trend chart's tooltip and the
Next-session chip all read them, so those three can never disagree about what heavy looks like.
Never re-derive a band locally in a component, and never inline a band hex.

### Page layout — two zones

```
StatCards                          glance strip
[ NextSession ‖ SessionLog ]       TODAY  — what to lift / what I lifted
ProgressChart                      TREND  — All ▾ or a per-lift drill-down
                                          — owns the span control, in both scopes
[ VolumeCard ‖ FrequencyHeatmap ]  TREND
```

`SessionLog` sits in the *today* zone deliberately: it opens on the latest session, which is what
a separate "latest workout" card would render a second time. Don't add one.

### The date range

**One control, presets plus a two-handle track**, rendered inside `ProgressChart` below the plot
in *both* scopes — but owned by `Dashboard`, because it drives the volume and frequency cards too.
A footnote under it says so; without that the cross-card effect is invisible.

It replaced three per-card index sliders, which counted different things (training days, ISO
weeks, one lift's sessions) and so could never agree on a period. Dates are the one unit all four
charts share. Don't re-add a per-card slider, and don't move the state into `ProgressChart` —
the other two cards need it.

It filters **charts only** (`rowsInRange` in `Dashboard`). These always read full history:

- the engine, so narrowing the view can never change what you are told to lift;
- `StatCards`, which states all-time records;
- the heatmap's `quantileThresholds`, so a day's shade doesn't depend on what else is on screen;
- `VolumeCard`'s session baseline, computed over everything and then sliced — computing it on
  the visible slice would give the first six bars a baseline that shifts as you drag, which
  looks like a data bug rather than a code one.

`ProgressChart` takes `showProjection`, false once the range is pulled back off the latest
session, because the dashed next-session point would otherwise sit beyond the window's own edge.

### Trend chart (`sessionMaxSeries` → `ProgressChart`)

Plots each session's **heaviest working set**, warmups excluded — the weight actually lifted that
day. Every session a lift was trained has a point, so the line is as dense as the training: this
replaced a logged-top-set series where overhead press had 2 points in five months.

The cost is that it mixes two quantities — the top set on a day that logged one, the working load
otherwise — and it moves with the band either way. Three things keep that legible:

- **`band`** heads the tooltip, so a dip reads as a volume day rather than lost strength;
- **`isPR`** is a running max over the series, not a comparison with the previous point — on a
  line that descends those differ, and the latter would dot every rebound;
- **`records`** feeds the legend chips, which must show the record, not the last point.

Don't swap it back to a top-set-only series, and don't take the max from `liftSessions.maxWeight`
— that counts warmups, and two squat days logged warmups only, which would plot as fake 50/60 kg
points. `DayWork.heaviest` is the guarded version.

**`makeSessionDot` draws two dots and the plain one is not decoration.** The x-axis has one slot
per training day for *any* big-four lift, so a lift not trained that day is `undefined` and
`connectNulls` bridges straight over it, drawing interpolation identically to measured data.
Overhead press is logged on 30 of 55 days, so nearly half its line is drawn through. The two dots
must differ by **size + ring, not fill alone**. Don't dot the bridged points "for consistency" —
the gap *is* the information.

`ProgressChart` appends a dashed `${key}__p` projection to a synthetic future date, plotting the
prescribed top set; tooltips ignore any `__p` dataKey. It draws **whether it rises or falls** — a
lighter next session is a real prediction and this axis can say so.

### Progress scope (`ProgressChart` ⊃ `LiftDetail`)

`ProgressChart` owns a local `Scope = 'all' | LiftKey`. A `LiftKey` renders `LiftDetailView`
(**unwrapped**: no `ChartCard`, no selector of its own) in the same card. The two views are never
needed at once, which is why they're one card.

**The drill-down's y-axis is kg of *volume*, not kg of weight.** One column per session, one block
per rep, a gray band at each new set, each block as tall as that set's weight — so a column's
height *is* that session's volume. Plain divs, not Recharts. Load-bearing:

- **Height is volume, so weight is nearly invisible — the deliberate trade, not a bug.** At a
  480 px body a 60 kg and a 50 kg block differ by ~2 px. Weight is legible only in the PR
  headline and the tooltip, which therefore lists every set in full. Don't "fix" this with a
  weight axis, a shade ramp, or a second panel. Because the tooltip is the only load readout it
  must be reachable without a hover: a **tap pins**, a mouse **hovers**, a pin outranks a hover,
  and they are separate state on purpose — iOS fires `pointerenter` before `click`, so
  collapsing them makes a tap open and immediately close the tooltip. Hence the
  `pointerType === 'mouse'` guard.
- **Weight and volume are anti-correlated here**, so the tallest column is usually the
  *lightest* session. A reader expecting "taller = stronger" reads it backwards; the subtitle and
  footnote exist to prevent that.
- **Set and rep separators are zero-height chrome** — both `inset box-shadow` on the rep block
  itself, never inserted gaps. Real height would make a 5-set session taller than a 3-set
  session of the same volume, and the chart's one claim would be false. They ride the *block*
  because a parent's inset shadow paints under its opaque children.
- **Blocks are square-cornered.** A radius eats the ends of the rectangle that encodes the
  weight, and leaks gray between every rep.
- **The two separators differ in kind, not width**: gray (`--surface-2`, 3 px) = a new set, a
  translucent dark score line (1 px) = the next rep. Making both gray, or rounding the blocks,
  has each already made the sets vanish into the reps. Keep gray exclusive to set edges.
- **The set separator is a band, not a tray.** It used to have side rails (`px-[3px]` plus an
  outline on four sides). At full span a column is ~7 px wide, so 6 px of horizontal padding
  clamped the coloured block to zero width and every column rendered as a solid gray bar — on a
  phone, the device this is most read from. Anything spending *horizontal* pixels on chrome here
  is a bug in waiting. Same reason the gap is `gap-[2px] sm:gap-[5px]`; it can't go to 0 or
  adjacent columns fuse. **Keep the x-label row's gap in lockstep.**
- **The y-domain is the biggest session on screen**, so the tallest visible column always fills
  the plot. Consequence: narrowing the date range rescales every block, so a block's pixel
  height is only comparable within one view. `liftGrowth` is scoped to the same window.
- **Warmups are excluded** (the same guard as `sessionVolume` and `dailyMetrics`) and `volume` is
  rounded the same way, so a column's kg equals that lift's segment of the Session-volume bar for
  the same date, exactly. There's a regression test (`metrics.blocks.test.ts`).

**The two rates (`liftGrowth`)** exist because the blocks can't say either thing: the axis is
volume, so weight is invisible (**Max weight**, kg/wk), and one column has no trend (**Weekly
volume**, %/wk). They use different statistics on purpose. Max weight takes the window's
**running max**, not a fit — top weight alternates by design, so a window ending on a volume day
would print a loss while the record never fell. Weekly volume takes a **least-squares slope**
because it's a level, with rest weeks filled in as 0. A rate is **null (`—`) rather than 0** when
the window is too short; a zero would read as "flat" instead of "unknown".

Also load-bearing: **the scope selector is a separate control from the legend chips.** The chips
multi-select (hide/show lines) and must keep doing so.

### Volume (`weeklyVolume` + `sessionVolume` → `VolumeCard`)

**One card, one quantity, two grains**, chosen by `VolumeGrainToggle` in `ChartCard`'s `right`
slot. Both grains use the same accumulation rule (big four, working sets, warmups excluded), so a
week's bar is exactly the sum of its sessions' bars. `week` answers "am I doing enough"; `session`
answers "was that day unusually heavy". `VolumeChart` and `SessionVolumeChart` were **merged**
here; don't re-split them.

Session grain only: each session carries a `baseline` (mean `total` of the previous 6 sessions),
a `deltaPct`, and `restDays`. The window is an **expanding** mean until 6 priors exist. A week has
no baseline, so the dashed `Line` is the one piece of grain-dependent chrome.

**The two grains are deliberately structurally identical**, and this is load-bearing: the card
shares a grid row with `FrequencyHeatmap`, which is `h-full`, so **any** height difference made
the heatmap resize every time you toggled. If you add a row to one grain, add its counterpart to
the other. Verified: the card's height is equal in both grains at 1280 / 1024 / 420 px.

**The `Line` over the bars plots the trailing baseline**, not `total`. A line retracing the bar
tops was reverted once (`c65f7fd`) for adding nothing; this one is a moving reference the bars
are measured *against*, and the card's purpose collapses without it. It wears `--text-muted`,
dashed and dotless, so it never reads as a fifth series. Don't pattern-match it to that revert.

There is deliberately **no spike badge or threshold outline**: volume trends upward through any
progression block, so a fixed threshold would fire constantly.

### Heatmap color modes (`FrequencyHeatmap`)

Three modes — **Sets / Volume / Band** — via `BandMetricToggle`, state in `useBandMetric`. All
three read one map, `dailyMetrics(rows)` → `{ sets, volume, band }`.

- **This is an *encoding* switch, not the filter that `33fa31b` removed.** That one *hid* days
  that didn't match a band. This one never adds or removes a cell — every training day is on the
  grid in every mode, only the shade's meaning changes, which is what makes the distribution
  visible at once. Don't pattern-match it to that revert.
- **Everything is scoped to the big four**, and the tonnage is taken *from* `sessionVolume`
  rather than re-summed, so the heatmap's kg for a day equals the Session-volume card's exactly.
- **Shade 0 (`--seq-0`) means "didn't train", in every mode.** That leaves four data shades, so
  `quantileThresholds` returns **three** cut points, and `volumeBucket` floors any nonzero day at
  1 — a real session must never render in the empty color.
- Sets and volume are *ordinal*, so they read off the sequential ramp. **Band is drawn
  *categorically*** — one hue per band, cool → hot. It rode the ramp originally and failed on
  both counts: three shades of one blue don't separate at 13 px, and a darker blue says nothing
  about what "heavy" means. **Red/green is a known color-vision collision**; on a single-reader
  dashboard that cost was weighed and accepted, and the tooltip names the band in words in every
  mode. It's a choice, not an oversight.

**The cells are a fixed 13 px, and the card's leftover height is filled with *information*, not
bigger cells.** Inflating them to fill the slack was tried and **rejected — it read as
oversized**. The slack is spent on the three stat chips and the **band-mix bar** (`bandMix`),
which counts the *same* per-day classification the grid colors by. A row of three counts was
considered; the bar won because the **balance** is the actionable read. It is shown in **every**
mode, which is what lets the categorical legend drop its swatches rather than saying it twice.
The tooltip **always prints all three metrics** regardless of mode — color is for scanning, so
reading a single day should never require a toggle.

### Theming

Three themes — `modern-dark` (default), `modern-light`, `cozy` — in `src/lib/theme.ts`. Each is a
`[data-theme='…']` block of CSS custom properties in `src/index.css`; `data-theme` on `<html>`
selects one. `useTheme.ts` reads/writes the attribute + `localStorage`.

**Gotcha:** `index.html` has an inline blocking script that sets `data-theme` before first paint.
Its `STORAGE_KEY` string and theme-id list are duplicated there and **must stay in sync with
`src/lib/theme.ts`**.

## Conventions — keep these

- **Units are kg.** Weights come straight from the CSV; no conversion.
- **Warmup sets** are the rows with `Set Order === "W"` (`isWarmup`). They are **excluded from
  working volume, frequency, and the engine entirely**, and never appear in a prescription.
- **Every plotted and printed number is a weight actually lifted.** There is no e1RM in the
  codebase. Don't reintroduce one.
- **Colors follow the dataviz skill's validated palette**, exposed as CSS vars (`--lift-*`,
  `--seq-*`, `--band-*`, ink/surface roles) and redefined per theme block. Use the `color` on a
  `LIFTS` entry or `BAND_COLOR`; never hardcode a hex in a component. **Never build a dual-axis
  chart.**
- **Each theme takes the palette's own steps for its surface, never a darkened or lightened copy
  of another theme's.** `modern-light` once carried hand-darkened versions of the dark steps and
  failed the validator outright on all pairs: deadlift yellow against overhead-press green at
  ΔE 2.4 under protanopia, and the two greens at ΔE 9.4 for normal vision, below the 15 floor.
  Before changing any series color, run
  `node <dataviz-skill>/scripts/validate_palette.js "<hex,...>" --mode light --pairs all` — the
  chart draws all four lifts at once, so `--pairs all` is the right list, not the adjacent
  default. Light-mode aqua and yellow sit under 3:1 contrast; the relief rule is satisfied by the
  direct end-labels and the value-bearing legend, so don't remove either.
- **Recharts marks must set `isAnimationActive={false}`.** Grow-in animation renders blank under
  throttled requestAnimationFrame (headless/screenshots, and a flash on load).
- Text wears ink tokens (`--text-*`), not the series color; identity is carried by a color chip
  beside the text.

## Tests

- `engine.test.ts` pins each rule in isolation with hand-built fixtures.
- `engine.golden.test.ts` runs the whole engine over **`src/lib/__fixtures__/workouts.csv`**, a
  frozen copy of the export, and inline-snapshots all twelve tracks and the four prescriptions.
  It reads the fixture and **not** the live CSV on purpose: the sync LaunchAgent commits new data
  every time the user trains, and CI runs only `npm run build`, so a golden test on the live file
  would sit red between syncs with nothing to catch it. Refresh the fixture deliberately, then
  `npx vitest run -u`.
- `metrics.blocks.test.ts` / `metrics.sessionVolume.test.ts` assert the cross-card agreements.

## Adding a new lift or chart

- **New lift:** add an entry to `LIFTS` in `types.ts` and a matching `--lift-*` var in **every
  `[data-theme]` block** in `index.css`. The engine and StatCards pick it up automatically; the
  `LiftKey`-typed fields in `cumulativeSeries` / `weeklyVolume` / `sessionVolume` need the key.
- **New theme:** add it to `THEMES`, add a `[data-theme='…']` block in `index.css`, and update the
  theme-id list in the inline script in `index.html`.
- **New chart:** wrap it in `ChartCard`, reuse `ChartTooltip`, add a `metrics.ts` function rather
  than aggregating inside the component, and take `rows` already sliced by the date range.

## Deployment

Push to `main` → `.github/workflows/deploy.yml` runs `npm ci && npm run build` and deploys `dist/`
to GitHub Pages. The Vite `base` is `/strength-training/` — it must match the repo name.

## Data update workflow (the user's normal loop)

On the user's Mac this is automated: `scripts/sync-data.sh`, run by the
`com.ys-math.strength-training.sync` LaunchAgent, watches
`~/Library/Mobile Documents/com~apple~CloudDocs/StrongExports` for a new Strong export and — only
if its content differs from the committed CSV — copies it to `strong_workouts.csv`, commits, and
pushes to `main`. See the collapsed "auto-sync new exports from iCloud Drive" block in
`README.md` for the one-time setup and the manual fallback.

If you touch `scripts/sync-data.sh`, keep it idempotent (hash-compare before committing) and keep
the unpushed-commit retry check at the top.
