import type { AudioSystem } from "./context";
import { noteHz, PATCHES, playDrum, playFm } from "./fm";
import type { Song } from "./song";

/** How far ahead notes are handed to the audio clock, and how often the scheduler runs. */
const LOOKAHEAD = 0.2;
const TICK_MS = 50;

/**
 * Plays a Song by scheduling its notes a little ahead on the audio clock (the timer that
 * wakes the scheduler is not precise; the audio clock is). Loops unless the song is `once`.
 */
export class Sequencer {
  private song: Song | null = null;
  private timer = 0;
  /** Audio-clock time of the song's beat 0 in the current pass, and the next beat to schedule. */
  private origin = 0;
  private nextBeat = 0;
  private noise: AudioBuffer | null = null;
  /** Playback speed; 1.1 lifts the tempo for the final seconds. */
  rate = 1;

  constructor(private readonly audio: AudioSystem) {}

  get playing(): Song | null {
    return this.song;
  }

  play(song: Song): void {
    this.stop();
    const context = this.audio.context;
    if (!context) return;
    this.song = song;
    this.noise ??= this.audio.noise(1);
    this.origin = context.currentTime + 0.05;
    this.nextBeat = 0;
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop(): void {
    clearInterval(this.timer);
    this.song = null;
  }

  private schedule(): void {
    const song = this.song;
    const context = this.audio.context;
    const out = this.audio.music;
    if (!song || !context || !out) return;
    const secondsPerBeat = 60 / (song.bpm * this.rate);
    const until = context.currentTime + LOOKAHEAD;
    // notes are scheduled in beat order; a pass is one loop of the song
    while (this.origin + this.nextBeat * secondsPerBeat < until) {
      const beat = this.nextBeat;
      for (const track of song.tracks) {
        for (const [at, note, length, velocity] of track.notes) {
          if (at < beat || at >= beat + 0.25) continue;
          const time = this.origin + at * secondsPerBeat;
          if (typeof note === "string") playDrum(context, out, this.noise!, note, time, velocity);
          else playFm(context, out, PATCHES[track.patch] ?? PATCHES.lead, noteHz(note), time, length * secondsPerBeat, velocity);
        }
      }
      this.nextBeat += 0.25;
      if (this.nextBeat >= song.beats) {
        if (song.once) {
          this.song = null;
          clearInterval(this.timer);
          return;
        }
        this.origin += song.beats * secondsPerBeat;
        this.nextBeat = 0;
      }
    }
  }
}
