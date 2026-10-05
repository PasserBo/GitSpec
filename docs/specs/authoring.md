---
kind: spec
id: authoring
title: Authoring
status: draft
owner: "@PasserBo"
governs:
  - apps/web/src/rich/schema.ts
  - apps/web/src/rich/parse.ts
  - apps/web/src/rich/serialize.ts
  - apps/web/src/rich/chrome.ts
  - packages/core/src/frontmatter.ts
  - packages/core/src/schema.ts
  - packages/core/src/browser.ts
  - packages/render/src/browser.ts
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
- **W-9** — What the browser loads reaches no build-time module. A bundler targeting the
  browser stubs a Node import rather than refusing it, so a successful build proves
  nothing; the constraint holds because each package offers the browser its own entry and
  the import graph is checked.

### The rich surface

- **W-10** — A block the author did not edit is written back as the bytes it was read as.
  It is not re-serialised and then compared; it is never serialised at all.
- **W-11** — A construct the editor cannot model is held as its own source text, shown as
  itself, and written back unchanged. Raw HTML, an unfamiliar fence and whatever Markdown
  grows next are all the same case.
- **W-12** — The rich surface offers nothing Markdown cannot express. A control that would
  produce a document the format cannot hold does not exist rather than failing on save.
- **W-13** — Both surfaces edit one document. Switching between them carries the text
  across, so a change made in either is never lost by looking at it in the other.

## Open questions

**The rich surface works by never serialising most of the document.** W-10 is kept by
ProseMirror's documents being persistent: an untouched block is the same object after any
number of edits, so a map built while parsing still answers for it, and whatever it
answers for is quoted from the source. The alternative — a serializer careful enough to
reproduce the author's spelling of every construct — is not reachable, because Markdown
has many spellings of the same tree and only the author knows which they meant.

What this does not cover is a block that *was* edited. Its bytes are regenerated, and the
formatter's preferences apply to it: bullets become `-`, fences become backticks. Those
were chosen to match what this repository already contains, so an edited block does not
stand out. Hard-wrapped prose survives, because remark keeps the line breaks inside the
text, but that is a property of the parser rather than a promise.

**Pasted text that looks like Markdown is escaped, and it looks alarming.** A paragraph
whose text begins `- ` is written `\- `, because not escaping it would make the next read
of the file see a list. It is correct and it reads as damage. Nothing warns the author
that this is what their paste became.

**The schema is built in, not declared.** `SPEC_SCHEMA` is GitSpec's own format, hard
coded. An adopter with their own document types has no way to describe them, so they get
`PAGE_SCHEMA`, which is almost nothing. Making schemas configurable is a substitution
rather than a rewrite, but nothing has been designed and no adopter has asked.

**W-7's refusal is conservative by construction.** The frontmatter scanner refuses
anything it cannot map key to key — flow mappings, quoted keys, anchors, merge keys —
because a wrong guess silently corrupts a file. That is the right default and it is also
untested against real repositories. Every document in this one is editable; nobody knows
what fraction of a stranger's repository would be.

**W-9 was learned the expensive way.** A build-time module reached the editor through a
barrel export, and one line of module-level work in it — `promisify(execFile)`, against a
`node:child_process` the bundler had stubbed to an empty object — threw during module
evaluation. Nothing rendered, nothing was logged beyond the raw TypeError, and the page
showed "Loading…" indefinitely. It reached the published site.

Tree shaking is why this had not happened before, and why it could not keep not
happening: it removes unused functions, not work done at the top of a module. The
separate browser entries are the fix, and the import-graph test is what keeps them honest.

**The editor bundle is now 750 kB.** A YAML parser to read the form, a Markdown parser
and writer, and ProseMirror with tables. The weight falls only on someone who clicked
Edit — published pages are static HTML and load none of it — but the page has a visible
pause before it appears, and nothing is lazy. Loading the source textarea first and the
rich surface after would cost one `import()` and has not been done.

Writing a smaller parser is not the answer: W-7's guard works by comparing the line scan
against a real parser, and two agreeing implementations is the entire safety property.

**Validation is available and unenforced.** `validateFrontmatter` can judge a document,
and nothing runs it on the way in. A spec that breaks its own format merged into this
repository and survived eight commits. The gate that would have caught it is described
in the other specs and does not exist.
