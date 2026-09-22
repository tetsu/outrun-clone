import type { AudioSystem } from "./context";
import { SoundEffects } from "./effects";
import { EngineSound } from "./engine";

/** The car's sounds, built together once the audio system is running. */
export class EffectsAndEngine {
  readonly engine: EngineSound;
  readonly effects: SoundEffects;

  constructor(audio: AudioSystem) {
    this.engine = new EngineSound(audio);
    this.effects = new SoundEffects(audio);
  }
}
