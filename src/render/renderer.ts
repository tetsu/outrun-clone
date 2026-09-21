import { CAMERA_DISTANCE, CAMERA_HEIGHT, DRAW_DISTANCE, focalLength } from "../game/camera";
import type { Game, RenderState } from "../game/game";
import { MAX_SPEED } from "../sim/player";
import { segmentAt, wrapDistance } from "../sim/track";
import { BackgroundRenderer } from "./background";
import { carFrame, type CarSprite } from "./carSprite";
import { createTexture } from "./gl";
import { DAY_COAST, type Palette } from "./palette";
import { createSceneryAtlas, type SceneryAtlas } from "./placeholders";
import { RoadRenderer } from "./road";
import { fillRoadTable, ROW_FLOATS } from "./roadTable";
import { SpriteBatch } from "./sprites";

const NO_CLIP = 1e9;

export class Renderer {
  palette: Palette = DAY_COAST;

  private readonly background: BackgroundRenderer;
  private readonly road: RoadRenderer;
  private readonly sprites: SpriteBatch;
  private readonly atlas: SceneryAtlas;
  private readonly atlasTexture: WebGLTexture;
  private rows = new Float32Array(0);

  constructor(
    private readonly gl: WebGL2RenderingContext,
    /** Replaceable: the game starts on a placeholder and swaps in rendered art when it arrives. */
    public car: CarSprite,
  ) {
    this.background = new BackgroundRenderer(gl);
    this.road = new RoadRenderer(gl);
    this.sprites = new SpriteBatch(gl);
    this.atlas = createSceneryAtlas();
    this.atlasTexture = createTexture(gl, this.atlas.canvas);
  }

  draw(game: Game, state: RenderState, timeSeconds: number): void {
    const gl = this.gl;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const focal = focalLength(height);
    const track = game.track;
    gl.viewport(0, 0, width, height);

    if (this.rows.length < height * ROW_FLOATS) this.rows = new Float32Array(height * ROW_FLOATS);

    // The camera trails the car, level, at a fixed height above the road beneath it.
    const cameraZ = wrapDistance(track, state.z - CAMERA_DISTANCE);
    const cameraY = game.roadHeight(cameraZ) + CAMERA_HEIGHT;
    const projected = fillRoadTable(
      track,
      { width, height, focal, z: cameraZ, x: state.x, y: cameraY, drawDistance: DRAW_DISTANCE },
      this.rows,
    );

    this.background.draw(width, height, height / 2, state.backgroundScroll, this.palette);
    this.road.draw(this.rows, height, track.lanes, this.palette);

    // scenery, far to near
    for (let i = projected.length - 1; i >= 0; i--) {
      const p = projected[i];
      if (p.segment.scenery.length === 0 || p.depth < 1) continue;
      for (const item of p.segment.scenery) {
        const art = this.atlas.items[item.kind];
        if (!art) continue;
        const w = art.width * p.scale;
        const h = art.height * p.scale;
        const x = p.x + item.offset * p.scale - w / 2;
        if (x > width || x + w < 0) continue;
        this.sprites.quad(x, p.y - h, w, h, art.u0, art.v0, art.u1, art.v1, p.clipY, p.fog, 1);
      }
    }
    this.sprites.flush(this.atlasTexture, width, height, this.palette.fog);

    this.drawCar(game, state, width, height, focal, timeSeconds);
  }

  private drawCar(game: Game, state: RenderState, width: number, height: number, focal: number, time: number): void {
    const track = game.track;
    const meta = this.car.meta;
    const speedRatio = state.speed / MAX_SPEED;

    // The car's own attitude: nose into the turn, and tilted with the slope it stands on
    // relative to the level camera.
    const curve = segmentAt(track, state.z).curve;
    const yaw = state.steer * 13 * Math.min(1, speedRatio * 3) + curve * 1800 * speedRatio;
    const slope = (game.roadHeight(state.z + 2) - game.roadHeight(state.z - 2)) / 4;
    const pitch = (Math.atan(slope) * 180) / Math.PI;

    // Where the road under the car sits on screen. On the flat this is where the sprite
    // was rendered; on a slope the car rides up or down with the road.
    const cameraZ = state.z - CAMERA_DISTANCE;
    const rise = game.roadHeight(state.z) - game.roadHeight(cameraZ);
    const shiftY = (-rise * focal) / CAMERA_DISTANCE;
    const rough = state.offroad ? 1 : 0.18;
    const bounce = Math.sin(time * 47) * Math.sin(time * 31) * rough * speedRatio * height * 0.004;

    const scale = height / meta.referenceScreenHeight;
    const principalX = width / 2;
    const principalY = height / 2 + shiftY + bounce;
    const groundY = height / 2 + (CAMERA_HEIGHT * focal) / CAMERA_DISTANCE + shiftY;

    const shadow = this.atlas.items.shadow;
    const shadowW = 2.9 * (focal / CAMERA_DISTANCE);
    this.sprites.quad(
      principalX - shadowW / 2, groundY - shadowW * 0.17, shadowW, shadowW * 0.42,
      shadow.u0, shadow.v0, shadow.u1, shadow.v1, NO_CLIP, 0, 0.8,
    );
    this.sprites.flush(this.atlasTexture, width, height, this.palette.fog);

    const f = carFrame(this.car, yaw, pitch);
    this.sprites.quad(
      principalX - meta.principalX * scale, principalY - meta.principalY * scale,
      meta.frameWidth * scale, meta.frameHeight * scale,
      f.u0, f.v0, f.u1, f.v1, NO_CLIP, 0, 1,
    );
    this.sprites.flush(this.car.texture, width, height, this.palette.fog);
  }
}
