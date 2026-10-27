---
kind: spec
id: validation
title: Validation
status: draft
owner: "@PasserBo"
governs:
  - packages/core/src/check.ts
  - packages/render/src/check-cli.ts
verified_against: null
---

# Validation

## Intent

Every rule in this repository's format was written down and enforced by nobody. F-1
listed the frontmatter keys, S-1 fixed the three sections, C-1 and C-2 fixed how a claim
is identified — and the only code that read any of it was a form in a browser. A spec
that broke its own format merged here and survived eight commits.

That gap matters more now than it did when the format was written, because of who writes
documentation. An agent handed a repository can already create `docs/something.md`; what
it could not do was find out whether what it wrote was right. Its only feedback was a
person reading a pull request, which arrives hours later and costs the one thing a small
team has least of. A command it can run itself closes that loop in seconds, and the same
command is what makes a review worth having: a reviewer who no longer has to check
whether the frontmatter is complete can spend the time on whether the claim is true.

The decision this spec exists to record is that validation is **deterministic and
separate from drift detection**. Drift asks whether a claim matches the code, which is a
judgement a model makes and can make differently twice. This asks whether a document is
well-formed, which a compiler answers the same way every time. Keeping them apart is what
lets this one be trusted enough to run on every commit — N-2 allows it for exactly that
reason.

What it will not do is block. GitSpec reports and exits; whether a report stops a merge
is the repository's own setting, made through branch protection. A tool that takes that
decision away from the repository is one an organisation has to fight rather than adopt.

## Behaviour

### Scope

- **V-1** — Validation is deterministic. The same document yields the same findings on
  every run, on every machine, forever.
- **V-2** — Validation never rewrites a document. It reports and exits.
- **V-3** — Validation never blocks a merge of its own accord. It exits non-zero on an
  error, and what that means is the repository's setting to make.
- **V-4** — Only a `spec` is checked beyond its own schema. F-6 exempts a `page` from
  every structural rule, so pointing GitSpec at a repository it did not write yields a
  site rather than a wall of findings.

### Findings

- **V-5** — Every finding names the claim it comes from, so a rule can be looked up
  rather than guessed at.
- **V-6** — Every finding names the document, and the line when the rule knows one.
- **V-7** — A finding is an error when the document breaks a rule, and a warning when
  something is suspect but legitimate. Warnings alone never fail a run.
- **V-8** — Every finding for a document is reported at once. Fixing one never reveals a
  previously hidden one.

### Surfaces

- **V-9** — The command, the workflow and the editor share one definition of the rules.
  There is no second copy that can disagree.
- **V-10** — The command emits machine-readable findings on request, as a stable shape.
  It is an interface for whatever reads it, not a log.

### What is checked

- **V-11** — A construct written inside code — a fence or a code span — is an example and
  is never judged as if it were real. A spec about links is full of links that are not.

## Open questions

**The editor does not run this yet.** V-9 says the three surfaces share one definition,
and two of them do. The editor still validates only frontmatter, which means a person
editing a claim by hand gets less help than an agent writing the same claim from a shell.
The wiring is small and is waiting on the rich editor landing first.

**Nothing checks that a claim is a claim.** C-3 says a claim states something true or
false of the code, and C-5 says it is self-contained. Both are judgements, so neither is
here — which leaves the most valuable rules in the format unenforced, and leaves `- **X-1**
— this spec is nice` passing.

**`governs` is not checked against the repository.** A spec can name a path glob matching
nothing, and nothing notices. The check is trivial and was left out because a spec written
before the code it describes is a normal and intended state; telling the two apart needs
something this does not have.

**Warnings have no way to be accepted.** A link to a file someone has not written yet is
reported forever, with no way to say so deliberately. The usual answer is an ignore file,
which is also the usual way a checker stops being read.
