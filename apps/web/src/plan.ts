/**
 * Setup writes text and only text — a config, a workflow, a starter page — so it narrows
 * `FileToWrite` rather than inheriting the byte case it can never produce. The result
 * page shows each file verbatim before anything is proposed, which needs a string.
 */
type TextFile = { path: string; contents: string };

/** What setup learned about a repository before deciding anything. */
export interface RepoFacts {
    owner: string;
    name: string;
    defaultBranch: string;
    hasGitspecYaml: boolean;
    hasDocsDir: boolean;
    hasDocsReadme: boolean;
}

export interface SetupAuth {
    clientId: string;
    broker: string;
}

export type SetupPlan =
    | { kind: "already"; reason: string }
    | { kind: "propose"; files: TextFile[]; siteUrl: string; notes: string[] };

/** GitHub Pages serves a project site at `<owner>.github.io/<repo>/`; a user site at the root. */
export function siteUrlFor(owner: string, name: string): string {
    const host = `${owner.toLowerCase()}.github.io`;
    return name.toLowerCase() === host ? `https://${host}/` : `https://${host}/${name}/`;
}

function quote(value: string): string {
    return JSON.stringify(value);
}

export function generateConfig(facts: RepoFacts, auth: SetupAuth): string {
    return `# GitSpec site configuration. Added by the setup page; edit freely.
version: 1

site:
  title: ${quote(facts.name)}

# Where the editor proposes changes. Remove this block for a read-only site.
repository:
  owner: ${quote(facts.owner)}
  name: ${quote(facts.name)}
  branch: ${quote(facts.defaultBranch)}

# Sign-in for the editor. Both values are public. This points at GitSpec's own broker;
# run your own and change the URL if you would rather not depend on it.
auth:
  clientId: ${quote(auth.clientId)}
  broker: ${quote(auth.broker)}

spaces:
  # \`key\` is this space's permanent identity. Rename \`title\` or \`path\` freely; never \`key\`.
  - key: docs
    title: Docs
    path: /
    directory: ./docs
`;
}

export function generateHome(facts: RepoFacts): string {
    return `---
kind: page
id: home
title: ${quote(facts.name)}
---

# ${facts.name}

This site is built by GitSpec from the Markdown under \`docs/\`. Add a page by adding a
file there, or use **Edit this page** on any page to propose a change as a pull request.

A page is plain Markdown. A file that declares \`kind: spec\` in its frontmatter is held
to the spec format and, once drift detection lands, is checked against the code it
\`governs\`.
`;
}

/**
 * Decide what setup will propose, without touching anything.
 *
 * Pure on purpose: everything the screens show, and everything the pull request will
 * contain, comes from here, so it can be tested without a browser or a token.
 *
 * O-2: setup only adds. If \`gitspec.yaml\` is already there, this is not our repository to
 * configure and the answer is to point at what exists.
 *
 * O-6: the generated site must build first time. The config points at \`docs/\`, so the
 * plan adds \`docs/README.md\` whenever it is missing — that single file is enough to
 * satisfy D-6 (the glob matches something) and A-7 (the home resolves), whatever else
 * the repository does or does not contain.
 */
export function planSetup(facts: RepoFacts, auth: SetupAuth, workflowTemplate: string): SetupPlan {
    if (facts.hasGitspecYaml) {
        return {
            kind: "already",
            reason: `${facts.owner}/${facts.name} already has a gitspec.yaml on ${facts.defaultBranch}. Setup only adds files and will not replace it.`,
        };
    }

    const files: TextFile[] = [
        { path: "gitspec.yaml", contents: generateConfig(facts, auth) },
        { path: ".github/workflows/docs.yml", contents: workflowTemplate },
    ];
    const notes: string[] = [];

    if (!facts.hasDocsReadme) {
        files.push({ path: "docs/README.md", contents: generateHome(facts) });
        notes.push(
            facts.hasDocsDir
                ? "docs/ exists but has no README.md, so a starter home page is added — the site needs one document to answer at its root."
                : "There is no docs/ directory yet, so one is started with a README.md. Move your Markdown in, or change `directory` in gitspec.yaml.",
        );
    }

    const siteUrl = siteUrlFor(facts.owner, facts.name);
    if (siteUrl === `https://${facts.owner.toLowerCase()}.github.io/`) {
        notes.push(
            "This is a user site, served from the domain root. Delete the `base:` line from the workflow after merging.",
        );
    }

    return { kind: "propose", files, siteUrl, notes };
}
