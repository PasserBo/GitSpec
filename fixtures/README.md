# fixtures

Miniature repositories used to test content discovery. Each directory is a self-contained
repository root: it has its own `gitspec.yaml`, its own documents, and an `expected.yaml`
recording what discovery must produce.

These are **not** part of the `gitspec-docs` space. The root `gitspec.yaml` maps only
`./docs`, so nothing here is discovered by GitSpec's own site.

| Fixture | Exercises |
| --- | --- |
| `simple/` | The `directory` shorthand (**D-2**), navigation taken from `SUMMARY.md` (**N-1**). |
| `scattered/` | Globs across unrelated trees (**D-1**), a space-level exclude and the built-in one (**D-3**), a matched file with no frontmatter (**A-4**), inferred navigation (**N-2**). |
| `invalid/overlapping-spaces/` | One file claimed by two spaces (**D-4**). |
| `invalid/duplicate-ids/` | Two documents sharing an `id` (**A-3**). |
| `invalid/empty-glob/` | A glob matching nothing (**D-6**). |
| `invalid/directory-and-include/` | Declaring both `directory` and `include` (**D-2**). |

Rule identifiers refer to [Content discovery](../docs/specs/content-discovery.md). A
fixture exists because a claim exists; if a claim is withdrawn, its fixture goes with it.

## expected.yaml

`result` is `ok` or `error`.

For `ok`, `documents` lists every document discovery must find, by `id` and path. A
document whose `id` was derived from its path rather than read from frontmatter is
marked `id_derived: true`. `excluded` lists files that must **not** be found, and why.
`navigation` is `from-summary` or `inferred`.

For `error`, `rule` names the claim violated, and `message_must_name` lists the strings
the failure has to mention. Naming the offending file is most of the value of failing,
so it is asserted rather than left to taste.

## node_modules

`scattered/node_modules/left-pad/README.md` is committed deliberately. It is the case a
naive implementation gets wrong, and it cannot be tested by a file that does not exist.
