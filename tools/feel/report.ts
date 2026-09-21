/**
 * Prints the feel report for the test course.
 *
 *   npm run feel                      the tuning in the code
 *   npm run feel -- '<json>'          with trial values on top, for example
 *   npm run feel -- '{"handling":{"accelLow":9.5},"view":{"pitchFollow":0.5}}'
 *
 * The JSON has the same shape as the tuning panel's "Copy values".
 */
import stage from "../../src/data/stages/test-course.json";
import { formatFeel, measureFeel } from "../../src/dev/feel";
import { applyTuning } from "../../src/dev/tuning";
import type { StageData } from "../../src/sim/track";

// Node runs this script; the project has no Node type definitions, so declare what is used.
declare const process: { argv: string[] };

const trial = process.argv[2];
if (trial) applyTuning(JSON.parse(trial));
console.log(formatFeel(measureFeel(stage as StageData)));
