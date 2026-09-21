import { view } from "../game/camera";
import type { Game, RenderState } from "../game/game";
import { MAX_SPEED } from "../sim/player";
import { segmentAt } from "../sim/track";
import { BackgroundRenderer } from "./background";
import { carFrame, type CarSprite } from "./carSprite";
import { createTexture } from "./gl";
import { DAY_COAST, type Palette } from "./palette";
import { createSceneryAtlas, type SceneryAtlas } from "./placeholders";
import { RoadRenderer } from "./road";
import { fillRoadTable, ROW_FLOATS, type ViewParams } from "./roadTable";
import { SpriteBatch } from "./sprites";
import { placeCamera, roadHeight, roadSlope } from "./view";

const NO_CLIP = 1e9;

/** Extra nose-in yaw of the car sprite at full slide, degrees: the tail steps out. */
const SKID_YAW = 7;
/** Camera shake off the road at top speed, screen heights. */
const OFFROAD_SHAKE = 0.006;

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
    const track = game.track;
    gl.viewport(0, 0, width, height);

    if (this.rows.length < height * ROW_FLOATS) this.rows = new Float32Array(height * ROW_FLOATS);

    // Off the road the whole view judders; the camera trails the car and pitches with the road.
    const speedRatio = state.speed / MAX_SPEED;
    const shake = state.offroad
      ? Math.sin(timeSeconds * 53) * Math.sin(timeSeconds * 29) * OFFROAD_SHAKE * speedRatio
      : 0;
    const camera = placeCamera(track, state.z, state.x, width, height, shake);
    const projected = fillRoadTable(track, camera, this.rows);

    this.background.draw(width, height, camera.horizon!, state.backgroundScroll, this.palette);
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

    this.drawCar(game, state, camera, timeSeconds);
  }

  private drawCar(game: Game, state: RenderState, camera: ViewParams, time: number): void {
    const track = game.track;
    const { width, height, focal } = camera;
    const meta = this.car.meta;
    const speedRatio = state.speed / MAX_SPEED;

    // The car's own attitude: nose into the turn (more when the tail slides out), and tilted
    // with the slope it stands on relative to the camera, which pitches with the road.
    const curve = segmentAt(track, state.z).curve;
    // Full lock plus the tightest bend reaches the outermost frames (±24°).
    const yaw = state.steer * 17 * Math.min(1, speedRatio * 3) + curve * 1800 * speedRatio
      + Math.sign(state.steer) * state.skid * SKID_YAW;
    const carSlope = (roadHeight(track, state.z + 2) - roadHeight(track, state.z - 2)) / 4;
    const cameraPitch = Math.atan(roadSlope(track, state.z) * view.pitchFollow);
    const pitch = ((Math.atan(carSlope) - cameraPitch) * 180) / Math.PI;

    // Where the road under the car sits on screen. On the flat this is where the sprite
    // was rendered; on a slope the car rides up or down with the road.
    const rise = roadHeight(track, state.z) - roadHeight(track, camera.z);
    const groundY = camera.horizon! + ((view.height - rise) * focal) / view.distance;
    const rough = state.offroad ? 1 : 0.18;
    const bounce = Math.sin(time * 47) * Math.sin(time * 31) * rough * speedRatio * height * 0.004;

    // The sheet was rendered with its own camera; scale and place it so its ground point lands
    // on ours. Exact when the cameras match, an approximation while the tuning panel differs.
    const c = meta.camera;
    const sheetFocal = meta.referenceScreenHeight / 2 / Math.tan((c.vfovDeg * Math.PI) / 360);
    const scale = (focal / sheetFocal) * (c.distance / view.distance);
    const sheetGround = meta.principalY + (c.height * sheetFocal) / c.distance;
    const left = width / 2 - meta.principalX * scale;
    const top = groundY - sheetGround * scale + bounce;

    const shadow = this.atlas.items.shadow;
    const shadowW = 2.9 * (focal / view.distance);
    this.sprites.quad(
      width / 2 - shadowW / 2, groundY - shadowW * 0.17, shadowW, shadowW * 0.42,
      shadow.u0, shadow.v0, shadow.u1, shadow.v1, NO_CLIP, 0, 0.8,
    );
    this.sprites.flush(this.atlasTexture, width, height, this.palette.fog);

    const f = carFrame(this.car, yaw, pitch);
    this.sprites.quad(
      left, top, meta.frameWidth * scale, meta.frameHeight * scale,
      f.u0, f.v0, f.u1, f.v1, NO_CLIP, 0, 1,
    );
    this.sprites.flush(this.car.texture, width, height, this.palette.fog);
  }
}
