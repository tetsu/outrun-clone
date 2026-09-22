import { block, chord, drums, MAJOR, melody, type Song } from "../../audio/song";

/** The results fanfare: a short rise and a held chord, once. */
export const results: Song = {
  title: "Results",
  bpm: 120,
  beats: 8,
  once: true,
  tracks: [
    { patch: "brass", notes: melody(0, "C5/0.5 E5/0.5 G5/0.5 C6>/1.5 -/0.5 G5/0.5 C6>/3", 0.9) },
    { patch: "pad", notes: [...block(0, chord("C4", MAJOR), 2, 0.5), ...block(2, chord("F4", MAJOR), 1.5, 0.5), ...block(3.5, chord("C4", MAJOR), 4, 0.6)] },
    { patch: "bass", notes: [[0, 36, 1.8, 0.9], [2, 41, 1.4, 0.8], [3.5, 36, 3.5, 0.9]] },
    { patch: "drums", notes: [...drums(0, "kick", "x.......x.....x."), ...drums(0, "snare", "....x...x.x.x...")] },
  ],
};
