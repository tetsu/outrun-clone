import { view } from "../game/camera";
import { createProgram, FULLSCREEN_VERTEX, uniforms } from "./gl";
import type { Palette } from "./palette";
import { ROW_FLOATS } from "./roadTable";

/** Lane dashes repeat every this many metres (a divisor of LOOP_MULTIPLE, so the loop seam is clean). */
const DASH_PERIOD = 12;

/**
 * Draws the road from the per-scanline table. The CPU decides where the road is on each
 * row; this shader only colours pixels, anti-aliasing every edge so it holds up at 4K.
 */
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uRows;
uniform float uHeight;
uniform float uBand;        // metres per stripe band
uniform float uDash;        // metres per lane-dash period
uniform float uLanes;
uniform vec3 uGrassLight, uGrassDark, uRoadLight, uRoadDark, uRumbleA, uRumbleB, uLine, uFog;
out vec4 outColor;

// 1 inside [a, b], 0 outside, with edges softened over w
float band(float v, float a, float b, float w) {
  return smoothstep(a - w, a + w, v) - smoothstep(b - w, b + w, v);
}

void main() {
  int row = int(uHeight - gl_FragCoord.y);
  vec4 r0 = texelFetch(uRows, ivec2(0, row), 0);
  if (r0.a < 0.5) discard;
  vec4 r1 = texelFetch(uRows, ivec2(1, row), 0);
  float halfWidth = r0.y;
  float dist = r0.z;
  float perRow = r1.y;

  // u: -1 and 1 are the road edges. One pixel covers 1/halfWidth in u.
  float u = (gl_FragCoord.x - r0.x) / halfWidth;
  float au = abs(u);
  float px = 0.75 / halfWidth;

  // Alternating bands along the road. Where a band is thinner than a pixel row, fade to
  // the average so the distance shimmers less.
  float phase = fract(dist / (2.0 * uBand));
  float w = perRow / (2.0 * uBand) * 0.5;
  float light = band(phase, 0.0, 0.5, w) + smoothstep(1.0 - w, 1.0 + w, phase);
  light = mix(light, 0.5, clamp((w - 0.1) / 0.3, 0.0, 1.0));

  vec3 color = mix(uGrassDark, uGrassLight, light);
  vec3 rumble = mix(uRumbleA, uRumbleB, light);
  color = mix(color, rumble, 1.0 - smoothstep(1.13 - px, 1.13 + px, au));
  vec3 road = mix(uRoadDark, uRoadLight, light);
  color = mix(color, road, 1.0 - smoothstep(1.0 - px, 1.0 + px, au));

  // solid edge lines
  float lines = band(au, 0.925, 0.955, px);
  // dashed lane lines: painted for the first 40% of each dash period
  float dashPhase = fract(dist / uDash);
  float dw = perRow / uDash * 0.5;
  float dash = band(dashPhase, 0.0, 0.4, dw);
  dash = mix(dash, 0.4, clamp((dw - 0.1) / 0.3, 0.0, 1.0));
  for (float i = 1.0; i < uLanes; i += 1.0) {
    float centre = -1.0 + 2.0 * i / uLanes;
    lines = max(lines, band(u, centre - 0.011, centre + 0.011, px) * dash);
  }
  color = mix(color, uLine, lines * (1.0 - smoothstep(1.0, 1.0 + px, au)));

  outColor = vec4(mix(color, uFog, r1.x), 1.0);
}`;

const UNIFORMS = [
  "uRows", "uHeight", "uBand", "uDash", "uLanes",
  "uGrassLight", "uGrassDark", "uRoadLight", "uRoadDark", "uRumbleA", "uRumbleB", "uLine", "uFog",
] as const;

export class RoadRenderer {
  private readonly program: WebGLProgram;
  private readonly u: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  private readonly texture: WebGLTexture;
  private textureHeight = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    this.u = uniforms(gl, this.program, UNIFORMS);
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  draw(rows: Float32Array, height: number, lanes: number, palette: Palette): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const data = rows.subarray(0, height * ROW_FLOATS);
    if (height !== this.textureHeight) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ROW_FLOATS / 4, height, 0, gl.RGBA, gl.FLOAT, data);
      this.textureHeight = height;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ROW_FLOATS / 4, height, gl.RGBA, gl.FLOAT, data);
    }

    gl.useProgram(this.program);
    gl.uniform1i(this.u.uRows, 0);
    gl.uniform1f(this.u.uHeight, height);
    gl.uniform1f(this.u.uBand, view.stripeLength);
    gl.uniform1f(this.u.uDash, DASH_PERIOD);
    gl.uniform1f(this.u.uLanes, lanes);
    gl.uniform3fv(this.u.uGrassLight, palette.grassLight);
    gl.uniform3fv(this.u.uGrassDark, palette.grassDark);
    gl.uniform3fv(this.u.uRoadLight, palette.roadLight);
    gl.uniform3fv(this.u.uRoadDark, palette.roadDark);
    gl.uniform3fv(this.u.uRumbleA, palette.rumbleA);
    gl.uniform3fv(this.u.uRumbleB, palette.rumbleB);
    gl.uniform3fv(this.u.uLine, palette.line);
    gl.uniform3fv(this.u.uFog, palette.fog);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
