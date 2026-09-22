import type { Song } from "../../audio/song";
import { coastal } from "./coastal";
import { inland } from "./inland";
import { results } from "./results";
import { sunset } from "./sunset";

/** The driving tracks the music select offers, in order, and the results tune. */
export const DRIVING_SONGS: Song[] = [coastal, sunset, inland];
export const RESULTS_SONG: Song = results;
