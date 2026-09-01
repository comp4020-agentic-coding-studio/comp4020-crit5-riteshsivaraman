Absolutely. We have enough decisions now to turn this into a developer-facing implementation specification.

I’m going to write this as something you could hand directly to an AI coding agent. The ASCII maps and lore are design inspiration, not literal geometry requirements. The most important implementation constraint is that the game should be complete, playable, polished enough, and realistically codeable overnight. If a feature threatens that, the developer should simplify it rather than expanding scope.

GAME DEVELOPMENT SPECIFICATION
Working Title: [TBD]
1. Project Overview

Create a small, polished, experimental 2D browser game combining platforming, environmental puzzles, exploration, and light mystery.

The game takes place inside a mysterious abandoned underground industrial facility. The player controls a small mechanical/organic creature capable of changing size.

The game should take approximately 10 minutes to complete and consist of:

3 large, interconnected-feeling puzzle/exploration levels
1 short finale
No tutorial
No instructional text
No collectible system
No inventory
No progression tree
No combat system
No backend
No accounts
No procedural generation

The game should feel like a strange experimental indie game, rather than a conventional commercial platformer.

The player should understand every mechanic by observing the world and experimenting with it.

Core design principle

The environment is the tutorial.

Never display instructions such as:

"Press R to rewind"
"You can grow here"
"This wall is destructible"
"Water makes you smaller"
"Use the rewind machine"

Instead, mechanics must be introduced through safe, visually obvious demonstrations.

2. Target Platform

The game is a static web application playable in a modern browser.

Target:

Desktop/laptop browsers
Mobile phone browsers
Landscape orientation only
Modern Chrome, Firefox, Safari and Edge
No installation required
No server/backend required

The implementation should preferably use a lightweight browser-friendly technology such as:

HTML5 Canvas + JavaScript/TypeScript, or
Phaser if it materially speeds up development

Do not introduce a large framework solely for architectural sophistication.

The final deliverable should be runnable as a static web project.

3. Scope Constraint: OVERNIGHT IMPLEMENTATION

This is a critical requirement.

The complete game should be realistically implementable by an AI coding agent in approximately one overnight development session.

Therefore:

Prefer
deterministic physics
simple collision detection
tile-based or grid-assisted level construction
small numbers of reusable objects
simple state machines
simple enemy AI
procedural/simple pixel-art placeholders
reusable visual components
one player character
2 enemy types maximum
2 size states
3 main levels + finale
one primary environmental music track
simple layered audio
no external services
Avoid
complicated physics simulation
multiplayer
procedural level generation
complex AI
inventory systems
RPG progression
skill trees
large quantities of unique assets
dialogue systems
save systems beyond trivial completion persistence, if any
elaborate menus
particle-heavy rendering
physics-based destruction of arbitrary geometry
dynamic lighting that is expensive or difficult to implement
complex animation rigs

If any feature threatens the overnight scope, simplify that feature while preserving the intended player experience.

The developer has permission to replace technically complex implementations with simpler approximations.

4. Game Structure

Target playtime:

~10 minutes

Structure:

START
  │
  ▼
LEVEL 1 — DISCOVERY
  │
  ▼
LEVEL 2 — EXPERIMENT
  │
  ▼
LEVEL 3 — MANIPULATION
  │
  ▼
FINALE — REVELATION
  │
  ▼
END


The levels should feel like locations within the same facility rather than unrelated stages.

There should be some visual continuity between them:

pipes
machinery
cables
doors
structural materials
recurring symbols
recurring industrial architecture

There is no world map.

The player should navigate by remembering the environment.

5. Player Character

The player controls a small mechanical/organic hybrid creature.

The exact sprite can be simple.

Recommended visual concept:

roughly 1–1.5 tiles tall when small
roughly 2 tiles tall when large
rounded mechanical shell
one glowing eye/core
tiny articulated legs
some organic-looking growth or internal glow
expressive but minimal animation

The creature should feel like it belongs nowhere obvious.

Its origin is never explicitly explained.

Animation requirements

Keep animation modest:

idle
run
jump
fall
small
large
death/reset
rewind
growth transition
destruction impact

No elaborate skeletal animation is required.

6. Player Movement

Use conventional, responsive 2D platforming.

Desktop:

Left / A = move left
Right / D = move right
Space = jump
Rewind interaction is physical/environmental rather than requiring unexplained keyboard input
Escape or a visible pause button = pause

Mobile:

large left button
large right button
large jump button
contextual/interactable rewind machine

Buttons should be large enough for thumbs and have generous touch targets.

Holding left/right should continuously move the player.

Jump should be responsive and forgiving.

The movement system should feel arcade-like rather than physically realistic.

Do not add unless trivial
wall jumping
ledge grabbing
crouching
double jumping
dash
air dash

The basic movement vocabulary should remain intentionally small.

7. Size System

The player has exactly two states:

SMALL

Visual:

smaller sprite
cooler visual coloration
visibly compressed body

Gameplay:

fits through narrow openings
lighter
more maneuverable
cannot destroy heavy/large fragile structures
LARGE

Visual:

substantially larger sprite
warmer visual coloration
expanded body

Gameplay:

can destroy designated fragile terrain
heavier
occupies larger collision area
cannot enter narrow openings
somewhat less maneuverable
reduced effective vision radius

Do not create a third medium state.

The difference between states should be immediately obvious.

8. Growing and Shrinking

Size changes occur through environmental objects.

Growth source

A distinctive warm/orange industrial-organic growth structure.

Conceptually:

       ✦
     ╱███╲
    ███████
      ███
      ███
──────████──────


When the player touches/interacts with it:

SMALL → LARGE

The transformation should take approximately 0.5–1 second.

Use a simple squash/stretch animation.

Shrinking source

A distinctive cyan/blue liquid, mist, or cooling zone.

Conceptually:

~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~ COOLANT ~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~


Contact changes:

LARGE → SMALL

Again, animate the transformation.

Discoverability rule

The first growth source must be placed somewhere safe.

The player should be able to walk into it without danger and immediately see the transformation.

Likewise, the first shrinking source must be safe.

No text is necessary.

9. Destructible Terrain

Some terrain is fragile.

It should never look identical to ordinary terrain.

Normal terrain:

████████████
████████████
████████████


Fragile terrain:

███▓▓▒▒▓▓███
██▓▓▒▒▒▒▓▓██
███▓▓▒▒▓▓███


Use:

cracks
different color
loose bolts
visibly unstable construction
slight animation where appropriate

Only LARGE players can destroy designated fragile terrain.

The destruction interaction should be extremely simple:

Large player touches fragile structure → structure breaks.

Use:

brief squash
debris particles
metallic sound
disappearance/change to empty space

Do not implement arbitrary physics-based destruction.

Each destructible object is a predefined level object.

10. Permanent Destruction

Destruction is permanent within the current level run.

If the player destroys a wall and then uses rewind:

the wall remains destroyed.

The player is the only thing rewound.

This is one of the game's central concepts.

Example:

BEFORE

🙂   ███████████
        ↑
      barrier


DESTROY

🙂   ███       ███


REWIND

🙂 ←──────

███       ███


The player returns to an earlier position, but the altered world remains altered.

Restart

If the player chooses Restart Level, the entire level is restored:

terrain
destructible objects
enemies
environmental states
player position

Restart means a completely fresh level state.

11. Rewind System

Rewind is player-only.

It does not rewind the environment.

The recommended implementation is based around physical rewind machines.

Rewind Machine

The machine should be visually unmistakable.

Concept:

       ┌─────────────┐
       │   ◀ ◀ ◀     │
       │      ⟳      │
       │     ▶ ▶     │
       └──────┬──────┘
              │
             ...


Use a distinctive violet/purple visual language.

The player interacts with the machine.

The machine establishes the player's rewind point.

Once activated, the machine can be used again to return the player to that point.

Rewind point

A rewind machine records:

player position
player velocity/state
player size/state if necessary
relevant transient player state

It does NOT record world destruction.

Example
Player reaches machine
        ↓
Activates it
        ↓
Explores
        ↓
Destroys wall
        ↓
Falls / makes mistake
        ↓
Uses rewind machine
        ↓
Player returns
        ↓
Wall is STILL destroyed

Discoverability

The first rewind machine must be in a completely safe area.

Activating it should create an obvious visual effect.

The player should then be able to move away and return.

The machine should visibly communicate:

"This object sends the player backward."

No explanatory text should be required.

After the player has encountered the machine, the implementation may provide a convenient dedicated rewind control while that rewind machine is active.

However, the control must never be the only explanation of the mechanic.

12. Rewind Visual Effect

When rewinding:

briefly darken/desaturate screen
show ghost/afterimage copies of the player
animate the player rapidly backwards
use a reversed/distorted sound
return to the stored position
restore player movement

Do not rewind the camera independently in a confusing way.

The effect should last approximately 0.5–1 second.

The world should visibly remain unchanged.

This visual contrast is important.

13. Limited Vision

The player does not have complete visibility of the environment.

Outside a radius around the player, the world is dark.

Recommended implementation:

render level normally
overlay a near-black layer
cut a soft/roughly circular visibility region around the player

Do not implement expensive true dynamic lighting.

The visible radius should be enough to navigate normally but insufficient to see an entire room.

Exploration rule

Prefer keeping previously explored areas visible rather than implementing complex persistent fog-of-war state.

The darkness should mainly make the player explore locally rather than reveal an entire level at once.

If persistent exploration visibility is cheap to implement, it may be added.

Otherwise use a simple player-centered visibility mask.

14. Enemies

Include two simple enemy types maximum.

Combat is NOT required.

Enemies primarily function as hazards.

Enemy A — Small patrol creature

Simple left/right patrol.

Behavior:

moves between predefined points
reverses at boundaries
damages/kills player on contact

It should be visually distinct and slightly organic.

Enemy B — Industrial drone

Simple predictable movement.

Possible behavior:

moves horizontally
pauses
moves vertically
follows a fixed path

Do not implement sophisticated pursuit AI.

Enemy philosophy

Enemies should not dominate the game.

The player should usually be able to:

avoid them
understand their movement
use the environment to bypass them

The game is fundamentally about exploration and puzzles, not combat.

15. Death

Death should be relatively uncommon.

Possible causes:

enemy contact
clearly dangerous spikes
occasional lethal fall

When the player dies:

short animation
sound
immediate reset to the latest safe state/checkpoint

Do not use lives.

Do not use game-over screens.

Unlimited attempts.

Avoid long death animations.

16. Checkpoints

Use simple checkpoints inside larger levels where appropriate.

A checkpoint can be visually represented by a small industrial light or machine.

Checkpoints should not require text.

If implementation time is limited, levels may instead have only one restart point at their beginning.

Do not create a complex save/checkpoint architecture.

17. Level Design Philosophy

The game is a sequence of simple intended solutions.

Each puzzle should have one obvious intended solution once the player understands the mechanics.

Do not make puzzles dependent on:

pixel-perfect timing
obscure exploits
complex combinations
hidden switches
trial-and-error death loops

Difficulty should come from:

understanding the relationship between objects.

Not from execution.

Example:

Player sees narrow opening
        +
Growth source nearby
        +
Fragile wall blocking another route

Player naturally concludes:

"I need to be small here,
large there."

18. Discoverability / No Tutorial Rules

This is one of the highest-priority sections.

There must be:

no tutorial level
no tutorial popups
no control instructions
no dialogue explaining mechanics
no "Press X" prompts
no floating instructional text
no mechanic glossary

Every mechanic follows:

Demonstrate → Experiment → Require → Combine

Example:

Growth
Safe growth object appears.
Player touches it.
Player visibly becomes large.
Nothing dangerous happens.
Later, large size becomes necessary.
Shrinking
Safe coolant appears.
Player touches it.
Player visibly becomes small.
A narrow opening is nearby.
Player naturally connects the two.
Destruction
Visibly cracked wall.
Player is large.
Collision breaks wall.
Later, similar walls block routes.
Rewind
Safe rewind machine.
Player interacts.
Player visibly travels backward.
World remains unchanged.
Later, rewind is required.
Limited vision
Safe dark room.
Player sees only nearby environment.
Exploration reveals the room.
Later, darkness becomes part of a puzzle.
Enemies
First enemy is slow and avoidable.
Player observes its movement.
Later, enemy placement becomes more meaningful.
19. Preventing Softlocks

Every puzzle state should be recoverable.

The player must never be able to permanently destroy the only route forward without some recovery mechanism.

Before placing a destructible object, verify:

destroying it cannot permanently block the exit
shrinking/growing cannot permanently trap the player
rewind can return the player to a usable position
level restart always restores everything

If an edge case is difficult to solve technically:

make the relevant object non-destructible or simplify the puzzle.

Do not add complicated recovery systems.

20. Exploration

There is no map.

The player should navigate using:

architecture
distinctive rooms
lighting
pipes
machinery
color
silhouettes
environmental landmarks

The player should occasionally encounter optional side paths.

These should contain:

strange machinery
environmental storytelling
unusual visual scenes
clues about the facility

They should NOT contain:

collectibles
stat upgrades
mandatory items
secret powers

Exploration is rewarded with knowledge and atmosphere.

21. Art Direction
Overall aesthetic

Chunky industrial pixel art.

The facility should feel:

huge
old
mechanical
abandoned
functional rather than ruined
mysterious

Avoid a generic post-apocalyptic aesthetic.

The facility should feel like it was built for a specific purpose that the player doesn't understand.

Palette

Base environment:

charcoal
dark grey
muted brown
concrete beige
dark green
rust

Interactive mechanics:

growth = orange/warm yellow
shrinking/cooling = cyan/blue
rewind = violet/purple
player core = bright contrasting color

Mechanic colors should be consistent throughout the entire game.

Pixel style

Use a deliberately chunky pixel aesthetic.

A fixed internal resolution around:

320 × 180

is recommended.

Scale to the browser viewport using integer scaling where possible.

Do not stretch individual pixels unevenly.

22. Environment Art

Create reusable tiles/objects rather than many unique assets.

Core visual components:

concrete wall
metal wall
floor
ceiling
pipe
large pipe
cable
vent
industrial door
fragile wall
growth source
coolant pool
rewind machine
checkpoint
spikes
machinery
warning light
background machinery silhouette

Use palette variation and composition to make rooms feel different.

23. Camera

Use a smooth follow camera.

The camera should:

follow the player horizontally and vertically
avoid excessive screen shake
keep the player near the center
reveal enough environment to understand nearby geometry

Do not implement complex cinematic cameras.

Small camera shake may occur during:

large destruction
rewind
major environmental events

But keep it restrained.

24. UI

Keep UI extremely minimal.

During gameplay, ideally show:

no HUD, or almost none
pause button on mobile
optional small rewind interaction indicator only after the rewind mechanic has been discovered

Do not display:

health bar
score
collectible counter
XP
minimap
objective list

The environment should communicate almost everything.

Pause

A visible pause button should always be accessible on mobile.

Desktop can use Escape as well.

Pause menu:

Resume
Restart Level
Audio toggle
Quit/return to title if needed

Keep it extremely simple.

25. Mobile Controls

Landscape only.

Use large touch controls near the bottom of the screen.

Recommended:

┌────────────────────────────────────────────┐
│                                            │
│                  GAME                      │
│                                            │
│                                            │
│                                           
│     #     [AREA 1]       #                 │
│     #                    #                 │
│     ######         #######                 │
│            \       /                        │
│             \     /                         │
│              \   /                          │
│               \ /                           │
│                V                            │
│             [AREA 2]                        │
│                 │                           │
│                 │                           │
│        ┌────────┴────────┐                  │
│        │                 │                  │
│     [SIDE]           [AREA 3]               │
│                           │                  │
│                           │                  │
│                        [FINALE]              │
│                                             │
╚═════════════════════════════════════════════╝


Again, this is conceptual rather than literal tile geometry.

26. LEVEL 1 — "THE ENTRY"

Purpose:

Introduce:

basic movement
jumping
growing
shrinking
destructible terrain

without explaining anything.

The environment should initially feel relatively safe.

Opening

The player starts in a quiet maintenance corridor.

No title card is required beyond perhaps a very brief game title at launch.

The player moves through the first room.

A warm growth object is placed naturally in the environment.

The player encounters it.

They grow.

Immediately nearby is a visibly fragile barrier.

Large player collision breaks it.

This establishes:

large → destruction

without text.

Further ahead is a small cyan coolant area.

The player touches it.

They shrink.

A narrow opening is immediately visible.

The player enters.

This establishes:

small → narrow spaces

Level 1 puzzle

Create a simple sequence:

START
  │
  ▼
growth
  │
  ▼
fragile wall
  │
  ▼
coolant
  │
  ▼
small passage
  │
  ▼
first enemy
  │
  ▼
EXIT


The first enemy should be avoidable.

The level should take approximately 2 minutes.

The player should leave Level 1 understanding:

I can become large
I can become small
large lets me destroy things
small lets me access narrow spaces
this world is dangerous but manageable
27. LEVEL 2 — "THE SINK"

The second area introduces:

rewind
limited vision
more deliberate exploration
combination of size and destruction

The player enters a much larger vertical industrial cavity.

The space should feel significantly bigger than Level 1.

First rewind machine

Place it in a safe room.

The machine is visually prominent.

The player interacts with it.

The rewind behavior is demonstrated.

Do not require the player to know a keyboard shortcut.

The player can then explore.

First rewind puzzle

Example:

             G
             │
             ▼
       fragile barrier
             │
             ▼
          lower area
             │
        dangerous route
             │
             ▼
          rewind
             │
             ▼
       return to machine


The intended solution is to:

activate rewind machine
grow
destroy a barrier
explore the lower area
make a mistake or reach a dead end
rewind
use the now-destroyed barrier to take a different route

The player should discover the central rule:

The player goes backward. The world doesn't.

Limited vision

Introduce a dark chamber after the rewind mechanic.

Do not combine darkness with difficult enemies immediately.

Let the player simply explore.

The level should feel mysterious rather than frustrating.

Target duration:

~3 minutes.

28. LEVEL 3 — "THE MACHINE"

This is the most puzzle-heavy level.

It combines:

Small
Large
Destruction
Rewind
limited vision
simple enemy hazards

The environment is a huge abandoned industrial processing machine.

The player needs to manipulate the geometry.

Example conceptual structure:

                 ┌─────────────┐
                 │   UPPER     │
                 │   MACHINE   │
                 └──────┬──────┘
                        │
                ┌───────┴───────┐
                │               │
             growth           coolant
                │               │
                ▼               ▼
          LARGE ROUTE       SMALL ROUTE
                │               │
                └───────┬───────┘
                        │
                 DESTRUCTIBLE
                    WALL
                        │
                        ▼
                  REWIND MACHINE
                        │
                        ▼
                      EXIT

Intended design

The player should realize:

"I need to alter the level while large, then rewind myself and use the altered route while small."

This is the core puzzle expression of the game.

Do not make the solution dependent on timing.

The player should have time to think.

Target duration:

~3 minutes.

29. FINALE — "THE CORE"

The finale should be approximately 1–2 minutes.

It should be less puzzle-heavy and more atmospheric.

The player enters a large machine/core chamber.

The facility suddenly feels much larger than the previous rooms suggested.

Use:

enormous machinery
distant lights
cables
strange organic growth
a machine that is still functioning
limited visibility

The player moves through a simple final sequence.

The environment should suggest that:

the player may not be the first creature to use these systems.

Potential visual:

             ╔════════════════════╗
             ║                    ║
             ║       CORE         ║
             ║                    ║
             ║       ◉            ║
             ║      /█\           ║
             ║     /███\          ║
             ║                    ║
             ╚════════╤═══════════╝
                      │
                      │
                  machinery
                      │
                   🙂


The ending should be ambiguous.

Do not explain:

who built the facility
what happened
what the creature is
why the facility stopped
what the core does

Instead, leave the player with enough evidence to form an interpretation.

Possible final image:

The player reaches an observation area.

Beyond glass is an enormous chamber.

There are multiple old growth/recovery stations.

One is visibly sized for something much larger than the player.

The player looks toward it.

Cut to black.

No exposition.

30. Environmental Lore

The narrative should be extremely subtle.

Potential story implication:

The facility was involved in some process involving controlled biological/mechanical growth and dimensional/physical manipulation.

The player may be a remnant or escaped specimen.

The rewind machines may have been designed for something other than the player.

None of this should be confirmed.

Environmental clues

Use a small number of recurring visual motifs:

numbered sectors
abandoned observation rooms
growth chambers
cooling systems
damaged machinery
empty containment areas
unusually large doors
strange scratches
abandoned tools
machines still operating
old warning symbols

No lore dumps.

No readable diary entries required.

If text exists, it should mostly be mundane industrial labels:

SECTOR 03
COOLANT
PRESSURE
MAINTENANCE
CORE ACCESS


Never use text to explain gameplay mechanics.

31. Audio

Use one primary atmospheric music track.

The track should loop seamlessly.

Mood:

mysterious
lonely
industrial
restrained
slightly uncanny

Avoid heroic melodies.

Layer-based music

If trivial to implement, the track may contain optional layers:

BASE
low drone
industrial ambience

EXPLORATION
subtle rhythmic layer

DARK AREA
high atmospheric layer / reduced rhythm

LARGE
slightly deeper layer

FINALE
additional restrained layer


These layers should be mixed subtly based on game state.

This is optional.

A single looping track is an acceptable final implementation.

Do not delay completion to build a sophisticated adaptive music system.

Sound effects

Strong SFX are more important than complex music.

Required effects:

jump
land
growth
shrink
fragile terrain impact
destruction
rewind activation
rewind movement
checkpoint
enemy contact/death
environmental machinery
doors
water/coolant
ambient machinery

Mechanical sounds should have satisfying weight.

The player should be able to understand many interactions through sound as well as visuals.

32. Sound as Tutorial

Sound should reinforce mechanics without explaining them.

Examples:

Growth:

low warm mechanical hum + expansion sound

Shrink:

cool metallic/airy sound

Destruction:

sharp crack + debris

Rewind:

distinctive reversed mechanical sweep

The rewind sound should be unique enough that the player begins associating it with:

"I'm going backward."

33. Main Menu

Keep it minimal.

Suggested:

        [ GAME TITLE ]

             PLAY



Optional:

        [ GAME TITLE ]

             PLAY
            AUDIO


No elaborate menus.

No lore explanation.

No tutorial.

No controls screen unless required for accessibility.

34. Completion

After the finale:

fade to black
brief ending
optionally display title again
simple "Play Again"

Do not show:

completion statistics
collectible percentage
achievement screen
score

The game is intended to be a compact experience.

35. Technical Architecture

Suggested structure:

/src
  main
  game
    Game
    Player
    Level
    Camera
    Physics
    Collision
    RewindSystem
    SizeSystem
    VisibilitySystem
    AudioManager
    InputManager
  entities
    Enemy
    PatrolEnemy
    DroneEnemy
    GrowthSource
    Coolant
    Destructible
    RewindMachine
    Checkpoint
  levels
    level1
    level2
    level3
    finale
  rendering
    PixelRenderer
    Effects
  ui
    PauseMenu
    TouchControls
/assets
  sprites
  tiles
  audio
/index.html


This is illustrative.

Do not over-engineer.

A simpler architecture is preferable if it makes implementation faster and more reliable.

36. Level Representation

Use a simple level representation.

A tile/grid-based format is recommended.

For example:

# = solid
. = empty
D = destructible
G = growth
C = coolant
R = rewind machine
E = exit
^ = hazard
P = player start


The final graphical level does not need to resemble ASCII.

ASCII layouts in this specification are conceptual references only.

Use reusable tiles and objects to construct the actual levels.

37. Collision

Use simple axis-aligned rectangular collision.

Player collision should change between Small and Large.

Avoid complicated polygonal collision.

Destructible objects use simple rectangular hitboxes.

Enemies use simple rectangular or circular hitboxes.

Prioritize predictable behavior over physical realism.

38. Physics

Use deterministic custom platformer physics.

Recommended qualities:

responsive acceleration
predictable horizontal movement
forgiving jump
controlled gravity
stable ground detection
no slippery physics
no realistic momentum requirements

The player should feel immediately controllable on both keyboard and touchscreen.

39. Camera / Visibility Implementation

Camera and visibility should be independent systems.

Camera:

smooth follow
level bounds
player-centered

Visibility:

dark overlay
player-centered mask
optional persistent reveal

Avoid expensive per-pixel lighting.

A simple Canvas compositing operation or radial mask is sufficient.

40. Responsive Rendering

The game uses a fixed internal resolution.

Recommended:

320 × 180

Render the game at this resolution and scale it to the available viewport.

Maintain aspect ratio.

If the phone's aspect ratio differs substantially:

letterbox/pillarbox
do not stretch the game
keep the playable area consistent

The game is landscape only.

41. Input Abstraction

Create a unified input layer so gameplay code does not care whether input originated from:

keyboard
touchscreen

Desktop:

A / Left Arrow  = left
D / Right Arrow = right
Space           = jump
Escape          = pause


The rewind action should be exposed only after the player has discovered/activated the rewind machine.

Mobile:

LEFT
RIGHT
JUMP
PAUSE


A contextual rewind button may appear once rewind has been established.

The player should never need to know a mysterious keyboard key.

42. Accessibility

Keep the first version clean and lightweight.

Required:

adjustable/master audio toggle
pause
mobile controls with large touch targets

Optional only if trivial:

reduced screen shake

Do not build a large accessibility settings system for version 1.

43. Performance

The game should run smoothly on ordinary mobile hardware.

Target:

60 FPS where practical.

Avoid:

excessive particle counts
huge numbers of entities
expensive lighting
unnecessary DOM manipulation every frame
high-resolution rendering

Use Canvas rendering rather than constructing the game world from hundreds of HTML elements.

44. Save/Persistence

No complicated save system is required.

Recommended:

The game simply starts fresh.

If desired, localStorage may remember:

whether the game has been completed
audio preference

Do not save detailed world state.

45. Error Recovery

The game must never require the player to reload the webpage because of a normal gameplay state.

Implement:

level restart
safe checkpoint/restart state
reset of transient state
graceful handling of invalid states

If an unusual edge case occurs:

reset the current level rather than risking an unrecoverable game state.

46. Developer Testing Checklist

Before considering the game complete, test:

Movement
left/right works on keyboard
left/right works on touch
jump works
player cannot escape level boundaries
player cannot become stuck inside terrain
Size
growth works
shrinking works
collision dimensions change correctly
large player cannot enter small spaces
small player cannot destroy large structures
Destruction
fragile terrain breaks correctly
debris/effect plays
destruction persists through rewind
destruction resets after level restart
Rewind
rewind point is established correctly
player returns correctly
environment remains unchanged
size state behaves correctly
enemies do not produce impossible states
rewind cannot place player inside solid geometry
Vision
player remains visible
visibility mask follows player
level remains navigable
no catastrophic performance issues
Enemies
patrol behavior works
collision works
death/reset works
enemies cannot trap the player permanently
Mobile
touch buttons work
controls do not interfere with gameplay
browser viewport is handled correctly
orientation is correct
pause works
Audio
music loops
SFX play
audio can be disabled
no overlapping sounds become excessive
Completion
all three levels can be completed
finale can be completed
game reaches ending
player can restart/play again
47. Final Quality Standard

The game does NOT need to have AAA polish.

It DOES need to feel intentional.

The finished experience should have:

cohesive art direction
consistent mechanic colors
satisfying destruction
readable level geometry
responsive controls
strong sound effects
mysterious atmosphere
clean mobile controls
no unnecessary UI
no tutorials
no exposition dumps

The player should be able to begin playing with essentially no explanation.

Within the first minute, they should understand the basic interaction language simply by experimenting.

48. Absolute Design Rules

These rules override other implementation decisions.

Rule 1 — No tutorial

Never explain a mechanic with text.

Rule 2 — Show before requiring

Every mechanic must appear safely before becoming necessary.

Rule 3 — Environment communicates mechanics

Visual language must make interactive objects obvious.

Rule 4 — Simple intended solutions

Puzzles should have one clear intended solution.

Rule 5 — No softlocks

Every puzzle state must be recoverable.

Rule 6 — Exploration without checklist design

Exploration rewards curiosity, not completionism.

Rule 7 — Mystery without exposition

The story should be inferred.

Rule 8 — Scope beats ambition

If a feature threatens overnight implementation, simplify it.

Rule 9 — Mobile is a first-class platform

Do not build desktop controls and bolt touch controls on later.

Rule 10 — Finish the game

A complete 10-minute game is preferable to a technically impressive but unfinished prototype.

49. Suggested Development Order

The AI developer should work in this order:

Create browser game shell.
Implement fixed-resolution Canvas rendering.
Implement player movement.
Implement collision.
Implement Small/Large states.
Implement growth/shrink objects.
Implement destructible terrain.
Implement rewind machine and player-only rewind.
Implement visibility mask.
Implement basic enemy.
Implement touch controls.
Build Level 1.
Build Level 2.
Build Level 3.
Build finale.
Add environmental art.
Add SFX.
Add atmospheric music.
Add pause/restart.
Test all puzzle states.
Test mobile browser.
Fix softlocks and major bugs.
Apply final visual/audio polish.

Do not spend excessive time building infrastructure before there is a playable level.

50. Definition of Done

The project is complete when a player can:

Open the web page.
Start the game without reading instructions.
Immediately understand movement through experimentation.
Discover growth.
Discover shrinking.
Discover destruction.
Discover rewind.
Complete all three major levels.
Reach the finale.
Experience the ambiguous ending.
Restart and play again.
Do all of the above on both laptop and phone.

The finished game should leave the player with the feeling:

"I figured that out myself."

and, after the ending:

"Wait... what actually happened here?"

The game should be small, strange, atmospheric, mechanically coherent, and complete.

That is the v1 developer specification I'd hand to an AI coding agent.

One thing I deliberately did not do is over-specify every tile coordinate and every pixel. The ASCII maps are useful for communicating spatial ideas, but if we give an overnight coding agent a 500-line coordinate-by-coordinate level specification, it will spend its time fighting the specification rather than building the game.

The next useful step, if you want to continue refining before implementation, would be to turn Levels 1–3 + the finale into much more concrete room-by-room blueprints: what the player sees first, exact sequence of discoveries, approximate room sizes, where each growth/coolant/rewind object goes, enemy placements, intended solution, and the environmental-lore beat in each room. That would be the bridge between this game spec and actual level construction.