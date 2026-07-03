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
- **Progress over time** — per-lift headline chart (Epley e1RM per session, or max-weight PRs).
- **PR cards** — the PR in the active metric, a from-previous-PR delta, and an inline sparkline.
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

| Weight (kg) |   1 |   2 |   3 |   4 |   5 |   6 |   7 |   8 |   9 |  10 |
| ----------: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
|          20 |  21 |  21 |  22 |  23 |  23 |  24 |  25 |  25 |  26 |  27 |
|          25 |  26 |  27 |  28 |  28 |  29 |  30 |  31 |  32 |  32 |  33 |
|          30 |  31 |  32 |  33 |  34 |  35 |  36 |  37 |  38 |  39 |  40 |
|          35 |  36 |  37 |  38 |  40 |  41 |  42 |  43 |  44 |  46 |  47 |
|          40 |  41 |  43 |  44 |  45 |  47 |  48 |  49 |  51 |  52 |  53 |
|          45 |  47 |  48 |  50 |  51 |  52 |  54 |  56 |  57 |  58 |  60 |
|          50 |  52 |  53 |  55 |  57 |  58 |  60 |  62 |  63 |  65 |  67 |
|          55 |  57 |  59 |  61 |  62 |  64 |  66 |  68 |  70 |  72 |  73 |
|          60 |  62 |  64 |  66 |  68 |  70 |  72 |  74 |  76 |  78 |  80 |
|          65 |  67 |  69 |  72 |  74 |  76 |  78 |  80 |  82 |  84 |  87 |
|          70 |  72 |  75 |  77 |  79 |  82 |  84 |  86 |  89 |  91 |  93 |
|          75 |  78 |  80 |  82 |  85 |  88 |  90 |  92 |  95 |  98 | 100 |
|          80 |  83 |  85 |  88 |  91 |  93 |  96 |  99 | 101 | 104 | 107 |
|          85 |  88 |  91 |  94 |  96 |  99 | 102 | 105 | 108 | 110 | 113 |
|          90 |  93 |  96 |  99 | 102 | 105 | 108 | 111 | 114 | 117 | 120 |
|          95 |  98 | 101 | 105 | 108 | 111 | 114 | 117 | 120 | 124 | 127 |
|         100 | 103 | 107 | 110 | 113 | 117 | 120 | 123 | 127 | 130 | 133 |
|         105 | 109 | 112 | 116 | 119 | 123 | 126 | 130 | 133 | 136 | 140 |
|         110 | 114 | 117 | 121 | 125 | 128 | 132 | 136 | 139 | 143 | 147 |
|         115 | 119 | 123 | 127 | 130 | 134 | 138 | 142 | 146 | 150 | 153 |
|         120 | 124 | 128 | 132 | 136 | 140 | 144 | 148 | 152 | 156 | 160 |
|         125 | 129 | 133 | 138 | 142 | 146 | 150 | 154 | 158 | 162 | 167 |
|         130 | 134 | 139 | 143 | 147 | 152 | 156 | 160 | 165 | 169 | 173 |
|         135 | 140 | 144 | 148 | 153 | 158 | 162 | 166 | 171 | 176 | 180 |
|         140 | 145 | 149 | 154 | 159 | 163 | 168 | 173 | 177 | 182 | 187 |
|         145 | 150 | 155 | 160 | 164 | 169 | 174 | 179 | 184 | 188 | 193 |
|         150 | 155 | 160 | 165 | 170 | 175 | 180 | 185 | 190 | 195 | 200 |

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
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## Project structure

```
strong_workouts.csv          Strong export — the single data source (imported via ?raw)
src/
  App.tsx                    imports the CSV, parses it once, renders <Dashboard>
  lib/
    types.ts                 the four LIFTS (BP/SQ/DL/OHP) + row/session types
    parse.ts                 CSV → typed SetRow[] (Epley e1RM, warmup flag)
    metrics.ts               e1RM / max-weight series, PRs, Big-4 total, volume, frequency
    format.ts                date / kg / tonnage display helpers
    theme.ts                 the selectable UI themes (dark / light / cozy)
    mode.ts                  metric mode (est. 1RM vs. actual max weight)
  hooks/
    useTheme.ts              reads/writes the active theme (data-theme + localStorage)
    useMetricMode.ts         reads/writes the active metric mode (localStorage)
  components/
    Dashboard.tsx            page layout, composes everything
    StatCards.tsx            Big-4 total + per-lift PR cards, each with a sparkline
    ProgressChart.tsx        headline chart; toggles est. 1RM ⇄ max weight
    VolumeChart.tsx          weekly stacked tonnage bars
    FrequencyHeatmap.tsx     calendar heatmap (plain divs, not Recharts)
    LiftDetail.tsx           per-lift est. 1RM vs. heaviest set
    ModeToggle.tsx           est. 1RM / max weight switch in the header
    ThemeSwitcher.tsx        theme picker in the footer
    Sparkline.tsx            tiny inline SVG trend line for stat cards
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
