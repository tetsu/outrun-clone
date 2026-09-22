import { createTexture } from "./gl";

/**
 * The crash sprites (dev server only for now: rendered from the stand-in models by
 * tools/blender/render_crash.py into local-assets/). Without them a crash is drawn with the
 * driving frames.
 */

/** local-assets/player-car/crash/sheet.json */
export interface CrashCarMeta {
  image: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  /** Rendered at half resolution: a frame is 1:1 on a screen this many pixels tall. */
  referenceScreenHeight: number;
  camera: { height: number; distance: number; vfovDeg: number };
  /** Where the camera's principal point sits relative to a frame's top-left, frame pixels. */
  principalX: number;
  principalY: number;
  /** The car turning on the road, occupants aboard; positive yaw turns the nose to the right. */
  spin: { first: number; yaws: number[] };
  /** The car rolling about its long axis through a pivot pivotHeight above the road, occupants
   *  gone; positive roll takes the roof to the right. pivotX/Y: the pivot in frame pixels. */
  roll: { first: number; angles: number[]; pivotHeight: number; pivotX: number; pivotY: number };
}

/** local-assets/crash-people/sheet.json: the occupants sitting on the road after being thrown out. */
export interface CrashPeopleMeta {
  image: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  /** One row per person. */
  rows: string[];
  /** 0 faces the camera; positive turns them to face the right of the screen. */
  yaws: number[];
  /** The road point under the hips, frame pixels, and the scale there, at the reference distance. */
  anchorX: number;
  anchorY: number;
  pixelsPerMetre: number;
}

export interface Sheet<M> {
  texture: WebGLTexture;
  meta: M;
  sheetWidth: number;
  sheetHeight: number;
}

export async function loadSheet<M extends { image: string }>(gl: WebGL2RenderingContext, base: string): Promise<Sheet<M> | null> {
  try {
    const response = await fetch(`${base}sheet.json`);
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return null;
    const meta = (await response.json()) as M;
    const image = await fetch(base + meta.image);
    if (!image.ok) return null;
    const bitmap = await createImageBitmap(await image.blob(), { premultiplyAlpha: "premultiply" });
    const sheet = { texture: createTexture(gl, bitmap), meta, sheetWidth: bitmap.width, sheetHeight: bitmap.height };
    bitmap.close();
    return sheet;
  } catch {
    return null;
  }
}

/** Texture rectangle of frame `index` in a sheet packed row by row. */
export function frameRect(sheet: Sheet<{ frameWidth: number; frameHeight: number; columns: number }>, index: number): { u0: number; v0: number; u1: number; v1: number } {
  const m = sheet.meta;
  const x = (index % m.columns) * m.frameWidth;
  const y = Math.floor(index / m.columns) * m.frameHeight;
  return { u0: x / sheet.sheetWidth, v0: y / sheet.sheetHeight, u1: (x + m.frameWidth) / sheet.sheetWidth, v1: (y + m.frameHeight) / sheet.sheetHeight };
}

/** Index of the value nearest to an angle in degrees, going round the circle. */
export function nearestAngle(values: number[], degrees: number): number {
  const d = (a: number): number => Math.abs((((a - degrees) % 360) + 540) % 360 - 180);
  let best = 0;
  for (let i = 1; i < values.length; i++) if (d(values[i]) < d(values[best])) best = i;
  return best;
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

/** The spin: two turns, fast at first, stopped after 1.7 s. Degrees of yaw. */
export function spinYaw(time: number, dir: number): number {
  return dir * 720 * easeOut(Math.min(1, time / 1.7));
}

/**
 * The roll-over: thrown up and over once in 1.25 s, then a small bounce. Returns the roll in
 * degrees and the height of the car above the road in metres.
 */
export function rollPose(time: number, dir: number): { roll: number; lift: number } {
  const air = 1.25;
  let lift = 0;
  if (time < air) lift = 2.6 * 4 * (time / air) * (1 - time / air);
  else if (time < air + 0.35) lift = 0.35 * Math.sin((Math.PI * (time - air)) / 0.35);
  return { roll: dir * 360 * ease(Math.min(1, time / air)), lift };
}

/**
 * Where an occupant is during a roll-over, relative to the car: thrown up out of the seat as the
 * car lifts, tumbling head over heels once through the air, landing on the road just ahead and to
 * their side with a small bounce, then sitting there dazed. Metres: sideways, ahead, up (of the
 * hips); `spin` is the tumble in radians, clockwise on screen (0 = upright).
 */
export function thrownPerson(time: number, side: number, ahead: number): { x: number; z: number; y: number; spin: number } {
  const from = 0.12;
  const land = 1.1;
  const seat = 0.9 + rollPose(from, 1).lift;
  if (time < from) return { x: side * 0.4, z: 0, y: 0.9 + rollPose(time, 1).lift, spin: 0 };
  const t = Math.min(1, (time - from) / (land - from));
  const after = time - land;
  const bounce = after > 0 && after < 0.3 ? 0.22 * Math.sin((Math.PI * after) / 0.3) : 0;
  return {
    x: side * (0.4 + 2.3 * easeOut(t)),
    z: ahead * easeOut(t),
    y: t < 1 ? seat * (1 - t) + 3.0 * 4 * t * (1 - t) : bounce,
    // each tumbles away from the car: the driver (on the left) turns anticlockwise
    spin: side * 2 * Math.PI * easeOut(t),
  };
}
