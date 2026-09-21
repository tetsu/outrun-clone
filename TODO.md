# Boso Run — development TODO

Working list of what is left to do. The overall design, milestones and decisions are in [plan.md](plan.md); this file tracks the concrete tasks. Tick items off as they land, and add new ones where they belong.

Milestone numbers (M1–M11) refer to the milestones in `plan.md`.

## Next up

In this order; each one unblocks the next.

1. [x] **Decide the curve model (M2).** Decided: the arcade model (a bend adds a sideways offset accumulated row by row up the screen, as the 1980s hardware did), tuned in the feel loop ([docs/feel-loop.md](docs/feel-loop.md)). The projected model stays selectable in the tuning panel. The fork is built on the arcade model.
2. [x] **Road fork prototype (M2).** A stage ending in `"fork"` widens (two roads overlapping), parts with a sign in the gore, and the two roads bend apart at the same height; the car commits to the branch it is on once there is grass between them, and the branch's stage is attached (`src/sim/route.ts`). Both roads live in the scanline table (two centres per row) and the shader colours each pixel from the nearer road. The branch not taken fades out before the fork's data ends. Prototype stages: `fork-test` → `fork-test-left` / `fork-test-right` → back to `fork-test`. Tests: `tests/fork.test.ts`.
3. [x] **Track editor (M2, M4).** Dev server only, F4: sections, roadside rules, fork and next stage, with the game as live preview, an overview (plan and height profile; click to put the car there) and Save through a dev-only endpoint (`/__dev/stage/<name>.json` in `vite.config.ts`). Saved files keep the hand-written layout (`tests/stages.test.ts`).
4. [x] **Traffic and collisions (M5).** Traffic, bumps, spin and roll-over crashes are in; what is left is under M5 below.

Long-lead work for the owner, to start in parallel because everything car-related is redone when it lands:

- [ ] **Concept design of the original player car** (see "Car and characters").
- [ ] Get the things `plan.md` lists under "Things to have on hand": a legitimate reference copy with a way to record it, a 4K display, a 120 or 144 Hz display, a gamepad, a low-end machine.

## Quality targets — getting close to the original

The original's quality comes less from detail in the art than from three things: how fast it feels, how good the car is to drive, and how well the graphics and sound hold together. The areas below are in order of how far the current build is from the original. Tasks that already exist elsewhere in this file are pointed to, not repeated.

**Approach: finish one stage before widening.** Bring stage 1 (Chōshi) to final quality — look, colour, sense of speed, sound — before building out the other 14. That stage sets the bar, and the rest becomes applying it. Widening at low quality means redoing everything later.

### 1. Sense of speed (the largest gap today)

The speed figure is already 293 km/h; what is missing is how the screen sells it. §1 and §2 are tuned in a measured loop: see [docs/feel-loop.md](docs/feel-loop.md) for how to run it and the log of what was changed and why.

- [x] **Tuning panel.** F2 in the dev server: every view, course and handling value live, plus the feel report. F9 / F10 record and play back replays.
- [ ] Roadside density and closeness: objects in an unbroken run right at the road edge. Passes its design target (10 objects/s at top speed) but still looks sparse; set it from the measured figure of the original.
- [x] Camera closer: 2.0 m high, 6.0 m behind (was 6.5 m). 1.6 m was tried and hid the far road behind the car, so bends could not be seen coming (feel loop, iteration 2). Car, crash and traffic sheets rendered to match.
- [x] Bends show before the car is in them: the projected bend is added to the arcade sweep (`curveLookahead` 1.5). Guarded by the `curve_ahead` and `horizon_clear` feel targets.
- [x] Curve look: arcade model (sideways offset accumulated up the screen), gain 1400; the projected model stays selectable. This settles the curve model decision in "Next up".
- [x] Bolder hills: the camera pitches half-way with the road, so the horizon travels 0.13 screens over a lap; crests hide the road ahead (5 on the test course).

### 2. Handling

- [x] Outward push in bends and the response when the wheel is returned: tuned to targets (gentle bend flat-out at about half lock, medium at 0.9, the tightest held up to 248 km/h; sideways motion stops 0.2 s after letting go).
- [x] Tyres let go at full lock above 217 km/h; sliding scrubs speed and swings the car's tail out in the sprite.
- [x] Dropping to LO for a bend pays off: braking hard while turning hard locks the tyres and runs the car wide onto the verge, engine braking in LO does not (1.6 s gained in the late-entry test).
- [x] Off-road: from top speed to 120 km/h in 2.8 s, and the view shakes.
- [ ] **Measurement sheet from a recording of the original** (legitimate copy): seconds to top speed, sideways shift of the road in the tightest bend, time per stage, roadside objects passed per second. These replace the design ranges in `FEEL_TARGETS` (`src/dev/feel.ts`). Measuring feel copies no data.
- [x] Replay recorder (F9 / F10) for comparing the same driving before and after a tuning change.
- [ ] Re-check the brake lock-up by driving once traffic and roadside collisions exist: the LO gain jumps from 0.02 s to 1.6 s between grip loss 0.5 and 0.6, because leaving the road is the only time penalty so far.
- [ ] Judge the feel by driving at 60 / 120 / 144 Hz with a gamepad; stills and numbers cannot show it.

### 3. Graphics

All graphics polish is gathered here. Items marked with a milestone are tracked there in detail; the rest are new.

One look:

- [ ] Few colours, high saturation: sky gradient, road, ground and roadside objects designed as one palette per stage. Today the realistically shaded car and the code-drawn trees look like two different games.
- [ ] Style guide first (M4), then the toon shader and outlines on the car ("Car") — that step alone closes much of the gap.
- [ ] Palette change while driving from one stage into the next (M6): sky and ground colours blending smoothly is one of the original's signatures.
- [ ] Haze colour per stage and time of day (morning mist, sunset glow). There is one haze colour today, in `src/render/palette.ts`.
- [ ] How the car is lit per time of day ("Car").

Road, ground and sky:

- [ ] Road drawn from a painted road texture (M2).
- [ ] Per-stage background panoramas replacing the shader-drawn hills (M2).
- [ ] **Sea and water.** The coastal route has the sea in view almost all the way. The ground is a flat colour today; it needs the sea to one side with a shoreline, sand, and the water of rice paddies, each told apart — a per-side ground type in the stage data and the road shader.
- [ ] **Clouds** in the sky layer, scrolling with curves. They also help the sense of speed, because they make the background visibly move in a bend.

Objects:

- [ ] Mipmapped high-resolution scenery sprites and soft shadows under them (M4).
- [ ] **Objects that span the road.** The Katsuura tunnels, shrine gates, the bay-crossing bridge, the Chiba monorail overhead, airliners low over Narita. The sprite system only places objects standing beside the road; things over it need their own kind: a gate sprite centred on the road and scaled to its width, and a tunnel drawn as walls and a roof from the scanline table, with the light changing inside.
- [ ] **Dusk and night.** City and industrial lights, headlights on the road, tail lights on traffic, and a glow around bright lights (an additive sprite pass; a bloom pass only if that is not enough). All five goal stages run from sunset into night.
- [ ] **Sprite edge quality at 4K on a real display:** shimmer on distant objects, soft fringes on enlarged ones. Check premultiplied-alpha edges and the mipmap bias.

Screen:

- [ ] Transitions: fades at the start, the goal and game over, and between the title, music select and the drive.

### 4. Small motions

At high resolution a flat sprite reads as a cardboard cut-out unless it moves.

- [ ] **Steering wheel and arms, baked into the yaw frames (first; no extra frames).** Each of the 13 yaw frames gets the wheel turned in proportion to the yaw, up to about ±70° (more would need hand-over-hand), and the hands follow it: `reach()` in `render_car.py` already puts them on the rim, so the grip points only shift by the wheel's turn. The arms and shoulders are what shows from behind. The stand-in car is one mesh, so the steering wheel is first cut out as its own object (its centre and radius are already measured in `seat_person.py`).
- [ ] **Front wheels turned, baked into the yaw frames (second; no extra frames).** Hidden from straight behind, but the outer front wheel shows past the body in the angled frames. Cut the front wheels out of the single mesh by the wheel-arch positions.
- [ ] **Spinning wheels (third; with the original car).** Not as extra sheet frames — every spin phase would multiply the 140 MB sheet. A small wheel-only layer drawn over the car, 2–3 phases (wheels blur at speed), rendered with the body as a holdout so it is hidden correctly. From straight behind only the tread shows, so it matters most at the start, at low speed and in angled frames. Ask for the wheels as separate parts when the original car is modelled.
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
- [x] Seeded random number generator (`src/sim/random.ts`); traffic and collisions draw only from it, and replays store its state.
- [ ] Asset loader with a progress display (art currently loads ad hoc in `src/render/carSprite.ts`).
- [ ] Handle a lost WebGL context (`webglcontextlost` / `webglcontextrestored`): rebuild textures and programs instead of a dead canvas.

### M2 — Road renderer

- [x] Curve model decision, road fork, track editor (see "Next up").
- [ ] Road width that changes along a stage (lane-count changes; the fork does without it, as two overlapping roads). Today a route keeps the first stage's width.
- [ ] Fork polish: roadside objects in the gore beyond the one sign, a proper overhead direction sign before the split, and a look at the fork with each branch's own scenery and palette (M6).
- [ ] Track editor: undo, dragging sections on the overview, and editing scenery placed one by one (only rules today).
- [ ] Road drawn from a road texture (one row per scanline) instead of shader-computed stripes, so the surface, lines and kerbs can be painted per stage.
- [ ] Per-stage background panoramas: layered images that scroll with curves and hills, replacing the shader-drawn hills for final art.
- [ ] Check the road at 1080p, 1440p and 4K on real displays.

### M3 — Player car and handling

- [x] Tune handling constants in `src/sim/player.ts` to "drivable and fun": done in the feel loop against design targets. Matching the original is M9.
- [x] Skid state (`PlayerState.skid`, 0..1): the trigger for the tyre squeal (M8) and tyre smoke.
- [ ] Engine RPM model (feeds the tachometer and the engine sound).
- [ ] Off-road dust and tyre-smoke sprites. (The bumpy camera off the road is done.)

### M4 — Scenery

- [ ] Style guide shared by rendered cars and drawn scenery: outline weight, shading steps, palette per time of day (`plan.md` → Art). Needed before any final art is made.
- [ ] Atlas packer in `tools/` that trims each frame to its content. The car sheet uses the same tool (see the sheet-size item under "Car").
- [ ] Mipmapped high-resolution scenery sprites replacing the code-drawn placeholders in `src/render/placeholders.ts`.
- [ ] Texture memory budget per stage (car + traffic + scenery + background), for desktop and for mobile.
- [ ] Per-stage roadside patterns for the 15 Bōsō stages.
- [ ] Soft shadows under roadside objects.

### M5 — Traffic and collisions

- [x] Lane-keeping traffic, all driving the player's way (`src/sim/traffic.ts`): 8 kinds with their own sizes and speed ranges, closing up behind slower vehicles instead of passing through them, spawned far ahead in the haze from the seeded generator, 5 per km. At a fork the left lanes take the left road and the right lanes the right. Rendered sheets in the dev server, code-drawn placeholders otherwise.
- [ ] Traffic that changes lanes, and traffic placed where it hurts (see Quality targets §5). Density per stage in the stage file.
- [ ] Traffic vehicle models, rendered at 3–5 angles (`plan.md` → Art). Scripted in Blender or generated; either way original designs, not real production cars. Models go in `art/models/traffic/<name>/<name>.glb` (local only, like the other models).
- [x] Traffic sprite render: `tools/blender/render_traffic.py` (11 yaw angles, ±40°, camera 10 m behind; no occupants). `prep_car.py` is used as it is, with the length per vehicle. The camera, frame fitting and sheet packing are shared with the player car in `sprite_common.py`. Output goes to `local-assets/traffic/<name>/`.
- [ ] Stand-in traffic models are in (`deco-truck` 6.0 m, `kei-truck` 3.4 m, `supercar` 4.5 m, `yankee` 4.4 m, `bus` 7.3 m — the lengths given to `prep_car.py`). Before any of them ships:
  - [ ] `supercar` reproduces a real Italian mid-engine sports car (body, lights and wheels). Stand-in only; replace with an original design.
  - [ ] `kei-truck` has the front face of a real kei truck. Seen from behind it is generic; change the front or replace it.
  - [x] `deco-truck`: the blank rear doors are dressed by `tools/blender/fix_deco_truck.py` — a door painting drawn in the script (sunrise over the sea with a lighthouse), lock rods, three round tail lamps per side and a plate. Render from `deco-truck.fixed.blend`.
  - [ ] `yankee` and `bus`: check the lettering and plates; no real company names.
- [ ] Traffic renders are overexposed on white and chrome bodies (the kei truck loses its shading). Lower the light for traffic or fix it with the toon shader.
- [ ] Each generated model is 1.8–1.9 million faces and a 60–80 MB file. Decimate in `prep_car.py` (the characters are already cut to 250k faces).
- [ ] Traffic sheets are 5–8 thousand pixels wide each (the bus and the truck use two rows). They count towards the texture budget (M4) and the 4096-pixel limit.
- [x] Collision boxes for traffic and roadside objects (`src/sim/collision.ts`): trunks and poles are solid; posts are knocked aside for a 10% loss of speed.
- [x] Light bump: slowed to behind the vehicle and nudged; side contact pushes the cars apart.
- [x] Hard hit and scenery hit: a spin (70 km/h or more faster than the vehicle hit, or a tree or sign above 50 km/h) or a roll-over (170 km/h faster, or scenery above 160 km/h); then back on the centre of the road, at a standstill, blinking and unhittable for 2.5 s. Replays store the traffic and the collision random state.
- [ ] Crash sounds, and the time lost to a crash checked against the original once the timer exists (M6).
- [x] Spin and roll-over frames for the player car: `tools/blender/render_crash.py car` (24 spin yaws with the occupants aboard, 12 roll angles without them, half resolution: 8160 × 1152).
- [x] Crash pose for driver and passenger, sitting on the road leaning back on their hands (`sitting_ground` in `pose_person.py`; `render_crash.py people`). In a roll-over they are thrown out ahead and sit there until the car is reset.
- [ ] Crash follow-ups: people in flight use the sitting frame (no tumbling frames); an argument between the two afterwards (Quality targets §4); the upside-down roll frames show the car's bare underside, which the stand-in model barely has.

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

- [ ] Replay-based regression tests (the recorder exists: `src/sim/replay.ts`; record reference drives and check where they end up).
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
- [ ] **Sprite sheet size — do this before scenery and traffic art arrive.** The 65-frame sheet is 7680 × 5760 since the camera moved closer: about 177 MB on the GPU (236 MB with mipmaps), plus the crash sheet (8160 × 1152, 38 MB), and wider than the 4096-pixel texture limit of some integrated and mobile GPUs. The frames cannot be mirrored to halve them, because the driver sits on one side. Options: trim each frame to its content with the atlas packer, split into pages of 4096 or less, GPU texture compression, half-resolution sheets for mobile.
- [ ] **Decide how the car is lit per time of day.** Five lights (sunrise → night) as five re-rendered sheets multiplies the memory above; a tint or palette step in the sprite shader costs nothing. Decide together with the style guide (M4).
- [x] **Glossy paint.** `clear_coat()` in `sprite_common.py` gives the paint (told apart by the saturation of the baked texture) a clear coat, and every sprite render reflects a sky with a sharp horizon, dark road below, so the horizon draws a line along the body. `rear_panel.py` now carries the rear panel's creases through the removed badge and lettering and gives them the panel's normals; before, the gloss showed the old letters as ghosts.
- [ ] Gloss follow-ups: the rear panel reads a little pale (the bright horizon); traffic sheets get the new sky on their next render but no clear coat yet (their paint colours vary, so the saturation mask needs checking per vehicle); decide how much gloss survives the toon shader.
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
