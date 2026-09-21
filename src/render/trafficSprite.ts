import { VEHICLES } from "../sim/traffic";
import { createTexture } from "./gl";

/** Written by tools/blender/render_traffic.py next to each sheet image. */
export interface VehicleSheetMeta {
  image: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  /** Sideways offset of each frame: metres from the camera to the vehicle, positive to the right.
   *  The vehicle stays parallel to the road; see tools/blender/render_traffic.py for why frames
   *  go by offset and not by angle. */
  offsets: number[];
  /** The road point under the vehicle's centre, frame pixels from the top-left. */
  anchorX: number;
  anchorY: number;
  /** Frame pixels per metre at that point (the sheet's reference distance). */
  pixelsPerMetre: number;
}

export interface VehicleSprite {
  texture: WebGLTexture;
  meta: VehicleSheetMeta;
  sheetWidth: number;
  sheetHeight: number;
}

/** Placeholder body height and colour per kind, metres. */
const LOOKS: Record<string, [height: number, body: string]> = {
  "kei-truck": [1.8, "#e8e8e2"],
  "kei-wagon": [1.7, "#9fc7e6"],
  "peanut-hatchback": [1.5, "#f2c14e"],
  "grey-sedan": [1.45, "#8d939b"],
  "station-wagon": [1.5, "#3f5a7a"],
  yankee: [1.35, "#6b2fa0"],
  "yellow-sport": [1.25, "#f5d000"],
  supercar: [1.15, "#d7261e"],
  "deco-truck": [3.0, "#2e6fbf"],
  bus: [3.1, "#f4f1e8"],
};
const PLACEHOLDER_PPM = 80;

/** A vehicle drawn in code from behind: body, rear window, lights, tyres. */
function placeholder(gl: WebGL2RenderingContext, kind: string): VehicleSprite {
  const { width } = VEHICLES[kind];
  const [height, body] = LOOKS[kind] ?? [1.5, "#888888"];
  const pad = 4;
  const w = Math.ceil(width * PLACEHOLDER_PPM) + pad * 2;
  const h = Math.ceil(height * PLACEHOLDER_PPM) + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d")!;
  const m = PLACEHOLDER_PPM;
  const left = pad;
  const right = w - pad;
  const bottom = h - pad;
  const top = pad;
  // tyres
  c.fillStyle = "#151515";
  c.fillRect(left + 0.08 * m, bottom - 0.32 * m, 0.3 * m, 0.32 * m);
  c.fillRect(right - 0.38 * m, bottom - 0.32 * m, 0.3 * m, 0.32 * m);
  // body
  c.fillStyle = body;
  c.beginPath();
  c.roundRect(left, top + height * 0.35 * m, right - left, bottom - 0.12 * m - (top + height * 0.35 * m), 0.12 * m);
  c.fill();
  // cabin
  c.beginPath();
  c.roundRect(left + 0.12 * m, top, right - left - 0.24 * m, height * 0.42 * m, 0.14 * m);
  c.fill();
  c.fillStyle = "#26303a";
  c.fillRect(left + 0.22 * m, top + 0.1 * m, right - left - 0.44 * m, height * 0.26 * m);
  // lamps and plate
  c.fillStyle = "#c8102e";
  c.fillRect(left + 0.06 * m, top + height * 0.52 * m, 0.34 * m, 0.14 * m);
  c.fillRect(right - 0.4 * m, top + height * 0.52 * m, 0.34 * m, 0.14 * m);
  c.fillStyle = "#f4f4ea";
  c.fillRect((left + right) / 2 - 0.2 * m, bottom - 0.5 * m, 0.4 * m, 0.2 * m);
  return {
    texture: createTexture(gl, canvas),
    meta: { image: "", frameWidth: w, frameHeight: h, columns: 1, offsets: [0], anchorX: w / 2, anchorY: bottom, pixelsPerMetre: m },
    sheetWidth: w,
    sheetHeight: h,
  };
}

/** Placeholders for every kind; always available, so traffic never waits on art. */
export function createPlaceholderVehicles(gl: WebGL2RenderingContext): Record<string, VehicleSprite> {
  return Object.fromEntries(Object.keys(VEHICLES).map((kind) => [kind, placeholder(gl, kind)]));
}

/**
 * Swaps in the rendered sheets that are present (dev server only: they are rendered from
 * stand-in models and live in local-assets/, outside any build).
 */
export async function loadRenderedVehicles(gl: WebGL2RenderingContext, into: Record<string, VehicleSprite>): Promise<void> {
  await Promise.all(Object.keys(VEHICLES).map(async (kind) => {
    try {
      const base = `assets/local/traffic/${kind}/`;
      const response = await fetch(`${base}sheet.json`);
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return;
      const meta = (await response.json()) as VehicleSheetMeta;
      const image = await fetch(base + meta.image);
      if (!image.ok) return;
      const bitmap = await createImageBitmap(await image.blob(), { premultiplyAlpha: "premultiply" });
      into[kind] = { texture: createTexture(gl, bitmap), meta, sheetWidth: bitmap.width, sheetHeight: bitmap.height };
      bitmap.close();
    } catch {
      // keep the placeholder
    }
  }));
}

/** Texture rectangle of the frame nearest a sideways offset: metres from the camera to the vehicle, positive to the right. */
export function vehicleFrame(sprite: VehicleSprite, offset: number): { u0: number; v0: number; u1: number; v1: number } {
  const m = sprite.meta;
  let index = 0;
  for (let i = 1; i < m.offsets.length; i++) if (Math.abs(m.offsets[i] - offset) < Math.abs(m.offsets[index] - offset)) index = i;
  const x = (index % m.columns) * m.frameWidth;
  const y = Math.floor(index / m.columns) * m.frameHeight;
  return { u0: x / sprite.sheetWidth, v0: y / sprite.sheetHeight, u1: (x + m.frameWidth) / sprite.sheetWidth, v1: (y + m.frameHeight) / sprite.sheetHeight };
}
