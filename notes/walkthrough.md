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

```
#........#######################
#........=........#......#.....#
#P..R.G..=.......C............E#
################==##############
################..##############
```
(full ceiling above and floor below omitted)

Legend: `#` solid wall · `=` fragile wall · `G` growth pad · `C` coolant ·
`R` rewind machine · `P` spawn · `E` exit · `.` open floor

**Teaching (plan.md §9):** requires combining size + rewind, and is the one
room that can actually be lost.

**The solver's actual shortest path — and an important divergence from the
design intent:**

Running the solver on the real room turns up something plan.md §9 doesn't
anticipate: **the rewind machine is not actually required to solve this
room.** The shortest path found is:

1. Walk right from spawn. You pass directly over **R** and it arms
   automatically (no cost to this — you don't have to use it).
2. Continue right onto **G** — you grow automatically.
3. Keep walking right into the first cracked wall (two fragile tiles,
   stacked) — it breaks automatically. This is "wall A" — the one that's
   mandatory to get further at all.
4. Keep walking right, past where the wall was, still large. You will pass
   directly over the coolant tile (**C**) — the moment your (2-tile-wide)
   large body's footprint lines up over it, you shrink automatically,
   *before* the game evaluates whether you're touching any fragile floor
   tile that same frame. That ordering is what saves you here (see the
   loss section below for why it matters).
5. Now small, continue walking right. There are two single-tile-high
   overhangs further down the lane that only a small body clears — you're
   already small from the coolant, so you pass under both without needing
   to do anything else.
6. Continue right to **E**.

At no point in this path do you ever press R. Plan.md's brief for this
room describes an "intended crossing" that arms the machine, grows, breaks
wall A, **rewinds back to the small alcove**, and only then walks the small
body the rest of the way. That is also a valid, solver-confirmed path
(re-running the solver with jumping disabled reproduces exactly that
sequence) — but it is not the *shorter* one, and a player who just keeps
walking right the whole time, never touching R, reaches the exit anyway.
The room's central lane simply doesn't force the "arm → break → rewind"
combination the design intended; the coolant, sitting in the direct line
of travel, does the same job rewind was meant to be required for.
**Report this to Ritesh as a real design/build divergence**, not a
walkthrough footnote — if "requires the combination" is meant to be
enforced, this room currently doesn't enforce it.

**The wrong move, and why it's fatal:**

The trap plan.md describes is real and the solver confirms it: if you walk
into the coolant/ledge area **without having broken wall A and immediately
continued moving** — specifically, if you rest a large body one tile short
of the coolant tile (directly on top of the ledge, not yet triggering the
auto-shrink) — your large footprint is sitting on the fragile floor tiles
that are the *only* thing holding that ledge up, and it breaks
automatically on contact, the same way any fragile wall does. There is no
separate "break" button; it is a straight consequence of a large body
touching a fragile tile, whether you meant to or not. The room's own
source comment calls this "wall B" — the floor the coolant approach rests
on.

**Caveat:** don't linger while large anywhere near the coolant/ledge area.
Keep moving through it in one motion (as the safe path above does) rather
than stopping to look around. If you do stop there while still large, you
may break the ledge under yourself without any warning prompt — it just
happens.

### On the loss condition specifically

`room3.ts` defines the loss as `fatalRecess(state) || fatalLockout(state)`,
evaluated every frame. The solver found 50 dead states out of 389 reachable
states for the real room (all confirmed by `pnpm check`'s solver test to be
correctly flagged — none are silent, none contradict a real escape).
Sampling them:

- Most of the sample look like `pos=(9,14)..(15,14) size=large
  destroyed=[9,13;9,14;16,15] anchor=-` — a large body, anywhere along the
  lane, once the ledge tile `16,15` has been destroyed and there is no
  small-sized anchor armed. This is **fatalLockout**: once that one ledge
  tile is gone, nothing in the room can turn you small again (the coolant
  tile itself sits on the now-broken ledge — you can't stand there safely
  anymore either), so a large body with no small anchor to fall back on is
  dead no matter where it's standing. Rewinding doesn't rescue you here
  unless the anchor you'd rewind *to* was recorded while you were small —
  rewind restores your position and size, but the world (including the
  now-missing ledge) stays exactly as broken as it was.
- A smaller set look like `pos=(16,16)/(17,16) size=small ...
  destroyed=[...16,15...] anchor=-` — this is **fatalRecess**: the ledge
  breaking opens a two-tile-deep pit beneath it that no jump climbs out
  of. If you fall into that pit with no anchor (or only a large anchor,
  which just relands you in the lockout case above), you're stuck; the
  *only* escape is rewind, and only a small-sized anchor actually helps.

**In short: the two ways to die here are (1) you're large, the ledge is
gone, and you have no small anchor to rewind to, or (2) you're physically
standing in the pit the broken ledge left behind and either have no anchor
or only a large one.** Rewind is the mechanic that could have saved you in
either case — but only if you armed it *while small*, before things went
wrong. Arming while large and then breaking the ledge is the actual trap;
by the time you'd want to rewind, the only anchor on record is the wrong
size for the world you're rewinding into.

---

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
