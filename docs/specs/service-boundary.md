---
kind: spec
id: service-boundary
title: Service boundary
status: draft
owner: "@PasserBo"
governs: []
verified_against: null
---

# Service boundary

## Intent

Some of what GitSpec does can run entirely inside the user's own GitHub account. Some
of it cannot: judging a claim costs tokens on every run, and re-anchoring a comment
after the text moved needs state that survives between runs. That is a real line, and
it is not the same line as "what would people pay for".

This spec draws the boundary on the technical fact and refuses to move it for
commercial reasons. A boundary drawn around what sells has to be defended by
withholding things, which means the free side gets deliberately worse over time. A
boundary drawn around what genuinely needs a server defends itself: nothing is being
withheld, because there is nothing to withhold.

Drawing it this way has a consequence worth stating plainly. The parts that every
documentation tool already has — rendering a site, editing a page, committing a change
— sit on the free side and always will. The parts nobody has yet sit on the paid side,
because they are the parts that cost money to run. That is the whole commercial model,
and it holds only for as long as the expensive things are also the valuable things.

It also decides whether this is usable at all on a private repository. Content that
never leaves the user's GitHub cannot be leaked by a service that never receives it,
and that is an architectural property, not a promise in a privacy policy. Every rule
below exists so that the free side can be adopted by someone who is not allowed to
send their content anywhere.

The paid side is not defended by secrecy either. Anyone can call a model and ask
whether a change contradicts a claim. What is hard is being right often enough to stay
unmuted, and that lives in the evaluation set and the tuning, not in the code.

## Behaviour

### The line

- **B-1** — Rendering, content discovery, editing and committing operate using only the
  user's own GitHub account and CI. No GitSpec-operated service is required for any of
  them.
- **B-2** — A GitSpec-operated service may exist only for a capability that cannot run
  without metered compute or without state that persists between runs.
- **B-3** — No GitSpec-operated service is an authoritative store of document content,
  consistent with **A-1** of [Sync architecture](sync-architecture.md).
- **B-4** — The OAuth token exchange is the one GitSpec-operated component the free side
  depends on. It is stateless, and document content never passes through it.

### Degradation

- **G-1** — When a paid capability is unavailable — unsubscribed, unreachable, or
  failing — every free capability continues to work unchanged.
- **G-2** — No free capability takes a paid capability as a prerequisite.
- **G-3** — A free capability is never withdrawn to the paid side. A capability that
  satisfies **B-1** stays free.

### User-supplied credentials

- **K-1** — Every model-backed capability can run with credentials supplied by the user,
  in the user's own CI, with no GitSpec-operated service involved.
- **K-2** — A capability running on user-supplied credentials is not restricted relative
  to its hosted form. The hosted form differs in how well it is tuned and operated, not
  in what it is permitted to do.

### Custody

- **C-1** — Document content and repository diffs reach a GitSpec-operated service only
  through a capability the user explicitly enabled, and are not retained once that
  capability has answered.
- **C-2** — Enabling a paid capability is a separate, explicit act from installing
  GitSpec. Installing never grants content access.

## Open questions

**G-3 is a promise that outlives the person making it.** Nothing enforces it but this
document, and the pressure to move a popular free capability behind the line arrives
exactly when the business needs it most. Whether to bind it harder — in the licence
rather than in a spec — is undecided.

**K-1 and the tuning are in tension.** If what is sold is prompts, thresholds and an
evaluation set rather than access to a model, then a user-supplied-credentials run
either ships that tuning, in which case it is not sold, or it does not, in which case
**K-2** is violated in substance while being satisfied in wording.

**C-1 says "not retained" without saying what is logged.** Operating a service means
keeping enough to debug it, and a failure worth debugging is usually one where the
content mattered. The retention rule for diagnostics is unwritten.

**The line moves as models get cheaper.** **B-2** rests on metered compute being
expensive enough to need a service. Local models run in a user's own CI would put drift
detection on the free side by this spec's own reasoning, and the commercial model would
need to be somewhere else entirely.

**Nothing here covers cross-repository capabilities.** Searching or reporting across
many repositories needs persistent state, so **B-2** admits it, but it also needs
content from repositories whose owners may not all have agreed, which **C-1** and
**C-2** do not address.
