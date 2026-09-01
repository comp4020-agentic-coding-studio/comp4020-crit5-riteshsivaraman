import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Sensor: plan.md §5's dependency rule. rules/physics/world/solver — and,
// crucially, loop.ts and layout.ts themselves, which is exactly why they're
// importable into vitest with no canvas at all — must stay free of browser
// globals. Only render.ts and input.ts (not yet built) are expected to touch
// the DOM from inside src/game; main.ts is the bootstrap and deliberately
// lives outside this directory, in src/scripts, so it never enters this scan.
// This checks source text rather than actually running in two environments,
// which is a cheap approximation but catches the obvious case (a stray
// `document.` or `window.` creeping into a module meant to stay pure).
const GAME_DIR = join(process.cwd(), "src", "game");
const ALLOWED_BROWSER_MODULES = new Set(["render.ts", "input.ts"]);

const BROWSER_API_PATTERN =
  /\b(document|window|navigator|localStorage|sessionStorage|requestAnimationFrame|performance\.now|addEventListener|HTMLCanvasElement|getContext)\b/;

// Strip `//` line comments before matching so a comment that merely
// *mentions* a browser API (explaining why a module must avoid one, say)
// doesn't trip the sensor. Deliberately not stripping /* */ block comments
// or string contents — this is a cheap approximation, not a parser, and the
// simple case is the one worth handling cheaply.
function withoutLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function gameFiles(): string[] {
  try {
    return readdirSync(GAME_DIR).filter((name) => name.endsWith(".ts"));
  } catch {
    return [];
  }
}

describe("pure modules: no browser API outside render/input", () => {
  const files = gameFiles();

  it("found at least the loop and layout modules to check", () => {
    expect(files).toEqual(expect.arrayContaining(["loop.ts", "layout.ts"]));
  });

  for (const file of files) {
    if (ALLOWED_BROWSER_MODULES.has(file)) continue;

    it(`${file} does not reference a browser API`, () => {
      const source = withoutLineComments(readFileSync(join(GAME_DIR, file), "utf8"));
      expect(BROWSER_API_PATTERN.test(source), `${file} matched a browser API pattern`).toBe(
        false,
      );
    });
  }
});
