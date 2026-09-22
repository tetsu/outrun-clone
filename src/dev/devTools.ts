import type { InputState } from "../core/input";
import type { SaveStorage } from "../core/storage";
import { STRIPE_LENGTHS, type ViewTuning } from "../game/camera";
import type { Flow } from "../game/flow";
import type { Game, RenderState } from "../game/game";
import { ReplayPlayer, ReplayRecorder, type Replay } from "../sim/replay";
import type { Stages } from "../sim/route";
import { buildTrack, course } from "../sim/track";
import { formatFeel, measureFeel } from "./feel";
import { applyTuning, changedTuning, currentTuning, resetTuning, type PartialTuning } from "./tuning";

/**
 * Development tools, loaded by the dev server only (never in a build):
 *
 *   F2   tuning panel: every view, course and handling value live, plus the feel report
 *   F9   start or stop recording a replay (kept in storage as the last replay)
 *   F10  play the last replay back from where it started
 *
 * The panel is a tool for the developer, so its text is English only and not in the string tables.
 */

export interface DevHooks {
  /** Every simulation step's input passes through here before the game sees it. */
  filterInput: (input: InputState) => InputState;
}

interface DevContext {
  game: Game;
  flow: Flow;
  stages: Stages;
  storage: SaveStorage;
  hooks: DevHooks;
}

type Slider = [key: string, min: number, max: number, step: number];

const VIEW_SLIDERS: Slider[] = [
  ["height", 1.0, 3.5, 0.05], ["distance", 4, 10, 0.1], ["vfovDeg", 40, 80, 1],
  ["pitchFollow", 0, 1, 0.05], ["curveGain", 0, 2500, 50],
  ["curveLookahead", 0, 2, 0.05],
];
const COURSE_SLIDERS: Slider[] = [["sceneryDensity", 0.25, 4, 0.25], ["hillScale", 0, 3, 0.05]];
const HANDLING_SLIDERS: Slider[] = [
  ["accelLow", 2, 20, 0.1], ["accelHighStart", 0.5, 12, 0.1], ["accelHighPeak", 2, 15, 0.1],
  ["highPeakAt", 0.1, 1, 0.05], ["gearFade", 0, 0.95, 0.05], ["gearFadePower", 1, 6, 0.5],
  ["brake", 5, 40, 0.5], ["coast", 0, 8, 0.1], ["overRevDrag", 0, 30, 0.5], ["offroadDrag", 0, 40, 0.5],
  ["steerSpeed", 4, 25, 0.25], ["steerResponse", 1, 20, 0.5], ["steerReturn", 1, 30, 0.5],
  ["lateralResponse", 2, 60, 1], ["centrifugal", 0, 2, 0.01], ["pushDelay", 0, 120, 5], ["skidLoad", 0.1, 1.5, 0.01],
  ["skidGripLoss", 0, 1, 0.05], ["skidScrub", 0, 20, 0.5], ["brakeGripLoss", 0, 1, 0.05], ["offroadGrip", 0, 1, 0.05],
];

const TUNING_KEY = "dev:tuning";
const REPLAY_KEY = "dev:replay";

export interface DevTools {
  update(state: RenderState): void;
  /** Sets tuning values for this session (not saved), rebuilding the course if needed; for scripted checks. */
  tune(values: PartialTuning): void;
}

export function installDevTools(ctx: DevContext): DevTools {
  const { game, flow, stages, storage, hooks } = ctx;
  // The feel targets are measured on the looping test course.
  const feelStage = stages["test-course"];
  // A route is rebuilt from the start of the stage the car is in, keeping the car where it is.
  const rebuildCourse = (): void => {
    if (!game.route) {
      game.setTrack(buildTrack(feelStage, course));
      return;
    }
    const at = game.route.stageAt(game.player.z);
    game.restartRoute(at.id, game.player.z - at.start);
    flow.play();
  };

  // Values changed in an earlier session come back, so a reload does not lose a tuning session.
  applyTuning(storage.read<PartialTuning>(TUNING_KEY, {}));
  // rebuilt with that tuning, still on the title screen
  if (game.route) game.restartRun(true);
  else rebuildCourse();
  const save = (): void => storage.write(TUNING_KEY, changedTuning());

  const panel = document.createElement("div");
  panel.className = "dev-panel";
  panel.hidden = true;
  const badge = document.createElement("div");
  badge.className = "dev-badge";
  badge.hidden = true;
  document.body.append(panel, badge);

  const live = document.createElement("pre");
  const report = document.createElement("pre");
  report.className = "dev-report";

  const build = (): void => {
    panel.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = "Tuning (F2)";
    panel.append(title, live);

    const tuning = currentTuning();
    const group = (name: string, values: Record<string, unknown>, sliders: Slider[], onChange: () => void): void => {
      const heading = document.createElement("h3");
      heading.textContent = name;
      panel.append(heading);
      for (const [key, min, max, step] of sliders) {
        panel.append(sliderRow(key, values[key] as number, min, max, step, (v) => {
          values[key] = v;
          onChange();
          save();
        }));
      }
    };

    const view = tuning.view as ViewTuning;
    group("View", view as unknown as Record<string, unknown>, VIEW_SLIDERS, () => {});
    panel.append(
      selectRow("curveModel", view.curveModel, ["arcade", "projected"], (v) => {
        view.curveModel = v as ViewTuning["curveModel"];
        save();
      }),
      selectRow("stripeLength", String(view.stripeLength), STRIPE_LENGTHS.map(String), (v) => {
        view.stripeLength = Number(v);
        save();
      }),
    );
    group("Course", tuning.course as unknown as Record<string, unknown>, COURSE_SLIDERS, rebuildCourse);
    group("Handling", tuning.handling as unknown as Record<string, unknown>, HANDLING_SLIDERS, () => {});

    const buttons = document.createElement("div");
    buttons.className = "dev-buttons";
    buttons.append(
      button("Feel report", () => {
        report.textContent = "measuring...";
        // let the text paint before the (synchronous, about a second) measurement
        setTimeout(() => (report.textContent = formatFeel(measureFeel(feelStage))), 20);
      }),
      button("Copy changes", () => {
        const text = JSON.stringify(changedTuning(), null, 2);
        report.textContent = text;
        void navigator.clipboard?.writeText(text).catch(() => {});
      }),
      button("Reset", () => {
        resetTuning();
        rebuildCourse();
        save();
        build();
      }),
    );
    panel.append(buttons, report);
  };
  build();

  // replays
  let recorder: ReplayRecorder | null = null;
  let player: ReplayPlayer | null = null;
  hooks.filterInput = (input) => {
    if (player) {
      const next = player.next();
      if (next) return next;
      player = null;
    }
    recorder?.record(input);
    return input;
  };

  window.addEventListener("keydown", (e) => {
    if (e.code === "F2") {
      e.preventDefault();
      panel.hidden = !panel.hidden;
    } else if (e.code === "F9") {
      e.preventDefault();
      if (recorder) {
        storage.write(REPLAY_KEY, recorder.finish());
        console.info(`replay saved: ${(recorder.steps / 120).toFixed(1)} s`);
        recorder = null;
      } else {
        player = null;
        // A replay starts from the start of the stage the car is in.
        const at = game.route?.stageAt(game.player.z);
        const from = at?.start ?? 0;
        const traffic = game.traffic.snapshot();
        for (const v of traffic.vehicles) v.z -= from;
        recorder = new ReplayRecorder(at?.id ?? "test-course", { ...game.player, z: game.player.z - from }, traffic, game.random.state);
      }
    } else if (e.code === "F10") {
      e.preventDefault();
      const replay = storage.read<Replay | null>(REPLAY_KEY, null);
      if (!replay) return;
      recorder = null;
      game.restartRoute(replay.stage);
      flow.play();
      game.reset(replay.start);
      if (replay.traffic) game.traffic.restore(replay.traffic);
      if (replay.random !== undefined) game.random.state = replay.random;
      player = new ReplayPlayer(replay);
    }
  });

  return {
    tune(values: PartialTuning): void {
      applyTuning(values);
      rebuildCourse();
      build();
    },
    update(state: RenderState): void {
      badge.hidden = !recorder && !player;
      badge.textContent = recorder ? `REC ${(recorder.steps / 120).toFixed(1)} s` : "REPLAY";
      if (panel.hidden) return;
      live.textContent =
        `${(state.speed * 3.6).toFixed(0).padStart(3)} km/h  ${state.gear ? "HI" : "LO"}  ` +
        `lock ${state.steer.toFixed(2)}  skid ${state.skid.toFixed(2)}  x ${state.x.toFixed(1)} m${state.offroad ? "  OFF ROAD" : ""}`;
    },
  };
}

function sliderRow(key: string, value: number, min: number, max: number, step: number, onInput: (v: number) => void): HTMLElement {
  const row = document.createElement("label");
  const name = document.createElement("span");
  name.textContent = key;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const shown = document.createElement("output");
  shown.textContent = String(value);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    shown.textContent = String(v);
    onInput(v);
  });
  // arrow keys drive the car, so the slider must not keep focus after a drag
  input.addEventListener("change", () => input.blur());
  row.append(name, input, shown);
  return row;
}

function selectRow(key: string, value: string, choices: string[], onChange: (v: string) => void): HTMLElement {
  const row = document.createElement("label");
  const name = document.createElement("span");
  name.textContent = key;
  const select = document.createElement("select");
  for (const choice of choices) {
    const option = document.createElement("option");
    option.value = option.textContent = choice;
    option.selected = choice === value;
    select.append(option);
  }
  select.addEventListener("change", () => {
    onChange(select.value);
    select.blur();
  });
  row.append(name, select);
  return row;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.addEventListener("click", () => {
    onClick();
    b.blur();
  });
  return b;
}

