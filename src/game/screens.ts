import { t } from "../core/i18n";
import { DRIVING_SONGS } from "../data/music";
import { COUNTDOWN, type Flow } from "./flow";
import { LETTERS } from "./scores";

/**
 * The screens over the road: title with the high-score table, the start-line countdown, the
 * goal results, game over and name entry. DOM text like the HUD, so it is sharp at any
 * resolution and lays out on every aspect ratio. Rebuilt only when what it shows changes.
 */
export class Screens {
  private key = "";

  constructor(private readonly root: HTMLElement) {}

  update(flow: Flow): void {
    const key = this.keyFor(flow);
    if (key === this.key) return;
    this.key = key;
    this.root.replaceChildren();
    this.root.hidden = flow.screen === "driving" && flow.time >= 1;
    if (this.root.hidden) return;
    const panel = document.createElement("div");
    panel.className = `screen screen-${flow.screen}`;
    this.fill(panel, flow);
    this.root.append(panel);
  }

  /** Rebuild after a language change. */
  refresh(): void {
    this.key = "";
  }

  private keyFor(flow: Flow): string {
    switch (flow.screen) {
      case "countdown": return `countdown ${Math.ceil(COUNTDOWN - flow.time)}`;
      case "driving": return flow.time < 1 ? "go" : "driving";
      case "nameEntry": return `name ${flow.entry.letters.join(",")} ${flow.entry.position}`;
      case "musicSelect": return `music ${flow.music}`;
      default: return flow.screen;
    }
  }

  private fill(panel: HTMLElement, flow: Flow): void {
    const el = (className: string, text = ""): HTMLElement => {
      const e = document.createElement("div");
      e.className = className;
      e.textContent = text;
      panel.append(e);
      return e;
    };
    switch (flow.screen) {
      case "title": {
        el("screen-logo", "BOSO RUN");
        el("screen-sub", t("title.tagline"));
        el("screen-press blink", t("title.press"));
        el("screen-hint", t("title.hint"));
        panel.append(scoreTable(flow));
        el("screen-hint", t("title.options"));
        break;
      }
      case "attract":
        el("screen-demo", t("title.demo"));
        el("screen-press blink", t("title.press"));
        break;
      case "musicSelect": {
        el("screen-sub", t("music.title"));
        const list = document.createElement("div");
        list.className = "screen-music";
        DRIVING_SONGS.forEach((song, i) => {
          const item = document.createElement("div");
          item.className = i === flow.music ? "track active" : "track";
          item.textContent = song.title;
          list.append(item);
        });
        panel.append(list);
        el("screen-hint", t("music.hint"));
        break;
      }
      case "countdown":
        el("screen-count", String(Math.ceil(COUNTDOWN - flow.time)));
        break;
      case "driving":
        el("screen-count", t("countdown.go"));
        break;
      case "results": {
        const run = flow.run;
        el("screen-banner", t("run.goal"));
        el("screen-line", `${t("run.bonus")}  ${run.bonus}`);
        el("screen-line", `${t("hud.score")}  ${run.score}`);
        el("screen-line", `${t("results.route")}  ${run.route}`);
        break;
      }
      case "gameover":
        el("screen-banner", t("run.gameover"));
        el("screen-line", `${t("hud.score")}  ${flow.run.score}`);
        break;
      case "nameEntry": {
        el("screen-sub", t("name.rank").replace("{n}", String(flow.rank + 1)));
        el("screen-line", t("name.prompt"));
        const letters = document.createElement("div");
        letters.className = "screen-letters";
        flow.entry.letters.forEach((index, i) => {
          const letter = document.createElement("span");
          letter.className = i === flow.entry.position ? "letter active blink" : "letter";
          letter.textContent = LETTERS[index];
          letters.append(letter);
        });
        panel.append(letters);
        el("screen-hint", t("name.hint"));
        break;
      }
    }
  }
}

/** The high-score table, with the line just entered picked out. */
function scoreTable(flow: Flow): HTMLElement {
  const table = document.createElement("table");
  table.className = "screen-scores";
  const caption = document.createElement("caption");
  caption.textContent = t("title.scores");
  table.append(caption);
  flow.scores.forEach((entry, i) => {
    const row = table.insertRow();
    if (i === flow.rank) row.className = "active";
    for (const text of [String(i + 1), entry.initials, String(entry.score).padStart(7, "0"), entry.route + (entry.goal ? " ★" : "")]) {
      const cell = row.insertCell();
      cell.textContent = text;
    }
  });
  return table;
}
