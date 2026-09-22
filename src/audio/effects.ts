import type { AudioSystem } from "./context";
import { noteHz, PATCHES, playFm } from "./fm";

/**
 * The sounds of driving besides the engine: continuous ones set every frame (tyre squeal,
 * the rumble off the road, wind), and one-shots for hits, the checkpoint and the countdown.
 */
export class SoundEffects {
  private readonly squeal: GainNode;
  private readonly rumble: GainNode;
  private readonly wind: GainNode;
  private readonly noise: AudioBuffer;

  constructor(private readonly audio: AudioSystem) {
    const context = audio.context!;
    this.noise = audio.noise(2);
    const loop = (type: BiquadFilterType, hz: number, q: number): GainNode => {
      const source = context.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = hz;
      filter.Q.value = q;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(audio.effects!);
      source.start();
      return gain;
    };
    this.squeal = loop("bandpass", 1100, 6);
    this.rumble = loop("lowpass", 220, 0.8);
    this.wind = loop("bandpass", 1600, 0.5);
  }

  /** `skid` 0..1, `speed` 0..1 of the top speed. */
  update(skid: number, offroad: boolean, speed: number): void {
    const t = this.audio.context!.currentTime;
    this.squeal.gain.setTargetAtTime(skid * 0.45, t, 0.03);
    this.rumble.gain.setTargetAtTime(offroad ? 0.25 + 0.35 * speed : 0, t, 0.05);
    this.wind.gain.setTargetAtTime(0.1 * speed * speed, t, 0.2);
  }

  /** A burst of filtered noise. */
  private burst(type: BiquadFilterType, hz: number, level: number, seconds: number, at = 0): void {
    const context = this.audio.context!;
    const t = context.currentTime + at;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.audio.effects!);
    source.start(t);
    source.stop(t + seconds + 0.05);
  }

  /** A dull thud: a sine dropping in pitch. */
  private thud(hz: number, level: number, seconds: number): void {
    const context = this.audio.context!;
    const t = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.setValueAtTime(hz, t);
    osc.frequency.exponentialRampToValueAtTime(hz * 0.3, t + seconds);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain);
    gain.connect(this.audio.effects!);
    osc.start(t);
    osc.stop(t + seconds);
  }

  bump(): void {
    this.thud(120, 0.6, 0.18);
    this.burst("lowpass", 400, 0.5, 0.15);
  }

  scrape(): void {
    this.burst("bandpass", 2600, 0.35, 0.3);
  }

  knock(): void {
    this.burst("bandpass", 700, 0.5, 0.12);
    this.thud(300, 0.3, 0.08);
  }

  crash(): void {
    this.thud(90, 0.9, 0.5);
    this.burst("lowpass", 900, 0.9, 0.6);
    this.burst("highpass", 3000, 0.4, 0.9, 0.05);
    // something metallic
    const context = this.audio.context!;
    playFm(context, this.audio.effects!, { ...PATCHES.bell, index: 6, ratio: 2.76, level: 0.4 }, 330, context.currentTime + 0.02, 0.5);
  }

  checkpoint(): void {
    const context = this.audio.context!;
    const t = context.currentTime;
    [84, 88, 91, 96].forEach((note, i) => playFm(context, this.audio.effects!, PATCHES.chime, noteHz(note), t + i * 0.09, 0.4, 0.8));
  }

  /** The countdown: short beeps, then a long high one for go. */
  beep(go: boolean): void {
    const context = this.audio.context!;
    const osc = context.createOscillator();
    const gain = context.createGain();
    const t = context.currentTime;
    const seconds = go ? 0.5 : 0.12;
    osc.type = "square";
    osc.frequency.value = go ? 1320 : 880;
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.setValueAtTime(0.18, t + seconds - 0.02);
    gain.gain.linearRampToValueAtTime(0, t + seconds);
    osc.connect(gain);
    gain.connect(this.audio.effects!);
    osc.start(t);
    osc.stop(t + seconds);
  }

  gameOver(): void {
    const context = this.audio.context!;
    const t = context.currentTime;
    [67, 63, 60, 55].forEach((note, i) => playFm(context, this.audio.effects!, PATCHES.brass, noteHz(note), t + i * 0.28, i === 3 ? 1.2 : 0.26, 0.9));
  }
}
