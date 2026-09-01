import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Sensor: plan.md's hard rule — "the environment is the tutorial". The game
// may never explain itself in words: no "press R to rewind", no key glyphs,
// no HUD copy. This runs against the BUILT site, so it checks what ships.
//
// It deliberately also scans README.md and the meta description: a link
// preview and the repo's front page are read before the game is, and an
// explanation there defeats the rule just as thoroughly as one on screen
// (notes/agents/log.md, Architect entry [#1 #12 #14]).
//
// Accessible names are exempt from the *phrasing* rule but not from length:
// aria-label="Rewind" is a name a screen reader announces, which the rule
// needs; aria-label="Press R to rewind" is a tutorial wearing a costume.
const DIST = resolve("dist");

const INSTRUCTIONAL = [
  /\bpress\b/i,
  /\bclick\b/i,
  /\btap\b/i,
  /\bhold\b/i,
  /\buse the\b/i,
  /\barrow keys?\b/i,
  /\bspace ?bar\b/i,
  /\bkeyboard\b/i,
  /\bto (jump|move|rewind|grow|shrink|restart|continue)\b/i,
  /\bhow to\b/i,
  /\bcontrols?:/i,
];

function htmlFiles(dir: string = DIST): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? htmlFiles(p) : p.endsWith(".html") ? [p] : [];
  });
}

/** Visible text of the shipped page, with script/style stripped. */
function visibleText(html: string): string {
  const doc = new JSDOM(html).window.document;
  for (const el of [...doc.querySelectorAll("script,style")]) el.remove();
  return doc.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("no-instructions: the environment is the tutorial", () => {
  const pages = htmlFiles();

  it("the build emitted at least one page to check", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const page of pages) {
    const html = readFileSync(page, "utf8");

    it(`${page.replace(DIST, "dist")}: visible text explains nothing`, () => {
      const text = visibleText(html);
      for (const pattern of INSTRUCTIONAL) {
        expect(pattern.test(text), `visible text matched ${pattern}: "${text.slice(0, 160)}"`).toBe(
          false,
        );
      }
    });

    it(`${page.replace(DIST, "dist")}: the meta description explains nothing`, () => {
      const doc = new JSDOM(html).window.document;
      const desc = doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
      expect(desc.length, "no meta description to check").toBeGreaterThan(0);
      for (const pattern of INSTRUCTIONAL) {
        expect(pattern.test(desc), `description matched ${pattern}: "${desc}"`).toBe(false);
      }
    });

    it(`${page.replace(DIST, "dist")}: accessible names are names, not sentences`, () => {
      const doc = new JSDOM(html).window.document;
      for (const el of [...doc.querySelectorAll("[aria-label]")]) {
        const label = el.getAttribute("aria-label") ?? "";
        expect(
          label.split(/\s+/).length,
          `aria-label "${label}" reads as a sentence, not a control name`,
        ).toBeLessThanOrEqual(3);
        for (const pattern of INSTRUCTIONAL) {
          expect(pattern.test(label), `aria-label "${label}" matched ${pattern}`).toBe(false);
        }
      }
    });
  }

  // Only the player-facing intro — everything from the first "##" onward is
  // developer documentation (how to run the checks, where the plan lives),
  // which a player never reads and which legitimately contains words like
  // "press" and "run". Scanning the whole file flagged the template's own
  // "Yours to grow.", which is exactly the kind of false positive that
  // teaches people to ignore a sensor.
  it("README.md's player-facing intro explains the game without teaching the controls", () => {
    const readme = readFileSync(resolve("README.md"), "utf8");
    const cut = readme.indexOf("\n## ");
    const intro = cut > 0 ? readme.slice(0, cut) : readme;
    expect(intro.length, "README has no intro before its first heading").toBeGreaterThan(40);
    for (const pattern of INSTRUCTIONAL) {
      expect(pattern.test(intro), `README.md intro matched ${pattern}: "${intro.slice(0, 160)}"`).toBe(
        false,
      );
    }
  });
});
