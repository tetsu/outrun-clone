import { describe, expect, it } from "vitest";
import { PATCHES } from "../src/audio/fm";
import { drums, melody, pitch } from "../src/audio/song";
import { DRIVING_SONGS, RESULTS_SONG } from "../src/data/music";

describe("songs", () => {
  it("read note names and melodies", () => {
    expect(pitch("A4")).toBe(69);
    expect(pitch("C4")).toBe(60);
    expect(pitch("F#3")).toBe(54);
    expect(pitch("Bb3")).toBe(58);
    const notes = melody(4, "C4/2 -/1 E4 G4>/0.5");
    expect(notes.map(([beat, note, length, velocity]) => [beat, note, Math.round(length * 100) / 100, velocity]))
      .toEqual([[4, 60, 1.8, 0.9], [7, 64, 0.9, 0.9], [8, 67, 0.45, 1]]);
    expect(drums(0, "kick", "x...o...")).toEqual([[0, "kick", 0.25, 0.7], [1, "kick", 0.25, 1]]);
  });

  it("are well formed: notes inside the loop, on patches that exist, in a playable range", () => {
    for (const song of [...DRIVING_SONGS, RESULTS_SONG]) {
      expect(song.tracks.length, song.title).toBeGreaterThan(0);
      for (const track of song.tracks) {
        expect(track.patch === "drums" || track.patch in PATCHES, `${song.title}: ${track.patch}`).toBe(true);
        for (const [beat, note, length] of track.notes) {
          expect(beat, song.title).toBeGreaterThanOrEqual(0);
          expect(beat, song.title).toBeLessThan(song.beats);
          expect(length, song.title).toBeGreaterThan(0);
          if (typeof note === "number") {
            expect(note, song.title).toBeGreaterThanOrEqual(24);
            expect(note, song.title).toBeLessThanOrEqual(108);
          }
        }
      }
    }
    expect(RESULTS_SONG.once).toBe(true);
  });
});
