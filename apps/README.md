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

A `packages/` directory appears when two apps need the same code — parsing
`gitspec.yaml`, resolving `SUMMARY.md`, and the document model are the likely first
candidates, since the drift checker will need all three and it is neither of these
apps.
