import type { SaveStorage } from "../core/storage";

/** One line of the high-score table. */
export interface ScoreEntry {
  initials: string;
  score: number;
  /** The branch taken at each fork, "L" or "R" per stage, so the table shows the route driven. */
  route: string;
  /** Reached a goal (rather than running out of time). */
  goal: boolean;
}

export const TABLE_SIZE = 10;
export const INITIALS = 3;
/** The letters the name entry cycles through. */
export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ.";

const KEY = "scores";

/** The table a fresh game shows: something to beat, and a shape for the screen. */
function defaultScores(): ScoreEntry[] {
  const names = ["BSO", "RUN", "CHB", "KJK", "SWR", "KTR", "TTY", "NRT", "SKR", "MKH"];
  return names.map((initials, i) => ({ initials, score: (TABLE_SIZE - i) * 100000, route: i % 2 ? "R" : "L", goal: i < 4 }));
}

export function loadScores(storage: SaveStorage): ScoreEntry[] {
  const saved = storage.read<ScoreEntry[]>(KEY, []);
  return saved.length === TABLE_SIZE ? saved : defaultScores();
}

export function saveScores(storage: SaveStorage, scores: ScoreEntry[]): void {
  storage.write(KEY, scores);
}

/** The rank (0 = top) a score would take, or -1 when it does not make the table. */
export function rankOf(scores: ScoreEntry[], score: number): number {
  const rank = scores.findIndex((entry) => score > entry.score);
  return rank < 0 && scores.length < TABLE_SIZE ? scores.length : rank;
}

/** Puts an entry in at its rank and drops the last line; returns the rank, or -1 if it did not make the table. */
export function insertScore(scores: ScoreEntry[], entry: ScoreEntry): number {
  const rank = rankOf(scores, entry.score);
  if (rank < 0) return -1;
  scores.splice(rank, 0, entry);
  scores.length = Math.min(scores.length, TABLE_SIZE);
  return rank;
}
