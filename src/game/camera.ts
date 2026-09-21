/**
 * The chase camera. tools/blender/render_car.py renders the car sprites with exactly these
 * numbers, so change them in both places together.
 */
export const CAMERA_HEIGHT = 2.0; // metres above the road
export const CAMERA_DISTANCE = 6.5; // metres behind the car's centre
export const VFOV_DEG = 60;

/** How far ahead the road is drawn, in metres. */
export const DRAW_DISTANCE = 1200;

/** Focal length in pixels for a screen of the given height. The vertical field of view is fixed. */
export function focalLength(screenHeight: number): number {
  return screenHeight / 2 / Math.tan((VFOV_DEG * Math.PI) / 360);
}
