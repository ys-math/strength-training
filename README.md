# Strength Training Progress

A self-updating dashboard for tracking barbell strength progress — **Bench Press,
Squat, Deadlift, Overhead Press** — built from a [Strong app](https://www.strong.app/)
CSV export. Modern dark UI, deployed free on GitHub Pages.

## 🔗 Live dashboard: **https://ys-math.github.io/strength-training/**

![Big 4](https://img.shields.io/badge/lifts-BP%20%C2%B7%20SQ%20%C2%B7%20DL%20%C2%B7%20OHP-3987e5)

## What it shows

- **Big 4 total** — combined estimated 1RM across the four lifts, one number that climbs.
- **Estimated 1RM over time** — Epley e1RM per lift, the headline progress chart.
- **PR cards** — best est. 1RM and heaviest set for each lift.
- **Weekly volume** — working tonnage (weight × reps), warmup sets excluded.
- **Training frequency** — GitHub-style calendar heatmap of working sets per day.
- **Per-lift detail** — est. 1RM vs. heaviest set for any single lift.

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

## Updating your data

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

## Enabling GitHub Pages (one-time)

In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
After the first push to `main`, the site publishes at
<https://ys-math.github.io/strength-training/>.

> The Vite `base` in `vite.config.ts` is set to `/strength-training/` to match the
> repo name. If you rename the repo, update it there too.

## Stack

Vite · React · TypeScript · Tailwind CSS · Recharts · PapaParse.
