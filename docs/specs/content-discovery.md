---
id: content-discovery
title: Content discovery
status: draft
owner: "@PasserBo"
created: 2026-09-16
updated: 2026-09-16
governs: []
verified_against: null
---

# Content discovery

## Intent

Mapping a space to a directory quietly does two jobs at once: it decides which files
belong to the space, and it decides where each one appears. That works only for
repositories whose documentation already sits in one tree.

Plenty of repositories do not look like that. Docs live next to the code they describe,
each package carries its own README, decision records sit in one place and feature
notes in another. GitBook's answer is that a space cannot reach outside its directory,
which leaves those repositories splitting one body of documentation across many spaces.

Neither layout is wrong. A spec that lives beside its code is easier to keep honest,
because the thing it describes is in the same directory. A spec in a central tree is
easier to read as a set. GitSpec should not force the choice, which means selection and
placement have to come apart.

They come apart cleanly because the pieces already exist. `governs` already separates
where a spec lives from what it describes. `id` is already required to be unique and
path-independent, so it can carry the address. What is left is selection, and globs do
that.

The cost is ambiguity, and the rules below spend most of their effort on refusing it.
A file that two spaces both claim, or an `id` that two files both use, is a question
with no right answer, and guessing produces a site whose URLs move when someone edits
a glob. Those cases fail loudly instead.

## Behaviour

### Selection

- **D-1** — A space's documents are the files matched by its `include` globs and not
  matched by its `exclude` globs. Every glob is relative to the repository root.
- **D-2** — `directory: X` is shorthand for `include: ["X/**/*.md"]`. A space declares
  `directory` or `include`, never both.
- **D-3** — A built-in exclude list applies to every space before its own `exclude` is
  considered. A space's `include` cannot override it.
- **D-4** — A file matched by more than one space is an error. Discovery fails and
  names the file and every space that claimed it.
- **D-5** — Discovery resolves against a single ref. A build never mixes files read
  from different commits.
- **D-6** — A glob that matches nothing is an error, so that a renamed directory is
  reported rather than silently emptying a space.

### Addressing

- **A-1** — A document's address is derived from its `id`, not from its path.
- **A-2** — Moving a file without changing its `id` leaves its address unchanged.
- **A-3** — Two documents in the same space with the same `id` is an error. Discovery
  fails and names both files.
- **A-4** — A matched file with no `id` in its frontmatter is assigned one derived from
  its path, and is served. Adopting a repository never requires editing its files
  first.

### Navigation

- **N-1** — When a space has a `SUMMARY.md`, that file defines the navigation tree, and
  its entries are repository-root-relative paths.
- **N-2** — When a space has no `SUMMARY.md`, navigation is inferred from the paths of
  its documents.
- **N-3** — A document absent from `SUMMARY.md` is still served at its address. It is
  absent from the navigation tree, not from the site.
- **N-4** — GitSpec never writes `SUMMARY.md`. A navigation file is authored, like any
  other document.

## Open questions

**A-4 buys adoption by breaking A-2.** A path-derived `id` moves when the file moves,
which is the thing `id` exists to prevent. The alternative is refusing to serve files
without frontmatter, which makes pointing GitSpec at an existing repository a
migration rather than a trial. Whether the derived id should be written back into the
file on first edit, converting it to a real one, is undecided.

**Inferred navigation across a scattered space is ugly.** N-2 produces a tree that
mirrors paths, so a space spanning `docs/` and `src/` gets two unrelated roots side by
side, ordered by nothing in particular. Some grouping rule is needed, and deriving it
from the glob that matched each file is the obvious candidate, but that makes
navigation depend on the order globs are written in.

**N-1 makes `SUMMARY.md` entries paths, not ids.** Paths are familiar and every editor
can follow them, but it means moving a file edits two places. Ids would not, at the
cost of a navigation file nobody can read without a lookup.

**The built-in exclude list is unspecified.** D-3 says one exists and that a space
cannot override it, which is a strong rule to leave without content. Vendored
directories and dependency trees are obvious. Whether generated documentation belongs
on it is not.

**Scale is untested.** These rules are written against repositories with hundreds of
documents. Nothing here says what happens at ten thousand, and D-5's single-ref read
implies loading the whole set to build anything.
