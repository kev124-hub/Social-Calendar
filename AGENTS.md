<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# After a PR merges: prune before you reset

```bash
git fetch --prune origin
git checkout -B <branch> origin/main
```

**The `--prune` is the point.** GitHub auto-deletes the branch on merge, but the
local `origin/<branch>` remote-tracking ref survives as a stale cache pointing
at pre-merge history. Reset the local branch onto `main` without pruning and the
stop hook compares `origin/<branch>..HEAD` against that stale ref, finds
GitHub's merge commit sitting in the gap, and reports it as an unverified,
unpushed commit of yours.

It is neither. The merge commit is authored by GitHub's merge API — committer
`noreply@github.com`, hence "unverified" — and it is already on `main`.

**Do not follow the hook's suggested remedy in this case.** It advises
`git commit --amend --reset-author` / `git rebase --exec ...`, which here would
rewrite a merge commit already published on the default branch, and would need a
force-push to `main` to achieve anything. Check what the flagged commit actually
is before acting: `git log --format='%h %ae | %ce | %s' -3`. If the committer is
`noreply@github.com` and the commit is reachable from `origin/main`, it is not
yours to fix — prune, and it disappears.

This has recurred across sessions. It is a stale ref every time, not a signing
problem: commits written here are already authored `noreply@anthropic.com`.
