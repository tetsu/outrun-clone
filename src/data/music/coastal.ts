import { arpeggio, block, chord, drums, MAJOR, melody, MINOR, repeat, type Note, type Song } from "../../audio/song";

/** "Coastal Breeze": bright and easy, A major, four to the floor. 16 bars. */
const BAR = 4;
const CHORDS = [
  chord("A3", MAJOR), chord("F#3", MINOR), chord("D3", MAJOR), chord("E3", MAJOR),
  chord("A3", MAJOR), chord("F#3", MINOR), chord("D3", MAJOR), chord("E3", MAJOR),
  chord("B3", MINOR), chord("E3", MAJOR), chord("C#3", MINOR), chord("F#3", MINOR),
  chord("D3", MAJOR), chord("E3", MAJOR), chord("A3", MAJOR), chord("E3", MAJOR),
];

const bass: Note[] = [];
const pad: Note[] = [];
const arp: Note[] = [];
CHORDS.forEach((c, bar) => {
  const at = bar * BAR;
  const root = c[0] - 12;
  for (const [beat, n] of [[0, root], [0.5, root], [1, root], [1.5, root], [2, root + 7], [2.5, root + 7], [3, root + 12], [3.5, root]] as const) {
    bass.push([at + beat, n, 0.45, beat % 1 === 0 ? 0.9 : 0.7]);
  }
  pad.push(...block(at, c.map((n) => n + 12), BAR, 0.5));
  arp.push(...arpeggio(at, c.map((n) => n + 24), [0, 1, 2, 1], 0.5, 8, 0.55));
});

const lead: Note[] = [
  ...melody(0, "E5/1.5 C#5/0.5 A4 B4 C#5/2 -/1 E5 F#5/1.5 E5/0.5 D5 C#5 B4/3 -/1"),
  ...melody(16, "E5/1.5 C#5/0.5 A4 B4 C#5 D5 E5/2 F#5 G#5 A5>/1.5 F#5/0.5 E5/3 -/1"),
  ...melody(32, "D5 F#5 B5/1.5 A5/0.5 G#5/2 E5/2 E5 G#5 C#6>/1.5 B5/0.5 A5/2 F#5/2"),
  ...melody(48, "D5 E5 F#5 A5 G#5/1.5 F#5/0.5 E5/2 C#5 D5 E5 C#5 A4/3 -/1"),
];

export const coastal: Song = {
  title: "Coastal Breeze",
  bpm: 126,
  beats: 16 * BAR,
  tracks: [
    { patch: "bass", notes: bass },
    { patch: "pad", notes: pad },
    { patch: "pluck", notes: arp },
    { patch: "brass", notes: lead },
    { patch: "drums", notes: [
      ...repeat(drums(0, "kick", "x...x...x...x..."), BAR, 16),
      ...repeat(drums(0, "snare", "....x.......x..."), BAR, 16),
      ...repeat(drums(0, "hat", "x.x.x.x.x.x.x.x."), BAR, 16),
      ...repeat(drums(0, "open", "..............x."), BAR * 2, 8),
    ] },
  ],
};
