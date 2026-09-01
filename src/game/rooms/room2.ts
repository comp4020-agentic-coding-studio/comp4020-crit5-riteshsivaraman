// Room 2 (issue #9): 'The Sink'. Adapted from plan.md §9's room 2 beat
// (a taller vertical space, one-way drop into a lower chamber, rewind as
// the only way back) to this game's single fixed 32x18 screen — there is
// no camera, so the beat is preserved as a single tall shaft rather than
// scrolling terrain. Two judgment calls worth flagging for override:
//
//   1. plan.md's 'taller vertical space' becomes a literal vertical shaft
//      on one screen (rows 1-6) rather than a scrolled column — the drop
//      still reads as a fall, just a short, entirely-visible one.
//   2. The wall break at (4, 4) relies on the CURRENT (open,
//      orchestrator-pending) contact-margin behaviour in world.ts's
//      tilesInContact: a large body resting on the growth pad at (3, 6)
//      is credited as 'touching' the fragile wall two rows above it
//      purely because of the 1px contact margin, not because it overlaps
//      or is adjacent by a full tile. If that directional-break behaviour
//      is ever tightened (breaking only on literal overlap), this room's
//      wall becomes unbreakable and needs a redesign — see
//      notes/agents/log.md [#9] for the cross-reference to that open
//      decision.
//
// Layout: spawn (P) falls down a 1-tile-wide shaft (col 2, rows 1-3) —
// narrow by construction, not by depth, so a grown body can never climb
// back up it (2-wide footprint never fits a 1-wide column) regardless of
// how the shaft is drawn. Lands on the rewind machine (R) at (2, 4),
// which auto-arms. Continuing right at (3, 4) drops one more tile (also
// 1-wide, same reasoning) onto the growth pad (G) at (3, 6). Growing there
// puts the large body's 2x2 footprint in contact range of the fragile
// wall (=) at (4, 4) — break it. The gap it leaves in row 4 is now part
// of the corridor from R to the exit (E) at (30, 4), but the corridor
// above (row 3) stays solid at col 4, so large is still physically stuck
// in the lower chamber: rewind (armed at R) is the only way out, landing
// small at (2, 4), from where the broken wall is now walkable.
//
// R, G and the broken wall are all landing/resting tiles the player
// walks or falls onto directly — never jumped over — so the solver's
// documented jump-arc blind spot (solver.ts's header) does not apply.
import { parseLevel } from "../level";

const ROWS = [
  "################################",
  "#P.#############################",
  "##.#############################",
  "##.#############################",
  "##R.=.........................E#",
  "###..###########################",
  "###G......######################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
];

export const room2 = parseLevel(ROWS, []);
