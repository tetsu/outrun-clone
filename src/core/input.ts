/** What the simulation reads each step. Analog where the device allows it. */
export interface InputState {
  steer: number; // -1 (left) .. 1 (right)
  throttle: number; // 0..1
  brake: number; // 0..1
  /** True for exactly one simulation step per press. */
  gearToggle: boolean;
}

export type Action = "left" | "right" | "throttle" | "brake" | "gear" | "start" | "menu" | "mute";

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
  Enter: "start",
  Escape: "menu",
  KeyM: "mute",
};

/** Standard gamepad buttons. */
const PAD = { a: 0, b: 1, x: 2, rb: 5, lt: 6, rt: 7, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15 } as const;

const STICK_DEADZONE = 0.12;

export class Input {
  onMenu: (() => void) | null = null;
  /** Every press of a key or button (not its repeat), for the screens outside driving. */
  onPress: ((action: Action) => void) | null = null;

  private readonly held = new Set<Action>();
  private readonly padHeld = new Set<Action>();
  private gearPresses = 0;

  constructor(target: Window = window) {
    target.addEventListener("keydown", (e) => {
      const action = DEFAULT_KEYS[e.code];
      if (!action || isTyping(e.target)) return;
      e.preventDefault();
      if (e.repeat) return;
      if (action === "menu") this.onMenu?.();
      else if (action === "gear") this.gearPresses++;
      else this.held.add(action);
      if (action !== "menu") this.onPress?.(action);
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
      if (pad.buttons[PAD.left]?.pressed) steer = -1;
      if (pad.buttons[PAD.right]?.pressed) steer = 1;
      throttle = Math.max(throttle, pad.buttons[PAD.rt]?.value ?? 0, pad.buttons[PAD.a]?.pressed ? 1 : 0);
      brake = Math.max(brake, pad.buttons[PAD.lt]?.value ?? 0, pad.buttons[PAD.x]?.pressed ? 1 : 0);

      // presses: the buttons and the stick as a d-pad
      const down = (...buttons: number[]): boolean => buttons.some((b) => pad.buttons[b]?.pressed);
      const now: Array<[Action, boolean]> = [
        ["left", down(PAD.left) || x < -0.5], ["right", down(PAD.right) || x > 0.5],
        // the d-pad's up and down only press (for the menus); they do not drive
        ["throttle", down(PAD.a, PAD.up) || (pad.buttons[PAD.rt]?.value ?? 0) > 0.5],
        ["brake", down(PAD.x, PAD.down) || (pad.buttons[PAD.lt]?.value ?? 0) > 0.5],
        ["gear", down(PAD.b, PAD.rb)], ["start", down(PAD.start)], ["menu", down(PAD.back)],
      ];
      for (const [action, held] of now) {
        const was = this.padHeld.has(action);
        if (held && !was) {
          if (action === "menu") this.onMenu?.();
          else {
            if (action === "gear") this.gearPresses++;
            this.onPress?.(action);
          }
        }
        if (held) this.padHeld.add(action);
        else this.padHeld.delete(action);
      }
    }

    const gearToggle = this.gearPresses > 0;
    if (gearToggle) this.gearPresses--;
    return { steer, throttle, brake, gearToggle };
  }
}

/** Keys typed into a text or number field belong to the field, not to the car. */
function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && target.type !== "range" && target.type !== "button" && target.type !== "checkbox";
}
