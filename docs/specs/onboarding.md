---
kind: spec
id: onboarding
title: Onboarding
status: draft
owner: "@PasserBo"
created: 2026-09-17
updated: 2026-09-17
governs:
  - apps/web/src/setup.ts
  - apps/web/src/plan.ts
  - packages/github/src/files.ts
  - packages/github/src/user.ts
verified_against: null
---

# Onboarding

## Intent

Adopting GitSpec by hand takes five steps: a configuration file, a workflow file, a
Pages setting, an app installation, and the repository details that make the editor
work. GitBook needs one, and buys it by hosting everything — the repository is a mirror
and nothing runs in the adopter's account. We chose the opposite, so the workflow file
is the visible price of B-1: if nothing runs on GitSpec's servers, something has to run
on the adopter's.

Most of those steps do not need a person, though. Once someone has signed in, their own
token can add the files, and a pull request can carry them for review exactly as a
document edit would. The setup page does that and nothing more. It is a static page on
GitSpec's own site — the adopter has no site yet — acting only with the signed-in
person's token, so the boundary that lets a private repository use the editor holds
here too: no GitSpec service touches the repository.

What it deliberately does not do is change a repository setting. Enabling Pages is an
API call, not a file; it cannot ride in the pull request, and a setting flipped outside a
merge is a change nobody reviewed. Setup states the step and leaves it to the adopter.

The one escalation is the app's `Workflows: write` permission, needed to create a file
under `.github/workflows/`. It is a sensitive grant and some organisations will refuse
it. Splitting the workflow out of the pull request to avoid it would leave a
`gitspec.yaml` that builds nothing on its own, so the two files stay together and the
permission is asked for. If adoption stalls on that, the fallback is a prefilled link to
GitHub's own file-creation page, which needs no permission at all.

## Behaviour

### Proposing

- **O-1** — Setup proposes its changes as a pull request against the repository's
  default branch. It never commits to the default branch.
- **O-2** — Setup only adds files. It writes `gitspec.yaml`, `.github/workflows/docs.yml`,
  and `docs/README.md` when that is absent, and nothing else. If `gitspec.yaml` already
  exists, setup stops and points at it rather than replacing it.
- **O-3** — Setup never changes a repository setting. Enabling Pages is the adopter's
  own act, and the result screen names it.

### Surface

- **O-4** — The setup page is a static page served from a site that opts in with
  `site.setup`, and it acts only with the signed-in person's token. No GitSpec-operated
  service touches the repository being set up.
- **O-5** — Setup offers only repositories the signed-in person can push to, as reported
  by GitHub for that person, and shows the others as unavailable with the reason.

### Result

- **O-6** — A configuration setup generates always yields a site that builds on the
  first run: it points at `docs/`, and it adds `docs/README.md` whenever that file is
  missing, so the space has a document to answer at its root.
- **O-7** — The workflow setup installs is byte-for-byte the one this repository
  documents in `examples/docs.yml`.
- **O-8** — The generated configuration carries `repository` and `auth`, so the
  resulting site is editable, and leaves `site.setup` off, so it does not become an
  onboarding portal of its own.

## Open questions

**Every adopter inherits the dependency on GitSpec's broker.** The generated `auth`
points at our token exchange, so B-4's one GitSpec-operated component is now something
every adopter's editor calls. The configuration says how to run one's own, but nobody
will until it fails. Whether the setup page should offer a self-hosted broker as a
first-class choice is undecided.

**`Workflows: write` may cost more adoption than it saves.** The decision above is
reasoned but not measured. The prefilled-link fallback exists as an idea, not as code.

**Adding a README to someone's repository is a judgement call.** O-6 makes the first
build succeed, at the cost of a file the adopter did not ask for. The alternative — a
config that fails D-6 or A-7 on its first run — is worse, but the starter page's wording
is ours in their repository.

**Repository lists are read once and unpaginated.** A person with more than a hundred
repositories under one installation sees the first hundred. Fine today; not fine for a
large organisation.

**A user site breaks the installed workflow's `base:` line.** `<owner>.github.io` serves
from the domain root, so the project-site prefix is wrong for it. Setup says so in a note
rather than rewriting the workflow, because rewriting it would break O-7.
