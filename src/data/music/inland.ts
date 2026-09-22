import { block, chord, drums, MAJOR, melody, MINOR, repeat, type Note, type Song } from "../../audio/song";

/** "Inland Rush": urgent, D minor, a galloping bass. 16 bars. */
const BAR = 4;
const CHORDS = [
  chord("D3", MINOR), chord("D3", MINOR), chord("Bb2", MAJOR), chord("C3", MAJOR),
  chord("D3", MINOR), chord("D3", MINOR), chord("Bb2", MAJOR), chord("A2", MAJOR),
  chord("G3", MINOR), chord("D3", MINOR), chord("Bb2", MAJOR), chord("A2", MAJOR),
  chord("G3", MINOR), chord("D3", MINOR), chord("C3", MAJOR), chord("A2", MAJOR),
];

const bass: Note[] = [];
const stabs: Note[] = [];
CHORDS.forEach((c, bar) => {
  const at = bar * BAR;
  const root = c[0] - 12;
  for (const beat of [0, 0.75, 1, 1.75, 2, 2.75, 3, 3.5]) bass.push([at + beat, beat === 3.5 ? root + 12 : root, 0.3, beat % 1 === 0 ? 1 : 0.7]);
  stabs.push(...block(at + 1.5, c.map((n) => n + 12), 0.4, 0.6), ...block(at + 3.5, c.map((n) => n + 12), 0.4, 0.6));
});

const lead: Note[] = [
  ...melody(0, "D5/0.5 -/0.5 D5/0.5 F5/0.5 A5 G5 F5/1.5 E5/0.5 D5/2 F5/0.5 -/0.5 F5/0.5 G5/0.5 A5 Bb5 A5/1.5 G5/0.5 E5/2"),
  ...melody(16, "D5/0.5 -/0.5 D5/0.5 F5/0.5 A5 G5 F5/1.5 E5/0.5 D5/2 D6> C6 Bb5 A5 G5 E5 C#5/2"),
  ...melody(32, "G5 Bb5 D6>/1.5 C6/0.5 A5/2 F5/2 Bb5 D6 F6>/1.5 D6/0.5 C#6/2 A5/2"),
  ...melody(48, "G5 Bb5 D6 G6> F6/1.5 E6/0.5 D6/2 E6 D6 C6 Bb5 A5/3 -/1"),
];

export const inland: Song = {
  title: "Inland Rush",
  bpm: 140,
  beats: 16 * BAR,
  tracks: [
    { patch: "bass", notes: bass },
    { patch: "brass", notes: stabs },
    { patch: "lead", notes: lead },
    { patch: "drums", notes: [
      ...repeat(drums(0, "kick", "x..x..x.x..x..x."), BAR, 16),
      ...repeat(drums(0, "snare", "....o.......o..."), BAR, 16),
      ...repeat(drums(0, "hat", "xxxxxxxxxxxxxxxx"), BAR, 16),
    ] },
  ],
};
