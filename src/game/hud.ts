import { t } from "../core/i18n";
import type { Banner } from "../sim/run";
import type { RenderState } from "./game";

/**
 * The HUD is DOM text over the canvas: sharp at any resolution, Japanese glyphs for free,
 * and anchored to the screen edges in CSS so every aspect ratio lays out.
 */
type Label = "hud.time" | "hud.speed" | "hud.gear" | "hud.score" | "hud.stage";

export class Hud {
  private readonly time: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly gear: HTMLElement;
  private readonly score: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly fps: HTMLElement;
  private readonly labels: Array<[HTMLElement, Label]> = [];
  private fpsSmoothed = 0;

  constructor(root: HTMLElement) {
    const item = (id: string, label: Label, unit = ""): HTMLElement => {
      const box = document.createElement("div");
      box.className = "hud-item";
      box.id = id;
      const labelEl = document.createElement("span");
      labelEl.className = "hud-label";
      const value = document.createElement("span");
      value.className = "hud-value";
      box.append(labelEl, value);
      if (unit) {
        const unitEl = document.createElement("span");
        unitEl.className = "hud-unit";
        unitEl.textContent = unit;
        box.append(unitEl);
      }
      root.append(box);
      this.labels.push([labelEl, label]);
      return value;
    };
    this.time = item("hud-time", "hud.time");
    this.score = item("hud-score", "hud.score");
    this.stage = item("hud-stage", "hud.stage");
    this.speed = item("hud-speed", "hud.speed", "km/h");
    this.gear = item("hud-gear", "hud.gear");
    // the words across the screen: checkpoint, goal, game over
    const banner = document.createElement("div");
    banner.id = "hud-banner";
    this.banner = document.createElement("div");
    this.banner.className = "hud-banner-main";
    this.sub = document.createElement("div");
    this.sub.className = "hud-banner-sub";
    banner.append(this.banner, this.sub);
    root.append(banner);
    this.fps = document.createElement("div");
    this.fps.className = "hud-item";
    this.fps.id = "hud-fps";
    root.append(this.fps);
    this.refreshLabels();
  }

  refreshLabels(): void {
    for (const [el, key] of this.labels) el.textContent = t(key);
  }

  update(state: RenderState, frameSeconds: number): void {
    setText(this.speed, String(Math.round(state.speed * 3.6)));
    setText(this.gear, t(state.gear === 0 ? "hud.gear.low" : "hud.gear.high"));
    const run = state.run;
    if (run) {
      // whole seconds, counting down; the last ten flash
      setText(this.time, String(Math.ceil(run.timeLeft)));
      this.time.classList.toggle("urgent", run.phase === "driving" && run.timeLeft < 10);
      setText(this.score, String(Math.floor(run.score)).padStart(7, "0"));
      setText(this.stage, String(run.stage));
      const [main, sub] = bannerText(run.banner, run.bonus);
      setText(this.banner, main);
      setText(this.sub, sub);
    } else {
      // a looping test course: the lap time, counting up
      const total = state.lapTime;
      const minutes = Math.floor(total / 60);
      const seconds = total - minutes * 60;
      setText(this.time, `${minutes}'${seconds.toFixed(2).padStart(5, "0")}"`);
    }
    this.score.parentElement!.hidden = this.stage.parentElement!.hidden = !run;

    if (frameSeconds > 0) this.fpsSmoothed += (1 / frameSeconds - this.fpsSmoothed) * 0.05;
    setText(this.fps, `${Math.round(this.fpsSmoothed)} fps`);
  }
}

function bannerText(banner: Banner, bonus: number): [string, string] {
  switch (banner) {
    case "checkpoint": return [t("run.checkpoint"), t("run.extended")];
    case "goal": return [t("run.goal"), `${t("run.bonus")} ${bonus}`];
    case "over": return [t("run.gameover"), ""];
    default: return ["", ""];
  }
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
