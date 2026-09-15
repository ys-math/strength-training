# Method: how the next session is decided

The whole algorithm lives in [`src/lib/engine.ts`](../src/lib/engine.ts). This page is that file in
prose. Nothing here is estimated: every number the dashboard prints is a weight you actually lifted,
or a plate step away from one.

## Bands

Four lifts — bench press, squat, deadlift, overhead press — and three rep bands the session rotates
through.

| band | reps | sets |
| --- | --- | --- |
| heavy | 3–5 | 3 |
| moderate | 6–9 | 3 |
| volume | 10–12 | 3 |

Each lift keeps **one track per band**, so twelve tracks in all. A volume day progresses from the
last volume day; heavy and volume loads never contaminate each other.

## Reading a logged day

Warmups (`Set Order = W` in the export) are excluded from every step below, and never appear in a
prescription.

1. **Straight sets** are the working sets at the **modal load** — the weight carrying the most sets
   that day, ties going to the heavier. The export marks nothing but warmups, so shape is all there
   is, and the modal load is what survives contact with ramp-ups and drop-off sets.
2. **Achieved reps** is `round(mean(reps))` over those sets, half rounding up.
3. The **band** is whichever window that number falls in. Counts outside 3–12 clamp to the nearest
   band, so a day of doubles reads as heavy rather than falling out of the rotation.

Anything logged off the modal load — a ramp-up, a heavy single, a drop-off set — does not prescribe.
It still counts as work: the trend chart plots the day's **heaviest** working set, whatever it was.

```
Sep 8 bench: 60x10, 60x10, 60x10, 70x2
  modal load  = 60         -> straight sets: 10, 10, 10
  achieved    = 10         -> band: volume
  heaviest    = 70 x 2     -> plotted, but not prescribed from
```

## Prescribing

Step one band along the cycle from that lift's **own** last session:

```
heavy -> volume -> moderate -> heavy
```

Contrast is the point: no two adjacent bands ever run back to back. The rotation is per lift, because
on 23 of 55 logged days the lifts sat in different bands, and overhead press is often a week behind
the others.

Find that lift's most recent session in the new band, then apply **the one rule**:

| condition | prescription |
| --- | --- |
| fewer than 3 straight sets | repeat it unchanged |
| achieved reps at the top of the band | `load + 2.5 kg`, reps back to the bottom of the band |
| otherwise | same load, `achieved + 1` reps |

Double progression only advances off a completed session, which is what makes the three-set shape
mean something rather than being presentation.

That is the whole prescription: three sets, one load, one rep count. Every weight is snapped to
2.5 kg, the smallest plate step — every weight in the log is a multiple of it.

## Two things the engine deliberately does not do

**It never backs off for a layoff.** A track you last trained six weeks ago still gets its plate step.
The card prints the date it progressed from instead, so a stale reference is visible and the judgement
is yours. There is no deload rule and no detraining decay to tune.

**It never estimates.** There is no e1RM anywhere in the codebase. A band with no history prints no
number at all, and asks you to log one session rather than guessing a starting load from a neighbouring
band.

## Worked example

From the export frozen on 2026-09-11:

```
SQ   Sep 8 heavy   -> volume    3 x 65.0 x 12   rep up    from Aug 7,  35d
BP   Sep 8 volume  -> moderate  3 x 65.0 x 7    rep up    from Sep 2,   9d
DL   Sep 8 heavy   -> volume    3 x 72.5 x 10   load up   from Aug 7,  35d
OHP  Aug 24 heavy  -> volume    3 x 22.5 x 11   rep up    from Aug 7,  35d
```

Deadlift reached 12 reps on its last volume day, so it earned the plate step. The other three add a
rep at the same load. All four are rotating onto a volume day, and three of the four references are
over a month old, which the card says out loud.

This block is pinned by [`engine.golden.test.ts`](../src/lib/engine.golden.test.ts) against a frozen
copy of the export, so any change to a rule shows up as a readable diff.
