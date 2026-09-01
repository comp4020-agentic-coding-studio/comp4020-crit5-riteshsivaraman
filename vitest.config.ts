import { configDefaults, defineConfig } from "vitest/config";

// Parallel Builders run in git worktrees under .claude/worktrees/, which are
// real checkouts *inside* this directory. Vitest's default include walks into
// them, so a run collects every worktree's copy of every spec as well as this
// one's --- three stale `pure-modules.test.ts` files each scanning their own
// `src/game`, and tests from branches that aren't merged. The count inflates
// and the result stops meaning anything: green there is not green here.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**"],
  },
});
