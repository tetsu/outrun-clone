import { hex, type Rgb } from "./gl";

/** Every colour a stage needs. Stages swap palettes; nothing else in the renderer holds colours. */
export interface Palette {
  skyTop: Rgb;
  skyHorizon: Rgb;
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
}

export const DAY_COAST: Palette = {
  skyTop: hex(0x1668d8),
  skyHorizon: hex(0xbfe4ff),
  sun: hex(0xfff6d8),
  farHills: hex(0x7fa6c9),
  nearHills: hex(0x3f8f5a),
  ground: hex(0x79b46a),
  fog: hex(0xc9e6fb),
  grassLight: hex(0x58b04a),
  grassDark: hex(0x4aa13f),
  roadLight: hex(0x6f7078),
  roadDark: hex(0x686970),
  rumbleA: hex(0xe03a2e),
  rumbleB: hex(0xf4f4f4),
  line: hex(0xf8f8f8),
};
