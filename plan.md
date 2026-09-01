# REMNANT — implementation plan

Architect pass, crit 5. Written once, not edited incrementally. Builder-Tester
sessions take one issue each and read this file first.

---

## 1. What we are building, in one paragraph

A ~3.5-minute browser puzzle-platformer set in an abandoned industrial
facility. You are a small creature that can be made **large** (warm growth pads)
or **small** (cyan coolant). Large bodies smash cracked walls; small bodies fit
through one-tile gaps. Violet **rewind machines** send *you* back to where you
armed them — but the world stays exactly as you left it. Breaking the right
thing opens the route. Breaking the wrong thing ends the run.

**The sentence the whole game is built to teach, wordlessly: *the world only
moves forward.***

## 2. What the brief actually requires, and how we answer each line

| Spec line | How this design answers it |
| --- | --- |
| Deployed live on GitHub Pages by cutoff | Astro static build, already wired; `/ship` flips it public |
| **It can be lost** — a wrong move is possible; play ends | A wrong destruction makes the exit unreachable → explicit loss state (§6). Win = reach the core |
| **It teaches itself** — no instructions on screen or off | No text of any kind explains a mechanic. Enforced by a sensor over `dist/` *and* `README.md` (issue 12) |
| Stranger reaches an ending within 5 minutes | 3 rooms + finale, designed at ~3.5 min; loss/restart is per-room, not per-run |
| One rule under a focused automated test | `spec/rules.test.ts`: destruction survives rewind; and the solver sensor (issue 8) |
| One change that came from playing, not reading code | Reserved: human + Builder playtests, recorded in `PROCESS.md` |
| Both marking viewports work | 1920×1080 landscape **and 390×844 portrait** — see §3 |

### The scope cut, and why

`notes/idea.md` is a 10-minute, 5-mechanic design. The brief asks for 5 minutes
and calls two interacting mechanics "the harder, better move". More importantly,
idea.md §15/§19 is explicitly *unlosable* (no lives, no game over, softlocks
designed out), which fails the spec's central line. So:

**Kept:** size, rewind, permanent destruction (the consequence layer that makes
loss possible), 3 rooms + a finale beat.

**Cut:** enemies (both types), checkpoints-as-a-system, music and adaptive
layers, side paths, main-menu options, sprite assets, level 3's second half.

**Stretch, only if core is green and budget survives:** a radial vision mask in
the finale room, atmosphere only, never a puzzle.

Enemies are cut deliberately: with the loss condition coming from the puzzle,
adding twitch death gives a stranger a second, unrelated way to fail in a
five-minute window, and doubles what must be taught without words.

## 3. Platform, resolution, and the portrait trap

Marking is Chrome at **1920×1080** and **390×844**. The second is *portrait*.
idea.md says "landscape only" — that would fail a viewport that counts fully.

- Internal resolution **320×180**, `imageSmoothingEnabled = false`, integer
  scaling where it fits, letterbox otherwise. Never stretch.
- **Landscape:** canvas centred, letterboxed, keyboard input.
- **Portrait (390×844):** canvas as a band across the top at full width
  (390×219 at 1.2× scale, or 320×180 at 1× centred), touch controls filling the
  space below — two large left/right pads and a jump pad, ≥64 px targets.
  Portrait is a *better* layout for this game, not a compromise.
- Both layouts share one code path: `layout.ts` returns `{scale, canvasRect,
  controlsRect}` from viewport size, and nothing else in the game knows.

### The invariants trap

`spec/invariants.test.ts` requires a `<nav>` landmark, exactly one `<h1>`, a
title, description, `og:image`, viewport meta, and alt text — on the **built**
page. A naive fullscreen-canvas rewrite kills three of those. So:

- `<h1>` is the game title, rendered as the start-screen title card (real DOM
  text, styled; not painted into the canvas).
- `<nav aria-label="Primary">` stays, minimal and unobtrusive.
- Neither the description, the title, the nav, nor `README.md` may say how to
  play. Naming the game is fine; explaining it is not.

## 4. Technology decision: no engine, no dependencies

Considered and rejected: **Phaser** (MIT, ~1.2 MB — brings a scene graph and
arcade physics we'd spend the night bending), **Kaplay** (MIT), **LittleJS**
(MIT, ~7 KB — the closest call), **Tiled / LDtk** as level editors.

We hand-roll ~500 lines instead, for a harness reason rather than a purity one:
**the graded automated test needs game rules importable into vitest without a
canvas.** Every engine puts the rules behind a runtime that needs a DOM to
instantiate; ours are pure functions over plain data. Secondary wins: no asset
licensing to audit, no bundle bloat through the Astro build, CI's link and
secret checks stay clean, and ASCII level strings are diffable in git — which is
itself process evidence.

Audio is ~40 lines of WebAudio oscillators. **Zero binary assets except
`public/card.png`.**

### Art: a real tileset, authored as code

`idea.md` §21–22 asks for chunky industrial pixel art from a small reusable
tileset. We build exactly that — but generate the atlas instead of shipping a
PNG. Each tile is a 10×10 character grid literal over a fixed palette:

```ts
const FRAGILE = [
  "aabbaabbaa",
  "ab..bbaaba",   // 'a','b' = palette indices; '.' = crack void
  ...
];
```

At boot, `tileset.ts` bakes every tile once into an offscreen canvas; `render.ts`
then blits with `drawImage` from that atlas. The render path is a genuine tile
atlas — the source is just code rather than a binary.

Why not a downloaded tileset PNG: no `base`-path resolution risk on Pages, no
license to audit, no art-direction mismatch against the mechanic colour
language, and — the real win — the tiles become **testable**. See the legibility
sensor in issue 2. Under a no-tutorial rule, visual legibility *is* the
tutorial, so it deserves a check rather than a hope.

**Fallback, if code-authored tiles look bad:** drop to a CC0 pack —
[Kenney](https://kenney.nl/support) publishes platformer tilesets as CC0 1.0,
commercial use permitted, attribution optional. The cost is not licensing but
geometry: those packs are 16 px, so adopting one means moving `TILE` from 10 to
16 and re-checking every clearance constant and room layout. Take that hit only
if the art is genuinely failing, and take it before issue 9, never after.

## 5. Module boundaries

Everything under `src/game/`. The split exists so that **rules are pure and
testable, and only `render`/`audio`/`input`/`main` touch the browser.**

```
src/game/
  tiles.ts      TILE=10, char→semantics tables, solidity queries
  tileset.ts    palette + 10×10 pixel-grid literals; bakes the atlas at boot
  level.ts      ASCII rows → Level {grid, spawn, exit, entities, fatal[]}
  physics.ts    pure: stepBody(body, input, level, destroyed) → body
  player.ts     size states, hitboxes, grow/shrink transition state machine
  world.ts      run state + pure reducers (destroy, arm, rewind, restart)
  rules.ts      the graded rules: isRoomDead(world), hasWon(world)
  solver.ts     TEST-ONLY reachability search (§7)
  layout.ts     viewport → {scale, canvasRect, controlsRect}
  render.ts     canvas painter: tiles, entities, effects, screens
  vision.ts     STRETCH: radial mask
  audio.ts      WebAudio SFX
  input.ts      keyboard + touch → InputState
  loop.ts       fixed-timestep accumulator + camera
  rooms/room1.ts room2.ts room3.ts finale.ts
src/scripts/main.ts   bootstrap only
```

**Determinism is a hard requirement.** Fixed 60 Hz timestep with an accumulator;
no `Math.random()` in anything under `rules`, `physics`, `world`, or `solver`;
no reads of wall-clock time inside the step. Tests replay input sequences and
must get identical results every run.

**Dependency rule:** `render`, `audio`, `input`, `layout`, `loop`, `main` may
import from `rules`/`physics`/`world`/`level`. Never the reverse. A test that
imports `rules.ts` must not pull in a single browser API.

## 6. Game state, and the loss condition

```ts
type Size = "small" | "large";
type World = {
  room: RoomId;
  player: { x, y, vx, vy, size, grounded, transition };
  destroyed: Set<string>;        // "x,y" of broken fragile tiles — permanent
  anchor: { x, y, size } | null; // set by a rewind machine
  status: "playing" | "lost" | "won";
};
```

- **Destruction is permanent within the room.** `rewind()` writes to
  `player` and reads `anchor`; it may not touch `destroyed`. This is the
  invariant the focused test guards.
- **Restart** rebuilds the room from its ASCII source: full reset, including
  `destroyed` and `anchor`.
- **Loss** is not a general solver at runtime. Each room declares a small list
  of **fatal predicates** — authored conditions that mean this room is now
  dead, e.g. `room3: (w) => w.destroyed.has("41,9") && !canReachCoolant(w)`.
  Runtime evaluation is exact, cheap, and readable.
- The general reachability search is **test-only** (§7) and verifies the
  authored predicates are neither too eager nor too lax. Runtime stays trivial;
  the expensive verification lives in `pnpm check`, which is exactly the split
  this week's brief is about.

Loss presentation is wordless: the facility goes dark, a red-violet pulse, one
restart glyph. Win: fade to black, the title, a play-again glyph. No stats, no
score, no explanation.

## 7. The solver sensor — the centrepiece test

`src/game/solver.ts` (imported only by `spec/`) does a breadth-first search over
states `(tileX, tileY, size, destroyedMask, anchor)` with edges for: walk to an
adjacent fitting tile, fall any distance, jump up to J tiles / across H tiles
(conservative arc table derived from the same constants `physics.ts` uses),
step onto a growth pad (→ large), step into coolant (→ small), break a fragile
tile while large, arm a machine, and rewind to `anchor`. Search space per room
is ~32k states — milliseconds.

`spec/solver.test.ts` then asserts, for every room:

1. From the spawn state, the exit **is** reachable — the room is solvable.
2. Every state matching a fatal predicate is **unreachable-to-exit** in the
   solver — we never declare a loss that isn't one.
3. Every reachable state that is unreachable-to-exit **matches some fatal
   predicate** — we never leave a player silently stranded.
4. Room 1 and room 2 have **no** dead states at all (loss is introduced in
   room 3, after both mechanics have been demonstrated).

If the solver and the authored predicates disagree, the check goes red and a
human looks at the room. That is the sensor doing its job.

## 8. Level format

ASCII rows, one string per row, in `rooms/*.ts`. Tile size 10 px; a screen is
32×18 tiles.

```
.  empty                        #  solid concrete
%  solid metal (visual variant) =  fragile wall (large-only, permanent)
G  growth pad (→ large)         C  coolant (→ small)
R  rewind machine               P  player spawn
E  exit                         :  non-colliding decor (pipe, cable, light)
```

Each of those characters maps to one 10×10 tile in the code-authored atlas
(§4). The palette is fixed and shared: terrain in charcoal, grey, muted brown,
concrete beige, rust; and the three mechanic colours — **growth orange**,
**coolant cyan**, **rewind violet** — reserved exclusively for their mechanics
and never used by terrain. `TILE = 10` is load-bearing for this decision; the
CC0 fallback would force it to 16.

Player hitboxes: **small 8×10** (0.8×1 tile), **large 16×20** (1.6×2 tiles). A
one-tile gap (10 px) admits small and refuses large — the clearance rule is
arithmetic, not a special case.

**Growth safety rule:** growing must never push the player into solid geometry.
Growth pads are only legal in a cell with 2 tiles of headroom and 2 of width;
`spec/rooms.test.ts` asserts this for every `G` in every room, so a bad room
layout fails the check rather than the playtest.

## 9. Room-by-room design

Every mechanic follows **demonstrate (safe) → require → combine**, and appears
safely before it is ever needed.

### Opening screen — the ten seconds that decide the crit

Player stands left of centre on a lit floor. Two tiles to the left is a wall —
there is nowhere to go but right. The floor runs right toward a warm glow at the
screen edge. Nothing else is on screen: no HUD, no prompt, no key glyph. Idle
animation breathes. On portrait, the three touch pads are visible and obviously
pressable. This is the one element no test can check — it is verified by the
stranger test and by the pod.

### Room 1 — THE ENTRY (~45 s) · teaches size + destruction

`P` → walk right → **growth pad** in a wide safe alcove, unmissable, walking
into it grows you (0.6 s squash/stretch) → immediately right, a **cracked wall**
at large-body height; walking into it breaks it → drop into a **coolant pool**,
you shrink → a **one-tile gap** is directly ahead at eye level → through it →
`E`. Exactly one fragile wall, and it is mandatory. **No loss is possible here.**

### Room 2 — THE SINK (~75 s) · teaches rewind, and the central rule

A taller vertical space. A **rewind machine** sits in a safe alcove near the
entrance; walking into it arms it with a violet pulse and a stored ghost of you.
The only way on is a one-way drop into a lower chamber holding a growth pad and
a fragile wall. Break the wall while large — behind it is a *dead end*. The
player is now stuck at the bottom with an obviously-armed machine in view above.
Rewind: you snap back to the alcove, small, and the wall stays broken — and from
up here the broken wall is now a *route*. This is the whole game in one beat.
**No loss is possible here** — the fatal-predicate list for room 2 is empty and
the solver test asserts it.

### Room 3 — THE MACHINE (~90 s) · requires the combination, and can be lost

One rewind machine, one growth pad, one coolant pool, **two** fragile walls.

- **Intended:** arm the machine while small → grow → break wall **A**, which
  opens an upper route → rewind (you return small, to the alcove) → take the
  upper route, fitting through a one-tile gap only a small body clears → `E`.
- **The wrong move:** while large, break wall **B** — the ledge that carries the
  only approach to the coolant. Coolant is now unreachable, so you can never be
  small again, so the one-tile gap is closed forever. Rewind does not help: it
  returns *you*, not the ledge. The room is dead → loss.

Wall B is visibly load-bearing (the ledge above it is drawn resting on it) and
sits off the direct path, so a wrong break is *possible* rather than *likely*.

### Finale — THE CORE (~30 s) · atmosphere, not puzzle

A short walk right into a vast chamber. The camera eases back. Distant lights,
cables, a machine still running, and several growth stations — one of them sized
for something far larger than you. A beat of stillness, then cut to black, the
title, and a play-again glyph. Nothing is explained. **Stretch:** the vision
mask lands here and nowhere else.

## 10. Anti-softlock and recovery

- Reachability is verified by the solver test, not by hand-checking rooms.
- Restart is always one obvious glyph away, and restart is per-room.
- The game never requires a page reload. Any unexpected state → reset the room.
- Rewind may never place the player inside solid geometry: `arm()` refuses to
  store an anchor whose body does not fit; asserted in `spec/rules.test.ts`.

## 11. Build order and issues

Twelve issues, one per subsystem, one Builder-Tester session each, `/clear`
between. Roughly in dependency order; 1–7 are the spine and must all land before
9 is worth doing.

1. Canvas shell, fixed-timestep loop, responsive layout (both viewports)
2. Tile format, ASCII level parser, procedural tile renderer
3. Player physics — pure deterministic AABB step
4. Size system — growth/coolant sources, hitbox swap, safe-growth rule
5. Destructible walls — large-only, permanent within room
6. Rewind machine — arm on contact, restores position + size, world untouched
7. Loss / win — fatal predicates, end screens, per-room restart
8. **Solver sensor** — test-only reachability, verifies the predicates
9. Rooms 1–3 + finale, authored and playtested
10. Input — keyboard, touch pads, contextual rewind control
11. Audio — WebAudio SFX
12. Head, card, and the **no-instructions sensor**; PROCESS + reflection

**Stretch (only if all twelve are green):** 13. vision mask in the finale.

The **human takes issue 9** (room authoring is the judgement-heavy one), and
runs the stranger test near the end: play cold, no context, report where you got
stuck. The **one Reviewer pass** (Opus, once for the whole crit) is spent after
issue 9 lands, on the rewind/destruction interaction specifically.

## 12. Budget and cut order

Budget is ~$100 and a few hours. If a subsystem eats disproportionately, cut its
scope rather than extend either. **Cut in this order:** vision mask → audio down
to three SFX → finale down to a single static tableau → room 3's second fragile
wall (loss then comes from the ledge alone) → room 2's vertical scale.

**Never cut:** the loss condition, the no-instructions rule, portrait support,
or a green `pnpm check`.
