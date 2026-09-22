import { t, type StringKey } from "../core/i18n";
import type { Action } from "../core/input";
import type { Settings } from "../core/settings";

/** Which setting a change was to, so the caller can preview a sound level as it moves. */
export type SettingKey = keyof Settings;

/** One line of the panel, steered by the mouse or by ↑ ↓ (choose) and ← → (change). */
interface Row {
  element: HTMLElement;
  /** Step the value one choice left (-1) or right (1). */
  change(direction: -1 | 1): void;
}

/** Sound levels are percentages in steps of this. */
const LEVEL_STEP = 10;

/** The options panel. Opening it pauses the game. */
export class OptionsPanel {
  private open = false;
  private rows: Row[] = [];
  private selected = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly settings: Settings,
    private readonly onChange: (key: SettingKey) => void,
  ) {
    this.build();
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open = !this.open;
    this.root.classList.toggle("open", this.open);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  /** A key or button press while the panel is open. */
  press(action: Action): void {
    if (action === "throttle" || action === "brake") {
      this.select(this.selected + (action === "throttle" ? -1 : 1));
    } else if (action === "left" || action === "right") {
      this.rows[this.selected]?.change(action === "left" ? -1 : 1);
    } else if (action === "gear") {
      this.rows[this.selected]?.change(1);
    } else if (action === "start") {
      this.toggle();
    }
  }

  /** Rebuilds the panel, for example after the language changes. */
  build(): void {
    this.root.replaceChildren();
    this.rows = [];
    const panel = document.createElement("div");
    panel.className = "panel";
    const title = document.createElement("h1");
    title.textContent = t("options.title");
    panel.append(title);

    const s = this.settings;
    panel.append(
      this.choice("language", "options.language", [
        ["auto", t("options.language.auto")],
        ["ja", "日本語"],
        ["en", "English"],
      ], (v) => (s.language = v as Settings["language"])),
      this.choice("fpsCap", "options.fps", [
        ["0", t("options.fps.display")],
        ["120", "120"],
        ["60", "60"],
        ["30", "30"],
      ], (v) => (s.fpsCap = Number(v) as Settings["fpsCap"])),
      this.choice("resolutionScale", "options.resolution", [
        ["1", "100%"],
        ["0.75", "75%"],
        ["0.5", "50%"],
      ], (v) => (s.resolutionScale = Number(v) as Settings["resolutionScale"])),
      heading(t("options.sound")),
      this.level("masterVolume", "options.master"),
      this.level("musicVolume", "options.music"),
      this.level("effectsVolume", "options.effects"),
      this.toggleRow("muted", "options.mute"),
    );

    const help = document.createElement("p");
    help.textContent = `${t("options.nav")}\n${t("options.help")}`;
    panel.append(help);
    this.root.append(panel);
    this.select(this.selected);
  }

  private select(index: number): void {
    this.selected = (index + this.rows.length) % this.rows.length;
    this.rows.forEach((row, i) => row.element.classList.toggle("selected", i === this.selected));
  }

  /** Adds a row; a click on it selects it too, so the keys carry on from there. */
  private row(element: HTMLElement, change: Row["change"]): HTMLElement {
    const index = this.rows.length;
    this.rows.push({ element, change });
    element.addEventListener("pointerdown", () => this.select(index));
    return element;
  }

  private choice(key: SettingKey, label: StringKey, choices: Array<[string, string]>, apply: (v: string) => void): HTMLElement {
    const row = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = t(label);
    const select = document.createElement("select");
    const value = String(this.settings[key]);
    for (const [v, name] of choices) {
      const option = document.createElement("option");
      option.value = v;
      option.textContent = name;
      option.selected = v === value;
      select.append(option);
    }
    const commit = (): void => {
      apply(select.value);
      this.onChange(key);
    };
    select.addEventListener("change", () => {
      commit();
      select.blur();
    });
    row.append(text, select);
    return this.row(row, (direction) => {
      select.selectedIndex = Math.min(choices.length - 1, Math.max(0, select.selectedIndex + direction));
      commit();
    });
  }

  /** A sound level, 0..1 in the settings, shown as a slider in percent. */
  private level(key: "masterVolume" | "musicVolume" | "effectsVolume", label: StringKey): HTMLElement {
    const row = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = t(label);
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = String(LEVEL_STEP);
    const shown = document.createElement("output");
    const set = (percent: number): void => {
      const p = Math.min(100, Math.max(0, Math.round(percent / LEVEL_STEP) * LEVEL_STEP));
      slider.value = String(p);
      shown.textContent = `${p}%`;
      this.settings[key] = p / 100;
      this.onChange(key);
    };
    const current = Math.round(this.settings[key] * 100);
    slider.value = String(current);
    shown.textContent = `${current}%`;
    slider.addEventListener("input", () => set(Number(slider.value)));
    // the arrow keys belong to the panel's own navigation, not to a focused slider
    slider.addEventListener("change", () => slider.blur());
    const control = document.createElement("span");
    control.className = "level";
    control.append(slider, shown);
    row.append(text, control);
    return this.row(row, (direction) => set(Number(slider.value) + direction * LEVEL_STEP));
  }

  private toggleRow(key: "muted", label: StringKey): HTMLElement {
    const row = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = t(label);
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.settings[key];
    const set = (on: boolean): void => {
      box.checked = on;
      this.settings[key] = on;
      this.onChange(key);
    };
    box.addEventListener("change", () => {
      set(box.checked);
      box.blur();
    });
    row.append(text, box);
    return this.row(row, () => set(!box.checked));
  }
}

function heading(text: string): HTMLElement {
  const h = document.createElement("h2");
  h.textContent = text;
  return h;
}
