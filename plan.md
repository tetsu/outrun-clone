# Boso Run — development plan

**Title:** Boso Run. The name is a pun on 房総 (Bōsō, the peninsula in Chiba) and 暴走 (bōsō, reckless driving).

## Goal

Build a browser racing game that matches the 1986 arcade original in feel, mechanics, structure and presentation. Later, stages and cars will be swapped so the game can be released on Steam and other platforms.

## What "exact" means

The build matches the original in:

- the rendering technique (per-scanline pseudo-3D road, scaled billboard sprites)
- the handling model
- the branching 15-stage layout
- the timer and checkpoint flow
- the HUD layout and the music-select screen

It deliberately does not match the original's 320×224 resolution or pixel-art look. The game targets 60 FPS at modern resolutions and must look natural on 1080p through 4K screens (see "Display targets").

It does not copy Sega's content: no ripped sprites or track data, no recreated licensed car, no original music, no logo or name. Even a free public web build with those would infringe, and it would block a Steam release.

Since stages and cars will be swapped later anyway, original art, music and track layouts are used from the start. All of that content lives in data files, so the later reskin means editing data rather than code. To tune the feel against the original, play a legitimate copy side by side with the build.

## Display targets

- **Frame rate:** variable, matched to the environment. Rendering runs at the display's refresh rate (60, 120, 144, 240 Hz and so on), with 60 FPS as the minimum target.
  - The simulation runs at a fixed 120 Hz, independent of the render rate, so game speed and handling are identical on every display and replays stay deterministic. 120 Hz keeps input latency low on fast monitors, and the cost is negligible.
  - Each rendered frame interpolates between the two latest simulation states. This is what keeps motion smooth at rates that don't divide evenly, such as 144 Hz.
  - An options setting caps the frame rate: display rate (default), 120, 60 or 30. Browsers draw only on the display's refresh via `requestAnimationFrame`, so a cap works by skipping frames and is smoothest at whole divisors of the refresh rate.
  - If a frame takes too long, the simulation catches up with a bounded number of steps, so a slow machine slows down gracefully instead of spiralling.
- **Resolution:** the canvas renders at the display's native pixel size (CSS size × `devicePixelRatio`), from 1920×1080 up to 3840×2160. Nothing is rendered small and scaled up.
- **Aspect ratio:** designed for 16:9. Wider screens see more to the sides; narrower ones get letterboxing. The vertical field of view stays constant so the driving feel doesn't change with the window shape.
- **Performance fallback:** an internal resolution-scale option (for example 75% or 50%) for weak GPUs driving a 4K display.

## Tech stack

- **Language and build:** TypeScript and Vite, with no game engine. The output is a static site.
- **Rendering:** WebGL2. A software framebuffer is too slow at 4K (about 8.3 million pixels per frame), so the GPU fills the pixels.
  - **Road:** the CPU computes the classic per-scanline table each frame (for each screen row: road centre, width, distance and colour band). That is at most 2160 rows, which is trivial. The table is uploaded as a small texture and a fragment shader draws the road from it. This keeps the original technique, so curves and hills behave the same way, and the shader anti-aliases road edges and lane markings so they stay clean at any resolution.
  - **Sprites:** batched textured quads with mipmaps and linear filtering, drawn back to front and clipped against hill crests.
  - **Backgrounds:** layered high-resolution panoramas that scroll with curves and hills, and gradient skies computed in the shader.
  - **HUD:** DOM text over the canvas, sized in viewport units and anchored to the screen edges, so it stays sharp at 4K and lays out on any aspect ratio (see "Status" for why this replaced the SDF-text idea).
- **Simulation:** fixed-timestep at 120 Hz and deterministic, separate from rendering. This allows input replays for regression tests and ghost cars later.
- **Audio:** Web Audio. A small FM synthesizer (four-operator voices, in the spirit of 1980s arcade sound chips) drives the engine sound, the sound effects and sequenced music. The music player also streams ordinary audio files, so generated or recorded tracks work too.
- **Text:** Japanese and English from the start. Every string goes through a string table, and the language can be switched in the options screen. The default follows the browser's language.
- **Platforms:** desktop browsers first. Mobile comes later as its own milestone, and Steam after that by wrapping the same build in Tauri or Electron. Nothing needs to change now for either.

## Architecture

```
src/
  core/      loop (fixed step), input (keyboard/gamepad/touch, rebindable), rng, asset loader,
             storage (settings and saves behind one interface), i18n (ja/en string tables)
  render/    WebGL2 context, road (scanline table + shader), sprite batcher, background parallax, palette,
             HUD (DOM text over the canvas, edge-anchored)
  sim/       player physics, traffic AI, collision, stage progression, timer/score
  game/      state machine: title → music select → start → drive → goal/game over → name entry; options
  audio/     FM synth, engine sound, sfx, sequencer, streamed-music player
  data/      stages/*.json, cars/*.json, palettes, sprite atlases, music, strings   ← everything swapped later
tools/       track editor, atlas packer (dev-only)
.github/     CI workflows
ASSETS.md    licence record for every third-party asset, font and sound
```

## Milestones

1. **Scaffold.** Vite and TypeScript, the fixed 120 Hz simulation loop with render interpolation at the display's refresh rate and a frame-rate cap, a WebGL2 canvas at native resolution that handles resize and `devicePixelRatio`, and the input layer. Also the foundations that are painful to retrofit: the Japanese and English string tables, the storage interface for settings and saves (localStorage now, files or Steam Cloud later), GitHub Actions CI (type-check, tests, build, preview deploy on every push), a code licence, and `ASSETS.md`.
2. **Road renderer.** A segment-based pseudo-3D road with curves, hills, rumble strips and lane markings, drawn by the scanline-table shader with anti-aliased edges. Checked at 1080p, 1440p and 4K. Distance-based colour banding, a horizon, and sky and background layers that shift with curves. Roads that widen and split, which the fork needs. The in-browser track editor starts here, with live preview of curves and hills.
3. **Player car and handling.** An acceleration curve, low and high gears, and a top speed of about 293 km/h. Steering against centrifugal pull in curves, off-road slowdown, skids, and car sprite frames for steering and hills.
4. **Scenery sprites.** A batched sprite renderer with mipmapped high-resolution atlases, clipping behind hill crests, an atlas pipeline, and per-stage roadside object patterns defined in data. The track editor gains roadside pattern editing.
5. **Traffic and collisions.** Lane-keeping AI cars and trucks with speed variance. A light bump gives a nudge and slowdown. A hard hit or a scenery hit gives the spin or flip crash sequence and a reset to the road centre.
6. **Stage structure.** A fork at the end of each stage, leading through a 5-tier tree of 15 stages to 5 goals (see "Stages"). Smooth palette and scenery transitions between stages, checkpoints that extend time, and 5 ending scenes.
7. **Game flow and HUD.** A title screen whose "press start" also unlocks audio, because browsers block sound until the player interacts. Attract mode, a music select, and a start-line countdown. A HUD with speed, tachometer, time, score, stage, lap times and a course-map progress display. The HUD anchors to screen edges, so 16:10 (Steam Deck, 1280×800) and ultrawide screens lay out correctly. A game-over screen and a high-score table with initials entry, saved through the storage interface.
8. **Audio.** The FM synthesizer and sequencer. Engine pitch tied to RPM and gear, plus tyre squeal, crash, checkpoint and countdown sounds. Three selectable tracks and a results tune (see "Music").
9. **Accuracy and polish pass.** Tune the physics constants and timing side by side with the original. Profile at 4K and at 60, 120 and 144 Hz. Finish the options screen: language, key and gamepad rebinding, volume, frame-rate cap and resolution scale. Add analog steering on a gamepad and a pause screen.
10. **Test and ship (desktop web).** Unit tests for projection and physics, replay-based regression tests, and a Playwright smoke test. Deploy to GitHub Pages or itch.io.
11. **Mobile (later).** Touch steering and pedals, a lower default resolution scale and smaller texture sets for phone GPUs, landscape lock with a rotate prompt, and testing on iOS Safari and Android Chrome.

Milestones 1–3 give something drivable quickly. Milestone 6 is where it starts to feel like the real game. Milestone 9 is where "exact" is won or lost, so budget real time for it.

## Art

**Direction:** the same genre look as the 1986 original — a bright blue sky, a red open-top sports car seen from behind, roadside scenery rushing past, saturated colours that change per stage — drawn as new, original artwork.

**Using the original as reference.** Watching the original (on a legitimate copy) to study it is fine: how large objects are on screen, how densely scenery is placed, how palettes shift between stages, how many animation frames a turn uses. Genre conventions and ideas are free to use. What is not used, in any form:

- screenshots, extracted sprites or tiles, or anything traced, redrawn or upscaled from them
- the original's specific car (a real licensed model), characters, logo, fonts, HUD graphics or stage-by-stage scenery designs
- ROM data of any kind

This matters more because the game will be sold: a traced asset is grounds for a takedown on Steam. Setting the game in Bōsō helps, because the scenery is naturally different.

The art is high-resolution, not pixel art. Sprites are authored for 4K and mipmapped down for smaller screens. As a guide, the player car covers roughly a quarter of the screen width, so its frames are about 1000 px wide. 

**Pre-rendering does not make the game 3D.** The 3D model exists only in the art tool. It is rendered offline into flat PNG frames, and the game loads and draws those frames as 2D sprites exactly as it would hand-drawn ones. There is no 3D model, camera or lighting in the game itself. With a toon shader and outlines, the frames read as illustration rather than as 3D renders.

Recommended split:

- **Cars: pre-rendered from 3D models.** Cars need many views of the same object. The player car needs 13 steering angles × 5 pitches (uphill to downhill), plus spin and crash frames. The angles cannot be mirrored to save half of them, because the driver sits on one side. Each traffic vehicle needs 3–5 angles. Drawing those by hand at 4K, consistently, is the expensive part; a model renders them all, and re-renders them if the design, resolution or lighting changes.
- **Roadside scenery and backgrounds: drawn.** Trees, signs, buildings and landmarks always face the camera and need one image each, so drawing them directly is simpler and gives the most character.
- **Where the 3D models come from.** Pre-rendering only needs a model that looks right from the camera angles used; clean topology, rigging and polygon count don't matter. That makes AI-generated models (Tripo and similar) usable here.
  - **Render pipeline: scripted in this project.** Blender Python scripts import a model, apply the toon shader and outlines, set the camera and the per-time-of-day lighting, render every angle and pitch, and pack the frames into sprite sheets. Any model from any source goes through the same scripts. Blender is installed (5.2), and the scripts are in `tools/blender/`.
  - **Traffic vehicles: built by script.** Trucks, vans, buses and small boxy cars are simple enough to model procedurally in Blender Python, as original designs.
  - **Player car: Tripo, a purchased model or a modeller.** It is on screen for the whole game, and a smooth, attractive sports-car body is beyond what scripted modelling does well. Design an original car first (a concept image), then generate or commission the model from it. Do not feed in photos or drawings of real cars or of the original game's car. Use a plan whose terms allow commercial use, record the model in `ASSETS.md`, and include it in the Steam AI-content declaration.
- **Player car identity: decided.** The model name is **CHIBA** and the emblem is an **M** (from the owner's surname, Mori). Both are drawn in their own original style, not in the lettering or emblem shape of any real maker, and go on an original car body. The Tripo model currently in `art/models/player-car/` reproduces a real production car and is a local test stand-in only; its badges have been removed and it never ships.
- **One style guide for both** (outline weight, shading steps, palette per time of day) so the two sources look like one game.

Placeholders are original vector-style shapes drawn in code and rasterized at load time for the actual screen size, so every milestone is playable and sharp at any resolution. Final car, scenery and background art is a separate track of work, done by the owner or an artist. It drops into `data/` without touching code.

## Stages

**Setting:** the Bōsō Peninsula (Chiba). The run starts at sunrise in Chōshi and ends at night on the Tokyo Bay side.

**Structure: follows the original.** Fifteen stages in five tiers (1, 2, 3, 4 and 5 stages), with a fork at the end of every stage and five goals. Stage length, time allowance and checkpoint extensions are set to match the original's pacing, and difficulty rises towards the right-hand routes. Going left at a fork keeps to the coast; going right heads inland.

**Road geometry: newly authored.** The curve and hill sequences are not taken from the original's data. Each stage is shaped after the real roads it depicts (long straights at Kujūkuri, tight bends on the Katsuura coast, climbs at Nokogiri), with the original's rhythm of curves, crests and straights as the guide for how a stage should flow. Layouts live in `data/stages/*.json` and are edited in the track editor.

| Stage | Area | Scenery | Light | Left → | Right → |
|---|---|---|---|---|---|
| 1 | Chōshi | Inubōsaki lighthouse, Byōbugaura cliffs, fishing port, wind turbines, cabbage fields | Sunrise | 2A | 2B |
| 2A | Kujūkuri | Endless straight surf beach, pine windbreaks, surfers, beach huts | Morning | 3A | 3B |
| 2B | Sawara and Katori | Edo-period canal town, willow trees, shrine gates, Tone River rice paddies | Morning | 3B | 3C |
| 3A | Onjuku and Katsuura | White sand, ria coast with tunnels and headlands, fishing harbour | Midday | 4A | 4B |
| 3B | Ōtaki and Yōrō Valley | Castle keep, river gorge, a small local train crossing fields of yellow rapeseed flowers | Midday | 4B | 4C |
| 3C | Narita | Great temple approach, wooden shopfronts, airliners passing low overhead | Midday | 4C | 4D |
| 4A | Minamibōsō and Tateyama | Flower fields, Nojimazaki lighthouse at the southern tip, palm-lined bay road | Late afternoon | 5A | 5B |
| 4B | Kamogawa and Mount Nokogiri | Terraced rice fields, saw-toothed quarry cliffs, giant stone Buddha | Late afternoon | 5B | 5C |
| 4C | Kazusa hills | Kururi castle town, forest roads, a waterfall cave lit by a shaft of light, highland pastures | Late afternoon | 5C | 5D |
| 4D | Sakura and Lake Inba | Dutch-style windmill with tulip fields, samurai houses, lakeside road | Late afternoon | 5D | 5E |
| 5A | **Goal: Urayasu** | Up the bay coast past Cape Futtsu and the lit-up industrial belt to the Urayasu waterfront | Dusk to night | — | — |
| 5B | **Goal: Umihotaru** | Kisarazu, then out over the sea on the bay-crossing bridge to the island rest area | Sunset | — | — |
| 5C | **Goal: Chiba City** | Port tower, a suspended monorail running overhead, city lights | Dusk | — | — |
| 5D | **Goal: Makuhari** | Wide boulevards, glass towers, seaside stadium | Dusk to night | — | — |
| 5E | **Goal: Sekiyado** | River embankments and farmland to the castle at the northern tip of Chiba, where two rivers part | Sunset | — | — |

The all-left route is the full coastal lap: Chōshi → Kujūkuri → Katsuura → Tateyama → Urayasu. The all-right route is the deepest inland run: Chōshi → Sawara → Narita → Sakura → Sekiyado.

Public landmarks (lighthouses, castles, temples, bridges) are drawn as original artwork. Real businesses are left out or made generic: no theme-park imagery at Urayasu, no named farms, aquariums, airlines or railway companies, and no real signage.

## Music

Four pieces are needed: three selectable driving tracks and a results tune. The music player takes both formats below, so the choice can be made per track.

- **FM-sequenced, made in this project.** The tracks are written as note data and played by the game's own FM synthesizer. The sound is authentic to the era, the files are tiny, the music is fully owned, and it can react to the game (for example a tempo lift in the final seconds). The limitation is compositional quality: the result is competent, not the work of a professional composer.
- **Generated with Suno, streamed as audio files.** Production quality is higher and any style is possible. Conditions: generate on a paid plan whose terms grant commercial use (check the terms in force at the time), keep prompts to style descriptions rather than naming the original's songs or composer, record each track in `ASSETS.md`, and declare AI-generated content on the Steam store page, which Steam requires.

Plan: build the FM synthesizer regardless, since the engine and effects need it, and write one FM track as a trial in milestone 8. Compare it with a Suno track in the game and decide then.

## Risks

- **Fork rendering.** Two roads diverging with correct overlap is the hardest rendering problem here, so it is prototyped early in milestone 2 rather than left to milestone 6.
- **Art cost at 4K.** High-resolution sprites with many frames take far more work and texture memory than pixel art. Pre-rendering from 3D models and compressed textures keep this manageable, but final art is the largest non-code cost.
- **Billboards at high resolution.** Flat scaled sprites are more noticeable at 4K than at 224 lines. Enough rotation frames for cars, and soft shadows under objects, keep it from looking like cardboard cut-outs.
- **Handling feel.** This takes repeated tuning against the original and can't be derived from first principles. The deterministic replays make that tuning measurable.

## Open decisions and prerequisites

Decisions for the owner:

- **Title: decided — Boso Run.** Still to do before a public build: check that the name is free as a trademark and on Steam, design an original logo, and keep the repo name `outrun-clone` out of the shipped game (renaming the repo to `boso-run` is the simplest way).
- **Setting: decided — the Bōsō Peninsula.** The stage tree in "Stages" is a first proposal; areas and landmarks can be swapped freely.
- **Art production: partly decided.** Cars and characters are pre-rendered in Blender from generated models (the pipeline is built, see "Status"). Still open: who draws the scenery, backgrounds and endings, and the original design of the player car.
- **Music: decided in outline.** Suno and/or FM-sequenced tracks, chosen after the trial in milestone 8 (see "Music").
- **Platform scope: decided.** Desktop browsers first, mobile later (milestone 11), Steam after that.
- **Languages: decided.** Japanese and English, from milestone 1.

Things to have on hand:

- **Dev environment.** Node.js and npm are already installed (Node 24, npm 11). Nothing else is required.
- **Reference copy.** A legitimate copy of the original on current hardware, and a way to record it, for side-by-side tuning of speed, timing and handling in milestone 9.
- **Test hardware.** A 4K display, a 120 or 144 Hz display, a gamepad with an analog stick, and one low-end machine with integrated graphics for performance checks.

For the Steam release later: a Steamworks account (one-time fee per title), the desktop wrapper, controller and Steam Deck verification, and store assets.

## Status

Built so far (a drivable base; roughly milestone 1, most of 2 and the start of 3 and 4):

- Vite and TypeScript project, fixed 120 Hz simulation with interpolated rendering and a frame-rate cap, WebGL2 canvas at native resolution with a resolution-scale setting.
- Road renderer: per-scanline table on the CPU, anti-aliased shader on the GPU, curves, hills with crest clipping, rumble strips, edge and lane lines, distance haze, and a shader-drawn sky with sun, two hill ranges and far ground.
- Player car: two gears (LO launches hard, HI is sluggish from low speed), 293 km/h top speed, steering with some weight against the centrifugal push, tyres that slide at high speed and lock when braking in a bend, off-road slowdown with a shaking view, gravity on slopes. Tuned against design targets; tuning against the original is still milestone 9.
- Feel loop: every sense-of-speed and handling quality is measured headlessly against a target (`npm run feel`, and a test that fails on a miss), with a live tuning panel, replays and frame snapshots in the dev server. See [docs/feel-loop.md](docs/feel-loop.md).
- Car sprites: `tools/blender/render_car.py` renders 13 steering angles (±24°) × 5 pitches (±10°) with the game's exact camera and packs a sprite sheet. The frame size is fitted to the car by projecting it for every attitude, so no frame is cut off. The game starts on a code-drawn placeholder car and swaps the sheet in when it loads.
- Driver and passenger: Blender tools rig generated T-pose or A-pose characters (`rig_person.py`), pose them (`pose_person.py`) and seat them in the car (`seat_person.py`), with the driver's hands placed on the wheel by two-bone IK. In the sprite frames both sway towards the outside of a bend and lean against a slope.
- Roadside scenery as clipped, hazed billboards, with code-drawn placeholder art (pine, palm, post, sign).
- Japanese and English string tables, settings and saves behind a storage interface, an options panel (language, frame rate, resolution), keyboard and gamepad input, unit tests, and a GitHub Actions workflow.

Decisions made while building:

- **HUD text is DOM, not SDF text in WebGL.** It is sharp at any resolution, handles Japanese glyphs without a font atlas, and anchors to screen edges with CSS. It also works unchanged in a desktop wrapper. SDF text can replace it later if a fully in-canvas HUD is ever needed.
- **Stand-in art lives in `local-assets/`, outside `public/`.** The dev server serves it at `/assets/local/`; a production build cannot include it. This keeps the stand-in car out of anything that ships.
- **The game never waits on art to start.** Large images load through `createImageBitmap`, because `HTMLImageElement.decode()` can stall in a tab the browser is not painting.
- **Bends use the arcade curve model.** A bend adds a sideways offset accumulated row by row up the screen, as the 1980s hardware did, so the road sweeps from just in front of the car. The geometrically exact projection stays selectable for comparison.
- **Camera: 2.0 m high, 6.0 m behind the car, pitching half-way with the road.** Closer than first built, for a faster-looking road; the horizon rises and falls with the hills. 1.6 m was tried and put the car over the far road, so bends could not be seen coming.
- **Bends: the arcade sweep plus the projected bend.** The sweep alone shows a bend only once the car is in it; 1.5 times the true, projected bend is added so a bend shows from far off.
- **Forks are two roads in one scanline table.** Both roads are at the same height while side by side, each with its own position and bend; the shader colours each pixel from the nearer road. A run is a route of stages attached as the car reaches them (`src/sim/route.ts`).
- **Traffic all drives the player's way**, as in the original, on every road.
- **Generated characters are weighted by body region, not by Blender's automatic weights.** Bone-heat weighting fails on meshes made of many overlapping shells, which is what generated models are.

- Road fork and routes: a stage ending in a fork splits into two roads and the car commits to the branch it is on; the branch's stage is attached.
- Track editor (dev server, F4): sections, roadside rules, fork and next stage, time allowance, live preview, overview map, save to the stage files.
- Traffic and collisions: 10 kinds of lane-keeping traffic from a seeded generator, bumps, spin and roll-over crashes with the occupants thrown out, reset to the road.
- One complete route (start of milestone 6): stage 1 (Chōshi) forking to Kujūkuri or Sawara, with the countdown, the checkpoint at the fork, the goal line and game over (`src/sim/run.ts`, `src/data/stages.json`). The stage times are set so that a clean scripted drive reaches each checkpoint and goal with 10–18 s to spare, checked by a test.

Not built yet from milestones 1–2: a code licence and `ASSETS.md`.

## Next step

Game flow and HUD (M7): the start-line countdown, title screen, game over and goal results, so the route built in M6 plays as a game from "press start" to name entry. Then the remaining 12 stages. The full task list is in [TODO.md](TODO.md).
