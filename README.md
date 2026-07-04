# Strength Training Progress

A self-updating dashboard for tracking barbell strength progress — **Bench Press,
Squat, Deadlift, Overhead Press** — built from a [Strong app](https://www.strong.app/)
CSV export. Modern dark UI, deployed free on GitHub Pages.

## 🔗 Live dashboard: **https://ys-math.github.io/strength-training/**

![Big 4](https://img.shields.io/badge/lifts-BP%20%C2%B7%20SQ%20%C2%B7%20DL%20%C2%B7%20OHP-3987e5)

## What it shows

- **Metric toggle** — flip the headline number, the PR cards, and the main chart between
  **estimated 1RM** and **actual max weight lifted**; your choice is remembered.
- **Big 4 total** — combined est. 1RM (or max weight) across the four lifts, one climbing number.
- **Progress over time** — per-lift headline chart of the best set each session (Epley e1RM,
  or actual heaviest weight — hover a point for its reps and set count). A dotted line extends
  each lift to where it would land next session if you hit the suggested goal, and a **span
  slider** below the chart zooms the visible date range.
- **Goal lines** — in max-weight mode, a switch overlays each lift’s **3-month goal** (the
  recommended target for the current fixed calendar quarter) as a dashed horizontal line on the
  chart (see [How goals work](#how-goals-work)).
- **PR cards** — the PR in the active metric and a from-previous-PR delta.
- **Latest workout** — the most recent session in full: every exercise, set, and volume, as chips.
- **Next session** — a suggested load × reps per lift, shown as `previous → target` chips with the
  change highlighted, plus a **heavy top set** for max-strength specificity, an automatic **back-off
  after a layoff**, and a goal-pace chip (see [How suggestions work](#how-suggestions-work) and
  [the theory → formula map](#the-science-theory--formula-map)).
- **Weekly volume** — working tonnage (weight × reps), warmup sets excluded.
- **Training frequency** — GitHub-style calendar heatmap of working sets per day.
- **Per-lift detail** — est. 1RM vs. heaviest set for any single lift.
- **Session log** — every exercise, set, and volume per workout.
- **Themes** — switch between Modern Dark, Modern Light, and Cozy; your choice is remembered.

Estimated 1RM uses the Epley formula $\mathrm{e1RM} = \text{weight} \times (1 + \text{reps}/30)$.

## How suggestions work

The **Next session** card proposes a load × reps for each lift, computed purely from
your set history (`nextSessionSuggestion` in `src/lib/metrics.ts`; all thresholds live in
`DEFAULT_SUGGESTION_CONFIG`). It's intentionally simple. Below is why each rule is written
the way it is — and, just as importantly, where it rests on solid evidence versus where
it's an admitted heuristic. The main chart draws the same goal as a **dotted line** from each
lift's last point to where it would land next session if the goal is met (the suggestion also
carries `projectedWeight` / `projectedE1rm` for this); a deload projects nothing.

1. **Double progression** — add reps within a rep window (default 6–10), then add the
   smallest load jump and reset to the bottom of the window. This is **progressive
   overload** under the **SAID principle** (Specific Adaptation to Imposed Demands):
   gradually increasing mechanical demand drives adaptation, one of the most consistently
   replicated findings in resistance-training research. This is the primary driver because
   it's the best-supported. Formula (top of window reached): $\text{load}' = \text{load} + \Delta$
   and $\text{reps}' = \text{lo}$, with $\Delta = 2.5$ kg (the smallest plate).

2. **Heavy top set for specificity** — on any progression/hold session the engine appends
   one **heavy, low-rep top set** at ≈ 90 % of your estimated 1RM. Rationale: because the
   goal here is a **1RM / max weight**, the **SAID principle** says you must also train that
   specific demand, and the **Size Principle** (Henneman) plus **rate coding / motor-unit
   synchronization** say the highest-threshold (strongest) motor units are only recruited at
   near-maximal force — moderate-rep accumulation alone leaves them under-trained. The target
   load is $\text{topLoad} = \operatorname{round}_{2.5}(\mathrm{e1RM} \cdot I)$ with intensity
   $I = 0.90$, and the reps come from inverting Epley:
   $\mathrm{e1RM} = \text{load}\cdot(1 + r/30) \Rightarrow r = 30\cdot(1/I - 1) \approx 3$. It's shown as a
   separate `+ heavy top set` chip and is omitted when it wouldn't be heavier than your
   working set (you're already training heavy enough) or on a deload/return.

3. **Detraining back-off** — if it's been a while since you last trained a lift, the next
   suggestion **reduces the load** and flags a *return* session instead of chasing a PR on
   detrained tissue. This is **reversibility** (loss of adaptation with time off), which is
   very well documented. Retention factor: $R(g) = 1$ for a gap $g \le g_0$ (grace, 2 weeks),
   else $R(g) = \max(0.70,\ \exp(-(g - g_0)/\tau))$ with $\tau = 10$ weeks; the suggested load is
   $\operatorname{round}_{2.5}(\text{lastLoad} \cdot R)$. Example: 4 weeks off → $R = \exp(-(4-2)/10) = 0.82$,
   so a 60 kg lift is eased back to $60 \times 0.82 \approx 49 \to$ **50 kg**. The 0.70 floor caps the back-off (we
   never assume you lost more than ~30 %), and the decay constant is a deliberately
   conservative heuristic — real detraining rates vary with training age and layoff length.

4. **Plateau → deload** — if estimated 1RM is flat or declining across the last few
   sessions (default 3) and rule 1 isn't already calling for more load, suggest cutting
   volume (~half the sets) for a session or two rather than the load. This is loosely
   motivated by the **fitness–fatigue model** (Bannister, 1975), but note the trigger here
   is a crude e1RM-trend heuristic, **not** a fitted two-factor model — without soreness,
   HRV, or sleep data we can't do better, and shouldn't pretend to.

5. **RPE autoregulation** — *only if* Strong's RPE column is populated. If effort is
   trending up at the same load and reps, bias toward holding instead of progressing
   (RPE/RIR-based autoregulation; Zourdos et al., 2016; Helms et al., 2016). Evidence
   doesn't clearly rank RPE-based loading above percentage- or velocity-based approaches,
   so it's treated as a mild adjustment, not a primary driver — and it's a complete no-op
   when the export has no RPE (as most Strong exports don't).

6. **No generic weekly-volume landmarks.** The familiar "~10–20 sets per muscle per week"
   figures come from dose–response meta-analyses that pool *every* exercise hitting a muscle
   group (e.g. Schoenfeld, Ogborn & Krieger, 2017). This dashboard tracks a single exercise
   per lift, so raw "sets/week for this lift" isn't comparable to those numbers; weekly set
   counts are context only and never gate a suggestion.

7. **No hardcoded periodization model or Prilepin table.** Head-to-head comparisons of
   linear vs. undulating periodization return inconsistent, frequently null differences,
   and Prilepin's table is *observational* — distilled from watching successful lifters, not
   an experiment. Both are fine as optional reference, but are deliberately not wired into the
   engine as if they were settled law.

## How goals work

The dashboard computes a per-lift **max-weight** (actual heaviest single) **recommended** target
and draws the **3-month one** on the progress chart. Targets are computed from your history; there
is nothing to edit and nothing is stored.

- **On the chart.** In max-weight mode, a **Goals switch** in the chart header overlays each lift’s
  **short-term (3-month) target** as a dashed horizontal line in the lift’s colour, labelled with
  the target kg. (Est-1RM mode hides it — goals are a max-weight quantity.) The span slider below
  the chart lets you zoom the visible date range independently.
- **Fixed calendar quarters.** The 3-month target is due at the next standard calendar quarter-end
  (Mar 31 / Jun 30 / Sep 30 / Dec 31) — a stable date, not a window that slides with today.
  `quarterCheckpoints` (in `goals.ts`) returns the upcoming quarter due-dates; `recommendedGoals`
  also computes 6-month and 1-year targets, used to keep the recommendation curve honest.
- **Recommended targets** (`recommendedGoals` in `metrics.ts`, config in `DEFAULT_GOAL_CONFIG`)
  are **history-driven but bounded by diminishing returns**: they project your **recent**
  best-to-date max-weight rate (`recentRatePerWeek`, ~8-week window) forward a quarter at a time,
  **decaying** its later contribution (mid ×0.7, long ×0.5), scale that by the two biological
  factors below, then **clamp** the cumulative gain between a small %-of-current floor (so even a
  plateaued lift still gets a modest target) and a %-of-current **ceiling that itself decelerates**
  — ≈ 8 % in one quarter, 15 % over two, 25 % over a year — so a hot 8-week streak can’t project to
  an absurd number. Results are snapped to 2.5 kg and forced strictly increasing. Per horizon:
  $\text{gain} = \operatorname{clamp}(\text{rate} \cdot \psi \cdot \sigma,\ \text{floor}\%\cdot\text{current},\ \text{cap}\%\cdot\text{current})$.
  Treat them as a **rough guide, not a promise**.
- **Neural-phase factor ψ** (`neuralFactor`) — early strength gains are largely **neural**
  (better recruitment/rate coding), and these come fast; later gains lean on slower **structural**
  change, so trainees decelerate with experience. We scale the projected gain by
  $\psi = \max(0.55,\ \exp(-(A - A_0)/\tau_n))$, where $A$ is your **logged training age** for the lift
  (weeks from first to last session), $A_0 = 12$ weeks of grace, $\tau_n = 40$ weeks. A novice keeps
  $\psi \approx 1$; a long-history lifter is pulled toward the 0.55 floor. **Caveat:** $A$ only counts
  training *in the export*, so it under-estimates true training age — treat ψ as a gentle nudge, not a verdict.
- **Stimulus factor σ** (`stimulusFactor`) — adaptation tracks the demand you actually impose
  (**SAID**), driven at the cellular level by **mechanical tension → mechanotransduction (mTOR)**
  and a favourable **muscle-protein synthesis/breakdown balance**, which in turn need enough
  training **frequency**. We temper the goal by $\sigma = \operatorname{clamp}(0.6 + 0.4\cdot\min(1,\ f/f^*),\ 0.6,\ 1)$,
  where $f$ = recent sessions/week for the lift and $f^* = 1.5$. Train the lift often → $\sigma \approx 1$ (full
  projected gain); train it rarely → $\sigma$ shrinks toward 0.6. **Caveat:** this is single-exercise
  frequency, a proxy for tension dose, not a muscle-level volume prescription.
- **Where you stand.** The **Next session** card carries a **pace** chip (`goalPace`) that compares
  the rate still required to hit the 3-month target, $(\text{target} - \text{current}) / \text{weeksLeft}$ to the
  quarter-end, against your recent rate → `ahead` / `on track` / `behind` / `met`.
- **Goal-aware next session:** the suggestion engine (targeting the recommended short-term goal)
  adds `goalPace` and one
  *bounded* behavioral tweak — if you're **behind** pace and only *mildly* stalled (still in the
  rep range, e1RM flat), it pushes one more rep instead of inserting a soft deload. It never
  invents larger jumps or removes a genuine below-range deload; progressive overload still happens
  one safe plate/rep at a time.

## The science: theory → formula map

The engine is built from established strength-training theory, but it's honest about where a
principle is close to a law and where our operationalization is a heuristic squeezed from
weight/reps/date data alone (no RPE, bodyweight, soreness, or velocity). Symbols: $\mathrm{e1RM}$ = Epley
estimate $\text{weight}\cdot(1+\text{reps}/30)$; $I$ = relative intensity $\text{load}/\mathrm{e1RM}$; $\Delta$ = 2.5 kg plate.

| Theory | What it says | How the app uses it | Formula | Evidence |
|---|---|---|---|---|
| **SAID / Specificity** | Adaptation is specific to the imposed demand | 1RM goal ⇒ train heavy + specific: heavy top set, and goals gated by imposed stimulus | top set at $I \approx 0.90$; $\sigma$ (below) | Near-law |
| **Progressive Overload** | Adaptation needs a rising demand over time | Double progression on the top working set | top of range: $\text{load}+\Delta$, $\text{reps}\to\text{lo}$ | Most-validated principle |
| **Reversibility / Detraining** | Adaptation is lost with time off | Back off load & flag a *return* after a layoff | $R(g)=\max(0.70,\ \exp(-(g-2)/10))$, $\text{load}\cdot R$ | Well documented |
| **Size Principle (Henneman)** | Motor units recruit small→large; high-threshold units need near-max force | The heavy top set recruits the strongest units moderate reps miss | $\text{reps}=30\cdot(1/I-1) \approx 3$ at $I=0.90$ | Established electrophysiology |
| **Neural Adaptation (early gains)** | Early strength is mostly neural & fast; later gains slow | Neural-phase factor shrinks *advanced* lifters' goals | $\psi=\max(0.55,\ \exp(-(A-12)/40))$ | Strong EMG / twitch-interpolation evidence |
| **Rate Coding / MU Synchronization** | Firing rate & sync rise with heavy/max-effort work | Justifies the near-max heavy top set | shares the $I=0.90$ top set | Solid neurophysiology |
| **MPS / MPB balance** | Net protein balance must be positive over time; each session lifts MPS ~24–48 h | Frequency feeds the stimulus factor (re-stimulate before MPS returns to baseline) | part of $\sigma$ (uses $f$ = sessions/wk) | Core biochemistry |
| **Mechanotransduction (mTOR)** | Mechanical tension activates mTORC1 → MPS | Tension/frequency dose gates goal size | part of $\sigma$ | Strong molecular support |
| **Mechanical Tension (primary)** | Tension is the main hypertrophy driver | Stimulus factor tempers goals when tension dose (frequency) is low | $\sigma=\operatorname{clamp}(0.6+0.4\cdot\min(1,f/1.5),0.6,1)$ | Well supported (metabolic stress / damage more debated) |

Two honest limits carry through the whole table: (1) we infer **training age** and **frequency**
only from the exported log, so both are lower bounds; and (2) tension/stimulus here is
**single-exercise**, not the muscle-level weekly volume those hypertrophy findings are measured in.
Everything above is a *decision aid*, not a coach.

## Updating your data

### Automatic sync via iCloud Drive (recommended, macOS)

Strong has no auto-export or API, so exporting is still a manual tap — but everything
after that is automatic:

1. In the Strong app: **Export → Save to Files → iCloud Drive/StrongExports**.
2. That's it. A background LaunchAgent notices the new file within seconds, commits it
   as `strong_workouts.csv`, and pushes to `main` — which triggers the GitHub Actions
   redeploy automatically.

**One-time setup:**

1. Create the folder **iCloud Drive/StrongExports** in Finder.
2. Grant Full Disk Access to `/bin/bash` and to Terminal, since iCloud Drive is
   privacy-protected and a background job needs explicit access:
   **System Settings → Privacy & Security → Full Disk Access** → click **+** → press
   `Cmd+Shift+G` → type `/bin/bash` → add it. Add **Terminal** the same way.
3. Install the agent:
   ```bash
   cp scripts/com.ys-math.strength-training.sync.plist ~/Library/LaunchAgents/
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ys-math.strength-training.sync.plist
   ```
4. Watch it work: `tail -f ~/Library/Logs/strength-training-sync.log`.

To pause or remove it:
```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.ys-math.strength-training.sync.plist
```

### Manual

The whole workflow is a file swap:

1. In the Strong app: **Settings → Export Data** → get `strong_workouts.csv`.
2. Replace `strong_workouts.csv` at the repo root with the new export.
3. Commit and push to `main`.

GitHub Actions rebuilds and redeploys the site automatically (see
`.github/workflows/deploy.yml`).

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/ (also the type-check gate)
npm run preview  # preview the production build
npm run test     # Vitest unit tests (suggestion + goals logic)
```

## Project structure

```
strong_workouts.csv          Strong export — the single data source (imported via ?raw)
src/
  App.tsx                    imports the CSV, parses it once, renders <Dashboard>
  lib/
    types.ts                 the four LIFTS (BP/SQ/DL/OHP) + row/session types
    parse.ts                 CSV → typed SetRow[] (Epley e1RM, warmup flag, optional RPE)
    metrics.ts               e1RM / max-weight series, PRs, Big-4, volume, frequency, suggestions, goals
    metrics.suggestion.test.ts  Vitest coverage of the next-session branching
    goals.test.ts            Vitest coverage of recommended goals + goal-aware suggestions
    format.ts                date / kg / tonnage display helpers
    theme.ts                 the selectable UI themes (dark / light / cozy)
    mode.ts                  metric mode (est. 1RM vs. actual max weight)
    goals.ts                 goal horizons (3/6/12 mo) + fixed calendar-quarter checkpoints
  hooks/
    useTheme.ts              reads/writes the active theme (data-theme + localStorage)
    useMetricMode.ts         reads/writes the active metric mode (localStorage)
  components/
    Dashboard.tsx            page layout; computes goal-aware suggestions once, passes them down
    StatCards.tsx            Big-4 total + per-lift PR cards
    LatestWorkout.tsx        most recent session in full (always expanded)
    NextSession.tsx          per-lift load × reps suggestion (prev → target chips) + pace chip
    SetChip.tsx              shared "weight kg × reps ×count" pill + groupSets
    ProgressChart.tsx        headline chart: dotted next-session projection, 3-mo goal lines (toggle),
                             span slider; est. 1RM ⇄ max weight
    VolumeChart.tsx          weekly stacked tonnage bars
    FrequencyHeatmap.tsx     calendar heatmap (plain divs, not Recharts)
    LiftDetail.tsx           per-lift est. 1RM vs. heaviest set
    SessionLog.tsx           collapsible full history of every session
    ModeToggle.tsx           est. 1RM / max weight switch in the header
    ThemeSwitcher.tsx        theme picker in the footer
    ChartCard.tsx / Tooltip.tsx   shared chart chrome
index.html                   inline pre-paint script sets the saved theme (no flash)
.github/workflows/deploy.yml  build + deploy to GitHub Pages on push to main
```

## GitHub Pages

Pages is already enabled (**Settings → Pages → Source: GitHub Actions**); every push
to `main` rebuilds and republishes automatically.

> The Vite `base` in `vite.config.ts` is set to `/strength-training/` to match the
> repo name. If you rename the repo, update it there too.

## Stack

Vite · React · TypeScript · Tailwind CSS · Recharts · PapaParse.
