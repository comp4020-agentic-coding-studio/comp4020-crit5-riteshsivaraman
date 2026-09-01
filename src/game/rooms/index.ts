// Room progression order for main.ts (issue #9). One module per room so
// each stays independently testable (spec/rooms.test.ts, spec/solver.test.ts
// both glob this directory); this file's only job is the ordering.
import { room1 } from "./room1";
import { room2 } from "./room2";
import { room3 } from "./room3";
import { finale } from "./finale";
import type { Level } from "../level";

export const rooms: readonly Level[] = [room1, room2, room3, finale];
