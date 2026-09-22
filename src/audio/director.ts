import { DRIVING_SONGS, RESULTS_SONG } from "../data/music";
import { COUNTDOWN, type Flow } from "../game/flow";
import type { Game, RenderState } from "../game/game";
import { LOW_GEAR_MAX, MAX_SPEED } from "../sim/player";
import type { AudioSystem } from "./context";
import { EffectsAndEngine } from "./sounds";
import { Sequencer } from "./sequencer";

/** The clock lifts the music's tempo under this many seconds left. */
const HURRY_UNDER = 10;

/**
 * Turns the game's state into sound every frame: the engine and the continuous effects from
 * the render state, one-shots from the game's events, the countdown from the flow, and the
 * music from which screen is up. Nothing plays until the audio system is unlocked.
 */
export class SoundDirector {
  private sounds: EffectsAndEngine | null = null;
  private readonly sequencer: Sequencer;
  private lastScreen: Flow["screen"] | null = null;
  private lastCount = 0;
  private musicPlaying = -1;

  constructor(private readonly audio: AudioSystem) {
    this.sequencer = new Sequencer(audio);
  }

  update(game: Game, flow: Flow, state: RenderState): void {
    if (!this.audio.ready) return;
    this.sounds ??= new EffectsAndEngine(this.audio);
    const sounds = this.sounds;

    // the car
    const driving = flow.hudVisible;
    const gearMax = state.gear === 0 ? LOW_GEAR_MAX : MAX_SPEED;
    const revs = Math.min(1, state.speed / gearMax);
    sounds.engine.update(driving ? revs : 0, driving ? state.throttle : 0, driving ? 1 : 0);
    sounds.effects.update(driving ? state.skid : 0, driving && state.offroad, driving ? state.speed / MAX_SPEED : 0);

    // what happened since the last frame
    for (const event of game.events.splice(0)) {
      if (!driving && event !== "goal" && event !== "over") continue;
      switch (event) {
        case "bump": sounds.effects.bump(); break;
        case "scrape": sounds.effects.scrape(); break;
        case "knock": sounds.effects.knock(); break;
        case "crash": sounds.effects.crash(); break;
        case "checkpoint": sounds.effects.checkpoint(); break;
        case "goal": this.play(RESULTS_SONG); break;
        case "over": this.stopMusic(); sounds.effects.gameOver(); break;
      }
    }

    // the countdown
    if (flow.screen === "countdown") {
      const count = Math.ceil(COUNTDOWN - flow.time);
      if (count !== this.lastCount && count > 0) sounds.effects.beep(false);
      this.lastCount = count;
    } else if (flow.screen === "driving" && this.lastScreen === "countdown") {
      sounds.effects.beep(true);
      this.lastCount = 0;
    }

    // the music: the chosen track from the music select through the drive
    if (flow.screen === "musicSelect" || flow.screen === "countdown" || flow.screen === "driving") {
      if (this.musicPlaying !== flow.music && game.run?.phase !== "goal") this.play(DRIVING_SONGS[flow.music], flow.music);
      const run = state.run;
      this.sequencer.rate = run && run.phase === "driving" && run.timeLeft < HURRY_UNDER ? 1.1 : 1;
    } else if (flow.screen === "title" || flow.screen === "attract") {
      this.stopMusic();
    }
    this.lastScreen = flow.screen;
  }

  private play(song: typeof RESULTS_SONG, index = -1): void {
    this.sequencer.rate = 1;
    this.sequencer.play(song);
    this.musicPlaying = index;
  }

  private stopMusic(): void {
    if (this.musicPlaying === -1 && !this.sequencer.playing) return;
    this.sequencer.stop();
    this.musicPlaying = -1;
  }
}
