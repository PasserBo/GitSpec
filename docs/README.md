---
kind: page
id: home
title: GitSpec
---

# GitSpec

A spec system where **git is the source of truth and both humans and AI agents are
first-class editors.**

Status: design only. Nothing is built yet. These pages are the design, and they are
edited the way GitSpec intends every document to be edited.

## The problem

Confluence, Notion and GitBook were designed in the 2010s, when every editor was a
human. They assume edits arrive one person at a time, that review is a conversation,
and that conflicts get resolved by people talking. Those assumptions break once a
meaningful share of the edits come from an agent:

- an agent changes twenty files in one pass — what does review look like?
- a person edits a paragraph in a web UI while an agent rewrites the whole section on
  a branch — how does that merge?
- the doc says "max 4 lines", the code says 5 — **who notices?**

The first two have known shapes, and [Sync architecture](specs/sync-architecture.md)
settles them by refusing to invent anything: edits become pull requests, and git
merges. The third is the interesting one, and it is the one that actually hurts.

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
it. That makes it the part worth owning, and it is specified in
[Drift detection](specs/drift-detection.md).

It only works if specs are written to be checkable, which is what
[Spec document format](specs/spec-format.md) is for: claims are discrete and
identified, so a report can name one, a comment can anchor to one, and a judgment
about one can be reproduced.

## Non-goals

- Replacing the wiki for meeting notes and discussion. Those are not specs.
- A general-purpose CMS. The value is in the spec-specific rules, not the editor.
- Implementing merge. Git already does that, and
  [Sync architecture](specs/sync-architecture.md) says so normatively.
