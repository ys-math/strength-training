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
  each lift to where it would land next session if you hit the suggested goal.
- **PR cards** — the PR in the active metric and a from-previous-PR delta.
- **Latest workout** — the most recent session in full: every exercise, set, and volume, as chips.
- **Next session** — a suggested load × reps per lift, shown as `previous → target` chips with the
  change highlighted (see [How suggestions work](#how-suggestions-work)).
- **Weekly volume** — working tonnage (weight × reps), warmup sets excluded.
- **Training frequency** — GitHub-style calendar heatmap of working sets per day.
- **Per-lift detail** — est. 1RM vs. heaviest set for any single lift.
- **Session log** — every exercise, set, and volume per workout.
- **Themes** — switch between Modern Dark, Modern Light, and Cozy; your choice is remembered.

Estimated 1RM uses the Epley formula: `weight × (1 + reps / 30)`.

## RM reference table

Percentage of 1RM by rep count, derived from the same Epley formula the dashboard
uses (`%1RM = 100 / (1 + reps / 30)`). The kg columns are working weights for each
lift, computed from the current estimated-1RM PRs in `strong_workouts.csv` (Bench
73 kg · Squat 83 kg · Deadlift 99 kg · OHP 35 kg) — re-derive them as those PRs move.

| Reps | % of 1RM | Bench (kg) | Squat (kg) | Deadlift (kg) | OHP (kg) |
| ---: | -------: | ---------: | ---------: | ------------: | -------: |
|    1 |      97% |         71 |         81 |            96 |       34 |
|    2 |      94% |         68 |         78 |            93 |       33 |
|    3 |      91% |         66 |         76 |            90 |       32 |
|    4 |      88% |         64 |         74 |            87 |       31 |
|    5 |      86% |         62 |         71 |            85 |       30 |
|    6 |      83% |         61 |         69 |            83 |       29 |
|    7 |      81% |         59 |         68 |            80 |       28 |
|    8 |      79% |         58 |         66 |            78 |       28 |
|    9 |      77% |         56 |         64 |            76 |       27 |
|   10 |      75% |         55 |         62 |            74 |       26 |
|   11 |      73% |         53 |         61 |            72 |       26 |
|   12 |      71% |         52 |         60 |            71 |       25 |

## Estimated 1RM lookup table

Find the weight you lifted (rows, kg) and the reps you got (columns) to read off
the estimated 1RM, via the same Epley formula: `weight × (1 + reps / 30)`, rounded
to the nearest kg.

| Weight (kg) |   2 |   3 |   4 |   5 |   6 |   7 |   8 |   9 |  10 |
| ----------: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
|          20 |  21 |  22 |  23 |  23 |  24 |  25 |  25 |  26 |  27 |
|        22.5 |  24 |  25 |  26 |  26 |  27 |  28 |  29 |  29 |  30 |
|          25 |  27 |  28 |  28 |  29 |  30 |  31 |  32 |  33 |  33 |
|        27.5 |  29 |  30 |  31 |  32 |  33 |  34 |  35 |  36 |  37 |
|          30 |  32 |  33 |  34 |  35 |  36 |  37 |  38 |  39 |  40 |
|        32.5 |  35 |  36 |  37 |  38 |  39 |  40 |  41 |  42 |  43 |
|          35 |  37 |  39 |  40 |  41 |  42 |  43 |  44 |  46 |  47 |
|        37.5 |  40 |  41 |  43 |  44 |  45 |  46 |  48 |  49 |  50 |
|          40 |  43 |  44 |  45 |  47 |  48 |  49 |  51 |  52 |  53 |
|        42.5 |  45 |  47 |  48 |  50 |  51 |  52 |  54 |  55 |  57 |
|          45 |  48 |  50 |  51 |  53 |  54 |  56 |  57 |  59 |  60 |
|        47.5 |  51 |  52 |  54 |  55 |  57 |  59 |  60 |  62 |  63 |
|          50 |  53 |  55 |  57 |  58 |  60 |  62 |  63 |  65 |  67 |
|        52.5 |  56 |  58 |  60 |  61 |  63 |  65 |  67 |  68 |  70 |
|          55 |  59 |  61 |  62 |  64 |  66 |  68 |  70 |  72 |  73 |
|        57.5 |  61 |  63 |  65 |  67 |  69 |  71 |  73 |  75 |  77 |
|          60 |  64 |  66 |  68 |  70 |  72 |  74 |  76 |  78 |  80 |
|        62.5 |  67 |  69 |  71 |  73 |  75 |  77 |  79 |  81 |  83 |
|          65 |  69 |  72 |  74 |  76 |  78 |  80 |  82 |  85 |  87 |
|        67.5 |  72 |  74 |  77 |  79 |  81 |  83 |  86 |  88 |  90 |
|          70 |  75 |  77 |  79 |  82 |  84 |  86 |  89 |  91 |  93 |
|        72.5 |  77 |  80 |  82 |  85 |  87 |  89 |  92 |  94 |  97 |
|          75 |  80 |  83 |  85 |  88 |  90 |  93 |  95 |  98 | 100 |
|        77.5 |  83 |  85 |  88 |  90 |  93 |  96 |  98 | 101 | 103 |
|          80 |  85 |  88 |  91 |  93 |  96 |  99 | 101 | 104 | 107 |
|        82.5 |  88 |  91 |  94 |  96 |  99 | 102 | 105 | 107 | 110 |
|          85 |  91 |  94 |  96 |  99 | 102 | 105 | 108 | 111 | 113 |
|        87.5 |  93 |  96 |  99 | 102 | 105 | 108 | 111 | 114 | 117 |
|          90 |  96 |  99 | 102 | 105 | 108 | 111 | 114 | 117 | 120 |
|        92.5 |  99 | 102 | 105 | 108 | 111 | 114 | 117 | 120 | 123 |
|          95 | 101 | 105 | 108 | 111 | 114 | 117 | 120 | 124 | 127 |
|        97.5 | 104 | 107 | 111 | 114 | 117 | 120 | 124 | 127 | 130 |
|         100 | 107 | 110 | 113 | 117 | 120 | 123 | 127 | 130 | 133 |
|       102.5 | 109 | 113 | 116 | 120 | 123 | 126 | 130 | 133 | 137 |
|         105 | 112 | 116 | 119 | 123 | 126 | 130 | 133 | 137 | 140 |
|       107.5 | 115 | 118 | 122 | 125 | 129 | 133 | 136 | 140 | 143 |
|         110 | 117 | 121 | 125 | 128 | 132 | 136 | 139 | 143 | 147 |
|       112.5 | 120 | 124 | 128 | 131 | 135 | 139 | 143 | 146 | 150 |
|         115 | 123 | 127 | 130 | 134 | 138 | 142 | 146 | 150 | 153 |
|       117.5 | 125 | 129 | 133 | 137 | 141 | 145 | 149 | 153 | 157 |
|         120 | 128 | 132 | 136 | 140 | 144 | 148 | 152 | 156 | 160 |
|       122.5 | 131 | 135 | 139 | 143 | 147 | 151 | 155 | 159 | 163 |
|         125 | 133 | 138 | 142 | 146 | 150 | 154 | 158 | 163 | 167 |
|       127.5 | 136 | 140 | 145 | 149 | 153 | 157 | 162 | 166 | 170 |
|         130 | 139 | 143 | 147 | 152 | 156 | 160 | 165 | 169 | 173 |
|       132.5 | 141 | 146 | 150 | 155 | 159 | 163 | 168 | 172 | 177 |
|         135 | 144 | 149 | 153 | 158 | 162 | 167 | 171 | 176 | 180 |
|       137.5 | 147 | 151 | 156 | 160 | 165 | 170 | 174 | 179 | 183 |
|         140 | 149 | 154 | 159 | 163 | 168 | 173 | 177 | 182 | 187 |
|       142.5 | 152 | 157 | 162 | 166 | 171 | 176 | 181 | 185 | 190 |
|         145 | 155 | 160 | 164 | 169 | 174 | 179 | 184 | 189 | 193 |
|       147.5 | 157 | 162 | 167 | 172 | 177 | 182 | 187 | 192 | 197 |
|         150 | 160 | 165 | 170 | 175 | 180 | 185 | 190 | 195 | 200 |

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
   it's the best-supported.

2. **Plateau → deload** — if estimated 1RM is flat or declining across the last few
   sessions (default 3) and rule 1 isn't already calling for more load, suggest cutting
   volume (~half the sets) for a session or two rather than the load. This is loosely
   motivated by the **fitness–fatigue model** (Bannister, 1975), but note the trigger here
   is a crude e1RM-trend heuristic, **not** a fitted two-factor model — without soreness,
   HRV, or sleep data we can't do better, and shouldn't pretend to.

3. **RPE autoregulation** — *only if* Strong's RPE column is populated. If effort is
   trending up at the same load and reps, bias toward holding instead of progressing
   (RPE/RIR-based autoregulation; Zourdos et al., 2016; Helms et al., 2016). Evidence
   doesn't clearly rank RPE-based loading above percentage- or velocity-based approaches,
   so it's treated as a mild adjustment, not a primary driver — and it's a complete no-op
   when the export has no RPE (as most Strong exports don't).

4. **No generic weekly-volume landmarks.** The familiar "~10–20 sets per muscle per week"
   figures come from dose–response meta-analyses that pool *every* exercise hitting a muscle
   group (e.g. Schoenfeld, Ogborn & Krieger, 2017). This dashboard tracks a single exercise
   per lift, so raw "sets/week for this lift" isn't comparable to those numbers; weekly set
   counts are context only and never gate a suggestion.

5. **No hardcoded periodization model or Prilepin table.** Head-to-head comparisons of
   linear vs. undulating periodization return inconsistent, frequently null differences,
   and Prilepin's table is *observational* — distilled from watching successful lifters, not
   an experiment. Both are fine as optional reference (the RM tables above are exactly that)
   but are deliberately not wired into the engine as if they were settled law.

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
npm run test     # Vitest unit tests (suggestion logic)
```

## Project structure

```
strong_workouts.csv          Strong export — the single data source (imported via ?raw)
src/
  App.tsx                    imports the CSV, parses it once, renders <Dashboard>
  lib/
    types.ts                 the four LIFTS (BP/SQ/DL/OHP) + row/session types
    parse.ts                 CSV → typed SetRow[] (Epley e1RM, warmup flag, optional RPE)
    metrics.ts               e1RM / max-weight series, PRs, Big-4, volume, frequency, suggestions
    metrics.suggestion.test.ts  Vitest coverage of the next-session branching
    format.ts                date / kg / tonnage display helpers
    theme.ts                 the selectable UI themes (dark / light / cozy)
    mode.ts                  metric mode (est. 1RM vs. actual max weight)
  hooks/
    useTheme.ts              reads/writes the active theme (data-theme + localStorage)
    useMetricMode.ts         reads/writes the active metric mode (localStorage)
  components/
    Dashboard.tsx            page layout, composes everything
    StatCards.tsx            Big-4 total + per-lift PR cards
    LatestWorkout.tsx        most recent session in full (always expanded)
    NextSession.tsx          per-lift load × reps suggestion (prev → target chips)
    SetChip.tsx              shared "weight kg × reps ×count" pill + groupSets
    ProgressChart.tsx        headline chart (+ dotted goal projection); est. 1RM ⇄ max weight
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
