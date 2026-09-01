// The canvas painter: bakes tileset.ts's pixel data into an atlas once at
// boot, then blits a Level and the player rect every frame. Per plan.md §5
// this is one of the two modules (with input.ts) allowed to touch browser
// canvas APIs — spec/pure-modules.test.ts allow-lists this file by name and
// scans every other file under src/game for exactly that reason. Keep the
// dependency direction one-way: this module may import tiles.ts, tileset.ts
// and level.ts; none of those may import this one.
//
// Issue 14 (notes/agents/log.md [#14]): plan.md §11 item 2's "procedural
// tile renderer" was never built when issue 2 shipped tilePixels() as pure
// byte data — this file is that missing half. tilePixels() returns flat
// RGBA per TILE*TILE tile; bakeAtlas() below does exactly one
// putImageData() per distinct tile kind, once, into a single wide atlas
// canvas, and renderLevel() then does one drawImage() per non-empty tile
// per frame, reading from that atlas. Nothing here re-derives pixel bytes
// after boot.
import { TILE, type TileKind } from "./tiles";
import { tilePixels, allTileKinds } from "./tileset";
import { tileKindAt, type Level } from "./level";

// ---------------------------------------------------------------------------
// Minimal structural types for the canvas APIs this module needs. Kept
// deliberately narrow (rather than importing lib.dom.d.ts's
// CanvasRenderingContext2D/HTMLCanvasElement) so spec/render.test.ts can
// drive this against a plain stub object with no jsdom canvas at all —
// only the handful of members actually used need to match.
// ---------------------------------------------------------------------------

/** Whatever `ImageData` shape `putImageData` needs — real `ImageData` in a
 * browser, a plain `{data, width, height}` object in tests. */
export type ImageDataLike = {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
};

/** `image` is typed `unknown` because the real DOM `drawImage` overload set
 * accepts several source types (canvas, image, bitmap) that this module
 * doesn't need to distinguish — it only ever passes back the same atlas
 * canvas object it created in `bakeAtlas`. */
export interface RenderCtx {
  imageSmoothingEnabled: boolean;
  fillStyle: string;
  fillRect(x: number, y: number, width: number, height: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  putImageData(image: ImageDataLike, dx: number, dy: number): void;
  drawImage(
    image: unknown,
    sx: number,
    sy: number,
    sWidth: number,
    sHeight: number,
    dx: number,
    dy: number,
    dWidth: number,
    dHeight: number,
  ): void;
}

export interface RenderCanvas {
  readonly width: number;
  readonly height: number;
  getContext(kind: "2d"): RenderCtx | null;
}

/** Builds a fresh offscreen canvas of the given pixel size. main.ts passes
 * `document.createElement("canvas")`; tests pass a stub that records calls. */
export type CreateCanvas = (width: number, height: number) => RenderCanvas;

/** Wraps flat RGBA bytes into whatever `putImageData` needs. main.ts passes
 * `(data, w, h) => new ImageData(data, w, h)`; the default here is a plain
 * object, which is all a test stub cares about. */
export type CreateImageData = (data: Uint8ClampedArray, width: number, height: number) => ImageDataLike;

const defaultCreateImageData: CreateImageData = (data, width, height) => ({ data, width, height });

// ---------------------------------------------------------------------------
// Atlas bake — once at boot
// ---------------------------------------------------------------------------

export type AtlasOffset = { x: number; y: number };

export type Atlas = {
  canvas: RenderCanvas;
  /** Source rect (in atlas pixels) for each tile kind, TILE*TILE each. */
  offsets: ReadonlyMap<TileKind, AtlasOffset>;
};

/**
 * Bake every tile kind into one wide atlas canvas, left to right in
 * `allTileKinds()` order, exactly once. Calls `putImageData` exactly once
 * per distinct tile kind and never again — `renderLevel` below never calls
 * it, so nothing rebuilds the atlas per frame.
 */
export function bakeAtlas(createCanvas: CreateCanvas, createImageData: CreateImageData = defaultCreateImageData): Atlas {
  const kinds = allTileKinds();
  const canvas = createCanvas(TILE * kinds.length, TILE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("render.ts: bakeAtlas could not get a 2d context from the atlas canvas");
  }

  const offsets = new Map<TileKind, AtlasOffset>();
  kinds.forEach((kind, index) => {
    const offset: AtlasOffset = { x: index * TILE, y: 0 };
    offsets.set(kind, offset);
    ctx.putImageData(createImageData(tilePixels(kind), TILE, TILE), offset.x, offset.y);
  });

  return { canvas, offsets };
}

// ---------------------------------------------------------------------------
// Per-frame draw
// ---------------------------------------------------------------------------

export type PlayerRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Issue #4: warm/cool colouring by size is the only explanation a
   * no-tutorial player gets for what grow/coolant did. Optional so every
   * existing caller (and every other issue's test fixture) keeps working
   * unchanged — omitted, this falls back to the original neutral colour. */
  color?: string;
};

/** Tile kinds that never need a blit — pure floor, nothing to draw. Fragile
 * tiles already destroyed join this set dynamically in `renderLevel`. */
const SKIP_KIND: ReadonlySet<TileKind> = new Set<TileKind>(["empty"]);

/** Not one of the reserved mechanic colours (tileset.ts's `g`/`y`/`v`) and
 * not any terrain hue, so the player reads as a distinct foreground entity
 * against the tileset per plan.md §4/§9. Default when `player.color` isn't
 * given (see issue #4's `PlayerRect.color`). */
const PLAYER_COLOR = "#f4f4f0";

/**
 * Draw one frame: background, every non-empty (and non-destroyed-fragile)
 * tile in `level`'s grid blitted from `atlas`, then the player rect on top.
 * One `drawImage` per qualifying tile — no other canvas writes per tile.
 */
export function renderLevel(
  ctx: RenderCtx,
  atlas: Atlas,
  level: Level,
  destroyed: ReadonlySet<string>,
  player: PlayerRect,
  backgroundColor = "#101014",
): void {
  const widthPx = level.width * TILE;
  const heightPx = level.height * TILE;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, widthPx, heightPx);

  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const kind = tileKindAt(level, x, y);
      if (SKIP_KIND.has(kind)) continue;
      if (kind === "fragile" && destroyed.has(`${x},${y}`)) continue;

      const offset = atlas.offsets.get(kind);
      if (!offset) continue;

      ctx.drawImage(atlas.canvas, offset.x, offset.y, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
    }
  }

  ctx.fillStyle = player.color ?? PLAYER_COLOR;
  ctx.fillRect(player.x, player.y, player.width, player.height);
}
