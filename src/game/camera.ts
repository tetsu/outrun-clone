/**
 * The chase camera and how the road is drawn.
 *
 * The camera defaults are what tools/blender/render_car.py renders the car sprites with
 * (CAMERA_HEIGHT and VFOV_DEG in sprite_common.py, CAMERA_DISTANCE in render_car.py). Change
 * them there too and re-render; until then the renderer only scales the car to fit.
 *
 * `view` is live: the development tuning panel changes it while the game runs.
 */
export type CurveModel = "projected" | "arcade";

export interface ViewTuning {
  /** Metres above the road. */
  height: number;
  /** Metres behind the car's centre. */
  distance: number;
  vfovDeg: number;
  /** How far the camera pitches with the road's slope: 0 always level, 1 along the road. */
  pitchFollow: number;
  /** How bends are drawn; see fillRoadTable. */
  curveModel: CurveModel;
  /** Arcade model only: how strongly a bend sweeps the road across the screen. */
  curveGain: number;
  /** Length of one light or dark band of the road and verge, metres. Must divide 18. */
  stripeLength: number;
}

export const DEFAULT_VIEW: Readonly<ViewTuning> = {
  height: 1.6,
  distance: 6.0,
  vfovDeg: 60,
  pitchFollow: 0.5,
  curveModel: "arcade",
  curveGain: 1400,
  stripeLength: 9,
};

export const view: ViewTuning = { ...DEFAULT_VIEW };

/** Stripe lengths that keep the stripes seamless where a looping course closes. */
export const STRIPE_LENGTHS = [3, 4.5, 6, 9];

/** How far ahead the road is drawn, in metres. */
export const DRAW_DISTANCE = 1200;

/** Focal length in pixels for a screen of the given height. The vertical field of view is fixed. */
export function focalLength(screenHeight: number, vfovDeg = view.vfovDeg): number {
  return screenHeight / 2 / Math.tan((vfovDeg * Math.PI) / 360);
}
