---
kind: spec
id: sync-architecture
title: Sync architecture
status: draft
owner: "@PasserBo"
created: 2026-09-15
updated: 2026-09-15
governs: []
verified_against: null
---

# Sync architecture

## Intent

Every bidirectional docs platform runs into the same wall: two people edited the same
document in two places, and now something has to merge them. Solving that properly is
hard, so products route around it instead.

GitBook's route is to not merge at all. Its sync unit is the whole state of a space,
pushed or pulled wholesale, last writer wins. That choice has visible consequences: it
must push to the branch without restrictions, so it asks to bypass branch protection;
its editorial flow is disconnected from pull requests by design, so a change request
in the editor and a pull request in the repository never know about each other; and
when it meets a file it did not create, it writes a new file beside it rather than risk
overwriting, which is why teams end up with duplicates.

None of that is necessary. Git already merges, and the hosting platform already has a
review surface, an identity model, and a permission system. The reason products avoid
them is that they want saving in an editor to feel instant and unconditional.

For specs, it should not be. A spec is a claim about how something works, and changing
it deserves the same scrutiny as changing the thing. So an edit here produces a branch
and a pull request, the same as any other change. Merging is what makes it true.

The result is that the hardest problem disappears rather than getting solved: GitSpec
never merges, never force-pushes, and never needs elevated permissions. When two people
edit the same document, they are working on one pull request, and git handles the rest.

## Behaviour

### Editing

- **E-1** — An edit made in the editor is committed to a branch other than the
  repository's default branch. GitSpec never commits to the default branch.
- **E-2** — A document under edit maps to exactly one branch and one open pull request.
- **E-3** — When a document already has an open pull request, a further edit appends a
  commit to that pull request's branch. A second pull request for the same document is
  never opened.
- **E-4** — A commit is authored as the signed-in user, using credentials that user
  authorized. An edit is never attributed to a bot or to a shared account.
- **E-5** — An edit made by an agent is committed and attributed the same way as one
  made by a person, and is distinguished only by trailer metadata on the commit.

### Authority

- **A-1** — The repository is the only authoritative store. GitSpec keeps no copy of a
  document that can outlive or override what is in the repository.
- **A-2** — A change becomes authoritative when its pull request merges. Saving in the
  editor does not change what the document says.
- **A-3** — GitSpec never merges a pull request.
- **A-4** — GitSpec never force-pushes, and never requires permission to bypass branch
  protection or any other repository rule.

### Conflicts

- **C-1** — Concurrent conflicting edits are resolved by git. GitSpec implements no
  merge algorithm of its own.
- **C-2** — When a branch cannot be updated, GitSpec reports the failure and leaves the
  branch untouched. It does not retry with force, and does not discard the edit.
- **C-3** — GitSpec never writes to a different path in order to avoid overwriting an
  existing file. A conflict is surfaced, never sidestepped.

### Reading

- **R-1** — The published view renders a named ref, defaulting to the repository's
  default branch, so the published site shows merged content only.
- **R-2** — An open pull request can be rendered at its own address, showing that
  branch's content.
- **R-3** — Rendering is read-only. Nothing in the reading path writes to the
  repository.

## Open questions

**One document per pull request does not survive every change.** E-2 is the rule that
makes conflicts rare, but a change that renames a concept across four specs is one
logical change spanning four documents. Forcing it into four pull requests means four
reviews of a change that only makes sense as a whole, and the first one merged leaves
the others stale.

**Rebasing is unspecified.** When the default branch moves under an open pull request,
C-2 says report and stop, but it does not say who resolves it or where. Doing it in the
editor means building merge-conflict UI, which is the thing this design exists to avoid.

**Editor identity versus repository permission.** E-4 requires committing as the
signed-in user, which means a user without write access cannot edit at all, even though
the fork-and-pull-request path would normally let them. Whether to support that path is
open, and it interacts with R-2, since previews of fork branches are the case GitBook
disables for security.

**Assets.** Nothing here covers images and other binaries. They are large, they do not
diff, and a paste-a-screenshot flow is exactly what a designer will reach for first.

**What the editor shows before submitting.** A-2 makes merging the moment of truth, but
the editor still has to show the author what they are about to propose. Whether that is
a rendered preview, a diff, or both, decides how much of the review actually happens
before the pull request exists.
