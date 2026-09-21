import { createProgram, FULLSCREEN_VERTEX, uniforms } from "./gl";
import type { Palette } from "./palette";

/**
 * Sky, sun, two ranges of hills and the far ground, all computed per pixel so they are
 * sharp at any resolution. The hills slide sideways as the road bends.
 */
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uSize;
uniform float uHorizon;     // pixels from the top
uniform float uScroll;      // sideways scroll, in screen heights
uniform vec3 uSkyTop, uSkyHorizon, uSun, uFarHills, uNearHills, uGround, uFog;
out vec4 outColor;

float ridge(float x, float seed) {
  return 0.5 + 0.28 * sin(x * 1.7 + seed) + 0.16 * sin(x * 4.3 + seed * 2.1) + 0.06 * sin(x * 11.0 + seed * 3.7);
}

void main() {
  float y = uSize.y - gl_FragCoord.y;                 // top-down pixels
  float up = (uHorizon - y) / uSize.y;                // screen heights above the horizon
  float x = (gl_FragCoord.x - uSize.x * 0.5) / uSize.y;
  float px = 1.0 / uSize.y;

  vec3 color = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.55, up));

  vec2 sunPos = vec2(0.42 - uScroll * 0.15, 0.30);
  float d = length(vec2(x, up) - sunPos);
  color = mix(color, uSun, 0.55 * exp(-d * 9.0));
  color = mix(color, uSun, 1.0 - smoothstep(0.035 - px, 0.035 + px, d));

  float far = 0.035 + 0.075 * ridge((x + uScroll * 0.35) * 2.2, 1.3);
  color = mix(color, mix(uFarHills, uFog, 0.35), 1.0 - smoothstep(far - px, far + px, up));
  float near = 0.008 + 0.045 * ridge((x + uScroll * 0.7) * 3.4, 4.1);
  color = mix(color, mix(uNearHills, uFog, 0.25), 1.0 - smoothstep(near - px, near + px, up));

  // below the horizon: far ground, seen wherever a crest hides the road
  vec3 ground = mix(uFog, uGround, smoothstep(0.0, 0.12, -up));
  color = mix(color, ground, 1.0 - smoothstep(-px, px, up));

  outColor = vec4(color, 1.0);
}`;

const UNIFORMS = [
  "uSize", "uHorizon", "uScroll",
  "uSkyTop", "uSkyHorizon", "uSun", "uFarHills", "uNearHills", "uGround", "uFog",
] as const;

export class BackgroundRenderer {
  private readonly program: WebGLProgram;
  private readonly u: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    this.u = uniforms(gl, this.program, UNIFORMS);
  }

  draw(width: number, height: number, horizon: number, scroll: number, palette: Palette): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform2f(this.u.uSize, width, height);
    gl.uniform1f(this.u.uHorizon, horizon);
    gl.uniform1f(this.u.uScroll, scroll);
    gl.uniform3fv(this.u.uSkyTop, palette.skyTop);
    gl.uniform3fv(this.u.uSkyHorizon, palette.skyHorizon);
    gl.uniform3fv(this.u.uSun, palette.sun);
    gl.uniform3fv(this.u.uFarHills, palette.farHills);
    gl.uniform3fv(this.u.uNearHills, palette.nearHills);
    gl.uniform3fv(this.u.uGround, palette.ground);
    gl.uniform3fv(this.u.uFog, palette.fog);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
