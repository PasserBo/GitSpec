# GitSpec

A research project on spec systems where **git is the source of truth and both humans
and AI agents are first-class editors.**

Status: nothing is built yet. This README states the thesis and the open questions.

## The problem

Confluence, Notion and GitBook were designed in the 2010s, when every editor was a
human. They assume edits arrive one person at a time, that review is a conversation,
and that conflicts get resolved by people talking. Those assumptions break once a
meaningful share of the edits come from an agent:

- an agent changes twenty files in one pass — what does review look like?
- a person edits a paragraph in a web UI while an agent rewrites the whole section on
  a branch — how does that merge?
- the doc says "max 4 lines", the code says 5 — **who notices?**

The first two are engineering problems with known shapes. The third is the interesting
one, and it is the one that actually hurts.

## Observed failure modes

Patterns seen in production documentation sets of a few hundred specs, split between
a repository and a wiki:

- A spec keeps describing behaviour that changed releases ago. Nothing flags it,
  because nothing is watching.
- A spec becomes untrustworthy as a whole, and has to be reconciled against the code
  line by line, by hand, before anyone can rely on it again.
- The most rigorous specs carry hand-maintained tables comparing intent to
  implementation, row by row. They are accurate on the day they are written and decay
  from then on.

Every one of these is a *drift* problem: the spec and the artefact it describes
diverged, and the divergence stayed invisible until someone paid to look.

## The bet

Drift detection was not buildable before LLMs, which is why no existing product does
it. That makes it the part worth owning.

The minimal core:

1. A change lands that touches some implementation.
2. Find the spec that claims to describe it.
3. Extract the spec's *checkable* statements — the ones with a truth value.
4. Ask whether the change contradicts any of them.
5. Say so, on the change, before it merges.

This is measurable rather than vibes-based: a corpus of real specs with known-stale
documents is a labelled evaluation set. Either the detector finds them or it does not.

## Open questions

**Anchoring.** Comments and annotations that survive edits to the text they point at.
Three known approaches — block IDs embedded in the source, sidecar fuzzy anchors
re-matched on read, or git-native comments that live on a diff. Each trades source
cleanliness against durability. The unexplored option is semantic re-anchoring: when
fuzzy matching fails, ask a model whether the rewritten passage is still the thing the
comment was about.

**What counts as checkable.** "The card is 312x426" is checkable. "The bar is the app's
fixed point" is intent, and flagging it as drift would be noise. The line between them
is not obvious and probably decides whether the tool is usable.

**Authoring.** A browser editor that round-trips Markdown without mangling tables,
diagrams and frontmatter is a solved-but-tedious problem, and off-the-shelf pieces
exist. It is deliberately not the starting point.

## Non-goals

- Replacing the wiki for meeting notes and discussion. Those are not specs.
- A general-purpose CMS. The value is in the spec-specific rules, not the editor.
