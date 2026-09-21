/** Simulation rate. Fixed, so handling and game speed are identical on every display. */
export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;

/** Most simulation steps run in one frame; beyond this the game slows down instead of spiralling. */
const MAX_STEPS_PER_FRAME = 30;

export interface LoopCallbacks {
  step(dt: number): void;
  /** `alpha` is how far the render time lies between the previous and current simulation state. */
  render(alpha: number, frameSeconds: number): void;
}

export class GameLoop {
  /** Frames per second to render at; 0 follows the display's refresh rate. */
  fpsCap = 0;

  private accumulator = 0;
  private lastTime = 0;
  private lastRender = 0;
  private running = false;

  constructor(private readonly callbacks: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = this.lastRender = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    requestAnimationFrame(this.frame);

    // Browsers only draw on the display's refresh, so a cap works by skipping refreshes.
    if (this.fpsCap > 0 && now - this.lastRender < 1000 / this.fpsCap - 1) return;
    const frameSeconds = (now - this.lastRender) / 1000;
    this.lastRender = now;

    this.accumulator += Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;

    let steps = 0;
    while (this.accumulator >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
      this.callbacks.step(SIM_DT);
      this.accumulator -= SIM_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.callbacks.render(this.accumulator / SIM_DT, frameSeconds);
  };
}
