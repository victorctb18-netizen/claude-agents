---
name: mapping-and-dispatching-issues
description: Use when the user has a pile of open GitHub issues (one repo or several) and wants them mapped, prioritized, and split across parallel worktrees or chat sessions for implementation — symptoms include "quais issues atacar primeiro", "divide isso em sessões", "roda em paralelo".
---

# Mapping and Dispatching Issues

## Overview

Turns a messy open-issues list into: priority order, a stale-issue sweep, isolated worktrees, and ready-to-paste kickoff prompts. Eight steps, always in this order — skipping the stale sweep or the overlap check is where this goes wrong.

This skill works the *batch*. Turning one raw issue into a specified, agent-ready one is a different job — that's `mattpocock-skills:triage`, per-issue. Run this skill first to know which issues matter, then triage the ones that need it, then come back here to dispatch.

## When to Use

- User has 10+ open issues (one or more repos) and asks what to tackle first.
- User wants to run 2+ issues at once without them clobbering each other.
- Don't use for a single already-scoped issue — go straight to `/implement`.

## The Eight Steps

### 1. Map
`gh issue list --repo <owner/repo> --state open --json number,title,labels,createdAt` per repo. Bucket by state label (needs-triage / ready-for-agent / unlabeled = never triaged). Flag issues carrying a state label but no category label (bug/enhancement) — half-triaged, still needs attention.

An unlabeled or `needs-triage` issue can still be *ranked* in step 3 — read the body and judge its impact like any other. It just can't be *dispatched* in step 4 until it has acceptance criteria and a named file list. Route those through `mattpocock-skills:triage` first, one at a time; they rejoin this flow at step 4 once they come back `ready-for-agent`.

### 2. Stale-issue sweep (do this BEFORE prioritizing — skipping it wastes a whole session redoing done work)
`git fetch origin <default-branch>` first, every time — including when re-running this step later in the same session. A local `origin/main` ref is a snapshot from whenever you last fetched; if a PR merged since (yours or anyone else's), the sweep silently checks against a past version of the repo and reports real work as still-missing. This isn't a one-time setup step — a session that fetched at minute 0 and sweeps again at minute 90 is checking stale data unless it fetches again.

`git log --all --oneline -i --grep="#<N>"` per repo, cross-referenced against the open list. Don't cap this with `-n`/`--max-count` or read a paginated API response without walking every page — a resolved issue whose commit sits outside the window you happened to grep is indistinguishable from a never-touched one, and you'll silently miss it. A commit/PR mentioning the issue number is a *claim*, not proof — verify:
- Read the issue's acceptance criteria.
- `git show --stat <sha>` / diff against the actual files the AC names.
- If the issue has cross-repo blockers, check those are closed too — a frontend piece can be "done" while the backend blocker it depends on is still open. Prefer GitHub's native blocked-by/blocking link (`gh api graphql`, or the issue's "Development"/relationship panel) over grepping the issue body for text like "Blocked by X#N" — native links stay accurate when someone edits the relationship later; body text doesn't.
- GitHub's "Fecha #N" **never** auto-closes across repos — this isn't flaky, it's a deliberate platform restriction (GitHub won't let a PR in repo A silently change state in repo B). Any closing-keyword reference to an issue in a *different* repo than the PR needs a manual close, every single time. Same-repo closing keywords usually fire on merge but still verify — don't assume.

**Search by concept, not only by issue number.** `git log --grep="#N"` only catches commits whose author bothered to cite the number — plenty of work ships without ever referencing the issue. Also grep the codebase for the issue's *domain term* (the function, field, or flag it asks for), and say where you looked. An issue can be fully implemented with zero commits mentioning it; number-only searching reports that as never-touched and sends a session to rebuild what already exists.

A commit reference alone is never enough to close — if you can't run `git show --stat` and diff against the AC (no shell access, log truncated, etc.), don't close and don't dispatch either. Flag it **likely-resolved, unconfirmed** and hold it out of both the priority ranking and the worktree batch until someone (you, next session) verifies.

### 3. Prioritize
Rank by category, not recency:
1. Bugs touching money/data integrity in production (wrong balance, silent data loss, race conditions on writes) — always first.
2. Bugs blocking a currently-running flow (production automation stuck, confirmed real-world incident).
3. Enhancements already `ready-for-agent` with no open blockers.
4. Housekeeping / docs / `needs-triage` still needing a human decision.
5. **Blocked** — has an open cross-repo (or in-repo) blocker per step 2. Not ranked with the rest; excluded from dispatch entirely until the blocker closes, no matter how urgent the issue's own category would otherwise place it.

**Tiebreak within a tier:** order by blast radius — how many users or how much money is wrong right now, and whether it's still getting worse with every transaction. Never break the tie by cost-to-implement or effort. Two agents guessing effort on the same unseen issue land on different numbers, and dividing by that guess flips the order: tested head-to-head, an ROI÷Cost score demoted a duplicate-charging bug below a smaller one purely because one run estimated its cost one point higher. Cheap-to-fix is not the same as urgent, and a tier-1 issue is in tier 1 because of what it's doing to production, not what it costs you.

**Comparing across repos:** when the user has issues open in more than one repo and asks which to tackle first, don't just concatenate and rank — repos aren't directly comparable by issue count. Weigh: (a) does either repo have money/production-integrity bugs the other doesn't (that alone usually decides it), (b) raw volume of category-1/2 issues, (c) is one repo's queue mostly UI/enhancement and the other mostly correctness bugs. State the comparison explicitly before picking a repo to start in — don't silently default to whichever repo you listed first.

### 4. Pick N issues to parallelize + create worktrees
**Not every ranked issue is dispatchable.** Exclude before picking, regardless of priority:
- `ready-for-human` — judgment call, design decision, external access, or manual testing. Ranking it high is fine; handing it to an agent session isn't.
- No acceptance criteria and no named files — goes to `mattpocock-skills:triage` first (step 1), not to a worktree.
- Blocked (step 3, tier 5).

Say explicitly which ranked issues you excluded and why — a high-priority issue silently missing from the dispatch batch reads as an oversight.

Before picking, read each candidate's file list (issue body usually names files/functions — if it doesn't, say so explicitly rather than guessing from the title; grep the actual codebase for the term instead if you have repo access). Reject a pair if they touch the same file — sequence those instead. Two issues can also collide on a file that doesn't exist yet: "document X in the README" and "write an onboarding guide" both create the same README, and no grep finds that because there's nothing to grep. Ask what each issue *creates*, not just what it edits.

**Batch size N:** cap at how many you can personally review as separate PRs in the same day. Teams running agents in worktrees sustain 4-8 concurrent worktrees per person reliably — above that you're bottlenecked on review, not on the agent or the worktree mechanics. Don't let "no file conflicts" alone justify going past what you can actually review same-day. For the surviving set:
```bash
git worktree add ../<repo>-issue<N> <base> -b <descriptive-branch-name>
cp <repo-root>/.env ../<repo>-issue<N>/.env   # .env often lives one level up from the git root — check both
```
`<base>` is whatever this repo's trunk actually is — confirm with `git branch -r` / `git symbolic-ref refs/remotes/origin/HEAD` before assuming `origin/main`; plenty of repos are `master`, or have no remote at all. Same for `.env`: check the git root *and* its parent, and if there's no `.env` anywhere just say so and skip the copy — don't invent one.
Each worktree gets its own full working directory — venv/node_modules/build cache duplicate per worktree, not shared. Budget disk accordingly at 4-8 concurrent. Git also refuses to check the same branch out in two worktrees at once ("already checked out at ...") — always give each worktree its own new branch, never reuse one across issues.

### 5. Parallel agents vs. separate sessions
| | Parallel agents (Agent tool) | Separate chat sessions + worktree |
|---|---|---|
| Best for | quick research, read-only, short independent edits reviewed together | real builds: TDD, financial/concurrency code, each needs its own PR review |
| Isolation | logical only, unless you hand each a worktree | physical: folder, branch, `.env`, context window |
| Context cost | all diffs land back in your main window | stays out of your main window entirely |

Default to separate sessions when the work is money/concurrency-sensitive or spans more than one sitting.

### 6. Kickoff prompt per session
Template — one per issue, paste into its own session:
```
Resolve issue #<N> (<owner/repo>).
Worktree já na branch <branch>, isolado das outras sessões.

<2-3 line summary of the problem, in the issue's own terms>

Segue CLAUDE.md/CONTEXT.md do repo. Usa /implement (TDD interno + code-review antes do commit).
Roda testes + lint antes de reportar pronto.

NÃO commita sem antes rodar /code-review no diff completo e resolver o que
ele apontar. "É só um fix pequeno" não dispensa — pequeno é exatamente onde
review sai barato e erro sai caro. Se /code-review não apontar nada, isso
também é resultado a registrar, não licença pra pular a etapa.

Ao terminar, fecha com um bloco Antes/Depois de 2-3 linhas:
**Antes:** <comportamento observável que a issue descreve, no presente>
**Depois:** <comportamento observável agora, após o commit>
**Arquivos:** <arquivos tocados>
**Code-review:** <rodou? o que achou, e o que foi corrigido — ou "sem achados">
```

The Antes/Depois block is what the dispatcher reads to decide whether to close the issue without re-reading the whole diff, so it has to be about **observable behaviour** — what a user or a caller sees differently. "Refatorou `calcular_saldo`" says nothing; "saldo do mês fechado ignorava lançamentos Transferido → agora soma" does. Ask for it in the prompt, not after the session reports done — a session that already declared itself finished writes this from memory of its own summary, not from the diff.

**O campo Code-review é obrigatório, não opcional.** Uma sessão que reporta pronto sem ele não terminou — mande de volta antes de aceitar o Antes/Depois como válido para fechar a issue (step 8). Não aceite "rodei os testes, tá tudo verde" como substituto: teste verde prova que o código faz o que o código faz: não prova que a abordagem está certa, que não introduziu risco em outro lugar, ou que segue o padrão do repo. Isso é exatamente o que `/code-review` cobre e teste não cobre.

### 7. Model pick
Opus for money-correctness or concurrency/race-condition issues (repo's own CLAUDE.md priorities say precision > speed here). Sonnet for everything else — mechanical/structural work, housekeeping (dead code/flag removal), docs. Without an explicit "everything else → Sonnet" default, this table gets read as only covering two buckets and leaves housekeeping/docs unscored.

### 8. Close out + cleanup after merge
Before anything else: check the session's Antes/Depois block has a filled **Code-review** field. Missing it, or a vague "rodei os testes" in its place, means the session skipped the gate from step 6 — send it back to run `/code-review` before you touch the issue or the worktree. A merge already happened does not excuse this: review the diff yourself against `/code-review`'s two axes (Standards + Spec) before closing, and note in the closing comment that it was done retroactively.

Take the session's Antes/Depois block (step 6) and post it as the issue's closing comment before closing — it's the record of what actually changed, in the issue's own terms, for whoever reads it in six months. If the issue is in a different repo than the PR, this close is manual and mandatory (step 2).

Then remove its worktree — don't just delete the folder:
```bash
git worktree remove ../<repo>-issue<N>
```
An orphaned worktree pointer (folder gone, `.git` still tracking it) is its own housekeeping issue later. Do this per-issue as each one lands, not in a batch at the end where it's easy to forget. If a worktree folder was already deleted with `rm -rf` instead, `git worktree remove` will fail — run `git worktree prune` to clear the stale metadata.

## Common Mistakes

- Prioritizing by "ready-for-agent" label alone — a label doesn't mean urgent, it means scoped. Sort by financial/production impact first.
- Parallelizing two issues that touch the same file "because they're both small" — merge conflict guaranteed, sequence them instead.
- Trusting a merged PR's "Fecha #N" without checking the issue actually closed — guaranteed false across repos, not just occasionally.
- Forgetting `.env` isn't in the git root the worktree was cut from — check the parent directory.
- Deleting a worktree folder by hand (`rm -rf`) instead of `git worktree remove` — leaves stale metadata; recover with `git worktree prune`.
- If a session reports git operations hanging across every worktree at once, check for a stale `.git/index.lock` from a crashed agent process — it blocks the whole repo, not just the worktree that crashed.
- Accepting a session's "done" without a Code-review field in the Antes/Depois block — tests passing is not the same as reviewed; a session under time pressure will treat green tests as license to skip `/code-review` unless the prompt makes it a required field and step 8 checks for it.
- Re-checking an issue against `origin/main` without fetching first — a PR merged since your last fetch (yours or someone else's) makes real work look untouched. Fetch every time you sweep, not just the first time.
- Breaking a priority tie by how cheap or quick a fix looks — effort is a guess, and ranking by it demotes the worst bug in the tier. Tie-break on blast radius.
- Searching only `git log --grep="#N"` and calling an issue untouched — work often ships without citing the number. Grep the domain term too.
- Dispatching a `ready-for-human` issue to an agent session because it ranked high — high priority ≠ delegable.
- Concatenating issues from two repos into one ranked list without first asking which repo matters more — see the cross-repo comparison note in step 3.
