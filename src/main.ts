import { setLanguage } from "./core/i18n";
import { Input, type InputState } from "./core/input";
import { GameLoop, SIM_DT, SIM_HZ } from "./core/loop";
import { loadSettings, saveSettings } from "./core/settings";
import { BrowserStorage } from "./core/storage";
import stageData from "./data/stages/test-course.json";
import { Game } from "./game/game";
import { Hud } from "./game/hud";
import { OptionsPanel } from "./game/options";
import { createPlaceholderCarSprite, loadRenderedCarSprite } from "./render/carSprite";
import { Renderer } from "./render/renderer";
import type { PlayerState } from "./sim/player";
import { buildTrack, type StageData } from "./sim/track";

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

  const game = new Game(buildTrack(stageData as StageData));
  const renderer = new Renderer(gl, createPlaceholderCarSprite(gl));
  void loadRenderedCarSprite(gl).then((sprite) => {
    if (sprite) renderer.car = sprite;
  });
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

  let time = 0;
  const loop = new GameLoop({
    step: (dt) => {
      const state = input.sample();
      if (!options.isOpen) game.step(state, dt);
    },
    render: (alpha, frameSeconds) => {
      if (!options.isOpen) time += frameSeconds;
      const state = game.renderState(options.isOpen ? 1 : alpha);
      renderer.draw(game, state, time);
      hud.update(state, frameSeconds);
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

  // Development only: advance the simulation without waiting for frames, for checking the
  // course in a throttled or hidden tab. Example: __boso.advance(10, { throttle: 1 })
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __boso: {
        player: game.player,
        advance(seconds: number, held: Partial<InputState> = {}): PlayerState {
          const state: InputState = { steer: 0, throttle: 0, brake: 0, gearToggle: false, ...held };
          for (let i = 0; i < Math.round(seconds * SIM_HZ); i++) {
            game.step(state, SIM_DT);
            state.gearToggle = false;
          }
          time += seconds;
          renderer.draw(game, game.renderState(1), time);
          return { ...game.player };
        },
      },
    });
  }
}

void main();
