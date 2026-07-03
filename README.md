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
