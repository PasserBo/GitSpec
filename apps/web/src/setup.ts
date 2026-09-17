import { restRepo, restUser, submitFiles, SubmitError, type AccessibleRepository } from "@gitspec/github";
import type { SiteManifest } from "@gitspec/render";
import workflowTemplate from "../../../examples/docs.yml" with { type: "text" };
import { beginSignIn, completeSignIn, currentToken, signOut } from "./auth.ts";
import { planSetup, type RepoFacts, type SetupPlan } from "./plan.ts";
import { $, escape, panel } from "./ui.ts";

/**
 * Setup: a bare repository to a GitSpec site, as one pull request.
 *
 * Served from GitSpec's own site because the adopter has no site yet, and acting only
 * with the signed-in person's token (O-4). It reads a repository to decide what to add,
 * shows exactly what it will add, and proposes it — never commits to the default branch
 * (O-1), never replaces a file it finds (O-2), never touches a repository setting (O-3).
 * Enabling Pages stays the adopter's own act, and the result screen says so.
 */

async function loadManifest(): Promise<SiteManifest> {
    const response = await fetch("../_gitspec/manifest.json");
    if (!response.ok) throw new Error(`manifest unavailable (${response.status})`);
    return response.json();
}

type Auth = NonNullable<SiteManifest["auth"]>;

function signInScreen(auth: Auth): void {
    $("app").innerHTML = `
<div class="panel">
  <h1>Set up GitSpec on a repository</h1>
  <p class="note">
    Sign in, pick a repository, and GitSpec opens a pull request adding the files it
    needs — committed as you, for you to review and merge. Nothing is written until you
    say so, and nothing outside that pull request is ever touched.
  </p>
  <button id="signin" class="primary">Sign in with GitHub</button>
</div>`;
    $("signin").addEventListener("click", () => beginSignIn(auth, ""));
}

function installScreen(auth: Auth): void {
    const href = auth.appSlug
        ? `https://github.com/apps/${encodeURIComponent(auth.appSlug)}/installations/new`
        : "https://github.com/settings/installations";
    $("app").innerHTML = `
<div class="panel">
  <h1>Install the app first</h1>
  <p class="note">
    GitSpec can only reach repositories its GitHub App is installed on — and only ones
    you can already push to. Install it on the repository you want a site for, then
    come back here.
  </p>
  <a class="primary button" href="${escape(href)}">Install GitSpec Docs</a>
  <p class="note">Already installed? <a href="javascript:location.reload()">Reload</a>.</p>
</div>`;
}

function repoListScreen(repos: AccessibleRepository[], onPick: (repo: AccessibleRepository) => void): void {
    const sorted = [...repos].sort((a, b) =>
        Number(b.canPush) - Number(a.canPush) || `${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`),
    );
    $("app").innerHTML = `
<div class="panel wide">
  <h1>Which repository?</h1>
  <p class="note">Only repositories you can push to can be set up. The rest are shown so you know why they are missing.</p>
  <ul class="repos">
    ${sorted
        .map(
            (r, i) => `
    <li class="${r.canPush ? "" : "disabled"}">
      <button data-i="${i}" ${r.canPush ? "" : "disabled"}>
        <strong>${escape(r.owner)}/${escape(r.name)}</strong>
        <span class="note">${r.private ? "private · " : ""}${escape(r.defaultBranch)}${r.canPush ? "" : " · you can't push here"}</span>
      </button>
    </li>`,
        )
        .join("")}
  </ul>
</div>`;
    for (const button of document.querySelectorAll<HTMLButtonElement>(".repos button:not([disabled])")) {
        button.addEventListener("click", () => onPick(sorted[Number(button.dataset.i)]!));
    }
}

function reviewScreen(facts: RepoFacts, plan: Extract<SetupPlan, { kind: "propose" }>, onConfirm: () => Promise<void>): void {
    $("app").innerHTML = `
<div class="panel wide">
  <h1>${escape(facts.owner)}/${escape(facts.name)}</h1>
  <p class="note">
    A pull request against <code>${escape(facts.defaultBranch)}</code> will add
    ${plan.files.length} file${plan.files.length === 1 ? "" : "s"}. Nothing else changes.
  </p>
  ${plan.notes.map((n) => `<p class="note provisional">${escape(n)}</p>`).join("")}
  ${plan.files
      .map(
          (f) => `
  <details>
    <summary><code>${escape(f.path)}</code></summary>
    <pre>${escape(f.contents)}</pre>
  </details>`,
      )
      .join("")}
  <p class="note">
    After merging, enable Pages once — <strong>Settings → Pages → Source: GitHub
    Actions</strong>. GitSpec never changes a repository's settings for you. Your site
    will then be at <code>${escape(plan.siteUrl)}</code>.
  </p>
  <button id="confirm" class="primary">Open the pull request</button>
  <a class="note" href="javascript:location.reload()">Pick a different repository</a>
  <div id="result"></div>
</div>`;
    $("confirm").addEventListener("click", async () => {
        const button = $<HTMLButtonElement>("confirm");
        button.disabled = true;
        button.textContent = "Opening…";
        try {
            await onConfirm();
        } finally {
            button.disabled = false;
            button.textContent = "Open the pull request";
        }
    });
}

function result(html: string, kind: "ok" | "bad"): void {
    $("result").innerHTML = `<div class="result ${kind}">${html}</div>`;
}

async function main(): Promise<void> {
    const manifest = await loadManifest();
    const auth = manifest.auth;
    if (!auth) {
        panel("Setup needs sign-in", "This site was built without `auth` in gitspec.yaml, so there is no way to act as you.");
        return;
    }

    try {
        await completeSignIn(auth);
    } catch (error) {
        panel("Sign-in did not complete", String(error), true);
        return;
    }

    const token = await currentToken(auth);
    if (!token) {
        signInScreen(auth);
        return;
    }

    const user = restUser({ token });
    let installations;
    try {
        installations = await user.installations();
    } catch (error) {
        signOut();
        panel("Could not list your installations", String(error), true);
        return;
    }
    if (installations.length === 0) {
        installScreen(auth);
        return;
    }

    const repos = (await Promise.all(installations.map((i) => user.installationRepositories(i.id)))).flat();
    if (repos.length === 0) {
        installScreen(auth);
        return;
    }

    repoListScreen(repos, async (picked) => {
        panel("Looking at the repository…", `${picked.owner}/${picked.name}`);
        const repo = restRepo({ owner: picked.owner, repo: picked.name, token });

        let facts: RepoFacts;
        try {
            const [config, docsDir, docsReadme] = await Promise.all([
                repo.getFile("gitspec.yaml", picked.defaultBranch),
                repo.listDirectory("docs", picked.defaultBranch),
                repo.getFile("docs/README.md", picked.defaultBranch),
            ]);
            facts = {
                owner: picked.owner,
                name: picked.name,
                defaultBranch: picked.defaultBranch,
                hasGitspecYaml: Boolean(config),
                hasDocsDir: Boolean(docsDir),
                hasDocsReadme: Boolean(docsReadme),
            };
        } catch (error) {
            panel("Could not read the repository", String(error), true);
            return;
        }

        const plan = planSetup(facts, auth, workflowTemplate);
        if (plan.kind === "already") {
            panel("Already set up", plan.reason);
            return;
        }

        reviewScreen(facts, plan, async () => {
            try {
                const outcome = await submitFiles(repo, {
                    branchId: "setup",
                    files: plan.files,
                    base: facts.defaultBranch,
                    title: "chore: set up GitSpec",
                    body: [
                        "Adds the configuration GitSpec needs to build a documentation site from this repository.",
                        "",
                        `After merging, enable Pages once (Settings → Pages → Source: GitHub Actions). The site will be at ${plan.siteUrl}`,
                        "",
                        "Opened from the GitSpec setup page, committed as the signed-in user. Nothing outside this pull request was changed.",
                    ].join("\n"),
                    addOnly: true,
                });
                result(
                    `${outcome.created ? "Opened" : "Updated"} <a href="${escape(outcome.pull.url)}" target="_blank" rel="noopener">pull request #${outcome.pull.number}</a>. ` +
                        `Merge it, then enable Pages. Your site: <code>${escape(plan.siteUrl)}</code>`,
                    "ok",
                );
            } catch (error) {
                result(escape(error instanceof SubmitError ? error.message : String(error)), "bad");
            }
        });
    });
}

void main().catch((error) => panel("Setup failed to start", String(error)));
