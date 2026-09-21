# Boso Run — development TODO

Working list of what is left to do. The overall design, milestones and decisions are in [plan.md](plan.md); this file tracks the concrete tasks. Tick items off as they land, and add new ones where they belong.

Milestone numbers (M1–M11) refer to the milestones in `plan.md`.

## Next up

In this order; each one unblocks the next.

1. [ ] **Decide the curve model (M2).** Either the arcade's per-scanline accumulation (lateral offset added row by row up the screen, which gives the original's characteristic bend) or the per-segment projection used now (geometrically exact, so scenery lines up, but bends look more even). The fork is built on top of this, so decide first. Build both behind a switch on the test course and compare.
2. [ ] **Road fork prototype (M2).** The road widens, then two roads diverge with correct overlap in the scanline table and the shader, and the player's position picks a branch. The hardest rendering problem in the plan.
3. [ ] **Track editor (M2, M4).** In-browser editor for sections (length, curve, hill) and roadside scenery rules, with live preview. Saving to `src/data/stages/*.json` needs a dev-only write endpoint in `vite.config.ts` (a browser cannot write to the repository by itself).
4. [ ] **Traffic and collisions (M5).** Tasks are under M5 below.

Long-lead work for the owner, to start in parallel because everything car-related is redone when it lands:

- [ ] **Concept design of the original player car** (see "Car and characters").
- [ ] Get the things `plan.md` lists under "Things to have on hand": a legitimate reference copy with a way to record it, a 4K display, a 120 or 144 Hz display, a gamepad, a low-end machine.

## Quality targets — getting close to the original

The original's quality comes less from detail in the art than from three things: how fast it feels, how good the car is to drive, and how well colour and sound hold together. The areas below are in order of how far the current build is from the original. Tasks that already exist elsewhere in this file are pointed to, not repeated.

**Approach: finish one stage before widening.** Bring stage 1 (Chōshi) to final quality — look, colour, sense of speed, sound — before building out the other 14. That stage sets the bar, and the rest becomes applying it. Widening at low quality means redoing everything later.

### 1. Sense of speed (the largest gap today)

The speed figure is already 293 km/h; what is missing is how the screen sells it.

- [ ] **Tuning panel (suggested first step).** A dev-only panel that changes camera height, camera distance, field of view, scenery density and hill scale while the game runs, so the feel can be compared at once.
- [ ] Roadside density and closeness: objects in an unbroken run right at the road edge. Speed is felt through the number of things passing; the test course is sparse.
- [ ] Camera: try lower and closer than the current 2.0 m high, 6.5 m behind. Any change must be mirrored in `tools/blender/render_car.py` and the car sheet re-rendered.
- [ ] Curve look: the way a bend swings harder towards the horizon comes from per-scanline accumulation (the curve model decision in "Next up").
- [ ] Bolder hills: crests that hide the road ahead completely, and a horizon and background that move up and down clearly more than now.

### 2. Handling

- [ ] Tune the outward push in bends and how quickly the car answers when the wheel is returned.
- [ ] Set the speed at which the tyres let go (skid state, M3).
- [ ] Make dropping to LO gear for a bend a technique that pays off.
- [ ] Off-road: slowdown plus shake (M3).
- [ ] **Measurement sheet from a recording of the original** (legitimate copy): seconds to top speed, sideways shift of the road in the tightest bend, time per stage, roadside objects passed per second. These become the target numbers. Measuring feel copies no data.
- [ ] Replay-driven comparison: the simulation is deterministic, so the same recorded input can be re-run after every tuning change (replay tests, M10 — pull the recorder forward for this).

### 3. Colour and a single look

- [ ] Few colours, high saturation: sky gradient, road, ground and roadside objects designed as one palette per stage. Today the realistically shaded car and the code-drawn trees look like two different games.
- [ ] Style guide first (M4), then the toon shader and outlines on the car ("Car") — that step alone closes much of the gap.
- [ ] Palette change while driving from one stage into the next (M6): sky and ground colours blending smoothly is one of the original's signatures.

### 4. Small motions

At high resolution a flat sprite reads as a cardboard cut-out unless it moves.

- [ ] Spinning wheels (wheel frames or a blurred wheel layer in the car sprite).
- [ ] Brake lights when braking.
- [ ] Tyre smoke and roadside dust (M3).
- [ ] Hair in the wind and occupants' gestures ("Car and characters").
- [ ] Crash sequence with both occupants thrown out and an argument afterwards, in original gestures (M5).

### 5. Tension

- [ ] Time allowance set so a first-time player runs out around stage 2–3, as in the original (timer and checkpoints, M6).
- [ ] Traffic placed where it hurts: at bend exits and on the outside line, so overtaking is the core of play (M5).
- [ ] Checkpoint moment: sound and on-screen display that make passing it feel like a reward.

### 6. Sound

Half of the original's impression is its music.

- [ ] Three driving tracks of real quality and the music-select screen (M7, M8).
- [ ] Engine sound tied to RPM and gear (M8). A cheap engine sound makes the whole game feel cheap.
- [ ] Tyre squeal that starts just before the tyres let go, so it works as a driving cue.

## Milestone backlog

### M1 — Scaffold

- [ ] Choose a licence for the code and add `LICENSE`.
- [ ] Add `ASSETS.md` and record every third-party asset, font and sound in it, with its licence.
- [ ] Add `.gitattributes` to fix line endings (every commit currently warns about LF/CRLF).
- [ ] Rewrite `README.md` (it still says "Outrun Clone"): title, how to run, how the Blender tools are used.
- [ ] Preview deploy in CI on every push (the workflow only type-checks, tests and builds).
- [ ] Seeded random number generator in `src/core/` — traffic and any random scenery must stay deterministic for replays.
- [ ] Asset loader with a progress display (art currently loads ad hoc in `src/render/carSprite.ts`).
- [ ] Handle a lost WebGL context (`webglcontextlost` / `webglcontextrestored`): rebuild textures and programs instead of a dead canvas.

### M2 — Road renderer

- [ ] Curve model decision, road fork, track editor (see "Next up").
- [ ] Road width that changes along a stage (the fork needs it; also lane-count changes).
- [ ] Road drawn from a road texture (one row per scanline) instead of shader-computed stripes, so the surface, lines and kerbs can be painted per stage.
- [ ] Per-stage background panoramas: layered images that scroll with curves and hills, replacing the shader-drawn hills for final art.
- [ ] Check the road at 1080p, 1440p and 4K on real displays.

### M3 — Player car and handling

- [ ] Tune handling constants in `src/sim/player.ts` to "drivable and fun" (currently placeholder values; high-speed cornering pushes out hard). Matching the original is M9.
- [ ] Skid state and tyre-squeal trigger.
- [ ] Engine RPM model (feeds the tachometer and the engine sound).
- [ ] Off-road dust and tyre-smoke sprites; bumpy camera off the road.

### M4 — Scenery

- [ ] Style guide shared by rendered cars and drawn scenery: outline weight, shading steps, palette per time of day (`plan.md` → Art). Needed before any final art is made.
- [ ] Atlas packer in `tools/` that trims each frame to its content. The car sheet uses the same tool (see the sheet-size item under "Car").
- [ ] Mipmapped high-resolution scenery sprites replacing the code-drawn placeholders in `src/render/placeholders.ts`.
- [ ] Texture memory budget per stage (car + traffic + scenery + background), for desktop and for mobile.
- [ ] Per-stage roadside patterns for the 15 Bōsō stages.
- [ ] Soft shadows under roadside objects.

### M5 — Traffic and collisions

- [ ] Lane-keeping traffic cars and trucks with varied speeds, spawned from the seeded generator.
- [ ] Traffic vehicle models scripted in Blender, rendered at 3–5 angles (`plan.md` → Art).
- [ ] Collision boxes for traffic and roadside objects.
- [ ] Light bump: nudge and slowdown.
- [ ] Hard hit and scenery hit: spin or flip crash, reset to the road centre.
- [ ] Spin and crash frames for the player car sprite (extra rows in `render_car.py`).
- [ ] Crash poses for driver and passenger (thrown out, sitting by the road) — original gestures.

### M6 — Stage structure

- [ ] **One complete route first:** stage 1 → fork → stage 2A / 2B with the countdown timer, a checkpoint and game over. Prove the whole loop on two tiers before authoring the other 12 stages.
- [ ] Stage graph data format: each stage file names its left and right successors; one index lists the 15 stages and 5 goals.
- [ ] Countdown timer and score in `src/sim/` (the HUD currently shows a lap time counting up).
- [ ] Checkpoints that extend the time; table of stage lengths and time allowances.
- [ ] Palette and scenery transitions between stages; palettes per time of day (sunrise → night).
- [ ] Road layouts for all 15 stages (stage table in `plan.md` → Stages).
- [ ] 5 ending scenes (2D illustrations).

### M7 — Game flow and HUD

- [ ] Game state machine: title → music select → start → drive → goal / game over → name entry.
- [ ] Title screen; "press start" also unlocks audio.
- [ ] Attract mode.
- [ ] Music select screen.
- [ ] Start-line countdown.
- [ ] HUD: tachometer, score, stage, lap times, course-map progress (speed, time and gear exist).
- [ ] Check the HUD layout at 16:10 (Steam Deck, 1280×800) and ultrawide.
- [ ] HUD font with Japanese glyphs; record its licence in `ASSETS.md`.
- [ ] Game over, high-score table with initials entry (through the storage interface).

### M8 — Audio

- [ ] FM synthesizer and sequencer (Web Audio).
- [ ] Engine sound tied to RPM and gear; tyre squeal, crash, checkpoint and countdown sounds.
- [ ] Streamed-music player for generated tracks.
- [ ] One trial FM-sequenced track; compare with a Suno track in game and decide (`plan.md` → Music).
- [ ] Three driving tracks and a results tune.

### M9 — Accuracy and polish

- [ ] Tune physics and timing side by side with the original.
- [ ] Profile at 4K and at 60 / 120 / 144 Hz on real displays (not yet checked; the in-app browser pane throttles frames).
- [ ] Options: key and gamepad rebinding, volume.
- [ ] Pause screen with resume, restart and quit (Esc currently opens the options panel, which pauses). Pause automatically when the tab is hidden or the gamepad disconnects.

### M10 — Test and ship (desktop web)

- [ ] Replay-based regression tests (the simulation is already deterministic).
- [ ] Playwright smoke test.
- [ ] Deploy to GitHub Pages or itch.io.

### M11 — Mobile

- [ ] Touch steering and pedals.
- [ ] Lower default resolution scale; half-resolution sprite sheets.
- [ ] Landscape lock with a rotate prompt.
- [ ] Test on iOS Safari and Android Chrome.

## Car and characters

The current car and both characters are local stand-ins (not in git, never shipped).

### Car

- [ ] **Original car design (required before release; long lead, start now).** The stand-in Tripo model is a real production car. Design an original two-seat open sports car as a concept image, generate or commission the model, and run it through `tools/blender/prep_car.py`. See `plan.md` → Art.
- [ ] **Per-car measurements in a data file.** Seat hip points and the steering wheel's centre, normal and radius are constants in `seat_person.py`, and `fix_car_materials.py` is written for the stand-in. Move the measurements to a JSON file next to each model so a new car does not mean editing scripts.
- [ ] **CHIBA wordmark and M emblem.** Original lettering and emblem shape (not a rounded-square badge), applied to the new car.
- [ ] **Sprite sheet size — do this before scenery and traffic art arrive.** The 65-frame sheet is 7776 × 4480: about 140 MB on the GPU (185 MB with mipmaps), and wider than the 4096-pixel texture limit of some integrated and mobile GPUs. The frames cannot be mirrored to halve them, because the driver sits on one side. Options: trim each frame to its content with the atlas packer, split into pages of 4096 or less, GPU texture compression, half-resolution sheets for mobile.
- [ ] **Decide how the car is lit per time of day.** Five lights (sunrise → night) as five re-rendered sheets multiplies the memory above; a tint or palette step in the sprite shader costs nothing. Decide together with the style guide (M4).
- [ ] Toon shader and outlines in the sprite render (planned style; sprites are currently rendered with realistic shading).

### Passenger (`art/models/passenger/passenger2.glb`)

- [ ] Remove the "DG"-like logo on the waistband and the print on the top before any front-facing use (title screen, endings).
- [ ] Recolour the hair to blonde.
- [ ] Hair blowing in the wind (separate hair layer or frames).

### Driver (`art/models/driver/driver.glb`)

- [ ] Finger bones so the hands grip the wheel (hands currently rest open on the rim).

### Both

- [ ] Decide whether the generated characters ship or are stand-ins too. If they ship: commercial-use terms of the plan they were generated on, an entry in `ASSETS.md`, and the Steam AI-content declaration.
- [ ] Feet poke through the car floor (hidden from the game camera; fix before side views are used).
- [ ] Reactions: passenger pointing or holding on, driver gestures at checkpoints and near misses.
- [ ] Decide if the occupants' sway through turns and slopes should be stronger (`SWAY_PER_YAW`, `LEAN_PER_PITCH` in `tools/blender/render_car.py`).

## Housekeeping

- [ ] Delete `tools/blender/remove_bag.py` (only for the first passenger model, superseded by `passenger2.glb`).
- [ ] Delete the unused first passenger files (`art/models/passenger/passenger.*`) — local only, not in git.
- [ ] Decide how final (original) models are stored: Git LFS for `art/models/` once they are real assets.
- [ ] Rename the repository from `outrun-clone` to `boso-run`.

## Before release

- [ ] Replace all stand-in art: car, scenery, and the characters unless they are cleared to ship.
- [ ] Trademark and Steam name check for "Boso Run".
- [ ] Original logo for the game.
- [ ] Music with licences that cover commercial release; Steam AI-content declaration if Suno or Tripo output ships.
- [ ] Every third-party asset recorded in `ASSETS.md`.
- [ ] Steam: Steamworks account, desktop wrapper (Tauri or Electron), controller and Steam Deck checks, store assets.
