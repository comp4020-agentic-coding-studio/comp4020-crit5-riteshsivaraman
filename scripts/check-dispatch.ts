#!/usr/bin/env node
// The gate between planning and building. Run it before handing an issue to a
// Builder-Tester session, not as part of `pnpm check` --- these are facts about
// the handoff, not about the code, and two of them need the network.
//
// It exists because all four of its checks failed at once on this crit's first
// dispatch: plan.md was untracked while every issue's first line said "read
// plan.md", the stack migration sat uncommitted where a Builder's first commit
// would have absorbed it, twelve of thirteen issue bodies carried literal
// backslash-escaped backticks from the shell quoting that created them, and the
// agent log was unread. Each is cheap here and expensive inside a /clear-ed
// session, which improvises rather than stopping when a promised file is
// missing.
//
// Usage: `pnpm check:dispatch` for the gate alone, or `pnpm check:dispatch 3`
// to also print the log entries tagged for issue 3 --- paste those into the
// Builder's opening prompt so the log is delivered rather than merely findable.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const LOG_PATH = "notes/agents/log.md";

/** Paths whose commits represent real work. A commit touching one of these
 *  without the log moving too means a session shipped without recording why. */
const WORK_PATHS = ["src", "plan.md", "spec", "scripts"];

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/** Last commit touching any of `paths`, or undefined if none ever has. */
export function lastCommitTouching(paths: string[]): string | undefined {
  const out = git("log", "-1", "--format=%H", "--", ...paths);
  return out === "" ? undefined : out;
}

/** True when `work` is strictly newer than `log` in the first-parent history.
 *  Uses ancestry rather than timestamps, which rebases and clock skew break. */
export function isStale(logCommit: string | undefined, workCommit: string | undefined): boolean {
  if (!workCommit) return false; // no work yet, nothing to have logged
  if (!logCommit) return true; // work exists, log has never been committed
  if (logCommit === workCommit) return false; // logged in the same commit
  try {
    // log is an ancestor of work => work landed after the last log entry
    execFileSync("git", ["merge-base", "--is-ancestor", logCommit, workCommit], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/** Entries are `- **Role** [#3 #8] — ...`; returns the issue numbers tagged on
 *  each entry so a Builder can be handed only what constrains its own issue. */
export function entriesForIssue(log: string, issue: number): string[] {
  const entries = log
    .split(/\n(?=- \*\*)/)
    .filter((block) => block.trimStart().startsWith("- **"));
  return entries.filter((entry) => {
    const tags = entry.match(/^- \*\*[^*]+\*\*[^—\n]*\[([^\]]+)\]/);
    if (!tags) return false;
    return tags[1].split(/\s+/).includes(`#${issue}`);
  });
}

/** Entries carrying no [#n] tag at all. Untagged entries are invisible to the
 *  targeted read, so they silently stop being delivered to anyone. */
export function untaggedEntries(log: string): string[] {
  const entries = log
    .split(/\n(?=- \*\*)/)
    .filter((block) => block.trimStart().startsWith("- **"));
  return entries.filter((entry) => !/^- \*\*[^*]+\*\*[^—\n]*\[#\d/.test(entry));
}

/** Issue-body defects a Builder would read as instructions. */
export function issueBodyProblems(body: string): string[] {
  const problems: string[] = [];
  if (body.includes("\\`")) {
    problems.push(
      "escaped backticks (\\`) — create and edit bodies with --body-file or a " +
        "single-quoted heredoc, never an inline double-quoted shell string",
    );
  }
  if (!/done when/i.test(body)) {
    problems.push("no 'Done when:' block — criteria must be written test-shaped");
  }
  return problems;
}

function main(): void {
  let failed = false;
  const fail = (msg: string): void => {
    console.error(`✗ ${msg}`);
    failed = true;
  };
  const ok = (msg: string): void => console.log(`✓ ${msg}`);
  const skip = (msg: string): void => console.warn(`! ${msg}`);

  // 1. A Builder's first commit should contain the Builder's work and nothing
  //    it inherited, or "closes #n" cites a diff no one can read.
  const dirty = git("status", "--porcelain");
  if (dirty === "") {
    ok("working tree clean");
  } else {
    fail(`working tree dirty — commit or stash before dispatching:\n${dirty}`);
  }

  // 2. Every issue opens with "read plan.md". Untracked, that instruction
  //    resolves only inside the one working copy that authored it.
  if (!existsSync("plan.md")) {
    fail("no plan.md — the Architect pass hasn't produced one");
  } else if (git("ls-files", "plan.md") === "") {
    fail("plan.md is untracked — a /clear-ed session or fresh clone can't read it");
  } else {
    ok("plan.md tracked");
  }

  // 3. Log lag, by ancestry: has work landed since the log last moved?
  if (!existsSync(LOG_PATH)) {
    fail(`no ${LOG_PATH} — it's step 2 of the Builder bootstrap`);
  } else {
    const logCommit = lastCommitTouching([LOG_PATH]);
    const workCommit = lastCommitTouching(WORK_PATHS.filter((p) => existsSync(p)));
    if (isStale(logCommit, workCommit)) {
      fail(
        `${LOG_PATH} is stale — ${workCommit?.slice(0, 7)} changed work paths after the ` +
          `last log entry (${logCommit?.slice(0, 7) ?? "never committed"}). The session that ` +
          "made that commit didn't record why.",
      );
    } else {
      ok("agent log current with the last work commit");
    }

    const untagged = untaggedEntries(readFileSync(LOG_PATH, "utf8"));
    if (untagged.length > 0) {
      // A warning, not a failure: an entry can legitimately constrain nothing.
      skip(
        `${untagged.length} log entr(ies) carry no [#n] tag, so no dispatch will deliver them`,
      );
    }
  }

  // 4. The issue bodies, as stored rather than as rendered.
  let issues: { number: number; title: string; body: string }[] = [];
  try {
    issues = JSON.parse(
      execFileSync("gh", ["issue", "list", "--state", "open", "--limit", "100", "--json", "number,title,body"], {
        encoding: "utf8",
      }),
    );
  } catch {
    skip("gh unavailable or not authenticated — skipping the issue-body check");
  }
  let clean = 0;
  for (const issue of issues) {
    const problems = issueBodyProblems(issue.body);
    if (problems.length === 0) clean += 1;
    for (const problem of problems) fail(`issue ${issue.number}: ${problem}`);
  }
  if (issues.length > 0 && clean === issues.length) {
    ok(`${clean} open issue bod(ies) clean`);
  }

  // 5. The delivery step: what this issue's Builder must be told.
  const target = Number.parseInt(process.argv[2] ?? "", 10);
  if (Number.isInteger(target) && existsSync(LOG_PATH)) {
    const relevant = entriesForIssue(readFileSync(LOG_PATH, "utf8"), target);
    console.log(`\n--- log entries tagged #${target} — paste into the Builder's prompt ---`);
    console.log(
      relevant.length > 0
        ? relevant.join("\n")
        : `(none — check that's right before dispatching; issue #${target} may be unconstrained)`,
    );
  }

  if (failed) {
    console.error("\ndispatch blocked — fix the above before starting a Builder session");
    process.exit(1);
  }
  console.log("\n✓ ready to dispatch");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
