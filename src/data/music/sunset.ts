import { arpeggio, block, chord, DOM7, drums, MAJOR7, melody, MINOR7, repeat, type Note, type Song } from "../../audio/song";

/** "Sunset Bay": laid back, F major with sevenths, bells over a slow pad. 16 bars. */
const BAR = 4;
const CHORDS = [
  chord("F3", MAJOR7), chord("D3", MINOR7), chord("G3", MINOR7), chord("C3", DOM7),
  chord("F3", MAJOR7), chord("D3", MINOR7), chord("G3", MINOR7), chord("C3", DOM7),
  chord("Bb2", MAJOR7), chord("A2", MINOR7), chord("G3", MINOR7), chord("C3", DOM7),
  chord("Bb2", MAJOR7), chord("A2", MINOR7), chord("G3", MINOR7), chord("C3", DOM7),
];

const bass: Note[] = [];
const pad: Note[] = [];
const bells: Note[] = [];
CHORDS.forEach((c, bar) => {
  const at = bar * BAR;
  const root = c[0] - 12;
  bass.push([at, root, 1.8, 0.9], [at + 2, root + 7, 0.9, 0.7], [at + 3, root + 12, 0.45, 0.6], [at + 3.5, root + 10, 0.45, 0.6]);
  pad.push(...block(at, c, BAR, 0.45));
  bells.push(...arpeggio(at, c.map((n) => n + 24), [0, 2, 1, 3], 0.5, 8, 0.4));
});

const lead: Note[] = [
  ...melody(0, "A4/2 C5 F5 E5/3 -/1 D5 F5 A5/2 G5/2 -/2", 0.8),
  ...melody(16, "A4/2 C5 F5 E5/2 D5 C5 D5 Bb4 A4/2 G4/2 -/2", 0.8),
  ...melody(32, "D5 F5 A5/2 G5/2 E5/2 F5 D5 Bb4/2 C5/2 -/2", 0.8),
  ...melody(48, "D5 F5 Bb5/2 A5/2 G5/2 F5 E5 D5 C5 F5/3 -/1", 0.8),
];

export const sunset: Song = {
  title: "Sunset Bay",
  bpm: 104,
  beats: 16 * BAR,
  tracks: [
    { patch: "bass", notes: bass },
    { patch: "pad", notes: pad },
    { patch: "bell", notes: bells },
    { patch: "chime", notes: lead },
    { patch: "drums", notes: [
      ...repeat(drums(0, "kick", "x.......x......."), BAR, 16),
      ...repeat(drums(0, "snare", "....x.......x..."), BAR, 16),
      ...repeat(drums(0, "hat", "x.x.x.x.x.x.x.x."), BAR, 16),
    ] },
  ],
};
