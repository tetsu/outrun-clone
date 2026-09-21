# Feel loop: sense of speed and handling

How the game's feel is tuned, and the log of what has been tuned so far. The work follows a closed loop: every quality in [TODO.md](../TODO.md) → "Quality targets" §1 (sense of speed) and §2 (handling) is a number with a target range, and every change is measured against all of them before it is kept.

## The loop

1. **Target.** [`src/dev/feel.ts`](../src/dev/feel.ts) lists each quality as a number with a range (`FEEL_TARGETS`), with the reason for the range.
2. **Change.** Either in the code (`DEFAULT_VIEW` in `src/game/camera.ts`, `DEFAULT_COURSE` in `src/sim/track.ts`, `DEFAULT_HANDLING` in `src/sim/player.ts`), or live in the game's tuning panel.
3. **Measure.** The simulation is deterministic, so every quality is measured headlessly on scripted drives and the road table:
   - `npm run feel` prints the report for the values in the code.
   - `npm run feel -- '{"handling":{"accelLow":9.5}}'` measures trial values without editing code.
   - The **Feel report** button in the tuning panel measures the live values.
4. **Look.** Numbers do not show what a change looks like. In the dev server, `__boso.pose(...)` puts the car anywhere on the course and `__boso.snapshot(name)` saves the frame to `dev-snapshots/` (git-ignored), so settings can be compared side by side as images.
5. **Lock in.** `tests/feel.test.ts` fails if any target is missed, so a later change cannot quietly undo a tuning decision. The failure message is the full report.

### Development tools (dev server only, never in a build)

| Key | Tool |
|---|---|
| F2 | Tuning panel: every view, course and handling value as a slider, a live readout (speed, gear, lock, skid, position), **Feel report**, **Copy changes** (the changed values as JSON, for pasting into the defaults or into `npm run feel -- '<json>'`), **Reset**. Changed values persist across reloads. |
| F9 | Start or stop recording a replay (the car's start state and every step's input). |
| F10 | Play the last replay back from where it started. After a tuning change, the same driving plays out under the new handling. |

## Targets are design calls

Every range in `FEEL_TARGETS` is our own judgement, not a figure from the original, except the top speed. The next step for accuracy is the measurement sheet (TODO → Quality targets §2): record a legitimate copy of the original, measure the same quantities (seconds to top speed, lock and sideways shift in bends, objects passed per second, and so on) and replace the ranges with those measurements. Measuring feel copies no data.

## Log

### Iteration 0: baseline (the model before this work)

All tunables were first set to reproduce the old behaviour exactly (the unit tests confirmed it), so the baseline is a true measurement of what was there. **11 of 23 targets met.**

Missed: curves swept too little (0.01 / 0.06 screens; the road looked straight near the car), the horizon never moved (0.00), LO launched too hard (0-100 in 2.8 s) and HI started too eagerly (only 1.6x slower), 0-290 took 17.1 s, a lane change was twitchy (0.43 s), the tyres never slid, the tightest bend could be held flat-out at 293 km/h, so neither slowing nor dropping to LO ever mattered, and leaving the road cost too little (4.8 s to fall to 120 km/h).

### Findings from measuring

- **The bend targets constrain each other.** The tightest and the gentle bend differ in curvature by 2.67x, so without any loss of grip "gentle bend at top speed needs ≤ 0.55 lock" forces "the tightest bend holds up to about 245 km/h or more". The targets are consistent, but only in a narrow band (gentle 0.52–0.55 lock, medium 0.86–0.92, tight limit 243–250 km/h). Any loss of grip that depends on the lock itself feeds back on itself (more lock → more slide → less grip → more lock) and makes medium bends impossible, so sliding costs speed (scrub), not grip.
- **The "holds the bend" test was too lenient.** It passed a car that survived 5 s while drifting out at 1.3 m/s. It now requires staying within 2 m of the line.
- **The LO-technique test reacted too early.** Bends ease their curvature in over the first quarter, so both runs finished slowing before the steering was loaded and braking was free. Both runs now react at full curvature, the late entry after a blind crest.
- **Being wide was free.** Braking in the bend put the car 6.3 m out (LO: 3.4 m), but nothing costs time until the car leaves the road. The rule chosen: braking while turning hard locks the tyres and loses grip, which engine braking in LO does not. At `brakeGripLoss` 0.5 the gain is 0.02 s, at 0.6 it is 1.6 s: a cliff, because leaving the road is the only time penalty. Worth re-checking by driving once traffic and roadside collisions exist.
- **Arc drawn as chords, found by a unit test.** Near the car one 3 m segment covers about a fifth of the screen, and rows were interpolated in straight lines between segment edges, which put a kink in the arcade arc. The offset is now computed for every row from its own depth (sweep a quarter of the way up: 0.11 → 0.14 screens).
- **Bug found by the tests:** at top speed with the throttle held, the car alternated between accelerating and coasting, so the speed flickered between 293 and 292 km/h. Fixed.

### Iteration 1: all targets met

View: arcade curve model, pitch follow 0.5. Handling: LO pull 9.5, HI pull 3.0 rising to 8.5, off-road drag 22, steering return 12, lateral response 14 (weight in the steering), centrifugal 0.833, slide above load 0.52 with 5 m/s² scrub, brake lock-up grip loss 0.6. **23 of 23 targets met**, with margin kept on the ones that first landed on an edge (0-290 km/h: 16.00 s → 15.5 s).

### Visual pass

- **Bends** (`bend-*.jpg`): the projected model keeps the road straight near the car and bends it sharply only near the horizon; the arcade model sweeps the whole road from just in front of the car. Gain 1000 was gentle, 1600 closest to the sweeping look; **1400** chosen (sweep 0.11 screens a quarter of the way up, 0.43 near the horizon).
- **Hills** (`climb-*`, `crest-*`, `dip-*`): with a level camera the climbing car shows a lot of its interior; pitching the camera half-way with the road halves that and moves the horizon (0.13 screens over a lap). Crests hide the road as intended; raising the hills 1.5x changed little, so the hill scale stays 1.
- **Camera** (`cam-*`): lower is faster-looking; at 1.4 m the car starts to hide the road ahead. **1.6 m high, 6.0 m behind** chosen (road flow 11.8 → 14.7 screens/s, car 0.24 of the screen width). The car and traffic sprite sheets were re-rendered for the new camera; the closer camera makes the car's frames larger (960 × 592), so its sheet grew to 7680 × 5328 (about 164 MB on the GPU; see the sheet-size item in the TODO).

### Still open

- Replace the design ranges with measurements from the original (the measurement sheet).
- Roadside density passes its target (10 objects/s) but looks sparse; decide with the measured figure.
- The slide shows only in the car's yaw; tyre smoke and the squeal are separate TODO items (M3, M8).
- Off-road shake and the feel at 60/120/144 Hz can only be judged by driving, not from stills.
