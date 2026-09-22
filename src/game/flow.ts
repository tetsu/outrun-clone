import type { Action, InputState } from "../core/input";
import type { SaveStorage } from "../core/storage";
import { DRIVING_SONGS } from "../data/music";
import { autopilot } from "../sim/autopilot";
import type { Game } from "./game";
import { INITIALS, insertScore, LETTERS, loadScores, rankOf, saveScores, type ScoreEntry } from "./scores";

/**
 * The game's flow from the title screen to the high-score table:
 *
 *   title ─(idle)─▶ attract ─▶ title                  a demo drive by the autopilot
 *   title ─(start)─▶ musicSelect ─▶ countdown ─▶ driving   pick a track; 3, 2, 1, go
 *   driving ─▶ results (goal) | gameover ─▶ nameEntry (if the score ranks) ─▶ title
 *
 * The game is stepped on every screen, so the road is always alive behind the text; only the
 * driving screen hands it the player's input. Screens draw from this state (screens.ts).
 */

export type Screen = "title" | "attract" | "musicSelect" | "countdown" | "driving" | "results" | "gameover" | "nameEntry";

/** Seconds on the title before the demo drive starts, and how long a demo may run. */
const TITLE_IDLE = 12;
const ATTRACT_MAX = 75;
/** The start-line countdown: 3, 2, 1, then go. */
export const COUNTDOWN = 3;
const RESULTS_FOR = 7;
const GAMEOVER_FOR = 4;
/** Name entry confirms itself after this long, and the music select starts the run by itself. */
const NAME_ENTRY_FOR = 30;
const MUSIC_SELECT_FOR = 20;
const MUSIC_KEY = "music";

const IDLE: InputState = { steer: 0, throttle: 0, brake: 0, gearToggle: false };

export class Flow {
  screen: Screen = "title";
  /** Seconds on the current screen. */
  time = 0;
  readonly scores: ScoreEntry[];
  /** Name entry: the letter index of each initial and which one is being chosen. */
  readonly entry = { letters: [0, 0, 0], position: 0 };
  /** The rank the run being entered takes (0 = top); stays until the next run, so the title can show it. */
  rank = -1;
  /** The driving track chosen on the music select (an index into DRIVING_SONGS), kept between runs. */
  music: number;
  /** Which branch the demo takes; it alternates. */
  private side: -1 | 1 = -1;

  constructor(private readonly game: Game, private readonly storage: SaveStorage) {
    this.scores = loadScores(storage);
    this.music = Math.min(DRIVING_SONGS.length - 1, Math.max(0, storage.read<number>(MUSIC_KEY, 0)));
    this.enter("title");
  }

  /** The HUD is up while there is driving to watch. */
  get hudVisible(): boolean {
    return this.screen === "attract" || this.screen === "countdown" || this.screen === "driving";
  }

  /** The run (score, route) the results and name entry are about. */
  get run(): { score: number; route: string; goal: boolean; bonus: number } {
    const run = this.game.run!;
    const route = (this.game.route?.placed ?? []).map((p) => (p.branch ? p.branch[0].toUpperCase() : "")).join("");
    return { score: Math.floor(run.score), route, goal: run.phase === "goal", bonus: run.bonus };
  }

  step(input: InputState, dt: number): void {
    const game = this.game;
    const run = game.run!;
    this.time += dt;
    switch (this.screen) {
      case "title":
        game.step(IDLE, dt);
        if (this.time >= TITLE_IDLE) this.enter("attract");
        break;
      case "attract":
        game.step(autopilot(game, this.side), dt);
        if (run.finished || this.time >= ATTRACT_MAX) {
          this.side = this.side < 0 ? 1 : -1;
          this.enter("title");
        }
        break;
      case "musicSelect":
        game.step(IDLE, dt);
        if (this.time >= MUSIC_SELECT_FOR) this.begin();
        break;
      case "countdown":
        game.step(input, dt);
        if (this.time >= COUNTDOWN) {
          run.go();
          this.enter("driving");
        }
        break;
      case "driving":
        game.step(input, dt);
        if (run.finished) this.enter(run.phase === "goal" ? "results" : "gameover");
        break;
      case "results":
      case "gameover":
        game.step(IDLE, dt);
        if (this.time >= (this.screen === "results" ? RESULTS_FOR : GAMEOVER_FOR)) this.afterRun();
        break;
      case "nameEntry":
        game.step(IDLE, dt);
        if (this.time >= NAME_ENTRY_FOR) this.confirmName();
        break;
    }
  }

  /** A key or button press; the screens outside driving are steered by these. */
  press(action: Action): void {
    switch (this.screen) {
      case "title":
      case "attract":
        if (action === "start") this.enter("musicSelect");
        break;
      case "musicSelect":
        if (action === "left" || action === "right") {
          this.music = (this.music + (action === "left" ? -1 : 1) + DRIVING_SONGS.length) % DRIVING_SONGS.length;
          this.storage.write(MUSIC_KEY, this.music);
        } else if (action === "start" || action === "throttle") {
          this.begin();
        } else if (action === "brake") {
          this.enter("title");
        }
        break;
      case "results":
      case "gameover":
        if (action === "start") this.afterRun();
        break;
      case "nameEntry": {
        const e = this.entry;
        if (action === "left" || action === "right") {
          e.letters[e.position] = (e.letters[e.position] + (action === "left" ? -1 : 1) + LETTERS.length) % LETTERS.length;
        } else if (action === "throttle" || action === "start" || action === "gear") {
          if (e.position < INITIALS - 1) e.position++;
          else this.confirmName();
        } else if (action === "brake" && e.position > 0) {
          e.position--;
        }
        break;
      }
    }
  }

  /** Straight into driving, for the development tools. */
  play(): void {
    this.game.run!.go();
    this.enter("driving");
  }

  private begin(): void {
    this.rank = -1;
    this.game.restartRun(true);
    this.enter("countdown");
  }

  private afterRun(): void {
    this.rank = rankOf(this.scores, this.run.score);
    if (this.rank < 0) {
      this.enter("title");
      return;
    }
    this.entry.letters.fill(0);
    this.entry.position = 0;
    this.enter("nameEntry");
  }

  private confirmName(): void {
    const { score, route, goal } = this.run;
    const initials = this.entry.letters.map((i) => LETTERS[i]).join("");
    this.rank = insertScore(this.scores, { initials, score, route, goal });
    saveScores(this.storage, this.scores);
    this.enter("title");
  }

  private enter(screen: Screen): void {
    this.screen = screen;
    this.time = 0;
    // the title and the demo start from the start line
    if (screen === "title") this.game.restartRun(true);
    if (screen === "attract") this.game.restartRun();
  }
}
