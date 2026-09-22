import type { SaveStorage } from "../core/storage";
import type { Game } from "../game/game";
import { SCENERY_KINDS } from "../render/placeholders";
import type { Stages } from "../sim/route";
import { DEFAULT_STAGE_TIME } from "../sim/run";
import { buildStage, course, SEGMENT_LENGTH, type SceneryRule, type SectionData, type StageData } from "../sim/track";

/**
 * Track editor (dev server only, F4). Edits a stage's sections, roadside rules, fork and next
 * stage, with the game as the live preview: every change rebuilds the route from the edited
 * stage and keeps the car where it was in it. Save writes the stage file through the dev
 * server (vite.config.ts); the page then reloads with the new file and the editor reopens
 * where it was.
 *
 * The overview shows the stage from above (bends integrated into a heading; the arcade road
 * is straight in the world, so this is the course as the bends describe it) and its height
 * profile. Clicking either puts the car there.
 */

const STATE_KEY = "dev:editor";

interface EditorState {
  open: boolean;
  stage: string;
  section: number;
}

interface EditorContext {
  game: Game;
  stages: Stages;
  storage: SaveStorage;
}

export function installEditor(ctx: EditorContext): void {
  const { game, stages, storage } = ctx;
  const saved = storage.read<EditorState>(STATE_KEY, { open: false, stage: "", section: 0 });
  const names = (): string[] => Object.keys(stages).sort();
  let current = stages[saved.stage] ? saved.stage : game.route?.placed[0]?.id ?? names()[0];
  let selected = saved.section;
  let draft: StageData = structuredClone(stages[current]);
  /** The stage as loaded, put back if the changes are discarded. */
  let original = stages[current];
  let dirty = false;

  const panel = document.createElement("div");
  panel.className = "dev-panel dev-editor";
  panel.hidden = !saved.open;
  document.body.append(panel);
  const remember = (): void => storage.write(STATE_KEY, { open: !panel.hidden, stage: current, section: selected });

  const map = document.createElement("canvas");
  map.className = "dev-map";
  const status = document.createElement("pre");

  /** Rebuilds the route from the draft, keeping the car's place in the stage if it is in it. */
  let pending = 0;
  const preview = (): void => {
    dirty = true;
    stages[current] = draft;
    clearTimeout(pending);
    pending = window.setTimeout(() => {
      const at = game.route?.stageAt(game.player.z);
      const z = at && at.id === current ? game.player.z - at.start : sectionStart(draft, selected);
      game.restartRoute(current, z);
      drawMap();
      showStatus();
    }, 120);
  };

  const showStatus = (message = ""): void => {
    const length = draft.sections.reduce((sum, s) => sum + s.length, 0);
    status.textContent = `${current}.json  ${(length / 1000).toFixed(2)} km${draft.fork ? " + fork" : ""}` +
      `${dirty ? "  (unsaved)" : ""}${message ? "\n" + message : ""}`;
  };

  const build = (): void => {
    panel.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = "Track editor (F4)";

    const pick = select(names(), current, (name) => {
      if (dirty && !confirm(`Discard the changes to ${current}?`)) {
        build();
        return;
      }
      stages[current] = original;
      current = name;
      original = stages[current];
      draft = structuredClone(original);
      selected = 0;
      dirty = false;
      game.restartRoute(current, 0);
      remember();
      build();
    });
    const top = document.createElement("div");
    top.className = "dev-buttons";
    top.append(
      pick,
      button("New", () => {
        const name = prompt("New stage file name (a-z, 0-9, -):", `${current}-copy`);
        if (!name || !/^[a-z0-9-]{1,60}$/.test(name) || stages[name]) return;
        stages[current] = original;
        current = name;
        draft = structuredClone({ ...draft, name, fork: undefined, next: undefined });
        stages[name] = original = draft;
        dirty = true;
        game.restartRoute(current, 0);
        remember();
        build();
      }),
      button("Save", () => void save()),
      button("Revert", () => location.reload()),
    );
    panel.append(title, top, status, map);

    // stage settings
    panel.append(heading("Stage"));
    panel.append(
      field("name", draft.name, "text", (v) => ((draft.name = v), preview())),
      field("halfWidth", draft.halfWidth, "number", (v) => ((draft.halfWidth = Number(v)), preview())),
      field("lanes", draft.lanes, "number", (v) => ((draft.lanes = Math.max(1, Math.round(Number(v)))), preview())),
      field("time (s)", draft.time ?? DEFAULT_STAGE_TIME, "number", (v) => ((draft.time = Number(v) || undefined), preview())),
    );
    const others = ["", ...names().filter((n) => n !== current)];
    panel.append(labelled("next", select(others, draft.next ?? "", (v) => {
      draft.next = v || undefined;
      if (v) draft.fork = undefined;
      preview();
      build();
    })));
    panel.append(labelled("fork", select(["no", "yes"], draft.fork ? "yes" : "no", (v) => {
      draft.fork = v === "yes" ? { left: others[1] ?? current, right: others[1] ?? current } : undefined;
      if (draft.fork) draft.next = undefined;
      preview();
      build();
    })));
    if (draft.fork) {
      const fork = draft.fork;
      const branches = names();
      panel.append(
        labelled("left", select(branches, fork.left, (v) => ((fork.left = v), preview()))),
        labelled("right", select(branches, fork.right, (v) => ((fork.right = v), preview()))),
        field("leftCurve", fork.leftCurve ?? 0.0015, "number", (v) => ((fork.leftCurve = Number(v)), preview())),
        field("rightCurve", fork.rightCurve ?? 0.0015, "number", (v) => ((fork.rightCurve = Number(v)), preview())),
      );
    }

    // sections
    panel.append(heading("Sections  (length m, curve 1/m: + right, hill m)"));
    const table = document.createElement("div");
    table.className = "dev-rows";
    draft.sections.forEach((section, i) => table.append(sectionRow(section, i)));
    panel.append(table, buttons(button("Add section", () => {
      draft.sections.splice(selected + 1, 0, { length: 300 });
      selected++;
      preview();
      build();
    })));

    // scenery
    panel.append(heading("Roadside  (kind, from m, to m, every m, offset m, side)"));
    const rules = document.createElement("div");
    rules.className = "dev-rows";
    draft.scenery.forEach((rule, i) => rules.append(ruleRow(rule, i)));
    panel.append(rules, buttons(button("Add rule", () => {
      draft.scenery.push({ kind: SCENERY_KINDS[0], from: 0, to: 100000, every: 40, offset: 12, side: "both" });
      preview();
      build();
    })));

    drawMap();
    showStatus();
  };

  const sectionRow = (section: SectionData, i: number): HTMLElement => {
    const row = document.createElement("div");
    row.className = i === selected ? "dev-row selected" : "dev-row";
    const set = (key: keyof SectionData) => (v: string): void => {
      const n = Number(v);
      if (key === "length") section.length = Math.max(SEGMENT_LENGTH, n);
      else if (n === 0) delete section[key];
      else section[key] = n;
      preview();
    };
    row.append(
      text(String(i + 1)),
      input(section.length, set("length"), 30),
      input(section.curve ?? 0, set("curve"), 0.0002),
      input(section.hill ?? 0, set("hill"), 1),
      button("go", () => {
        selected = i;
        remember();
        game.restartRoute(current, sectionStart(draft, i));
        build();
      }),
      button("↑", () => move(draft.sections, i, -1)),
      button("↓", () => move(draft.sections, i, 1)),
      button("✕", () => {
        if (draft.sections.length > 1) draft.sections.splice(i, 1);
        selected = Math.min(selected, draft.sections.length - 1);
        preview();
        build();
      }),
    );
    row.addEventListener("focusin", () => {
      if (selected === i) return;
      selected = i;
      remember();
      for (const r of row.parentElement!.children) r.classList.toggle("selected", r === row);
      drawMap();
    });
    return row;
  };

  const ruleRow = (rule: SceneryRule, i: number): HTMLElement => {
    const row = document.createElement("div");
    row.className = "dev-row";
    const num = (key: "from" | "to" | "every" | "offset") => (v: string): void => {
      rule[key] = Number(v);
      preview();
    };
    row.append(
      select(SCENERY_KINDS, rule.kind, (v) => ((rule.kind = v), preview())),
      input(rule.from, num("from"), 10),
      input(rule.to, num("to"), 10),
      input(rule.every, num("every"), 1),
      input(rule.offset, num("offset"), 0.5),
      select(["both", "left", "right"], rule.side, (v) => ((rule.side = v as SceneryRule["side"]), preview())),
      button("✕", () => {
        draft.scenery.splice(i, 1);
        preview();
        build();
      }),
    );
    return row;
  };

  const move = <T>(list: T[], i: number, by: number): void => {
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    selected = j;
    preview();
    build();
  };

  const save = async (): Promise<void> => {
    const response = await fetch(`/__dev/stage/${current}.json`, { method: "POST", body: formatStage(draft) });
    if (response.ok) {
      dirty = false;
      remember();
      showStatus("saved; reloading");
      // the dev server reloads the page for the changed file; the editor reopens here
    } else {
      showStatus(`save failed: ${response.status}`);
    }
  };

  // --- overview: plan and height profile
  const drawMap = (): void => {
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round((panel.clientWidth - 32 || 380) * ratio);
    const h = Math.round(w * 0.75);
    map.width = w;
    map.height = h;
    const c = map.getContext("2d")!;
    c.clearRect(0, 0, w, h);
    const built = buildStage(draft, course);
    const segs = built.segments;
    if (segs.length === 0) return;

    // plan: integrate the heading; the fork's two roads are placed by their offsets
    const planH = h * 0.66;
    type P = [number, number];
    const line: P[] = [];
    const lineB: P[] = [];
    let heading = 0;
    let px = 0;
    let py = 0;
    for (const s of segs) {
      const nx = Math.cos(heading);
      const ny = -Math.sin(heading);
      line.push([px + nx * s.a1, py + ny * s.a1]);
      lineB.push([px + nx * s.b1, py + ny * s.b1]);
      heading += (s.curve + s.curveB) / 2 * SEGMENT_LENGTH;
      px += Math.sin(heading) * SEGMENT_LENGTH;
      py += Math.cos(heading) * SEGMENT_LENGTH;
    }
    // the fork's bends make the roads part: integrate each from where they differ
    const forkFrom = segs.findIndex((s) => s.curve !== s.curveB);
    if (forkFrom >= 0) {
      for (const [points, key] of [[line, "curve"], [lineB, "curveB"]] as const) {
        let hd = 0;
        let [x, y] = points[forkFrom];
        let base = 0;
        for (let i = 0; i < forkFrom; i++) base += (segs[i].curve + segs[i].curveB) / 2 * SEGMENT_LENGTH;
        hd = base;
        for (let i = forkFrom; i < segs.length; i++) {
          points[i] = [x, y];
          hd += segs[i][key] * SEGMENT_LENGTH;
          x += Math.sin(hd) * SEGMENT_LENGTH;
          y += Math.cos(hd) * SEGMENT_LENGTH;
        }
      }
    }
    const all = line.concat(lineB);
    const minX = Math.min(...all.map((p) => p[0]));
    const maxX = Math.max(...all.map((p) => p[0]));
    const minY = Math.min(...all.map((p) => p[1]));
    const maxY = Math.max(...all.map((p) => p[1]));
    const pad = 12 * ratio;
    const scale = Math.min((w - 2 * pad) / Math.max(1, maxX - minX), (planH - 2 * pad) / Math.max(1, maxY - minY));
    const toScreen = ([x, y]: P): P => [pad + (x - minX) * scale, planH - pad - (y - minY) * scale];

    const range = sectionRange(draft, selected);
    const stroke = (points: P[], from: number, to: number, color: string, width: number): void => {
      c.strokeStyle = color;
      c.lineWidth = width * ratio;
      c.beginPath();
      for (let i = from; i < Math.min(to, points.length); i++) {
        const [x, y] = toScreen(points[i]);
        if (i === from) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    };
    const [s0, s1] = [range[0] / SEGMENT_LENGTH, range[1] / SEGMENT_LENGTH];
    if (forkFrom >= 0) stroke(lineB, Math.max(0, forkFrom - 1), lineB.length, "#8a93a8", 3);
    stroke(line, 0, line.length, "#8a93a8", 3);
    stroke(line, s0, s1 + 1, "#ffd84a", 4);

    // height profile
    const top = planH + 8 * ratio;
    const ph = h - top - 4 * ratio;
    const ys = segs.map((s) => s.y1);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys, lo + 1);
    c.fillStyle = "rgba(255,255,255,0.06)";
    c.fillRect(0, top, w, ph);
    const profile = (i: number): P => [(i / segs.length) * w, top + ph - ((ys[i] - lo) / (hi - lo)) * (ph - 4 * ratio) - 2 * ratio];
    c.strokeStyle = "#7fc8ff";
    c.lineWidth = 2 * ratio;
    c.beginPath();
    for (let i = 0; i < segs.length; i++) {
      const [x, y] = profile(i);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.fillStyle = "rgba(255,216,74,0.25)";
    c.fillRect((s0 / segs.length) * w, top, ((s1 - s0) / segs.length) * w, ph);

    // the car, if it is in this stage
    const at = game.route?.stageAt(game.player.z);
    if (at && at.id === current) {
      const i = Math.min(segs.length - 1, Math.max(0, Math.floor((game.player.z - at.start) / SEGMENT_LENGTH)));
      c.fillStyle = "#ff4f5e";
      for (const [x, y] of [toScreen(line[i]), profile(i)]) {
        c.beginPath();
        c.arc(x, y, 4 * ratio, 0, Math.PI * 2);
        c.fill();
      }
    }
    mapGeometry = { segments: segs.length, line: line.map(toScreen), profileTop: top, ratio };
  };

  let mapGeometry = { segments: 0, line: [] as [number, number][], profileTop: 0, ratio: 1 };
  map.addEventListener("click", (e) => {
    const r = mapGeometry.ratio;
    const x = e.offsetX * r;
    const y = e.offsetY * r;
    let i: number;
    if (y >= mapGeometry.profileTop) {
      i = Math.floor((x / map.width) * mapGeometry.segments);
    } else {
      let best = Infinity;
      i = 0;
      mapGeometry.line.forEach(([px, py], k) => {
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < best) {
          best = d;
          i = k;
        }
      });
    }
    game.restartRoute(current, i * SEGMENT_LENGTH);
    drawMap();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code !== "F4") return;
    e.preventDefault();
    panel.hidden = !panel.hidden;
    remember();
    if (!panel.hidden) build();
  });
  // keep the car marker moving while the editor is open
  window.setInterval(() => {
    if (!panel.hidden) drawMap();
  }, 500);

  if (!panel.hidden) {
    game.restartRoute(current, sectionStart(draft, selected));
    build();
  }
}

/** Distance from the stage start to the start of section i. */
function sectionStart(stage: StageData, i: number): number {
  return sectionRange(stage, i)[0];
}

/** Start and end of section i in metres, rounded to whole segments as the track builder does. */
function sectionRange(stage: StageData, i: number): [number, number] {
  let z = 0;
  for (let k = 0; k < stage.sections.length; k++) {
    const length = Math.max(1, Math.round(stage.sections[k].length / SEGMENT_LENGTH)) * SEGMENT_LENGTH;
    if (k === i) return [z, z + length];
    z += length;
  }
  return [z, z];
}

/** A stage file's text: one line per section and per rule, like the hand-written files. */
export function formatStage(stage: StageData): string {
  const inline = (o: object): string =>
    "{ " + Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ") + " }";
  const list = (items: object[]): string => (items.length ? "[\n" + items.map((o) => "    " + inline(o)).join(",\n") + "\n  ]" : "[]");
  const lines = [
    `  "name": ${JSON.stringify(stage.name)}`,
    `  "halfWidth": ${stage.halfWidth}`,
    `  "lanes": ${stage.lanes}`,
    ...(stage.time !== undefined ? [`  "time": ${stage.time}`] : []),
    `  "sections": ${list(stage.sections)}`,
    `  "scenery": ${list(stage.scenery)}`,
  ];
  if (stage.fork) lines.push(`  "fork": ${inline(stage.fork)}`);
  if (stage.next) lines.push(`  "next": ${JSON.stringify(stage.next)}`);
  return "{\n" + lines.join(",\n") + "\n}\n";
}

// --- small DOM helpers (the editor is a developer tool: English only, no string tables)

function heading(textContent: string): HTMLElement {
  const h = document.createElement("h3");
  h.textContent = textContent;
  return h;
}

function text(textContent: string): HTMLElement {
  const span = document.createElement("span");
  span.textContent = textContent;
  return span;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", () => {
    onClick();
    b.blur();
  });
  return b;
}

function buttons(...items: HTMLElement[]): HTMLElement {
  const div = document.createElement("div");
  div.className = "dev-buttons";
  div.append(...items);
  return div;
}

function input(value: number, onChange: (v: string) => void, step: number): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "number";
  el.step = String(step);
  el.value = String(value);
  el.addEventListener("change", () => onChange(el.value));
  return el;
}

function select(choices: readonly string[], value: string, onChange: (v: string) => void): HTMLSelectElement {
  const el = document.createElement("select");
  for (const choice of choices) {
    const option = document.createElement("option");
    option.value = choice;
    option.textContent = choice || "(none)";
    option.selected = choice === value;
    el.append(option);
  }
  el.addEventListener("change", () => {
    onChange(el.value);
    el.blur();
  });
  return el;
}

function labelled(name: string, control: HTMLElement): HTMLElement {
  const row = document.createElement("label");
  row.className = "dev-field";
  row.append(text(name), control);
  return row;
}

function field(name: string, value: string | number, type: "text" | "number", onChange: (v: string) => void): HTMLElement {
  const el = document.createElement("input");
  el.type = type;
  el.value = String(value);
  if (type === "number") el.step = "any";
  el.addEventListener("change", () => onChange(el.value));
  return labelled(name, el);
}
