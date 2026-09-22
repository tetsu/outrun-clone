import { t, type StringKey } from "../core/i18n";
import type { Settings } from "../core/settings";

const LEVELS: Array<[string, string]> = [["0", "0%"], ["0.3", "30%"], ["0.5", "50%"], ["0.7", "70%"], ["1", "100%"]];

/** The options panel. Opening it pauses the game. */
export class OptionsPanel {
  private open = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly settings: Settings,
    private readonly onChange: () => void,
  ) {
    this.build();
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open = !this.open;
    this.root.classList.toggle("open", this.open);
  }

  /** Rebuilds the panel, for example after the language changes. */
  build(): void {
    this.root.replaceChildren();
    const panel = document.createElement("div");
    panel.className = "panel";
    const title = document.createElement("h1");
    title.textContent = t("options.title");
    panel.append(title);

    panel.append(
      this.select("options.language", this.settings.language, [
        ["auto", t("options.language.auto")],
        ["ja", "日本語"],
        ["en", "English"],
      ], (v) => (this.settings.language = v as Settings["language"])),
      this.select("options.fps", String(this.settings.fpsCap), [
        ["0", t("options.fps.display")],
        ["120", "120"],
        ["60", "60"],
        ["30", "30"],
      ], (v) => (this.settings.fpsCap = Number(v) as Settings["fpsCap"])),
      this.select("options.resolution", String(this.settings.resolutionScale), [
        ["1", "100%"],
        ["0.75", "75%"],
        ["0.5", "50%"],
      ], (v) => (this.settings.resolutionScale = Number(v) as Settings["resolutionScale"])),
      this.select("options.music", String(this.settings.musicVolume), LEVELS, (v) => (this.settings.musicVolume = Number(v))),
      this.select("options.effects", String(this.settings.effectsVolume), LEVELS, (v) => (this.settings.effectsVolume = Number(v))),
    );

    const help = document.createElement("p");
    help.textContent = t("options.help");
    panel.append(help);
    this.root.append(panel);
  }

  private select(label: StringKey, value: string, choices: Array<[string, string]>, apply: (v: string) => void): HTMLElement {
    const row = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = t(label);
    const select = document.createElement("select");
    for (const [v, name] of choices) {
      const option = document.createElement("option");
      option.value = v;
      option.textContent = name;
      option.selected = v === value;
      select.append(option);
    }
    select.addEventListener("change", () => {
      apply(select.value);
      this.onChange();
    });
    row.append(text, select);
    return row;
  }
}
