import type { AudioSystem } from "./context";

/**
 * The engine: two detuned sawtooths and a square an octave up, the firing pulse of a
 * four-cylinder, through a low-pass filter that opens with the revs and the throttle, with
 * an intake hiss on top. Revs follow the speed within the gear, so a gear change drops them.
 */
const IDLE_HZ = 34;
const REDLINE_HZ = 190;

export class EngineSound {
  private readonly oscillators: OscillatorNode[] = [];
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;
  private readonly hiss: GainNode;

  constructor(private readonly audio: AudioSystem) {
    const context = audio.context!;
    this.filter = context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = 1.2;
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    this.filter.connect(this.gain);
    this.gain.connect(audio.effects!);
    for (const [type, ratio, level] of [["sawtooth", 1, 0.5], ["sawtooth", 1.007, 0.35], ["square", 2, 0.12], ["sine", 0.5, 0.45]] as const) {
      const osc = context.createOscillator();
      osc.type = type;
      osc.frequency.value = IDLE_HZ * ratio;
      const g = context.createGain();
      g.gain.value = level;
      osc.connect(g);
      g.connect(this.filter);
      osc.start();
      this.oscillators.push(osc);
    }
    const noise = context.createBufferSource();
    noise.buffer = audio.noise(2);
    noise.loop = true;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2400;
    band.Q.value = 0.7;
    this.hiss = context.createGain();
    this.hiss.gain.value = 0;
    noise.connect(band);
    band.connect(this.hiss);
    this.hiss.connect(audio.effects!);
    noise.start();
  }

  /** `revs` 0..1 within the gear, `throttle` 0..1; `level` 0 silences it. */
  update(revs: number, throttle: number, level: number): void {
    const t = this.audio.context!.currentTime;
    const hz = IDLE_HZ + (REDLINE_HZ - IDLE_HZ) * Math.pow(revs, 0.85);
    const ratios = [1, 1.007, 2, 0.5];
    this.oscillators.forEach((osc, i) => osc.frequency.setTargetAtTime(hz * ratios[i], t, 0.04));
    this.filter.frequency.setTargetAtTime(180 + revs * 2200 + throttle * 900, t, 0.06);
    this.gain.gain.setTargetAtTime(level * (0.16 + 0.16 * throttle + 0.1 * revs), t, 0.05);
    this.hiss.gain.setTargetAtTime(level * throttle * (0.02 + 0.06 * revs), t, 0.08);
  }
}
