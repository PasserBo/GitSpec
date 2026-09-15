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

Those first candidates for shared code have since landed in `packages/`:
`@gitspec/core` (configuration, discovery, addressing) and `@gitspec/render`
(Markdown to HTML, navigation, the static build behind `action.yml`). Both are
consumed by the Action today and will be consumed by `web` and `server` unchanged.
