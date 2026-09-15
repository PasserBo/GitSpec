---
id: drift-detection
title: Drift detection
status: draft
owner: "@PasserBo"
created: 2026-09-15
updated: 2026-09-15
governs: []
verified_against: null
---

# Drift detection

## Intent

A spec decays silently. Nobody edits a document to make it wrong; it becomes wrong
because the code moved and the document stayed. By the time someone notices, the whole
document is suspect, and the only honest repair is to read it line by line against the
code. That repair is expensive enough that it usually does not happen, and the spec is
quietly abandoned instead.

The cheapest moment to catch this is while the change is still under review. The person
making the change knows exactly what they changed and why; they are the only one who
will ever be able to update the spec cheaply. Five minutes later that knowledge is gone.

The hard constraint is trust. A checker that reports things that are not drift will be
muted within a week, and a muted checker is worse than none, because the specs now look
supervised while nobody reads the reports. Everything below prefers silence to a guess.

Judging drift is not the same as judging correctness. The checker has no opinion about
whether the code or the spec is right — only about whether they still agree. Deciding
which one to change is the author's call, and the tool must never imply otherwise.

## Behaviour

### Selection

- **S-1** — A change is checked against every spec whose `status` is `active` and whose
  `governs` globs match at least one path modified by the change.
- **S-2** — Specs matching no modified path are not evaluated, and produce no output.
- **S-3** — A modified path matched by no spec produces no output. Absence of a spec is
  not itself reported as a problem.

### Evaluation

- **E-1** — The unit of evaluation is one claim against one change. Claims are judged
  independently, and no claim's verdict depends on another's.
- **E-2** — Each evaluation returns exactly one of three verdicts: `contradicted`,
  `consistent`, or `indeterminate`.
- **E-3** — `indeterminate` is returned whenever the change does not carry enough
  information to judge the claim. It is a normal outcome, not an error.
- **E-4** — A claim is judged only against the change and the files it touches. The
  checker does not evaluate a claim against the whole repository, so a claim that was
  already violated before the change is not reported.
- **E-5** — Statements outside a `Behaviour` section are never evaluated.

### Reporting

- **R-1** — Only `contradicted` verdicts are reported. `consistent` and `indeterminate`
  produce no output.
- **R-2** — Every report names the spec `id`, the claim identifier, and the specific
  location in the change that contradicts the claim.
- **R-3** — A report states the contradiction and stops. It does not propose which side
  to change, and does not offer replacement spec text.
- **R-4** — A change with no `contradicted` verdicts produces no output at all, rather
  than a passing summary.

### Non-interference

- **N-1** — The checker never modifies a spec, and never opens a change of its own.
- **N-2** — The checker never blocks a change from merging. Its output is advisory.
- **N-3** — The checker never writes `verified_against`.
- **N-4** — A failure inside the checker is reported as a checker failure and never as
  drift.

## Open questions

**Precision has no measurement yet.** R-1 and E-3 encode a preference for silence, but
preference is not a threshold. Without a labelled set of real changes and real drift,
there is no way to say whether the checker is quiet because it is accurate or because
it is blind. Building that set is probably the actual first task, ahead of the checker.

**E-4 forgives pre-existing drift.** Judging a claim only against the change means a
spec that was already wrong stays wrong forever, because no single change contradicts
it. A periodic whole-repository pass would catch those, but it reports drift with no
author attached to fix it, and lands on whoever happens to read it.

**Granularity of the change.** Evaluating against a whole change is cheap and gives the
model context, but a large change mixing a rename with a behavioural edit will produce
reports pointing at the rename. Evaluating per file or per hunk is more precise and
loses the context that makes the judgment possible.

**Whether `indeterminate` should ever be visible.** R-1 hides it, which keeps the output
clean but also hides that a claim is unjudgeable in principle. A claim that returns
`indeterminate` on every change is badly written, and nobody will ever find out.
