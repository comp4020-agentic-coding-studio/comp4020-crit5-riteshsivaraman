import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Sensor, caught for real on issue #10: `el.hidden = true` works only
// through the UA stylesheet's `[hidden] { display: none }` rule. An author
// rule with a higher-specificity selector (an id, in this stylesheet) that
// sets `display` on that same element outranks it — the attribute gets set,
// the code runs with no error, and the element still renders. That's
// exactly what happened to `#game-controls`: `main.ts`'s
// `controls.hidden = true` in the landscape branch compiled and ran fine
// while the touch pads kept rendering over the canvas, because
// `#game-controls { display: flex; }` beat the UA `[hidden]` rule and
// `position: absolute` is only applied in the portrait branch, so the pads
// fell into static flow on top of the game view.
//
// The ids checked here are exactly the ones toggled via `el.hidden = ...`
// somewhere in src/ (`grep -rn '\.hidden' src/` to refresh this list — it
// isn't derived automatically, since these ids reach `hidden` through DOM
// element references picked up via getElementById, not string literals a
// script could follow reliably).
const HIDDEN_TOGGLED_IDS = ["game-controls", "rewind-control"];

const CSS_PATH = join(process.cwd(), "src", "styles", "styles.css");

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

type Rule = { selectors: string[]; body: string };

function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  const pattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css))) {
    const selectors = match[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    rules.push({ selectors, body: match[2] });
  }
  return rules;
}

/** First `display` value a rule's body sets, or null if it doesn't touch
 * `display` at all. */
function displayValue(body: string): string | null {
  const match = /display\s*:\s*([a-zA-Z-]+)/.exec(body);
  return match ? match[1] : null;
}

describe("hidden-display: elements toggled via .hidden must not have display rules that outrank [hidden]", () => {
  const css = withoutComments(readFileSync(CSS_PATH, "utf8"));
  const rules = parseRules(css);

  for (const id of HIDDEN_TOGGLED_IDS) {
    it(`#${id}: any bare display rule is guarded by a [hidden] override`, () => {
      const bareSelector = `#${id}`;
      const bareRuleSetsDisplay = rules.some(
        (rule) => rule.selectors.includes(bareSelector) && displayValue(rule.body) !== null,
      );

      if (!bareRuleSetsDisplay) {
        // No competing display rule on the plain id selector at all — the
        // UA's `[hidden] { display: none }` rule is free to win on its own.
        return;
      }

      const hasHiddenGuard = rules.some(
        (rule) =>
          rule.selectors.some(
            (sel) => sel === `${bareSelector}[hidden]` || sel === `[hidden]${bareSelector}`,
          ) && displayValue(rule.body) === "none",
      );

      expect(
        hasHiddenGuard,
        `${bareSelector} sets 'display' outside a [hidden]-guarded rule, which outranks ` +
          `the UA '[hidden] { display: none }' default — setting .hidden = true on this ` +
          `element in JS will have no visible effect. Add ` +
          `'${bareSelector}[hidden] { display: none; }'.`,
      ).toBe(true);
    });
  }
});
