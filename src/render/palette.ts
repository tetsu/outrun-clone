import { hex, type Rgb } from "./gl";

/** Every colour a stage needs. Stages pick a palette by time of day; nothing else in the renderer holds colours. */
export interface Palette {
  skyTop: Rgb;
  skyHorizon: Rgb;
  /** The sun by day, the moon at night. */
  sun: Rgb;
  farHills: Rgb;
  nearHills: Rgb;
  ground: Rgb;
  fog: Rgb;
  grassLight: Rgb;
  grassDark: Rgb;
  roadLight: Rgb;
  roadDark: Rgb;
  rumbleA: Rgb;
  rumbleB: Rgb;
  line: Rgb;
  /** The light on sprites (cars, trees), multiplied in: white by day, warm at sunset, dim blue at night. */
  tint: Rgb;
}

/** Times of day a stage can be lit by (`light` in the stage file). */
export type Light = "sunrise" | "morning" | "midday" | "afternoon" | "sunset" | "dusk" | "night";

const palette = (colours: Record<keyof Palette, number>): Palette =>
  Object.fromEntries(Object.entries(colours).map(([k, v]) => [k, hex(v)])) as unknown as Palette;

export const PALETTES: Record<Light, Palette> = {
  sunrise: palette({
    skyTop: 0x3a5ec8, skyHorizon: 0xffb37a, sun: 0xfff1c0, farHills: 0x8a7aa8, nearHills: 0x4f7a58, ground: 0x8aa86a,
    fog: 0xf2c9a8, grassLight: 0x6aa552, grassDark: 0x5c9546, roadLight: 0x6c6a72, roadDark: 0x64626a,
    rumbleA: 0xd9392e, rumbleB: 0xf2e6d8, line: 0xf5efe4, tint: 0xffe0c8,
  }),
  morning: palette({
    skyTop: 0x1e6fd6, skyHorizon: 0xc8e8ff, sun: 0xfff8e0, farHills: 0x86adcf, nearHills: 0x428f5c, ground: 0x7ab56c,
    fog: 0xcfe8fb, grassLight: 0x5ab34c, grassDark: 0x4ca340, roadLight: 0x707179, roadDark: 0x68696f,
    rumbleA: 0xe03a2e, rumbleB: 0xf4f4f4, line: 0xf8f8f8, tint: 0xffffff,
  }),
  midday: palette({
    skyTop: 0x1668d8, skyHorizon: 0xbfe4ff, sun: 0xfff6d8, farHills: 0x7fa6c9, nearHills: 0x3f8f5a, ground: 0x79b46a,
    fog: 0xc9e6fb, grassLight: 0x58b04a, grassDark: 0x4aa13f, roadLight: 0x6f7078, roadDark: 0x686970,
    rumbleA: 0xe03a2e, rumbleB: 0xf4f4f4, line: 0xf8f8f8, tint: 0xffffff,
  }),
  afternoon: palette({
    skyTop: 0x2a62c4, skyHorizon: 0xd8dcc8, sun: 0xfff0c0, farHills: 0x8f9ab8, nearHills: 0x4a8a52, ground: 0x8fae5c,
    fog: 0xe0d8c0, grassLight: 0x66a848, grassDark: 0x58983c, roadLight: 0x727074, roadDark: 0x6a686c,
    rumbleA: 0xd83a2e, rumbleB: 0xf0e8d8, line: 0xf4ecd8, tint: 0xfff0d8,
  }),
  sunset: palette({
    skyTop: 0x3a3f9a, skyHorizon: 0xff9a5a, sun: 0xffd090, farHills: 0x6b4f7a, nearHills: 0x3e5a46, ground: 0x7a7a4e,
    fog: 0xf0a878, grassLight: 0x5a8a3e, grassDark: 0x4c7a34, roadLight: 0x5e5860, roadDark: 0x565058,
    rumbleA: 0xc8382e, rumbleB: 0xe8d0b8, line: 0xecd8c0, tint: 0xffc8a0,
  }),
  dusk: palette({
    skyTop: 0x141e5c, skyHorizon: 0xd06a6a, sun: 0xffb080, farHills: 0x3e3a68, nearHills: 0x2c4a3c, ground: 0x4e5e44,
    fog: 0xb07088, grassLight: 0x3e6a34, grassDark: 0x34582c, roadLight: 0x46444e, roadDark: 0x3e3c46,
    rumbleA: 0xa02c26, rumbleB: 0xc0a8a0, line: 0xd0c0b8, tint: 0xc8a0b0,
  }),
  night: palette({
    skyTop: 0x060a2a, skyHorizon: 0x1e2a6a, sun: 0xe8ecff, farHills: 0x121a3e, nearHills: 0x12281c, ground: 0x1e2e22,
    fog: 0x1c2450, grassLight: 0x1e3a22, grassDark: 0x18321c, roadLight: 0x2a2c36, roadDark: 0x24262e,
    rumbleA: 0x6a2020, rumbleB: 0x8a8a90, line: 0xa0a4b0, tint: 0x6070a0,
  }),
};

export const LIGHTS = Object.keys(PALETTES) as Light[];
export const DEFAULT_LIGHT: Light = "midday";

/** A palette part way (`t` 0..1) from `a` to `b`, for the shift between stages. */
export function mixPalette(a: Palette, b: Palette, t: number): Palette {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = {} as Record<keyof Palette, Rgb>;
  for (const key of Object.keys(a) as Array<keyof Palette>) {
    const p = a[key];
    const q = b[key];
    out[key] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  }
  return out;
}
