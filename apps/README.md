# apps

Product code. Nothing is here yet; the stack is not chosen.

What [Sync architecture](../docs/specs/sync-architecture.md) implies has to exist:

| App | Responsibility |
| --- | --- |
| `web` | The editor and the reading view. Renders a document from a ref, and submits an edit. |
| `server` | Holds the GitHub App credentials. Exchanges a user's OAuth grant for the ability to commit **as that user**, creates the branch, pushes the commit, opens or updates the pull request. |

Two constraints on the split, both from the spec rather than from taste:

- The server exists because a GitHub App's client secret cannot live in a browser, not
  because it stores documents. Per **A-1** it stores none.
- Nothing in the reading path may write, per **R-3**, so rendering must not depend on
  anything only the server can do.

What is in `packages/` so far:

| Package | Holds |
| --- | --- |
| `@gitspec/core` | Configuration, discovery, addressing. Governed by [Content discovery](../docs/specs/content-discovery.md). |
| `@gitspec/render` | Markdown to HTML, navigation, the static build behind `action.yml`. |
| `@gitspec/github` | Turning an edit into a branch, a commit and a pull request. |

`@gitspec/render` and `@gitspec/github` are the two halves of
[Sync architecture](../docs/specs/sync-architecture.md) — reading and writing — and the
spec governs both.

`@gitspec/github` takes a `RepoApi` port rather than a client, so `web` can pass one
backed by the signed-in user's token and a test can pass one backed by a map. The port
has no merge and no force-push on it at all, which is how **A-3** and **A-4** are kept:
a capability absent from the interface cannot be reached for later.
