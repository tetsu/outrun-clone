/** What the simulation reads each step. Analog where the device allows it. */
export interface InputState {
  steer: number; // -1 (left) .. 1 (right)
  throttle: number; // 0..1
  brake: number; // 0..1
  /** True for exactly one simulation step per press. */
  gearToggle: boolean;
}

export type Action = "left" | "right" | "throttle" | "brake" | "gear" | "menu";

/** Default bindings; rebinding replaces this table through the settings later. */
const DEFAULT_KEYS: Record<string, Action> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "throttle",
  KeyW: "throttle",
  ArrowDown: "brake",
  KeyS: "brake",
  Space: "gear",
  ShiftLeft: "gear",
  Escape: "menu",
};

const STICK_DEADZONE = 0.12;

export class Input {
  onMenu: (() => void) | null = null;

  private readonly held = new Set<Action>();
  private gearPresses = 0;
  private padGearHeld = false;
  private padMenuHeld = false;

  constructor(target: Window = window) {
    target.addEventListener("keydown", (e) => {
      const action = DEFAULT_KEYS[e.code];
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      if (action === "menu") this.onMenu?.();
      else if (action === "gear") this.gearPresses++;
      else this.held.add(action);
    });
    target.addEventListener("keyup", (e) => {
      const action = DEFAULT_KEYS[e.code];
      if (action) this.held.delete(action);
    });
    target.addEventListener("blur", () => this.held.clear());
  }

  /** Call once per simulation step. */
  sample(): InputState {
    let steer = (this.held.has("right") ? 1 : 0) - (this.held.has("left") ? 1 : 0);
    let throttle = this.held.has("throttle") ? 1 : 0;
    let brake = this.held.has("brake") ? 1 : 0;

    const pad = navigator.getGamepads?.().find((p) => p && p.connected && p.mapping === "standard");
    if (pad) {
      const x = pad.axes[0] ?? 0;
      if (Math.abs(x) > STICK_DEADZONE) {
        steer = Math.sign(x) * ((Math.abs(x) - STICK_DEADZONE) / (1 - STICK_DEADZONE));
      }
      if (pad.buttons[14]?.pressed) steer = -1;
      if (pad.buttons[15]?.pressed) steer = 1;
      throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0, pad.buttons[0]?.pressed ? 1 : 0);
      brake = Math.max(brake, pad.buttons[6]?.value ?? 0, pad.buttons[2]?.pressed ? 1 : 0);

      const gearHeld = !!(pad.buttons[1]?.pressed || pad.buttons[5]?.pressed);
      if (gearHeld && !this.padGearHeld) this.gearPresses++;
      this.padGearHeld = gearHeld;
      const menuHeld = !!pad.buttons[9]?.pressed;
      if (menuHeld && !this.padMenuHeld) this.onMenu?.();
      this.padMenuHeld = menuHeld;
    }

    const gearToggle = this.gearPresses > 0;
    if (gearToggle) this.gearPresses--;
    return { steer, throttle, brake, gearToggle };
  }
}
