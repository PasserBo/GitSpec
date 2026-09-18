---
kind: spec
id: authoring
title: Authoring
status: draft
owner: "@PasserBo"
governs:
  - packages/core/src/frontmatter.ts
  - packages/core/src/schema.ts
  - apps/web/src/form.ts
  - apps/web/src/editor.ts
verified_against: null
---

# Authoring

## Intent

The editor exists because the people who know what a spec should say are not always the
people who enjoy writing Markdown in a monospace box. A designer who changes a decision
in a chat thread is not refusing to document it; they are refusing this particular
surface. Every rule below is about removing a reason not to use it.

The first reason is churn. A document belongs to git, and git shows changes as lines. An
editor that reformats a file it opened — reordering frontmatter keys, renormalising
quotes, rewrapping prose — buries the one line the author meant to change in forty they
did not. That makes the pull request unreviewable, which makes review theatre, which
removes the only thing that makes a merged document trustworthy. It also makes the
repository worse for agents, which is half the premise. So fidelity is not politeness
here; it is what keeps the rest of the design standing.

The second reason is the blank page. What actually stops someone filling in a spec is
rarely syntax. It is not knowing which fields are required, what `governs` is for, which
values `status` will accept, or whether a bullet needs an identifier. `spec-format.md`
answers all of that, and until there was a schema, nothing read it — so the format could
only be learned by reading a document about the format. A generated form answers those
questions at the moment they are asked, which is the cheapest documentation there is.

The cost of a schema is that it only covers documents that have one. F-6 makes `page`
the default precisely so that pointing GitSpec at a repository it did not write yields a
site rather than a wall of violations, and most documents in most repositories will have
no shape to generate a form from. Those still have to be editable, which is why the
fallback below is a first-class path rather than an error state.

## Behaviour

### Fidelity

- **W-1** — The editor writes no byte it was not asked to change. A field the author did
  not edit is byte-identical after a save, including key order, quoting style, comments
  and blank lines.
- **W-2** — When nothing changed, nothing is committed and no pull request is opened.
- **W-3** — A value submitted that already equals what the document says is not a change.
  Handing back an untouched form rewrites nothing.

### The form

- **W-4** — The fields an author is shown are generated from the document's schema, and
  that schema is the same value validation reads. There is no second description of the
  format.
- **W-5** — Every complaint about a field names the claim it comes from, so a rule can be
  looked up rather than guessed at.
- **W-6** — Every problem with a document is reported at once. Fixing one field never
  reveals a previously hidden one.

### Fallback

- **W-7** — A document whose frontmatter cannot be edited key by key is given no form.
  The editor says which document and why, and offers the file as text instead.
- **W-8** — Editing is always available. No document becomes uneditable because a richer
  surface could not be offered for it.

## Open questions

**The body is still a textarea.** W-1 is enforced for frontmatter, where the unit is a
key and the guard is cheap. The body has no equivalent yet: it is submitted whole, so an
editor that rewrites prose would satisfy nothing above. A rich editing surface is the
point of the next step, and it inherits W-1 as a constraint rather than an aspiration —
which means a corpus round-trip test, and a decision to hold frontmatter, raw HTML and
unknown fenced blocks verbatim rather than re-serialising them.

**The schema is built in, not declared.** `SPEC_SCHEMA` is GitSpec's own format, hard
coded. An adopter with their own document types has no way to describe them, so they get
`PAGE_SCHEMA`, which is almost nothing. Making schemas configurable is a substitution
rather than a rewrite, but nothing has been designed and no adopter has asked.

**W-7's refusal is conservative by construction.** The frontmatter scanner refuses
anything it cannot map key to key — flow mappings, quoted keys, anchors, merge keys —
because a wrong guess silently corrupts a file. That is the right default and it is also
untested against real repositories. Every document in this one is editable; nobody knows
what fraction of a stranger's repository would be.

**The editor bundle now carries a YAML parser.** Reading values into a form needs one,
and it added about a hundred kilobytes to a bundle that was already large. The weight
falls only on someone who clicked Edit — the published pages are static HTML and load
none of it — but the page has a visible pause before it appears, and a rich editing
surface will add more. Splitting the bundle so the text arrives before the rest is the
obvious answer and has not been done.

Writing a smaller parser is not the answer: W-7's guard works by comparing the line scan
against a real parser, and two agreeing implementations is the entire safety property.

**Validation is available and unenforced.** `validateFrontmatter` can judge a document,
and nothing runs it on the way in. A spec that breaks its own format merged into this
repository and survived eight commits. The gate that would have caught it is described
in the other specs and does not exist.
