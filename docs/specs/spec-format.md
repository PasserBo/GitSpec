---
id: spec-format
title: Spec document format
status: draft
owner: "@PasserBo"
created: 2026-09-15
updated: 2026-09-15
governs: []
verified_against: null
---

# Spec document format

## Intent

A spec is worth writing only if it can be trusted later, and it can be trusted later
only if something notices when it stops being true. Every rule below exists to make
that noticing possible.

The central move is to stop treating a spec as prose. Asking a model to extract
checkable statements from free-form text is fragile: the extraction changes run to run,
so a report cannot be reproduced, a false positive cannot be traced to a cause, and
there is nothing stable to attach a comment to. Instead the format asks the author to
write the checkable parts as discrete, identified claims. The model's job shrinks from
"find the claims and judge them" to "judge this one claim", which is a task with a
right answer.

That split has a cost: authors have to decide, while writing, which sentences are
claims. This is deliberate. A sentence nobody can judge as true or false was never
going to hold a spec together.

Intent sections like this one are never drift-checked. Prose about *why* has no truth
value against code, and flagging it would train people to ignore the tool.

## Behaviour

### Frontmatter

- **F-1** — Every spec begins with YAML frontmatter containing `id`, `title`, `status`,
  `owner`, `created`, `updated`, `governs` and `verified_against`. Missing or unknown
  keys are an error.
- **F-2** — `id` is unique across the repository and is independent of the file path,
  so a spec can be moved without breaking references to it.
- **F-3** — `status` is one of `draft`, `active`, or `superseded`. Only `active` specs
  are drift-checked.
- **F-4** — `governs` is a list of path globs, relative to the repository root, naming
  the code this spec describes. An empty list means the spec governs no code and is
  never drift-checked.
- **F-5** — `verified_against` is a commit SHA recording the last time a human
  confirmed the spec matched the code, or `null` if that has never happened.

### Structure

- **S-1** — A spec has exactly three top-level sections, in this order: `Intent`,
  `Behaviour`, `Open questions`. Any of them may be empty; none may be absent.
- **S-2** — Only `Behaviour` is drift-checked. `Intent` and `Open questions` are
  ignored by every automated check.
- **S-3** — `Behaviour` may be divided into subsections for readability. Subsection
  headings carry no meaning to any tool.

### Claims

- **C-1** — Every statement in `Behaviour` is a claim, and every claim carries an
  identifier formatted as `<PREFIX>-<number>` in bold at the start of the line.
- **C-2** — A claim identifier is unique within its spec and permanent. Identifiers are
  never reused for a different claim and never renumbered, so that reports, comments
  and commit messages referring to one stay valid.
- **C-3** — A claim states something that is true or false of the code. A statement
  that cannot be contradicted by a change belongs in `Intent`.
- **C-4** — A retired claim keeps its identifier and is marked `(withdrawn)` rather
  than deleted, so that historical references still resolve.
- **C-5** — A claim is self-contained: understanding it does not require reading
  another claim. Shared context belongs in the subsection heading or in `Intent`.

## Open questions

**Claim granularity.** C-5 pushes toward many small claims; readability pushes toward
few large ones. A claim covering six numbers reports drift without saying which number
moved, but six claims make the spec tedious to read and to write. No rule yet.

**Cross-spec claims.** Nothing here says what happens when a claim depends on another
spec's claim. Duplicating it breaks the single source of truth; referencing it by
identifier creates a link that can dangle when the other spec withdraws the claim.

**Who assigns identifiers.** Sequential numbering by hand collides whenever two people
write claims on separate branches. Content-derived identifiers would not collide, but
then C-2 fails, because editing a claim's wording would change its identifier.

**Whether `verified_against` can be set automatically.** A human confirming the spec is
the whole point of the field. But if the drift checker passes cleanly over a spec, that
is evidence too, and leaving the field permanently `null` makes it useless.

**Nothing says which documents this format applies to.** F-1 opens with "every spec",
and no rule anywhere defines what makes a document a spec rather than an ordinary page.
Discovery found this by serving `docs/README.md`, which is a real document, is not a
spec, and satisfies none of S-1. Either the format applies to a marked subset and the
marker needs specifying, or plain pages are a second document kind that no spec covers.
