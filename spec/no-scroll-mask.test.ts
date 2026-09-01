import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Sensor: "no horizontal scroll" is a claim about layout fitting the
// viewport, not about the scrollbar being invisible. `overflow-x: hidden`
// (or `overflow: hidden`) on `html`/`body` makes a genuine overflow
// unfalsifiable by hiding the symptom instead of fixing the cause — the
// page can overflow by any amount and this criterion would still read
// green. This is a harness sensor (outlives this brief, not this issue):
// never let a check pass by disabling the thing it observes.
const CSS_PATH = join(process.cwd(), "src", "styles", "styles.css");

// Strip comments so a comment merely discussing overflow-x doesn't trip it.
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function rulesFor(css: string, selector: string): string[] {
  const blocks: string[] = [];
  const pattern = new RegExp(`(^|[,{}\\s])${selector}\\s*\\{([^}]*)\\}`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css))) blocks.push(match[2]);
  return blocks;
}

describe("no-scroll-mask: horizontal overflow must not be hidden away", () => {
  const css = withoutComments(readFileSync(CSS_PATH, "utf8"));

  for (const selector of ["html", "body"]) {
    it(`${selector} does not suppress overflow-x`, () => {
      const blocks = rulesFor(css, selector);
      const suppressesX = blocks.some((block) =>
        /overflow(-x)?\s*:\s*(hidden|clip)/.test(block),
      );
      expect(
        suppressesX,
        `${selector} sets overflow(-x): hidden/clip — this masks a real horizontal ` +
          `overflow instead of fixing the layout that causes it`,
      ).toBe(false);
    });
  }
});
