/**
 * A two-operator FM voice on Web Audio: a sine carrier whose frequency is driven by a sine
 * modulator, the classic sound of the 1980s arcade boards. Each note gets its own nodes,
 * which the browser frees when they end.
 */

export interface FmPatch {
  /** Modulator frequency as a multiple of the carrier's. */
  ratio: number;
  /** Modulation depth in carrier frequencies; the higher, the brighter. */
  index: number;
  /** How much of the depth is left at the note's end (0..1): brightness that fades. */
  indexDecay: number;
  /** Amplitude envelope, seconds. */
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  level: number;
  /** "sine" is the FM classic; "triangle" or "square" carriers give a chip-tune edge. */
  wave?: OscillatorType;
}

export const PATCHES: Record<string, FmPatch> = {
  bass: { ratio: 1, index: 3.5, indexDecay: 0.3, attack: 0.004, decay: 0.18, sustain: 0.5, release: 0.08, level: 0.6 },
  lead: { ratio: 2, index: 2.2, indexDecay: 0.5, attack: 0.01, decay: 0.25, sustain: 0.6, release: 0.12, level: 0.4 },
  brass: { ratio: 1, index: 4.5, indexDecay: 0.45, attack: 0.04, decay: 0.3, sustain: 0.7, release: 0.1, level: 0.35 },
  pad: { ratio: 3, index: 1.2, indexDecay: 0.6, attack: 0.15, decay: 0.4, sustain: 0.6, release: 0.35, level: 0.2 },
  pluck: { ratio: 3.01, index: 5, indexDecay: 0.05, attack: 0.003, decay: 0.22, sustain: 0.05, release: 0.1, level: 0.35 },
  bell: { ratio: 3.5, index: 2.5, indexDecay: 0.1, attack: 0.003, decay: 0.6, sustain: 0.1, release: 0.4, level: 0.35 },
  chime: { ratio: 2, index: 1.5, indexDecay: 0.2, attack: 0.003, decay: 0.5, sustain: 0.2, release: 0.5, level: 0.4 },
};

/** Frequency of a MIDI note number. */
export function noteHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** Plays one note into `out`: `hz` from `at` for `seconds`, then the release. */
export function playFm(context: BaseAudioContext, out: AudioNode, patch: FmPatch, hz: number, at: number, seconds: number, velocity = 1): void {
  const carrier = context.createOscillator();
  carrier.type = patch.wave ?? "sine";
  carrier.frequency.value = hz;
  const modulator = context.createOscillator();
  modulator.frequency.value = hz * patch.ratio;
  const depth = context.createGain();
  const amp = context.createGain();
  modulator.connect(depth);
  depth.connect(carrier.frequency);
  carrier.connect(amp);
  amp.connect(out);

  const end = at + seconds;
  const peak = patch.level * velocity;
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(peak, at + patch.attack);
  amp.gain.setTargetAtTime(peak * patch.sustain, at + patch.attack, patch.decay / 3);
  amp.gain.setTargetAtTime(0, end, patch.release / 3);

  const full = patch.index * hz;
  depth.gain.setValueAtTime(full, at);
  depth.gain.setTargetAtTime(full * patch.indexDecay, at + patch.attack, patch.decay / 2);

  carrier.start(at);
  modulator.start(at);
  carrier.stop(end + patch.release * 2);
  modulator.stop(end + patch.release * 2);
}

/** A drum hit: a pitched sine drop for the kick, filtered noise for the snare and hats. */
export function playDrum(context: BaseAudioContext, out: AudioNode, noise: AudioBuffer, kind: "kick" | "snare" | "hat" | "open", at: number, velocity = 1): void {
  if (kind === "kick") {
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    amp.gain.setValueAtTime(0.9 * velocity, at);
    amp.gain.exponentialRampToValueAtTime(0.001, at + 0.28);
    osc.connect(amp);
    amp.connect(out);
    osc.start(at);
    osc.stop(at + 0.3);
    return;
  }
  const source = context.createBufferSource();
  source.buffer = noise;
  const filter = context.createBiquadFilter();
  const amp = context.createGain();
  const [type, hz, level, length] = kind === "snare"
    ? ["bandpass" as const, 1800, 0.5, 0.16]
    : kind === "hat" ? ["highpass" as const, 7000, 0.18, 0.05] : ["highpass" as const, 6000, 0.2, 0.22];
  filter.type = type;
  filter.frequency.value = hz;
  amp.gain.setValueAtTime(level * velocity, at);
  amp.gain.exponentialRampToValueAtTime(0.001, at + length);
  source.connect(filter);
  filter.connect(amp);
  amp.connect(out);
  source.start(at);
  source.stop(at + length + 0.02);
}
