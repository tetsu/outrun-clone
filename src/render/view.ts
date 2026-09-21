import { DRAW_DISTANCE, focalLength, view } from "../game/camera";
import { heightAt, wrapDistance, type Track } from "../sim/track";
import type { ViewParams } from "./roadTable";

/** Distance over which the camera averages the road's slope when it pitches with it, metres. */
const PITCH_SPAN = 30;

/** Road height at any distance, wrapping around a looping course. */
export function roadHeight(track: Track, z: number): number {
  return heightAt(track, wrapDistance(track, z));
}

/** The road's slope around a point, averaged over PITCH_SPAN. Positive is uphill. */
export function roadSlope(track: Track, z: number, span = PITCH_SPAN): number {
  return (roadHeight(track, z + span / 2) - roadHeight(track, z - span / 2)) / span;
}

/**
 * Where the chase camera is for a car at (carZ, carX): trailing it at the tuned distance and
 * height, pitched with the road by `view.pitchFollow`. `shake` moves the view up or down, in
 * screen heights.
 */
export function placeCamera(track: Track, carZ: number, carX: number, width: number, height: number, shake = 0): ViewParams {
  const focal = focalLength(height);
  const z = wrapDistance(track, carZ - view.distance);
  // Pitching up (uphill) turns the view upwards, so the world and the horizon move down the screen.
  const pitch = roadSlope(track, carZ) * view.pitchFollow;
  return {
    width,
    height,
    focal,
    z,
    x: carX,
    y: roadHeight(track, z) + view.height,
    drawDistance: DRAW_DISTANCE,
    horizon: height / 2 + focal * pitch + shake * height,
    curveModel: view.curveModel,
    curveGain: view.curveGain,
    curveLookahead: view.curveLookahead,
    eyeHeight: view.height,
  };
}
