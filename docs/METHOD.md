# Method: how the next session is decided

The whole algorithm lives in [`src/lib/engine.ts`](../src/lib/engine.ts). This page is that file in
prose. Nothing here is estimated: every number the dashboard prints is a weight you actually lifted,
or a plate step away from one.

## Bands

Four lifts — bench press, squat, deadlift, overhead press — and three rep bands the session rotates
through, plus a fixed top set.

| band | reps | sets |
| --- | --- | --- |
| heavy | 3–5 | 3 |
| moderate | 6–9 | 3 |
| volume | 10–12 | 3 |
| top set | 2 | 1 |

Each lift keeps **one track per band**, so twelve tracks in all. A volume day progresses from the
last volume day; heavy and volume loads never contaminate each other.

## Reading a logged day

Warmups (`Set Order = W` in the export) are excluded from every step below, and never appear in a
prescription.

1. **Straight sets** are the working sets at the **modal load** — the weight carrying the most sets
   that day, ties going to the heavier. The export carries no top-set marker, so shape is all there
   is, and the modal load is what survives contact with ramp-ups and drop-off sets.
2. **Achieved reps** is `round(mean(reps))` over those sets, half rounding up.
3. The **band** is whichever window that number falls in. Counts outside 3–12 clamp to the nearest
   band, so a day of doubles reads as heavy rather than falling out of the rotation.
4. The **top set** is the heaviest set logged *above* the modal load, if any. It is not used to
   prescribe — the top set is derived — but the trend chart plots it.

```
Sep 8 bench: 60x10, 60x10, 60x10, 70x2
  modal load  = 60         -> straight sets: 10, 10, 10
  achieved    = 10         -> band: volume
  top set     = 70 x 2
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

The **top set** follows from the load just prescribed:

```
topLoad = max( snap2.5( straightLoad / factor ), straightLoad + 2.5 )
factor  = 0.95 heavy | 0.90 moderate | 0.85 volume
topSet  = 1 set x 2 reps
```

`snap2.5` rounds to the nearest 2.5 kg, the smallest plate step — every weight in the log is a
multiple of it. The floor matters at light loads: on the heavy band the factor is only 1.05×, which
would snap back onto the straight-set load itself at 20 and 22.5 kg and print a fourth identical set
as if it were a top set.

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
                                1 x 77.5 x 2    65.0 / 0.85 = 76.47
BP   Sep 8 volume  -> moderate  3 x 65.0 x 7    rep up    from Sep 2,   9d
                                1 x 72.5 x 2    65.0 / 0.90 = 72.22
DL   Sep 8 heavy   -> volume    3 x 72.5 x 10   load up   from Aug 7,  35d
                                1 x 85.0 x 2    72.5 / 0.85 = 85.29
OHP  Aug 24 heavy  -> volume    3 x 22.5 x 11   rep up    from Aug 7,  35d
                                1 x 27.5 x 2    22.5 / 0.85 = 26.47
```

Deadlift reached 12 reps on its last volume day, so it earned the plate step. The other three add a
rep at the same load. All four are rotating onto a volume day, and three of the four references are
over a month old, which the card says out loud.

This block is pinned by [`engine.golden.test.ts`](../src/lib/engine.golden.test.ts) against a frozen
copy of the export, so any change to a rule shows up as a readable diff.
