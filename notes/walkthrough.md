# Player's walkthrough

Every step below was derived by running `solveRoom()` (`src/game/solver.ts`)
against the real room files in `src/game/rooms/`, in a throwaway BFS script
that recorded a parent pointer per state so an actual spawn-to-exit path
could be reconstructed and translated into plain instructions — not by
reading the ASCII and guessing. Where that matters for what you should
actually do, it's called out explicitly.

## Controls

| Key | Action |
|---|---|
| A / Left | Move left |
| D / Right | Move right |
| Space | Jump |
| R | Rewind (return to the last armed anchor) |
| Escape | Pause |

Touch pads (move/jump/pause + a rewind glyph) appear only in portrait.
**On desktop in landscape, R is currently the only way to rewind** — the
on-screen rewind glyph lives inside `#game-controls`, which is hidden
entirely in landscape, so the glyph is unreachable at that viewport. This is
a known bug, being fixed separately; don't go looking for an on-screen
rewind button in landscape, use the key.

---

## Room 1 — The Entry

```
#........#......#...:...:......#
#........#......#..............#
#........#......#..............#
#........=......#..............#
#.P..G...=.C................E..#
################################
```
Legend: `#` solid wall · `=` fragile (destructible) wall · `G` growth pad ·
`C` coolant (shrink) · `P` spawn · `E` exit · `:` decor (no collision) ·
`.` open floor

**Teaching (plan.md §9):** grow → destroy → shrink, in one uninterrupted
lane. No loss is possible in this room — its fatal-predicate list is empty.

**Solution:**
1. Walk right from spawn onto the **G** pad — you grow automatically, no
   button press.
2. Keep walking right, now large, into the cracked (`=`) wall — it breaks
   automatically the instant your large body touches it. This is the one
   mandatory wall in the room.
3. Keep walking right onto the **C** tile — you shrink back to small
   automatically.
4. Keep walking right. There's a full-height wall ahead with a gap only at
   floor level, one tile tall — small fits through it, large would not
   have. Since you're already small from the coolant, just walk through.
5. Continue right to **E**.

**Caveat:** there's nothing to get wrong here. The solver confirms zero
dead states for this room — whatever you do, the exit stays reachable.
The only thing to notice for later rooms: growth/coolant tiles trigger
automatically on contact, they are not something you opt into.

---

## Room 2 — The Sink

```
#P.#############################
##.#############################
##R.=.........................E#
###..###########################
###G......######################
```
(rows above/below are solid ceiling/floor, omitted for width)

Legend: `#` solid wall · `=` fragile wall · `G` growth pad · `R` rewind
machine · `P` spawn · `E` exit · `.` open floor

**Teaching (plan.md §9):** rewind, and the central rule of the whole game —
breaking a wall is permanent, but rewind can put *you* back where a broken
wall now helps rather than hurts.

**Solution:**
1. From spawn, walk right and drop — the shaft is one tile wide, there's no
   choice of path. You land directly on **R**, which arms automatically
   (stores your position and size — you're small here).
2. Continue right and drop again, landing on the **G** pad. You grow
   automatically.
3. Still large, keep moving right into the cracked wall — it breaks
   automatically on contact. Behind it is a dead end; there is no way
   forward from here while large.
4. Press **R** to rewind. You snap back to the machine's alcove, small
   again — the *world* doesn't change, the broken wall is still broken.
5. Walk right through the gap the wall used to block (now open, because
   you're viewing it from the alcove side this time) and continue right,
   along the open corridor, all the way to **E**.

**Caveat:** the fragile wall here relies on a documented, deliberate
implementation detail — a large body resting on the growth pad is credited
as "touching" the wall two rows above purely via a 1-pixel contact margin,
not literal overlap (see room2.ts's own comment). If that margin behaviour
is ever tightened, this room's wall stops being breakable from that spot
and needs re-authoring. Not a concern for playing it today — flagging it
because it's a load-bearing detail of *why* this room currently works, and
it's exactly the kind of thing a "just play it" tester wouldn't notice.
Room 2, like Room 1, has zero dead states — nothing here can be gotten
wrong badly enough to lose.

---

## Room 3 — The Machine (the only room you can lose)

> Re-authored after this document was first written. The coolant moved from
> column 17 to column 21, behind a gate only a small body fits through, so it
> can no longer substitute for the rewind. Verified with the solver:
> `solveRoom(room3).solvable === true`, and
> `solveRoom(room3, {allowRewind: false}).solvable === false`.

```
#........=........#......#.....#
#P..R..G.=...........C........E#
################==##############
################..##############
     ^   ^ ^          ^        ^
     R  G  wall A     C        E
```

`P` spawn · `R` rewind machine · `G` growth pad · `=` fragile · `C` coolant ·
`E` exit. The `#` at row 13 columns 18 and 25 are low ceilings: a small body
passes, a large one cannot.

**What it teaches:** the two mechanics together. Rewind is now load-bearing —
the room is provably unsolvable without it.

**Solution**

1. Walk right. **Do not jump.** Stepping onto the machine at column 4 arms it
   while you are small.
2. Continue onto the growth pad at column 7. You grow.
3. Walk into the cracked wall at column 9. Large, you break it.
4. You are now stuck: too large for the ceiling ahead, and walking further
   right breaks the floor at columns 16–17 and drops you in a pit.
5. **Press R.** You return to the machine, small, and the wall stays broken.
6. Walk right through the opening, under both ceilings, to the exit.

**The caveat, and it is the important one**

*Jumping over the machine at the start is fatal.* Skip it while small, grow,
and you can never be small again — the coolant sits past a small-only gate.
Every one of the room's 156 dead states (of 394 reachable) requires having
skipped the machine while small; 66 of them do not involve the floor break at
all.

If you *did* arm the machine while small, the room can never become
unwinnable — the solver reports **zero** dead states with a small anchor armed.
Breaking the floor is recoverable: press R.

This is a known design flaw, not intended behaviour. `plan.md` §9 puts the
machine in a safe alcove precisely so it cannot be missed.

## Finale — The Core

```
#............:.................#
#..............................#
#.:...................:........#
#..............................#
#..............................#
#..............................#
#..............................#
#..............................#
#.:...........................:#
#..............................#
#..............................#
#.....:.................:......#
#.P..........................E.#
################################
```
Legend: `#` solid wall · `:` decor (no collision, atmosphere only) · `P`
spawn · `E` exit · `.` open floor

**Teaching:** none — plan.md §9 calls this "atmosphere, not puzzle." No
entities, no fatal predicates.

**Solution:** walk right, the whole way, to **E**. That's it.

**Caveat:** none — there is nothing to get wrong.

---

## The rewind mechanic, on its own

**What arming does:** walking onto an `R` tile stores your current
position and size as an "anchor" — one anchor at a time, replaced whenever
you walk onto a *different* rewind tile, but not re-armed by walking back
onto the same one (that re-triggers a rewind instead — see below).

**What firing it does:** pressing R (or re-entering the same armed R tile)
snaps you back to the anchor's stored position *and size*. Deliberately,
the world does not roll back with you — every wall you broke, everything
you destroyed, stays destroyed. Room 2 is built entirely around that
contrast: you rewind back small to a spot where a wall you broke while
large is now a route instead of a dead end, and the broken wall is still
broken when you get there.

**What it deliberately does not do:** restore any tile you destroyed, or
undo anything about the room other than your own position/size. This is
exactly what makes room 3 losable: rewind returns *you*, not a ledge you
destroyed out from under yourself.

**How a player is supposed to discover this with no on-screen text:** by
walking into the `R` tile (an unmissable violet pulse plus a stored ghost
image, per plan.md) in room 2, getting stuck at a dead end directly below
it, and having nothing else to try but pressing back toward the machine —
at which point R is meant to be the obvious next input to guess at. Whether
that discovery actually happens with *no* prior hint is genuinely the
weakest link in the design as built: there is no on-screen prompt naming
the key, the contextual rewind glyph (meant to appear once armed, as a
visual hint) is invisible in landscape entirely (see Controls above), and
in portrait it only becomes visible *after* arming, meaning a player who
doesn't already suspect "R" as a keybinding has no visible cue that the
mechanic exists until they've already stumbled into arming it by walking
over the machine tile. Ritesh has already reported this isn't obvious in
practice — this walkthrough doesn't have a fix to offer, only the honest
answer: today, a keyboard player in landscape who doesn't already know to
try R has no on-screen affordance telling them it exists.

---

## If you get stuck

- **Rooms 1, 2 and the finale cannot be softlocked or lost** — the solver
  confirms zero dead states in all three (verified against the real rooms,
  not just the fixtures, by `pnpm check`'s solver test). Whatever you do
  in these rooms, the exit stays reachable.
- **Room 3 is the only room that can end in a loss screen**, via the two
  fatal states described above. The restart glyph (`↻`) that appears on
  the loss screen fully recovers: it rebuilds the room from the ASCII
  source with every fragile tile intact, the rewind anchor cleared, and
  you back at spawn (`restartRoom()` / `freshRoomState`, asserted by
  `spec/room.test.ts`) — there is no partial-reset state to worry about.
- **The one thing that can leave you stuck without a loss screen firing:**
  resting a large body on the coolant ledge in room 3 without immediately
  continuing forward — you might break the ledge tile without realizing
  it, and depending on which tile broke and whether you already have a
  small anchor, you may or may not actually be in a flagged-dead state
  yet. If movement stops making sense in that area and no loss screen has
  appeared, keep trying — the game's own predicate is proven (by the
  solver test) to fire on every genuinely unwinnable state, so if you
  haven't lost yet, there is still a way out; if you're unsure, resting
  there again to explicitly check is safe (either you're already dead and
  the screen will confirm it, or you're not and you can back off).
