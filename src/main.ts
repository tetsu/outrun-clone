import { setLanguage } from "./core/i18n";
import { Input, type InputState } from "./core/input";
import { GameLoop, SIM_DT, SIM_HZ } from "./core/loop";
import { loadSettings, saveSettings } from "./core/settings";
import { BrowserStorage } from "./core/storage";
import tree from "./data/stages.json";
import { Game } from "./game/game";
import { Hud } from "./game/hud";
import { OptionsPanel } from "./game/options";
import { createPlaceholderCarSprite, loadRenderedCarSprite } from "./render/carSprite";
import { loadSheet, type CrashCarMeta, type CrashPeopleMeta } from "./render/crashSprite";
import { Renderer } from "./render/renderer";
import { loadRenderedVehicles } from "./render/trafficSprite";
import type { PlayerState } from "./sim/player";
import { Route, type Stages } from "./sim/route";
import type { StageData } from "./sim/track";

/** Every stage file, by name. */
const STAGES: Stages = Object.fromEntries(
  Object.entries(import.meta.glob<StageData>("./data/stages/*.json", { eager: true, import: "default" }))
    .map(([path, data]) => [path.replace(/^.*\/|\.json$/g, ""), data]),
);
/** A run starts at the first stage of the first tier (src/data/stages.json). */
const FIRST_STAGE = tree.tiers[0][0];

async function main(): Promise<void> {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) {
    document.body.textContent = "This game needs WebGL2.";
    return;
  }

  const storage = new BrowserStorage();
  const settings = loadSettings(storage);
  setLanguage(settings.language);

  const game = new Game(new Route(STAGES, FIRST_STAGE));
  const renderer = new Renderer(gl, createPlaceholderCarSprite(gl));
  void loadRenderedCarSprite(gl).then((sprite) => {
    if (sprite) renderer.car = sprite;
  });
  void loadRenderedVehicles(gl, renderer.vehicles);
  void loadSheet<CrashCarMeta>(gl, "assets/local/player-car/crash/").then((sheet) => (renderer.crashCar = sheet));
  void loadSheet<CrashPeopleMeta>(gl, "assets/local/crash-people/").then((sheet) => (renderer.crashPeople = sheet));
  const input = new Input();
  const hud = new Hud(document.getElementById("hud")!);

  // Render at the display's native pixel size, times the resolution-scale setting.
  const resize = (): void => {
    const ratio = (window.devicePixelRatio || 1) * settings.resolutionScale;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  };
  window.addEventListener("resize", resize);
  resize();

  // Development tools (tuning panel, replays) replace these hooks; a build never loads them.
  const hooks = { filterInput: (state: InputState): InputState => state };
  let dev: import("./dev/devTools").DevTools | null = null;

  let time = 0;
  const loop = new GameLoop({
    step: (dt) => {
      const state = input.sample();
      if (!options.isOpen) game.step(hooks.filterInput(state), dt);
    },
    render: (alpha, frameSeconds) => {
      if (!options.isOpen) time += frameSeconds;
      const state = game.renderState(options.isOpen ? 1 : alpha);
      renderer.draw(game, state, time);
      hud.update(state, frameSeconds);
      dev?.update(state);
    },
  });

  const options = new OptionsPanel(document.getElementById("overlay")!, settings, () => {
    saveSettings(storage, settings);
    setLanguage(settings.language);
    loop.fpsCap = settings.fpsCap;
    resize();
    hud.refreshLabels();
    options.build();
  });
  input.onMenu = () => options.toggle();

  loop.fpsCap = settings.fpsCap;
  loop.start();

  // Development only: drive the simulation and look at the result without waiting for frames,
  // for checking the course in a throttled or hidden tab. Examples:
  //   __boso.advance(10, { throttle: 1 })
  //   __boso.pose({ z: 4620, speed: 81, steer: -0.9 }, 0.25, { throttle: 1, steer: -0.9 }); await __boso.snapshot("bend")
  //   __boso.tune({ view: { curveModel: "projected" } })
  if (import.meta.env.DEV) {
    const { installDevTools } = await import("./dev/devTools");
    dev = installDevTools({ game, stages: STAGES, storage, hooks });
    const { installEditor } = await import("./dev/editor");
    installEditor({ game, stages: STAGES, storage });
    const advance = (seconds: number, held: Partial<InputState> = {}): PlayerState => {
      const state: InputState = { steer: 0, throttle: 0, brake: 0, gearToggle: false, ...held };
      for (let i = 0; i < Math.round(seconds * SIM_HZ); i++) {
        game.step(state, SIM_DT);
        state.gearToggle = false;
      }
      time += seconds;
      renderer.draw(game, game.renderState(1), time);
      return { ...game.player };
    };
    Object.assign(window, {
      __boso: {
        game,
        player: game.player,
        advance,
        tune: (values: import("./dev/tuning").PartialTuning) => dev?.tune(values),
        /** Puts the car in a state (sideways speed and slide cleared), then advances. */
        pose(state: Partial<PlayerState>, seconds = 0.25, held: Partial<InputState> = {}): PlayerState {
          game.reset({ ...game.player, vx: 0, skid: 0, offroad: false, ...state });
          return advance(seconds, held);
        },
        /**
         * Saves the frame just drawn to dev-snapshots/<name>.jpg. Call it straight after
         * advance() or pose(), in the same script: the canvas is only readable until the frame ends.
         */
        async snapshot(name: string): Promise<number> {
          const blob = await (await fetch(canvas.toDataURL("image/jpeg", 0.9))).blob();
          return (await fetch(`/__dev/snapshot/${name}.jpg`, { method: "POST", body: blob })).status;
        },
      },
    });
  }
}

void main();
