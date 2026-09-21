import { t } from "../core/i18n";
import type { RenderState } from "./game";

/**
 * The HUD is DOM text over the canvas: sharp at any resolution, Japanese glyphs for free,
 * and anchored to the screen edges in CSS so every aspect ratio lays out.
 */
export class Hud {
  private readonly time: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly gear: HTMLElement;
  private readonly fps: HTMLElement;
  private readonly labels: Array<[HTMLElement, "hud.time" | "hud.speed" | "hud.gear"]> = [];
  private fpsSmoothed = 0;

  constructor(root: HTMLElement) {
    const item = (id: string, label: "hud.time" | "hud.speed" | "hud.gear", unit = ""): HTMLElement => {
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
    this.speed = item("hud-speed", "hud.speed", "km/h");
    this.gear = item("hud-gear", "hud.gear");
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
    const total = state.lapTime;
    const minutes = Math.floor(total / 60);
    const seconds = total - minutes * 60;
    setText(this.time, `${minutes}'${seconds.toFixed(2).padStart(5, "0")}"`);

    if (frameSeconds > 0) this.fpsSmoothed += (1 / frameSeconds - this.fpsSmoothed) * 0.05;
    setText(this.fps, `${Math.round(this.fpsSmoothed)} fps`);
  }
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
