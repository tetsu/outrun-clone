import { createProgram, uniforms, type Rgb } from "./gl";

const VERTEX = `#version 300 es
layout(location = 0) in vec2 aPos;      // top-down screen pixels
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec3 aExtra;    // clip row, fog, alpha
uniform vec2 uSize;
out vec2 vUv;
out vec3 vExtra;
void main() {
  vUv = aUv;
  vExtra = aExtra;
  gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform vec2 uSize;
uniform vec3 uFog;
uniform vec3 uTint;
in vec2 vUv;
in vec3 vExtra;
out vec4 outColor;
void main() {
  // rows at or below the clip row are hidden behind nearer road
  if (uSize.y - gl_FragCoord.y >= vExtra.x) discard;
  vec4 c = texture(uTexture, vUv) * vExtra.z;          // premultiplied alpha
  outColor = vec4(mix(c.rgb * uTint, uFog * c.a, vExtra.y), c.a);
}`;

const FLOATS_PER_VERTEX = 7;
const WHITE: Rgb = [1, 1, 1];
const MAX_QUADS = 4096;

/** Textured quads in top-down pixel coordinates, batched into one draw call per texture. */
export class SpriteBatch {
  private readonly program: WebGLProgram;
  private readonly u: Record<"uSize" | "uTexture" | "uFog" | "uTint", WebGLUniformLocation | null>;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly data = new Float32Array(MAX_QUADS * 6 * FLOATS_PER_VERTEX);
  private count = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, VERTEX, FRAGMENT);
    this.u = uniforms(gl, this.program, ["uSize", "uTexture", "uFog", "uTint"] as const);
    this.vao = gl.createVertexArray()!;
    this.buffer = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 16);
    gl.bindVertexArray(null);
  }

  /** `u0..v1` are texture coordinates with v measured from the top of the image. */
  quad(
    x: number, y: number, w: number, h: number,
    u0: number, v0: number, u1: number, v1: number,
    clipRow: number, fog: number, alpha: number,
  ): void {
    if (this.count >= MAX_QUADS) return;
    const d = this.data;
    let o = this.count * 6 * FLOATS_PER_VERTEX;
    const put = (px: number, py: number, pu: number, pv: number): void => {
      d[o++] = px; d[o++] = py; d[o++] = pu; d[o++] = pv; d[o++] = clipRow; d[o++] = fog; d[o++] = alpha;
    };
    put(x, y, u0, v0); put(x + w, y, u1, v0); put(x, y + h, u0, v1);
    put(x + w, y, u1, v0); put(x + w, y + h, u1, v1); put(x, y + h, u0, v1);
    this.count++;
  }

  /** Draws what has been queued: hazed towards `fog` by each quad's fog, lit by `tint`. */
  flush(texture: WebGLTexture, width: number, height: number, fog: Rgb, tint: Rgb = WHITE): void {
    if (this.count === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform2f(this.u.uSize, width, height);
    gl.uniform3fv(this.u.uFog, fog);
    gl.uniform3fv(this.u.uTint, tint);
    gl.uniform1i(this.u.uTexture, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * 6 * FLOATS_PER_VERTEX));
    gl.drawArrays(gl.TRIANGLES, 0, this.count * 6);
    gl.bindVertexArray(null);
    this.count = 0;
  }
}
