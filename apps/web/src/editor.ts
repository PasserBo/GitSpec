import { loadForEdit, restRepo, submitEdit, SubmitError, type PullRef } from "@gitspec/github";
import { beginSignIn, completeSignIn, currentToken, signOut } from "./auth.ts";
import { $, escape, panel } from "./ui.ts";
import { renderMarkdown, stripFrontmatter, withBase } from "@gitspec/render";
import type { SiteManifest } from "@gitspec/render";

/**
 * The editor. A static page that talks to GitHub with the reader's own token and to
 * nothing else — there is no GitSpec service in this path, which is what lets a private
 * repository use it (B-1).
 *
 * It edits Markdown source rather than offering a rich-text surface. A round-tripping
 * WYSIWYG rewrites files it did not need to touch, and the resulting churn is exactly
 * what makes a repository hostile to both review and agents. The live preview is meant
 * to carry the weight instead.
 */

const TOKEN_KEY = "gitspec:token";

async function loadManifest(): Promise<SiteManifest> {
    // The editor page lives at <base>/_edit/, so the manifest is one level up.
    const response = await fetch("../_gitspec/manifest.json");
    if (!response.ok) throw new Error(`manifest unavailable (${response.status})`);
    return response.json();
}

function pasteScreen(onToken: (token: string) => void): void {
    $("app").innerHTML = `
<div class="panel">
  <h1>Sign in to edit</h1>
  <p class="note">
    GitSpec commits as you, so it needs a token that belongs to you. Paste a GitHub
    personal access token with <code>repo</code> access. It is kept in this browser's
    local storage and sent only to github.com — never to any GitSpec service.
  </p>
  <p class="note provisional">
    Pasting a token is temporary scaffolding. Sign-in will replace it, at which point
    this screen goes away and no token is ever handled by hand.
  </p>
  <input id="token" type="password" placeholder="ghp_…" autocomplete="off" spellcheck="false">
  <button id="save" class="primary">Continue</button>
</div>`;

    const input = $<HTMLInputElement>("token");
    const submit = () => {
        const value = input.value.trim();
        if (!value) return;
        localStorage.setItem(TOKEN_KEY, value);
        onToken(value);
    };
    $("save").addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
        if ((event as KeyboardEvent).key === "Enter") submit();
    });
    input.focus();
}

function editorScreen(args: {
    manifest: SiteManifest;
    document: SiteManifest["documents"][number];
    source: string;
    ref: string;
    pull?: PullRef;
    onSubmit: (contents: string, summary: string) => Promise<void>;
}): void {
    const { manifest, document: doc, source, ref, pull } = args;

    const where = pull
        ? `continuing <a href="${escape(pull.url)}" target="_blank" rel="noopener">pull request #${pull.number}</a>`
        : `proposing against <code>${escape(ref)}</code>`;

    $("app").innerHTML = `
<header class="bar">
  <div>
    <strong>${escape(doc.title)}</strong>
    <span class="note"> &middot; ${escape(doc.path)}</span>
  </div>
  <div class="note">${where}</div>
</header>
<div class="split">
  <textarea id="source" spellcheck="false"></textarea>
  <article id="preview" class="preview"></article>
</div>
<footer class="bar">
  <input id="summary" placeholder="What changed, and why (optional)">
  <button id="submit" class="primary">Propose change</button>
  <a class="note" href="${escape(withBase(manifest.base, doc.address))}">Cancel</a>
</footer>
<div id="result"></div>`;

    const textarea = $<HTMLTextAreaElement>("source");
    const preview = $("preview");
    textarea.value = source;

    const lookup = (path: string) => manifest.documents.find((d) => d.path === path)?.address;

    let pending = 0;
    const refresh = async () => {
        const mine = ++pending;
        const html = await renderMarkdown(
            { kind: doc.kind, address: doc.address, id: doc.id, idDerived: false, path: doc.path, spaceKey: doc.spaceKey, frontmatter: {} },
            stripFrontmatter(textarea.value),
            lookup,
            manifest.base,
        );
        if (mine === pending) preview.innerHTML = html;
    };

    textarea.addEventListener("input", () => void refresh());
    void refresh();

    $("submit").addEventListener("click", async () => {
        const button = $<HTMLButtonElement>("submit");
        button.disabled = true;
        button.textContent = "Proposing…";
        try {
            await args.onSubmit(textarea.value, $<HTMLInputElement>("summary").value);
        } finally {
            button.disabled = false;
            button.textContent = "Propose change";
        }
    });
}

function report(html: string, kind: "ok" | "bad"): void {
    $("result").innerHTML = `<div class="result ${kind}">${html}</div>`;
}

function signInScreen(auth: { clientId: string; broker: string }, docId: string): void {
    $("app").innerHTML = `
<div class="panel">
  <h1>Sign in to edit</h1>
  <p class="note">
    GitSpec commits as you, so an edit carries your name and goes through review like
    any other change. It can only reach repositories this app is installed on, and only
    where you already have access.
  </p>
  <button id="signin" class="primary">Sign in with GitHub</button>
</div>`;
    $("signin").addEventListener("click", () => beginSignIn(auth, `?doc=${encodeURIComponent(docId)}`));
}

async function main(): Promise<void> {
    const manifest = await loadManifest();

    // A redirect back from GitHub carries the code in the address bar, and completing it
    // restores the query the editor was on. Read `doc` only after that has happened.
    if (manifest.auth) {
        try {
            await completeSignIn(manifest.auth);
        } catch (error) {
            panel("Sign-in did not complete", String(error), true);
            return;
        }
    }

    const id = new URLSearchParams(location.search).get("doc");
    const doc = manifest.documents.find((d) => d.id === id);

    if (!doc) {
        panel("Nothing to edit", `No document with id "${id ?? ""}" is part of this site.`);
        return;
    }
    if (!manifest.repository) {
        panel(
            "Editing is not configured",
            "This site was built without repository details, so an edit has nowhere to go. Set `repository` in gitspec.yaml, or pass it to the action.",
        );
        return;
    }

    const start = async (token: string) => {
        const repository = manifest.repository!;
        const repo = restRepo({ owner: repository.owner, repo: repository.name, token });

        let loaded;
        try {
            loaded = await loadForEdit(repo, { documentId: doc.id, path: doc.path, base: repository.branch });
        } catch (error) {
            // A rejected token is the overwhelmingly likely cause, and leaving it in
            // storage would lock the editor into a loop it cannot explain.
            if (manifest.auth) signOut();
            else localStorage.removeItem(TOKEN_KEY);
            panel("Could not open the document", String(error), true);
            return;
        }

        editorScreen({
            manifest,
            document: doc,
            source: loaded.contents,
            ref: loaded.ref,
            pull: loaded.pull,
            onSubmit: async (contents, summary) => {
                try {
                    const result = await submitEdit(repo, {
                        documentId: doc.id,
                        path: doc.path,
                        contents,
                        base: repository.branch,
                        title: doc.title,
                        summary,
                    });
                    report(
                        `${result.created ? "Opened" : "Added to"} <a href="${escape(result.pull.url)}" target="_blank" rel="noopener">pull request #${result.pull.number}</a>. ` +
                            `It becomes part of the document when it is merged.`,
                        "ok",
                    );
                } catch (error) {
                    const message = error instanceof SubmitError ? error.message : String(error);
                    report(escape(message), "bad");
                }
            },
        });
    };

    if (manifest.auth) {
        const token = await currentToken(manifest.auth);
        if (token) await start(token);
        else signInScreen(manifest.auth, doc.id);
        return;
    }

    // No app configured: local development, where the paste screen is the only way in.
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing) await start(existing);
    else pasteScreen((token) => void start(token));
}

void main().catch((error) => {
    panel("Editor failed to start", String(error));
});
