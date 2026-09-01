// Room 1 (issue #9): the tutorial room. Teaches grow -> break -> shrink in
// one uninterrupted floor lane, left to right. No loss condition — the
// fatal list is empty (hard constraint: rooms 1 & 2 must be unlosable),
// so a wrong choice here just costs the player some backtracking, never a
// restart.
//
// Beat, left to right along row 14 (the floor lane):
//   P (spawn) -> G (grow) -> wall at col 9 (fragile, rows 13-14; solid
//   rows 9-12 above it, so it can only be passed by breaking the fragile
//   section while large, never jumped over) -> C (shrink back to small) ->
//   a solid-except-row-14 wall at col 16 (a one-tile gap: admits small,
//   refuses large, plan.md §8's rule) -> E.
//
// Every G/C sits directly in the floor lane the player walks along, so
// each is reached by walking onto it, not by being jumped over — the
// solver's documented limitation (solver.ts's header) never applies here.
import { parseLevel } from "../level";

const ROWS = [
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "#........#......#...:...:......#",
  "#........#......#..............#",
  "#........#......#..............#",
  "#........#......#..............#",
  "#........=......#..............#",
  "#.P..G...=.C................E..#",
  "################################",
  "################################",
  "################################",
];

export const room1 = parseLevel(ROWS, []);
