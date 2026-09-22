/**
 * The audio system: one AudioContext, created on the first user gesture (browsers keep sound
 * silent until then), with a master bus and separate music and effects buses whose levels the
 * options set. Everything that makes a sound takes this and builds on its buses.
 */
export class AudioSystem {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  music: GainNode | null = null;
  effects: GainNode | null = null;
  private masterLevel = 1;
  private musicLevel = 1;
  private effectsLevel = 1;

  /** True once the context is running; nothing plays before the first unlock(). */
  get ready(): boolean {
    return this.context !== null && this.context.state === "running";
  }

  /** Create or resume the context. Call from a user gesture (the start press). */
  unlock(): void {
    if (!this.context) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      this.context = new Context({ latencyHint: "interactive" });
      // a limiter on the master, so a crash on top of the music cannot clip
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.2;
      limiter.connect(this.context.destination);
      this.master = this.context.createGain();
      this.master.gain.value = this.masterLevel;
      this.master.connect(limiter);
      this.music = this.context.createGain();
      this.music.gain.value = this.musicLevel;
      this.music.connect(this.master);
      this.effects = this.context.createGain();
      this.effects.gain.value = this.effectsLevel;
      this.effects.connect(this.master);
    }
    if (this.context.state !== "running") void this.context.resume();
  }

  /** The levels from the options (0..1 each); muted silences everything. */
  setLevels(levels: { masterVolume: number; musicVolume: number; effectsVolume: number; muted: boolean }): void {
    // full volume in the options leaves headroom under the limiter
    this.masterLevel = levels.muted ? 0 : 0.8 * levels.masterVolume;
    this.musicLevel = levels.musicVolume;
    this.effectsLevel = levels.effectsVolume;
    const set = (node: GainNode | null, value: number): void => {
      // a short glide, so moving a slider does not click
      if (node && this.context) node.gain.setTargetAtTime(value, this.context.currentTime, 0.02);
    };
    set(this.master, this.masterLevel);
    set(this.music, this.musicLevel);
    set(this.effects, this.effectsLevel);
  }

  /** A looping buffer of white noise, the raw material of tyres, wind and crashes. */
  noise(seconds = 2): AudioBuffer {
    const context = this.context!;
    const buffer = context.createBuffer(1, Math.round(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    // a fixed generator, so the noise is the same every run
    let state = 0x9e3779b9;
    for (let i = 0; i < data.length; i++) {
      state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x1b873593) | 0;
      data[i] = ((state >>> 8) & 0xffff) / 32768 - 1;
    }
    return buffer;
  }
}
