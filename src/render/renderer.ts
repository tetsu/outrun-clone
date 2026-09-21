import { view } from "../game/camera";
import type { Game, RenderState } from "../game/game";
import { CRASH_ROLL, CRASH_SPIN } from "../sim/collision";
import { MAX_SPEED } from "../sim/player";
import { roadCentre } from "../sim/traffic";
import { roadUnder, SEGMENT_LENGTH } from "../sim/track";
import { BackgroundRenderer } from "./background";
import { carFrame, type CarSprite } from "./carSprite";
import {
  frameRect, nearestAngle, rollPose, spinYaw, thrownPerson,
  type CrashCarMeta, type CrashPeopleMeta, type Sheet,
} from "./crashSprite";
import { createTexture } from "./gl";
import { DAY_COAST, type Palette } from "./palette";
import { createSceneryAtlas, type SceneryAtlas } from "./placeholders";
import { RoadRenderer } from "./road";
import { fillRoadTable, fogAt, ROW_FLOATS, type ProjectedSegment, type ViewParams } from "./roadTable";
import { SpriteBatch } from "./sprites";
import { createPlaceholderVehicles, vehicleFrame, type VehicleSprite } from "./trafficSprite";
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
  /** Crash art, when present (see crashSprite.ts); without it a crash uses the driving frames. */
  crashCar: Sheet<CrashCarMeta> | null = null;
  crashPeople: Sheet<CrashPeopleMeta> | null = null;
  /** Traffic art by kind; placeholders until rendered sheets are swapped in. */
  readonly vehicles: Record<string, VehicleSprite>;
  /** The texture of the quads waiting in the sprite batch. */
  private batchTexture: WebGLTexture | null = null;

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
    this.vehicles = createPlaceholderVehicles(gl);
  }

  /** Quads are batched per texture: switching texture draws what is waiting first. */
  private use(texture: WebGLTexture): void {
    if (this.batchTexture && this.batchTexture !== texture) this.flush();
    this.batchTexture = texture;
  }

  private flush(): void {
    const gl = this.gl;
    if (this.batchTexture) this.sprites.flush(this.batchTexture, gl.drawingBufferWidth, gl.drawingBufferHeight, this.palette.fog);
    this.batchTexture = null;
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

    // Traffic goes in with the scenery by segment, far to near; vehicles nearer than the
    // player's car are drawn after it.
    const bySegment = new Map<number, RenderState["vehicles"]>();
    const inFront: RenderState["vehicles"] = [];
    for (const v of state.vehicles) {
      if (v.z - camera.z < view.distance) inFront.push(v);
      else {
        const index = Math.floor(v.z / SEGMENT_LENGTH);
        const list = bySegment.get(index) ?? [];
        list.push(v);
        bySegment.set(index, list);
      }
    }

    for (let i = projected.length - 1; i >= 0; i--) {
      const p = projected[i];
      if (p.segment.scenery.length > 0 && p.depth >= 1) {
        this.use(this.atlasTexture);
        for (const item of p.segment.scenery) {
          const art = this.atlas.items[item.kind];
          if (!art) continue;
          const w = art.width * p.scale;
          const h = art.height * p.scale;
          const onB = item.road === "b";
          // objects beside the branch not taken fade out with it
          const alpha = onB ? p.segment.fadeB1 : 1;
          if (alpha <= 0) continue;
          const x = (onB ? p.xB : p.x) + item.offset * p.scale - w / 2;
          if (x > width || x + w < 0) continue;
          this.sprites.quad(x, p.y - h, w, h, art.u0, art.v0, art.u1, art.v1, p.clipY, p.fog, alpha);
        }
      }
      const here = bySegment.get(p.segment.index);
      if (here) {
        here.sort((a, b) => b.z - a.z);
        for (const v of here) this.drawVehicle(game, v, camera, projected, i);
      }
    }
    this.flush();

    this.drawCar(game, state, camera, timeSeconds);

    inFront.sort((a, b) => b.z - a.z);
    for (const v of inFront) this.drawVehicle(game, v, camera, projected, -1);
    this.flush();
  }

  /**
   * One traffic vehicle, placed on its road between the edges of the segment it is in and
   * scaled for its distance. The frame is picked by how far to the side of the camera it is.
   */
  private drawVehicle(game: Game, v: RenderState["vehicles"][number], camera: ViewParams, projected: ProjectedSegment[], index: number): void {
    const depth = v.z - camera.z;
    if (depth < 1) return;
    const { width, focal } = camera;
    // The segment the vehicle is in, and the next one out, for where the road is on screen.
    let i = index;
    if (i < 0) {
      const segment = Math.floor(v.z / SEGMENT_LENGTH);
      i = projected.findIndex((p) => p.segment.index === segment);
      if (i < 0) return;
    }
    const near = projected[i];
    const far = projected[i + 1] ?? near;
    // screen positions are linear in 1/depth between the two edges
    const span = 1 / near.depth - 1 / far.depth;
    const t = span > 1e-9 ? Math.min(1, Math.max(0, (1 / near.depth - 1 / depth) / span)) : 0;
    const scale = focal / depth;
    const lateral = v.x - roadCentre(game.track, v.z, v.road);
    const nearX = (v.road === "b" ? near.xB : near.x) + lateral * near.scale;
    const farX = (v.road === "b" ? far.xB : far.x) + lateral * far.scale;
    const x = nearX + (farX - nearX) * t;
    const y = near.y + (far.y - near.y) * t;

    const sprite = this.vehicles[v.kind];
    if (!sprite) return;
    const m = sprite.meta;
    // The frame whose sides run the way the vehicle's lane runs on screen. A line along a
    // straight road x metres to the side runs x / (eye height) pixels across per pixel down;
    // in a bend or on a hill the lane runs another way, and the frame follows the lane.
    const rise = near.y - far.y;
    const offset = rise > 0.5 ? (view.height * (nearX - farX)) / rise : (x - width / 2) / scale;
    const f = vehicleFrame(sprite, offset);
    const k = scale / m.pixelsPerMetre;
    const w = m.frameWidth * k;
    if (x - m.anchorX * k > width || x - m.anchorX * k + w < 0) return;
    this.use(sprite.texture);
    this.sprites.quad(x - m.anchorX * k, y - m.anchorY * k, w, m.frameHeight * k, f.u0, f.v0, f.u1, f.v1,
      index < 0 ? NO_CLIP : near.clipY, fogAt(depth, camera.drawDistance), 1);
  }

  private drawCar(game: Game, state: RenderState, camera: ViewParams, time: number): void {
    const track = game.track;
    const { width, height, focal } = camera;
    const meta = this.car.meta;
    const speedRatio = state.speed / MAX_SPEED;

    // The car's own attitude: nose into the turn (more when the tail slides out), and tilted
    // with the slope it stands on relative to the camera, which pitches with the road.
    const curve = roadUnder(track, state.z, state.x).curve;
    // Full lock plus the tightest bend reaches the outermost frames (±24°).
    let yaw = state.steer * 17 * Math.min(1, speedRatio * 3) + curve * 1800 * speedRatio
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

    // A roll-over lifts the car off the road and throws the occupants out ahead of it.
    const rolling = state.crash === CRASH_ROLL ? rollPose(state.crashTime, state.crashDir) : null;
    const metre = focal / view.distance;
    const shadow = this.atlas.items.shadow;
    const shadowW = 2.9 * metre * (rolling ? 1 / (1 + rolling.lift * 0.3) : 1);
    this.sprites.quad(
      width / 2 - shadowW / 2, groundY - shadowW * 0.17, shadowW, shadowW * 0.42,
      shadow.u0, shadow.v0, shadow.u1, shadow.v1, NO_CLIP, 0, 0.8,
    );
    this.sprites.flush(this.atlasTexture, width, height, this.palette.fog);
    if (rolling) this.drawThrownPeople(game, state, camera);

    // Put back on the road after a crash, the car blinks while nothing can hit it.
    if (state.ghost > 0 && Math.floor(time * 12) % 2 === 1) return;

    const crash = this.crashCar;
    if (crash && (state.crash === CRASH_SPIN || rolling)) {
      // Crash frames are rendered at another resolution; place them by the same camera maths.
      const m = crash.meta;
      const cf = m.referenceScreenHeight / 2 / Math.tan((m.camera.vfovDeg * Math.PI) / 360);
      const k = (focal / cf) * (m.camera.distance / view.distance);
      let index: number;
      let x: number;
      let y: number;
      if (rolling) {
        index = m.roll.first + nearestAngle(m.roll.angles, rolling.roll);
        x = width / 2 - m.roll.pivotX * k;
        y = groundY - (m.roll.pivotHeight + rolling.lift) * metre - m.roll.pivotY * k;
      } else {
        index = m.spin.first + nearestAngle(m.spin.yaws, spinYaw(state.crashTime, state.crashDir));
        x = width / 2 - m.principalX * k;
        y = groundY - (m.principalY + (m.camera.height * cf) / m.camera.distance) * k;
      }
      const f = frameRect(crash, index);
      this.sprites.quad(x, y, m.frameWidth * k, m.frameHeight * k, f.u0, f.v0, f.u1, f.v1, NO_CLIP, 0, 1);
      this.sprites.flush(crash.texture, width, height, this.palette.fog);
      return;
    }

    // Without crash frames: the spin sweeps through the driving frames, the roll-over only lifts.
    if (state.crash === CRASH_SPIN) yaw = 24 * Math.sin((spinYaw(state.crashTime, state.crashDir) * Math.PI) / 180);
    const f = carFrame(this.car, yaw, pitch);
    this.sprites.quad(
      left, top - (rolling ? rolling.lift * metre : 0), meta.frameWidth * scale, meta.frameHeight * scale,
      f.u0, f.v0, f.u1, f.v1, NO_CLIP, 0, 1,
    );
    this.sprites.flush(this.car.texture, width, height, this.palette.fog);
  }

  /** The driver and the passenger, thrown out in a roll-over, then sitting on the road ahead. */
  private drawThrownPeople(game: Game, state: RenderState, camera: ViewParams): void {
    const sheet = this.crashPeople;
    if (!sheet) return;
    const m = sheet.meta;
    const { width, focal } = camera;
    // The driver sits on the left and is thrown that way; each lands a different distance ahead.
    const people: Array<[row: number, side: number, ahead: number]> = [
      [m.rows.indexOf("passenger"), 1, 10],
      [m.rows.indexOf("driver"), -1, 7],
    ];
    const cameraY = roadHeight(game.track, camera.z) + view.height;
    for (const [row, side, ahead] of people) {
      if (row < 0) continue;
      const p = thrownPerson(state.crashTime, side, ahead);
      const depth = view.distance + p.z;
      const scale = focal / depth;
      const x = width / 2 + p.x * scale;
      const y = camera.horizon! + (cameraY - roadHeight(game.track, state.z + p.z) - p.y) * scale;
      // they sit facing the camera, turned a little towards it
      const yawIndex = nearestAngle(m.yaws, (-Math.atan(p.x / depth) * 180) / Math.PI);
      const f = frameRect(sheet, row * m.columns + yawIndex);
      const k = scale / m.pixelsPerMetre;
      this.sprites.quad(x - m.anchorX * k, y - m.anchorY * k, m.frameWidth * k, m.frameHeight * k, f.u0, f.v0, f.u1, f.v1, NO_CLIP, 0, 1);
    }
    this.sprites.flush(sheet.texture, camera.width, camera.height, this.palette.fog);
  }
}
