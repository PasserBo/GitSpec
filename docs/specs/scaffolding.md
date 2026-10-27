---
kind: spec
id: scaffolding
title: Scaffolding
status: draft
owner: "@PasserBo"
governs:
  - packages/core/src/scaffold.ts
  - packages/core/src/agents.ts
  - packages/render/src/new-cli.ts
  - packages/render/src/agents-cli.ts
verified_against: null
---

# Scaffolding

## Intent

This product had no beginning. An editor that opens an existing document, a checker that
judges one, a renderer that publishes one — and no way at all to make the first one.
Creating a document meant writing seven frontmatter keys from memory, getting three
section headings right and in order, choosing an id nothing else had taken, and
remembering a navigation line that nothing would have mentioned. The reward for getting
any of it wrong was a review comment, hours later.

That is a bad first five minutes for a person. For an agent it is worse, because an agent
has no memory of the format between tasks: every new document is the first one it has
ever written, and the rules are in a spec it has no reason to have read. The most common
failure is not a wrong claim, it is a document the checker rejects for reasons nobody
told it about.

So two things are generated rather than remembered. A new document comes from the same
schema the form renders and the checker enforces, which is what lets it be born passing.
And the instruction file agents read is generated from that schema too — a hand-written
one describes the rules as they were on the day it was written, and the gap between that
and the rules as they are is exactly the kind of rot this product exists to notice.

What is not generated is the content. A skeleton says what each section is for and stops;
nothing here writes a claim, because a claim nobody decided is worse than an empty
section.

## Behaviour

### A generated document

- **G-1** — A generated document passes the checker as written. Generating one that does
  not is this tool's defect, not the author's problem, and it is refused rather than
  written.
- **G-2** — Frontmatter is generated from the schema, in the order the schema declares.
  A key added there appears in new documents without anyone editing a template.
- **G-3** — Where a document is placed is read from where the repository's documents of
  that kind already are. A convention is chosen only when there is none to find.
- **G-4** — Generation refuses rather than overwrites. An existing path, or an id another
  document already declares, is an error.
- **G-5** — A generated skeleton contains no claim. It says what each section is for and
  leaves the statements to whoever has decided something.

### The instruction file

- **G-6** — The instruction file agents read is generated from the same schema the checker
  enforces, so it cannot describe a rule that is no longer the rule.
- **G-7** — The instruction file names the commands that check and create documents. An
  agent that reads it can correct its own work without a review.

## Open questions

**Nothing keeps the instruction file current.** G-6 makes it generated; it does not make
it regenerated. A repository whose schema changes keeps whatever `AGENTS.md` it last
wrote, and nothing warns that the two have parted. A check comparing the file against
what would be generated now is the obvious answer and is not here.

**`AGENTS.md` is one of several conventions.** Some tools read `CLAUDE.md`, some read
`.cursorrules`, some read nothing. Writing all of them would mean maintaining several
copies of one truth, and writing one means being wrong for somebody. The file is written
where the broadest convention looks, and a repository that needs another can point at it.

**G-3 learns from a repository that may be wrong.** A repository with one misplaced spec
teaches the generator to misplace the next one. The alternative — imposing a layout — is
worse for the case this is for, which is a repository that already has documents.

**Nothing creates a document from the editor yet.** The command serves an agent and a
developer at a terminal. Someone who only ever opens the site still has no way to start a
document, which is the half of this gap that is left.
