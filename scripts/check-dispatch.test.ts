import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  entriesForIssue,
  isStale,
  issueBodyProblems,
  lastCommitTouching,
  untaggedEntries,
} from "./check-dispatch.ts";

const LOG = `# Agent log

---

- **Architect** [#3 #8] — solver's jump-arc table derives from the physics
  constants, not hand-copied numbers.
- **Architect** [#9] — TILE = 10 is load-bearing; the 16 px fallback
  invalidates every room, so decide before authoring.
- **Orchestrator** — added a gate between planning and building.
`;

describe("entriesForIssue", () => {
  it("delivers only the entries tagged for that issue", () => {
    const found = entriesForIssue(LOG, 8);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("jump-arc table");
  });

  it("matches on the whole tag, not a substring of a longer number", () => {
    // #9 must not be found by a search for #9 inside a hypothetical #19
    expect(entriesForIssue("- **A** [#19] — x", 9)).toEqual([]);
  });

  it("returns nothing for an issue no entry constrains", () => {
    expect(entriesForIssue(LOG, 11)).toEqual([]);
  });
});

describe("untaggedEntries", () => {
  it("finds entries that no dispatch will ever deliver", () => {
    const untagged = untaggedEntries(LOG);
    expect(untagged).toHaveLength(1);
    expect(untagged[0]).toContain("Orchestrator");
  });

  it("ignores the file's prose header", () => {
    expect(untaggedEntries("# Agent log\n\nSome prose.\n")).toEqual([]);
  });
});

describe("issueBodyProblems", () => {
  it("catches the escaped backticks that shell quoting produces", () => {
    const problems = issueBodyProblems("Read \\`plan.md\\` first.\n\nDone when: it works.");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("escaped backticks");
  });

  it("catches criteria that aren't written test-shaped", () => {
    const problems = issueBodyProblems("Build the thing.");
    expect(problems.some((p) => p.includes("Done when"))).toBe(true);
  });

  it("passes a well-formed body", () => {
    expect(issueBodyProblems("Read `plan.md` §3.\n\n**Done when:**\n- `pnpm check` green")).toEqual(
      [],
    );
  });
});

// Log lag is the one check that needs real history: the failure it catches is
// "work landed after the log last moved", which only exists in commits.
describe("isStale, against a real repository", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  const run = (cwd: string, ...args: string[]): void => {
    execFileSync("git", args, { cwd, stdio: "ignore" });
  };

  function repo(): string {
    const d = mkdtempSync(join(tmpdir(), "dispatch-"));
    run(d, "init", "-b", "main");
    run(d, "config", "user.email", "t@t.t");
    run(d, "config", "user.name", "t");
    mkdirSync(join(d, "notes", "agents"), { recursive: true });
    mkdirSync(join(d, "src"), { recursive: true });
    return d;
  }

  it("is clean when the log moved in the same commit as the work", () => {
    dir = repo();
    writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(dir, "notes", "agents", "log.md"), LOG);
    run(dir, "add", "-A");
    run(dir, "commit", "-m", "work plus log");
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      expect(isStale(lastCommitTouching(["notes/agents/log.md"]), lastCommitTouching(["src"]))).toBe(
        false,
      );
    } finally {
      process.chdir(cwd);
    }
  });

  it("is stale when work landed in a later commit than the log", () => {
    dir = repo();
    writeFileSync(join(dir, "notes", "agents", "log.md"), LOG);
    run(dir, "add", "-A");
    run(dir, "commit", "-m", "log only");
    writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n");
    run(dir, "add", "-A");
    run(dir, "commit", "-m", "work with no log entry");
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      expect(isStale(lastCommitTouching(["notes/agents/log.md"]), lastCommitTouching(["src"]))).toBe(
        true,
      );
    } finally {
      process.chdir(cwd);
    }
  });

  it("is stale when work exists and the log has never been committed", () => {
    expect(isStale(undefined, "abc1234")).toBe(true);
  });

  it("is clean when there is no work yet to have logged", () => {
    expect(isStale(undefined, undefined)).toBe(false);
  });
});
