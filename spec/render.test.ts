import { describe, expect, it, vi } from "vitest";
import { bakeAtlas, renderLevel, type RenderCanvas, type RenderCtx } from "../src/game/render";
import { allTileKinds } from "../src/game/tileset";
import { TILE } from "../src/game/tiles";
import { parseLevel } from "../src/game/level";

// Issue 14's acceptance criteria (gh issue view 14). No jsdom canvas
// anywhere here — a plain stub 2D context, per the issue's explicit
// instruction, so this sensor can never be satisfied by "a canvas existed
// somewhere in the DOM" the way a zero-file sensor once was (notes/agents/
// log.md).

type StubCtx = {
  imageSmoothingEnabled: boolean;
  fillStyle: string;
  fillRect: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
};

function makeStubCtx(): StubCtx {
  return {
    imageSmoothingEnabled: false,
    fillStyle: "",
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
  };
}

function asRenderCtx(stub: StubCtx): RenderCtx {
  return stub as unknown as RenderCtx;
}

function makeStubCanvasFactory() {
  const ctx = makeStubCtx();
  const canvas: RenderCanvas = {
    width: 0,
    height: 0,
    getContext: () => asRenderCtx(ctx),
  };
  const createCanvas = vi.fn(() => canvas);
  return { createCanvas, canvas, ctx };
}

describe("bakeAtlas: boot-time bake, never repeated", () => {
  it("calls putImageData exactly once per distinct tile kind, and creates exactly one canvas", () => {
    const { createCanvas, ctx } = makeStubCanvasFactory();

    const atlas = bakeAtlas(createCanvas);

    const kinds = allTileKinds();
    expect(createCanvas).toHaveBeenCalledTimes(1);
    expect(ctx.putImageData).toHaveBeenCalledTimes(kinds.length);
    expect(atlas.offsets.size).toBe(kinds.length);
  });

  it("gives every tile kind a distinct, non-overlapping TILE-wide offset", () => {
    const { createCanvas } = makeStubCanvasFactory();
    const atlas = bakeAtlas(createCanvas);

    const xs = [...atlas.offsets.values()].map((o) => o.x).sort((a, b) => a - b);
    for (let i = 0; i < xs.length; i++) {
      expect(xs[i]).toBe(i * TILE);
    }
  });

  it("never calls putImageData again across subsequent render frames", () => {
    const { createCanvas, ctx } = makeStubCanvasFactory();
    const atlas = bakeAtlas(createCanvas);
    const kinds = allTileKinds();
    ctx.putImageData.mockClear();

    const renderCtx = makeStubCtx();
    const level = parseLevel(["P.", ".E"]);
    for (let frame = 0; frame < 5; frame++) {
      renderLevel(asRenderCtx(renderCtx), atlas, level, new Set(), { x: 0, y: 0, width: 8, height: 8 });
    }

    expect(ctx.putImageData).not.toHaveBeenCalled();
    expect(kinds.length).toBeGreaterThan(0); // sanity: the earlier bake had something to bake
  });
});

describe("renderLevel: one blit per non-empty tile, at the right atlas offset", () => {
  it("draws one drawImage per non-empty tile, reading from the tile's baked atlas offset", () => {
    const { createCanvas } = makeStubCanvasFactory();
    const atlas = bakeAtlas(createCanvas);

    // '#' solidConcrete, '=' fragile, ':' decor, '.' empty (skipped), plus
    // the mandatory single P/E. 2x2 grid: 4 tiles, 3 non-empty.
    const level = parseLevel(["P#", "=E"]);

    const renderCtx = makeStubCtx();
    const player = { x: 3, y: 4, width: 8, height: 16 };
    renderLevel(asRenderCtx(renderCtx), atlas, level, new Set(), player);

    // Non-empty tiles: P (spawn), # (solidConcrete), = (fragile), E (exit).
    // "." would be empty and skipped, but this fixture has none.
    expect(renderCtx.drawImage).toHaveBeenCalledTimes(4);

    const solidOffset = atlas.offsets.get("solidConcrete")!;
    const fragileOffset = atlas.offsets.get("fragile")!;
    const spawnOffset = atlas.offsets.get("spawn")!;
    const exitOffset = atlas.offsets.get("exit")!;

    expect(renderCtx.drawImage).toHaveBeenCalledWith(
      atlas.canvas,
      spawnOffset.x,
      spawnOffset.y,
      TILE,
      TILE,
      0,
      0,
      TILE,
      TILE,
    );
    expect(renderCtx.drawImage).toHaveBeenCalledWith(
      atlas.canvas,
      solidOffset.x,
      solidOffset.y,
      TILE,
      TILE,
      TILE,
      0,
      TILE,
      TILE,
    );
    expect(renderCtx.drawImage).toHaveBeenCalledWith(
      atlas.canvas,
      fragileOffset.x,
      fragileOffset.y,
      TILE,
      TILE,
      0,
      TILE,
      TILE,
      TILE,
    );
    expect(renderCtx.drawImage).toHaveBeenCalledWith(
      atlas.canvas,
      exitOffset.x,
      exitOffset.y,
      TILE,
      TILE,
      TILE,
      TILE,
      TILE,
      TILE,
    );
  });

  it("skips a fragile tile once its coordinate is in the destroyed set", () => {
    const { createCanvas } = makeStubCanvasFactory();
    const atlas = bakeAtlas(createCanvas);
    const level = parseLevel(["P#", "=E"]);
    const renderCtx = makeStubCtx();

    renderLevel(asRenderCtx(renderCtx), atlas, level, new Set(["0,1"]), { x: 0, y: 0, width: 8, height: 8 });

    // Only P, #, E now — the destroyed fragile at (0,1) is skipped.
    expect(renderCtx.drawImage).toHaveBeenCalledTimes(3);
    const fragileOffset = atlas.offsets.get("fragile")!;
    expect(renderCtx.drawImage).not.toHaveBeenCalledWith(
      atlas.canvas,
      fragileOffset.x,
      fragileOffset.y,
      TILE,
      TILE,
      0,
      TILE,
      TILE,
      TILE,
    );
  });

  it("draws the player rect at its given position and size, on top of the tiles", () => {
    const { createCanvas } = makeStubCanvasFactory();
    const atlas = bakeAtlas(createCanvas);
    const level = parseLevel(["P.", ".E"]);
    const renderCtx = makeStubCtx();
    const player = { x: 12, y: 34, width: 8, height: 16 };

    renderLevel(asRenderCtx(renderCtx), atlas, level, new Set(), player);

    // Last fillRect call is the player: the background fill happens first,
    // covering the whole level, then the player draws on top of it.
    const calls = renderCtx.fillRect.mock.calls;
    expect(calls.at(-1)).toEqual([player.x, player.y, player.width, player.height]);
  });
});
