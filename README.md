# GitSpec

A spec system where git is the source of truth and both humans and AI agents are
first-class editors. An edit becomes a branch and a pull request; merging it is what
makes it true.

Design only so far — no product code yet. **The design lives in [`docs/`](docs/), and
is itself the first thing GitSpec manages.**

## Layout

This is a monorepo with two areas, kept apart so the product never has privileged
access to the content it serves.

| Path | What it is |
| --- | --- |
| [`docs/`](docs/) | Content. A GitSpec space, mapped in `gitspec.yaml`, edited under GitSpec's own rules. |
| [`apps/`](apps/) | Product code. See [`apps/README.md`](apps/README.md) for the intended split. |
| `gitspec.yaml` | Site configuration: which directories are spaces. |

## Dogfooding

`docs/` is not a sample. It is the real design of the product, served by the product,
and every rule in it applies to itself:

- [Spec document format](docs/specs/spec-format.md) is written in the format it defines.
- [Sync architecture](docs/specs/sync-architecture.md) describes the pull-request flow
  that changes to this repository go through.
- [Drift detection](docs/specs/drift-detection.md) will run against `apps/` once there
  is code there, using the `governs` field of the specs in `docs/`.

The intended consequence is that the format cannot rot unnoticed, because the people
maintaining it are the people suffering under it.

## Why not GitBook

GitBook solves bidirectional sync by never merging: its sync unit is a whole space,
pushed or pulled wholesale, last writer wins. That forces three things — it must be
allowed to bypass branch protection, its change requests are disconnected from pull
requests by design, and it writes duplicate files rather than risk overwriting one it
did not create.

GitSpec gives the merge back to git and the review back to the platform. The reasoning
is in [Sync architecture](docs/specs/sync-architecture.md#intent).
