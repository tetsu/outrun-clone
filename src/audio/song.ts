/**
 * Songs as note data for the FM synthesizer: tiny, owned outright, and able to follow the
 * game. A song is a set of tracks, each on one patch (or the drums), of notes placed in beats;
 * it loops after `beats` unless `once`.
 */

export type DrumKind = "kick" | "snare" | "hat" | "open";
/** [beat, MIDI note or drum, length in beats, velocity 0..1] */
export type Note = [beat: number, note: number | DrumKind, length: number, velocity?: number];

export interface SongTrack {
  patch: string;
  notes: Note[];
}

export interface Song {
  title: string;
  bpm: number;
  beats: number;
  once?: boolean;
  tracks: SongTrack[];
}

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI number of a note name like "F#4" or "Bb3". */
export function pitch(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return (Number(m[3]) + 1) * 12 + NAMES[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}

/** Notes of a chord: a root name and intervals in semitones. */
export function chord(root: string, intervals: number[]): number[] {
  const r = pitch(root);
  return intervals.map((i) => r + i);
}

export const MAJOR = [0, 4, 7];
export const MINOR = [0, 3, 7];
export const MAJOR7 = [0, 4, 7, 11];
export const MINOR7 = [0, 3, 7, 10];
export const DOM7 = [0, 4, 7, 10];
export const SUS4 = [0, 5, 7];

/**
 * A melody from a string: tokens "name/length" in beats, "-/length" for a rest, "name" alone
 * lasting one beat; an optional ">" after the name marks an accent. Starts at `at`.
 */
export function melody(at: number, text: string, velocity = 0.9, gate = 0.9): Note[] {
  const notes: Note[] = [];
  let beat = at;
  for (const token of text.trim().split(/\s+/)) {
    const [name, len] = token.split("/");
    const length = len ? Number(len) : 1;
    if (name !== "-") {
      const accent = name.endsWith(">");
      notes.push([beat, pitch(accent ? name.slice(0, -1) : name), length * gate, accent ? 1 : velocity]);
    }
    beat += length;
  }
  return notes;
}

/** A drum line from a grid string, one character per `step` beats: x hit, o accent, . rest. */
export function drums(at: number, kind: DrumKind, grid: string, step = 0.25): Note[] {
  const notes: Note[] = [];
  let beat = at;
  for (const c of grid.replace(/\s+/g, "")) {
    if (c === "x") notes.push([beat, kind, step, 0.7]);
    else if (c === "o") notes.push([beat, kind, step, 1]);
    beat += step;
  }
  return notes;
}

/** Chord tones held for `length` beats from `at`. */
export function block(at: number, notes: number[], length: number, velocity = 0.7): Note[] {
  return notes.map((n) => [at, n, length * 0.95, velocity]);
}

/** Chord tones played one after another in `order` (indexes into the chord), each `step` beats. */
export function arpeggio(at: number, notes: number[], order: number[], step: number, count: number, velocity = 0.7): Note[] {
  const out: Note[] = [];
  for (let i = 0; i < count; i++) out.push([at + i * step, notes[order[i % order.length] % notes.length], step * 0.9, velocity]);
  return out;
}

/** Repeats notes spanning `span` beats `times` times, `span` beats apart. */
export function repeat(notes: Note[], span: number, times: number): Note[] {
  const out: Note[] = [];
  for (let i = 0; i < times; i++) for (const [beat, note, length, velocity] of notes) out.push([beat + i * span, note, length, velocity]);
  return out;
}

/** Everything in a song shifted by `beats`. */
export function shift(notes: Note[], beats: number): Note[] {
  return notes.map(([beat, note, length, velocity]) => [beat + beats, note, length, velocity]);
}
