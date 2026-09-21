import { CAMERA_DISTANCE, CAMERA_HEIGHT, VFOV_DEG } from "../game/camera";
import { createTexture } from "./gl";
import { createPlaceholderCar } from "./placeholders";

/** Written by tools/blender/render_car.py next to the sheet image. */
interface SheetMeta {
  image: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  yaws: number[];
  pitches: number[];
  /** Where the view's principal point sits relative to the frame's top-left, in frame pixels. */
  principalX: number;
  principalY: number;
  referenceScreenHeight: number;
  camera: { height: number; distance: number; vfovDeg: number };
}

export interface CarSprite {
  texture: WebGLTexture;
  meta: SheetMeta;
  sheetWidth: number;
  sheetHeight: number;
}

const LOCAL_SHEET = "assets/local/player-car/";

/** A car drawn in code. Always available, so the game never waits on art to start. */
export function createPlaceholderCarSprite(gl: WebGL2RenderingContext): CarSprite {
  const frameWidth = 1024;
  const frameHeight = 576;
  const meta: SheetMeta = {
    image: "",
    frameWidth,
    frameHeight,
    columns: 1,
    yaws: [0],
    pitches: [0],
    principalX: frameWidth / 2,
    principalY: -60,
    referenceScreenHeight: 1440,
    camera: { height: CAMERA_HEIGHT, distance: CAMERA_DISTANCE, vfovDeg: VFOV_DEG },
  };
  const texture = createTexture(gl, createPlaceholderCar(frameWidth, frameHeight));
  return { texture, meta, sheetWidth: frameWidth, sheetHeight: frameHeight };
}

/**
 * Loads the rendered sprite sheet if one is present; resolves to null otherwise. Rendered
 * sheets of stand-in models live outside git, so a fresh checkout has none.
 *
 * The image goes through createImageBitmap rather than HTMLImageElement.decode(): decode()
 * can stall indefinitely in a tab the browser is not painting, and this sheet is large.
 */
export async function loadRenderedCarSprite(gl: WebGL2RenderingContext): Promise<CarSprite | null> {
  try {
    const response = await fetch(`${LOCAL_SHEET}sheet.json`);
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return null;
    const meta = (await response.json()) as SheetMeta;
    const imageResponse = await fetch(LOCAL_SHEET + meta.image);
    if (!imageResponse.ok) return null;
    const bitmap = await createImageBitmap(await imageResponse.blob(), { premultiplyAlpha: "premultiply" });
    const c = meta.camera;
    if (c.height !== CAMERA_HEIGHT || c.distance !== CAMERA_DISTANCE || c.vfovDeg !== VFOV_DEG) {
      console.warn("car sprite sheet was rendered for a different camera; re-run tools/blender/render_car.py");
    }
    const sprite = { texture: createTexture(gl, bitmap), meta, sheetWidth: bitmap.width, sheetHeight: bitmap.height };
    bitmap.close();
    return sprite;
  } catch {
    return null;
  }
}

function nearestIndex(values: number[], target: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i] - target) < Math.abs(values[best] - target)) best = i;
  }
  return best;
}

/** Texture rectangle (v from the top) of the frame closest to the given attitude, in degrees. */
export function carFrame(sprite: CarSprite, yawDeg: number, pitchDeg: number): { u0: number; v0: number; u1: number; v1: number } {
  const m = sprite.meta;
  const index = nearestIndex(m.pitches, pitchDeg) * m.yaws.length + nearestIndex(m.yaws, yawDeg);
  const x = (index % m.columns) * m.frameWidth;
  const y = Math.floor(index / m.columns) * m.frameHeight;
  return {
    u0: x / sprite.sheetWidth,
    v0: y / sprite.sheetHeight,
    u1: (x + m.frameWidth) / sprite.sheetWidth,
    v1: (y + m.frameHeight) / sprite.sheetHeight,
  };
}
