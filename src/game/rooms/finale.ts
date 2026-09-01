import { parseLevel } from "../level";

/**
 * The finale -- "THE CORE". Plan.md §9: "a short walk right into a vast
 * chamber... Nothing is explained." No puzzle, no fatal predicates, no
 * G/C/R entities at all -- just a walk to E. The "camera eases back" beat
 * plan.md describes assumes a camera this game doesn't have (one screen,
 * no scrolling -- see this repo's fixed 32x18 backbuffer); the
 * single-screen adaptation is to draw the chamber already open on
 * arrival (a taller ceiling than any other room, `:` decor scattered
 * through the space standing in for the distant lights/cables/oversized
 * growth stations plan.md describes) rather than reveal it via a camera
 * pull. `:` is decor only (level.ts: non-colliding), so none of it needs
 * growth-pad clearance or solver checks -- there is nothing to solve here
 * beyond "can you walk from P to E", which pnpm check's room loop still
 * confirms.
 */

const ROWS = [
  "################################",
  "################################",
  "#............:.................#",
  "#..............................#",
  "#.:...................:........#",
  "#..............................#",
  "#..............................#",
  "#..............................#",
  "#..............................#",
  "#..............................#",
  "#.:...........................:#",
  "#..............................#",
  "#..............................#",
  "#.....:.................:......#",
  "#.P..........................E.#",
  "################################",
  "################################",
  "################################",
];

export const finale = parseLevel(ROWS, []);
